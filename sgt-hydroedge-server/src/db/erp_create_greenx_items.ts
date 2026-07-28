/// <reference types="node" />
// =====================================================================
// erp_create_greenx_items.ts
// Creates the 23 catalogue items in ERPNext, plus their MRP Item Price.
//
// DRY RUN BY DEFAULT. Creates nothing until you pass CONFIRM_CREATE=1.
//
//   npx tsx src/db/erp_create_greenx_items.ts                  # report only
//   CONFIRM_CREATE=1 npx tsx src/db/erp_create_greenx_items.ts # create
//
// EXISTING ITEMS ARE NEVER TOUCHED. Any item_code that already exists is
// skipped and reported — no update, no rename, no disable. ERPNext already
// holds two other GreenX naming schemes (band items like
// "GreenX 51-125 kVA" and assembly items like "Saarthi GreenX-625");
// neither is modified.
//
// The catalogue is read from quote_service.product_model rather than
// hardcoded, so the items created here cannot drift from the price books
// the resolver uses.
//
// ── One deliberate choice: is_stock_item = 0 ─────────────────────────
// These are created as NON-STOCK sales items. The existing "Saarthi
// GreenX-*" items are the manufactured assemblies — they carry BOMs,
// valuation rates and warehouse defaults. Creating 23 more stock items
// for the same physical product would double-count inventory and give
// two valuation trails for one machine.
//
// What these 23 are for is quoting: a Quotation needs a sellable
// item_code keyed to the kVA the customer actually has. So they are
// sales-only, which cannot disturb stock, valuation or any BOM.
//
// If you later want them stock-tracked, set STOCK_ITEM=1 — but that
// needs a default warehouse and a decision about how they relate to the
// assembly items. Do not flip it casually.
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;

const COMPANY = process.env.ERP_COMPANY ?? 'SGT Hydroedge Private Limited';
const INCOME_ACCOUNT = process.env.ERP_INCOME_ACCOUNT ?? 'Sales - SGT';
const ITEM_GROUP = process.env.ERP_ITEM_GROUP ?? 'Final Assembly';
const HSN = process.env.ERP_GREENX_HSN ?? '85433000';
const UOM = 'Nos';
const SELLING_PRICE_LIST = process.env.ERP_SELLING_PRICE_LIST ?? 'Standard Selling';
const STOCK_ITEM = process.env.STOCK_ITEM === '1' ? 1 : 0;
const CONFIRMED = process.env.CONFIRM_CREATE === '1';

if (!BASE || !KEY || !SECRET) {
  console.error('✗ ERPNEXT_URL / ERPNEXT_API_KEY / ERPNEXT_API_SECRET must be set');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const headers = {
  Authorization: `token ${KEY}:${SECRET}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

async function erpGet(doctype: string, params: Record<string, unknown> = {}) {
  const url = new URL(`${BASE}/api/resource/${encodeURIComponent(doctype)}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`GET ${doctype} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).data as any[];
}

async function erpPost(doctype: string, doc: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/resource/${encodeURIComponent(doctype)}`, {
    method: 'POST', headers, body: JSON.stringify(doc),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${doctype} ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text).data as any;
}

interface Model {
  model_code: string;
  rating_label: string;
  covers_upto_kva: string;
  mrp: string | null;
}

async function main() {
  console.log(CONFIRMED
    ? `▶ Creating GreenX catalogue items in ${BASE}\n`
    : `▶ DRY RUN — nothing will be created. ${BASE}\n`);

  // ---- Catalogue straight from the price book ------------------------
  const { rows } = await pool.query<Model>(`
    select pm.model_code, pm.rating_label, pm.covers_upto_kva,
           (select pl.unit_price::text
              from quote_service.price_line pl
              join quote_service.price_book pb on pb.id = pl.price_book_id
             where pl.model_id = pm.id and pb.code = 'GREENX_MRP_V1_1') as mrp
      from quote_service.product_model pm
     where pm.product_code = 'GreenX' and pm.is_active
     order by pm.sort_order
  `);
  if (!rows.length) throw new Error('no GreenX models in quote_service — run migrate_quote_01.ts');
  console.log(`  catalogue: ${rows.length} models from quote_service\n`);

  // ---- Confirm the masters we depend on actually exist ---------------
  const [company] = await erpGet('Company', { filters: [['name', '=', COMPANY]], fields: ['name'] });
  if (!company) throw new Error(`Company "${COMPANY}" not found — set ERP_COMPANY`);
  const [group] = await erpGet('Item Group', { filters: [['name', '=', ITEM_GROUP]], fields: ['name'] });
  if (!group) throw new Error(`Item Group "${ITEM_GROUP}" not found — set ERP_ITEM_GROUP`);
  const [plist] = await erpGet('Price List', { filters: [['name', '=', SELLING_PRICE_LIST]], fields: ['name'] });
  if (!plist) throw new Error(`Price List "${SELLING_PRICE_LIST}" not found`);
  const [acct] = await erpGet('Account', { filters: [['name', '=', INCOME_ACCOUNT]], fields: ['name'] });
  if (!acct) console.log(`  ⚠ Income account "${INCOME_ACCOUNT}" not found — items will be created without it`);
  console.log(`  masters ok: ${COMPANY} · ${ITEM_GROUP} · ${SELLING_PRICE_LIST}\n`);

  const toCreate: Model[] = [];
  const existing: string[] = [];

  for (const m of rows) {
    const found = await erpGet('Item', {
      filters: [['item_code', '=', m.model_code]], fields: ['name'], limit_page_length: 1,
    });
    if (found.length) existing.push(m.model_code);
    else toCreate.push(m);
  }

  if (existing.length) {
    console.log(`  ${existing.length} already exist and will be left untouched:`);
    console.log(`    ${existing.join(', ')}\n`);
  }
  if (!toCreate.length) {
    console.log('✔ Nothing to create — all 23 catalogue items already exist.');
    return;
  }

  console.log(`  ${toCreate.length} to create (is_stock_item=${STOCK_ITEM}):`);
  for (const m of toCreate) {
    console.log(`    · ${m.model_code.padEnd(14)} covers ≤ ${String(m.covers_upto_kva).padStart(7)} kVA` +
                `  MRP ${m.mrp ? '₹' + Number(m.mrp).toLocaleString('en-IN') : '— none in price book'}`);
  }

  if (!CONFIRMED) {
    console.log('\n  DRY RUN — nothing created.');
    console.log('  Re-run with CONFIRM_CREATE=1 to create these items and their MRP prices.');
    return;
  }

  console.log('\n  creating…');
  let madeItems = 0, madePrices = 0;
  for (const m of toCreate) {
    const doc: Record<string, unknown> = {
      doctype: 'Item',
      item_code: m.model_code,
      item_name: m.model_code,
      description:
        `GreenX Controlled Hydrogen Fuel Assist retrofit — covers DG ratings up to ` +
        `${m.covers_upto_kva} kVA (label ${m.rating_label}).`,
      item_group: ITEM_GROUP,
      gst_hsn_code: HSN,
      stock_uom: UOM,
      is_stock_item: STOCK_ITEM,
      is_sales_item: 1,
      is_purchase_item: 0,
      // Required for Sales Partner commission to compute on this line.
      grant_commission: 1,
      include_item_in_manufacturing: 0,
      end_of_life: '2099-12-31',
      uoms: [{ uom: UOM, conversion_factor: 1 }],
      item_defaults: [
        acct
          ? { company: COMPANY, income_account: INCOME_ACCOUNT }
          : { company: COMPANY },
      ],
    };

    try {
      await erpPost('Item', doc);
      madeItems++;
      console.log(`    ✓ ${m.model_code}`);
    } catch (e: any) {
      console.log(`    ✗ ${m.model_code}: ${String(e.message).slice(0, 180)}`);
      continue;
    }

    if (m.mrp) {
      try {
        await erpPost('Item Price', {
          doctype: 'Item Price',
          item_code: m.model_code,
          price_list: SELLING_PRICE_LIST,
          price_list_rate: Number(m.mrp),
          currency: 'INR',
          selling: 1,
        });
        madePrices++;
      } catch (e: any) {
        console.log(`      ⚠ price not set: ${String(e.message).slice(0, 160)}`);
      }
    }
  }

  console.log(`\n✔ created ${madeItems} item(s), ${madePrices} MRP price(s) in ${SELLING_PRICE_LIST}`);
  if (madeItems < toCreate.length) {
    console.log(`  ${toCreate.length - madeItems} failed — see above. Re-running skips what succeeded.`);
  }
}

main()
  .catch(e => { console.error('\n✗ failed —', e.message ?? e); process.exitCode = 1; })
  .finally(() => pool.end());

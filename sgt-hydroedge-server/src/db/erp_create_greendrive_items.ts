/// <reference types="node" />
// =====================================================================
// erp_create_greendrive_items.ts
// Creates the three GreenDrive items in ERPNext, plus their India price.
//
// DRY RUN BY DEFAULT. Creates nothing until you pass CONFIRM_CREATE=1.
//
//   npx tsx src/db/erp_create_greendrive_items.ts                  # report only
//   CONFIRM_CREATE=1 npx tsx src/db/erp_create_greendrive_items.ts # create
//
// Built the same way as erp_create_greenx_items.ts and with the same rule:
// EXISTING ITEMS ARE NEVER TOUCHED. An item_code that already exists is
// skipped and reported. A missing Item Price on an existing item IS added,
// because without it the quotation falls back to the catalogue figure and
// ERPNext no longer owns the rate.
//
// The catalogue comes from domain/greenDrive.ts, the same table the quote
// route prices from, so the two cannot disagree.
//
// Non-stock sales items, like the GreenX quoting items: these exist to be
// quoted, not to be stocked or valued.
//
// USD prices are NOT created. Export quotations need a USD price list and
// exchange rate in ERPNext that do not exist yet.
// =====================================================================

import 'dotenv/config';
import { GD_CATALOGUE, GD_HSN } from '../domain/greenDrive.js';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;

const COMPANY = process.env.ERP_COMPANY ?? 'SGT Hydroedge Private Limited';
const INCOME_ACCOUNT = process.env.ERP_INCOME_ACCOUNT ?? 'Sales - SGT';
const ITEM_GROUP = process.env.ERP_ITEM_GROUP ?? 'Final Assembly';
const UOM = 'Nos';
const SELLING_PRICE_LIST = process.env.ERP_SELLING_PRICE_LIST ?? 'Standard Selling';
const CONFIRMED = process.env.CONFIRM_CREATE === '1';

if (!BASE || !KEY || !SECRET) {
  console.error('✗ ERPNEXT_URL / ERPNEXT_API_KEY / ERPNEXT_API_SECRET must be set');
  process.exit(1);
}

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

async function main() {
  console.log(CONFIRMED
    ? `▶ Creating GreenDrive items in ${BASE}\n`
    : `▶ DRY RUN — nothing will be created. ${BASE}\n`);

  const [company] = await erpGet('Company', { filters: [['name', '=', COMPANY]], fields: ['name'] });
  if (!company) throw new Error(`Company "${COMPANY}" not found — set ERP_COMPANY`);
  const [group] = await erpGet('Item Group', { filters: [['name', '=', ITEM_GROUP]], fields: ['name'] });
  if (!group) throw new Error(`Item Group "${ITEM_GROUP}" not found — set ERP_ITEM_GROUP`);
  const [plist] = await erpGet('Price List', { filters: [['name', '=', SELLING_PRICE_LIST]], fields: ['name'] });
  if (!plist) throw new Error(`Price List "${SELLING_PRICE_LIST}" not found`);
  const [acct] = await erpGet('Account', { filters: [['name', '=', INCOME_ACCOUNT]], fields: ['name'] });
  if (!acct) console.log(`  ⚠ Income account "${INCOME_ACCOUNT}" not found — items will be created without it`);
  console.log(`  masters ok: ${COMPANY} · ${ITEM_GROUP} · ${SELLING_PRICE_LIST} · HSN ${GD_HSN}\n`);

  const plan: { row: typeof GD_CATALOGUE[number]; item: boolean; price: boolean }[] = [];
  for (const row of GD_CATALOGUE) {
    const item = (await erpGet('Item', {
      filters: [['item_code', '=', row.itemCode]], fields: ['name'], limit_page_length: 1,
    })).length > 0;
    const price = (await erpGet('Item Price', {
      filters: [['item_code', '=', row.itemCode], ['price_list', '=', SELLING_PRICE_LIST]],
      fields: ['name', 'price_list_rate'], limit_page_length: 1,
    }));
    if (price.length && Number(price[0].price_list_rate) !== row.inr) {
      console.log(`  ⚠ ${row.itemCode} is priced ₹${Number(price[0].price_list_rate).toLocaleString('en-IN')} in ERPNext, ` +
                  `catalogue says ₹${row.inr.toLocaleString('en-IN')}. ERPNext wins; not changed here.`);
    }
    plan.push({ row, item: !item, price: !price.length });
  }

  for (const p of plan) {
    const what = [p.item ? 'create item' : 'item exists', p.price ? `set price ₹${p.row.inr.toLocaleString('en-IN')}` : 'price exists']
    console.log(`  · ${p.row.itemCode.padEnd(16)} ${what.join(' · ')}`);
  }
  if (!plan.some(p => p.item || p.price)) {
    console.log('\n✔ Nothing to do — all three items and prices exist.');
    return;
  }
  if (!CONFIRMED) {
    console.log('\n  DRY RUN — nothing created.');
    console.log('  Re-run with CONFIRM_CREATE=1 to apply.');
    return;
  }

  console.log('\n  creating…');
  for (const { row, item, price } of plan) {
    if (item) {
      try {
        await erpPost('Item', {
          doctype: 'Item',
          item_code: row.itemCode,
          item_name: row.label,
          description: `${row.label}`,
          item_group: ITEM_GROUP,
          gst_hsn_code: GD_HSN,
          stock_uom: UOM,
          is_stock_item: 0,
          is_sales_item: 1,
          is_purchase_item: 0,
          // Required for Sales Partner commission to compute on this line,
          // once GreenDrive partners exist.
          grant_commission: 1,
          include_item_in_manufacturing: 0,
          end_of_life: '2099-12-31',
          uoms: [{ uom: UOM, conversion_factor: 1 }],
          item_defaults: [
            acct ? { company: COMPANY, income_account: INCOME_ACCOUNT } : { company: COMPANY },
          ],
        });
        console.log(`    ✓ item ${row.itemCode}`);
      } catch (e: any) {
        console.log(`    ✗ item ${row.itemCode}: ${String(e.message).slice(0, 180)}`);
        continue;
      }
    }
    if (price) {
      try {
        await erpPost('Item Price', {
          doctype: 'Item Price',
          item_code: row.itemCode,
          price_list: SELLING_PRICE_LIST,
          price_list_rate: row.inr,
          currency: 'INR',
          selling: 1,
        });
        console.log(`    ✓ price ${row.itemCode} ₹${row.inr.toLocaleString('en-IN')}`);
      } catch (e: any) {
        console.log(`    ⚠ price ${row.itemCode} not set: ${String(e.message).slice(0, 160)}`);
      }
    }
  }
  console.log('\n✔ done. Re-running skips whatever succeeded.');
}

main().catch(e => { console.error('\n✗ failed —', e.message ?? e); process.exitCode = 1; });

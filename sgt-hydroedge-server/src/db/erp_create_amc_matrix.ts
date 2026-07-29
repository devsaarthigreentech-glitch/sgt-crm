/// <reference types="node" />
// =====================================================================
// erp_create_amc_matrix.ts
// One AMC item per model per term: 23 models × 3 terms = 69 items,
// each with a real Item Price.
//
// DRY RUN BY DEFAULT.
//
//   npx tsx src/db/erp_create_amc_matrix.ts
//   ERP_AMC_SAC=998719 CONFIRM_CREATE=1 npx tsx src/db/erp_create_amc_matrix.ts
//
// Why this replaces the single GreenX-AMC item
// --------------------------------------------
// The generic item had no Item Price, so every quotation line showed a
// price list rate of ₹0 and then the real figure in the "discounted rate"
// column — which reads, to a customer, as an ₹84,336 discount off nothing.
//
// A priced item per model per term means the printed line shows a list
// rate that equals the charge, the discount column stays empty, and the
// AMC catalogue is visible in ERPNext rather than computed in our code.
//
// Pricing is 10% of the model's MRP per year, so a 3-year AMC is three
// times the 1-year figure. Taken from quote_service, same as the machines,
// so the two cannot drift.
//
// The old GreenX-AMC item is NOT deleted — quotations already reference
// it. Disable it in ERPNext once nothing new points at it.
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;

const COMPANY = process.env.ERP_COMPANY ?? 'SGT Hydroedge Private Limited';
const INCOME_ACCOUNT = process.env.ERP_INCOME_ACCOUNT ?? 'Sales - SGT';
const ITEM_GROUP = process.env.ERP_AMC_ITEM_GROUP ?? 'Services';
const PRICE_LIST = process.env.ERP_SELLING_PRICE_LIST ?? 'Standard Selling';
const SAC = process.env.ERP_AMC_SAC ?? '';
const AMC_PCT = Number(process.env.QUOTE_AMC_PCT ?? '10');
const TERMS = [1, 2, 3];
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

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, json, text };
}

/** The one place the AMC item code is constructed. */
export const amcCode = (modelCode: string, years: number) => `${modelCode}-AMC-${years}Y`;

async function main() {
  console.log(CONFIRMED
    ? `▶ Creating the AMC matrix — ${BASE}\n`
    : `▶ DRY RUN — nothing will be created. ${BASE}\n`);

  if (!SAC) {
    console.error('✗ ERP_AMC_SAC is required — india_compliance rejects an Item without a SAC.');
    console.error('  AMC is a service and cannot reuse the machine HSN 85433000.');
    console.error('  998719 is the code normally used for maintenance of machinery;');
    console.error('  confirm with your CA, then re-run with ERP_AMC_SAC=998719.');
    process.exit(1);
  }

  const { rows: models } = await pool.query<{ model_code: string; mrp: string | null }>(`
    select pm.model_code,
           (select pl.unit_price::text
              from quote_service.price_line pl
              join quote_service.price_book pb on pb.id = pl.price_book_id
             where pl.model_id = pm.id and pb.code = 'GREENX_MRP_V1_1') as mrp
      from quote_service.product_model pm
     where pm.product_code = 'GreenX' and pm.is_active
     order by pm.sort_order
  `);
  if (!models.length) throw new Error('no GreenX models in quote_service');

  const planned: { code: string; name: string; model: string; years: number; price: number }[] = [];
  for (const m of models) {
    if (!m.mrp) {
      console.log(`  ⚠ ${m.model_code} has no MRP in the price book — skipped`);
      continue;
    }
    for (const y of TERMS) {
      planned.push({
        code: amcCode(m.model_code, y),
        name: `${m.model_code} AMC — ${y} year${y > 1 ? 's' : ''}`,
        model: m.model_code,
        years: y,
        price: Math.round(Number(m.mrp) * AMC_PCT / 100) * y,
      });
    }
  }
  console.log(`  ${models.length} models × ${TERMS.length} terms = ${planned.length} AMC items` +
              `  (${AMC_PCT}% of MRP per year)\n`);

  // What already exists.
  const existing = new Set<string>();
  for (let i = 0; i < planned.length; i += 40) {
    const batch = planned.slice(i, i + 40).map(p => p.code);
    const r = await call('GET',
      `/api/resource/Item?filters=${encodeURIComponent(JSON.stringify([['item_code', 'in', batch]]))}` +
      `&fields=${encodeURIComponent('["name"]')}&limit_page_length=100`);
    for (const row of r.json?.data ?? []) existing.add(String(row.name));
  }
  const todo = planned.filter(p => !existing.has(p.code));
  if (existing.size) console.log(`  ${existing.size} already exist and are left untouched.`);
  if (!todo.length) {
    console.log('\n✔ Nothing to create — the whole matrix is present.');
    return;
  }

  console.log(`\n  ${todo.length} to create. Sample:`);
  for (const p of todo.slice(0, 6)) {
    console.log(`    · ${p.code.padEnd(24)} ₹${p.price.toLocaleString('en-IN')}`);
  }
  if (todo.length > 6) console.log(`    … and ${todo.length - 6} more`);

  if (!CONFIRMED) {
    console.log('\n  DRY RUN — nothing created.');
    console.log('  Re-run with CONFIRM_CREATE=1 to create them.');
    return;
  }

  console.log('\n  creating…');
  let items = 0, prices = 0, failed = 0;
  for (const p of todo) {
    const r = await call('POST', '/api/resource/Item', {
      doctype: 'Item',
      item_code: p.code,
      item_name: p.name,
      description:
        `Annual maintenance contract for ${p.model}, ${p.years} year${p.years > 1 ? 's' : ''}, ` +
        `commencing after the standard warranty period.`,
      item_group: ITEM_GROUP,
      gst_hsn_code: SAC,
      stock_uom: 'Nos',
      is_stock_item: 0,
      is_sales_item: 1,
      is_purchase_item: 0,
      grant_commission: 1,
      include_item_in_manufacturing: 0,
      end_of_life: '2099-12-31',
      uoms: [{ uom: 'Nos', conversion_factor: 1 }],
      item_defaults: [{ company: COMPANY, income_account: INCOME_ACCOUNT }],
    });
    if (!r.ok) {
      failed++;
      const why = r.json?.exception ?? r.text.slice(0, 160);
      console.log(`    ✗ ${p.code}: ${String(why).replace(/\s+/g, ' ').slice(0, 160)}`);
      continue;
    }
    items++;

    const pr = await call('POST', '/api/resource/Item Price', {
      doctype: 'Item Price',
      item_code: p.code,
      price_list: PRICE_LIST,
      price_list_rate: p.price,
      currency: 'INR',
      selling: 1,
    });
    if (pr.ok) prices++;
    else console.log(`      ⚠ ${p.code}: price not set`);
  }

  console.log(`\n✔ created ${items} item(s), ${prices} price(s)` +
              (failed ? `, ${failed} failed` : ''));
  console.log('  The old generic GreenX-AMC item is untouched. Disable it in ERPNext');
  console.log('  once no new quotation points at it.');
}

main()
  .catch(e => { console.error('\n✗ failed —', e.message ?? e); process.exitCode = 1; })
  .finally(() => pool.end());

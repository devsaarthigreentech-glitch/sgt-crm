/// <reference types="node" />
// =====================================================================
// erp_fix_greenx_items.ts
// Turns "Maintain Stock" on for the 23 GreenX catalogue items and gives
// them a default warehouse. Also reports the Item Price rows that exist
// for each, so "the price isn't there" can be checked rather than guessed.
//
// DRY RUN BY DEFAULT.
//
//   npx tsx src/db/erp_fix_greenx_items.ts                 # report
//   CONFIRM_FIX=1 npx tsx src/db/erp_fix_greenx_items.ts   # apply
//
// Only the 23 codes from quote_service are touched. The pre-existing
// "Saarthi GreenX-*" assembly items and "GreenX <band> kVA" items are
// not read, not written, not listed.
//
// Note on prices: an Item's "Standard Selling Rate" field is a
// create-time convenience that GENERATES an Item Price record. It is not
// where the price is stored, so it reads blank on the Item form even
// when a price exists. The real records are under Item Price. This
// script prints them per item.
//
// Note on stock: switching is_stock_item on is only possible while an
// item has no stock ledger entries. These were created days ago and
// never transacted, so it will go through — but it does mean these 23
// now sit alongside the "Saarthi GreenX-*" assemblies as separate
// stock items for the same physical machine. Inventory and valuation
// will count them separately. That is the owner's call, made knowingly.
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;

const COMPANY = process.env.ERP_COMPANY ?? 'SGT Hydroedge Private Limited';
const WAREHOUSE = process.env.ERP_WAREHOUSE ?? 'Stores - SGT';
const INCOME_ACCOUNT = process.env.ERP_INCOME_ACCOUNT ?? 'Sales - SGT';
const CONFIRMED = process.env.CONFIRM_FIX === '1';

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

async function erpGetDoc(doctype: string, name: string) {
  const res = await fetch(
    `${BASE}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, { headers });
  if (!res.ok) throw new Error(`GET ${doctype}/${name} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).data as any;
}

async function erpPut(doctype: string, name: string, doc: Record<string, unknown>) {
  const res = await fetch(
    `${BASE}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
    { method: 'PUT', headers, body: JSON.stringify(doc) });
  const text = await res.text();
  if (!res.ok) throw new Error(`PUT ${doctype}/${name} ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text).data as any;
}

async function main() {
  console.log(CONFIRMED
    ? `▶ Enabling stock on GreenX catalogue items — ${BASE}\n`
    : `▶ DRY RUN — nothing will be changed. ${BASE}\n`);

  const { rows: models } = await pool.query<{ model_code: string }>(`
    select model_code from quote_service.product_model
     where product_code = 'GreenX' and is_active order by sort_order
  `);
  if (!models.length) throw new Error('no GreenX models in quote_service');

  // Verify the warehouse before touching anything.
  const [wh] = await erpGet('Warehouse', { filters: [['name', '=', WAREHOUSE]], fields: ['name', 'company'] });
  if (!wh) {
    const all = await erpGet('Warehouse', { fields: ['name'], limit_page_length: 50 });
    throw new Error(
      `Warehouse "${WAREHOUSE}" not found. Available: ${all.map(w => w.name).join(', ').slice(0, 300)}. ` +
      `Set ERP_WAREHOUSE to one of them.`);
  }
  console.log(`  warehouse: ${wh.name}\n`);

  const needFix: { code: string; doc: any; prices: any[] }[] = [];
  const alreadyOk: string[] = [];
  const missing: string[] = [];

  for (const m of models) {
    let doc: any;
    try {
      doc = await erpGetDoc('Item', m.model_code);
    } catch {
      missing.push(m.model_code);
      continue;
    }
    const prices = await erpGet('Item Price', {
      filters: [['item_code', '=', m.model_code]],
      fields: ['name', 'price_list', 'price_list_rate', 'selling'],
      limit_page_length: 10,
    });
    const hasWarehouse = (doc.item_defaults ?? []).some((d: any) => d.default_warehouse);
    if (doc.is_stock_item === 1 && hasWarehouse) alreadyOk.push(m.model_code);
    else needFix.push({ code: m.model_code, doc, prices });
  }

  if (missing.length) {
    console.log(`  ⚠ not found in ERPNext (run erp_create_greenx_items.ts first): ${missing.join(', ')}\n`);
  }
  if (alreadyOk.length) {
    console.log(`  ${alreadyOk.length} already have stock enabled with a warehouse — untouched.\n`);
  }

  // Price reality check, since the Item form does not show it.
  console.log('  Item Price rows found (the Item form will not show these):');
  let priced = 0;
  for (const f of needFix.concat(alreadyOk.map(c => ({ code: c, doc: null, prices: [] as any[] })))) {
    const rows = f.prices.length
      ? f.prices
      : await erpGet('Item Price', {
          filters: [['item_code', '=', f.code]],
          fields: ['price_list', 'price_list_rate', 'selling'], limit_page_length: 10,
        });
    if (rows.length) {
      priced++;
      for (const r of rows) {
        console.log(`    · ${f.code.padEnd(14)} ${String(r.price_list).padEnd(18)} ₹${Number(r.price_list_rate).toLocaleString('en-IN')}`);
      }
    } else {
      console.log(`    · ${f.code.padEnd(14)} — no Item Price`);
    }
  }
  console.log(`    ${priced} of ${models.length} items have at least one price.\n`);

  if (!needFix.length) {
    console.log('✔ Nothing to change — all catalogue items already maintain stock.');
    return;
  }

  console.log(`  ${needFix.length} item(s) to update (is_stock_item -> 1, default warehouse -> ${WAREHOUSE}):`);
  for (const f of needFix) console.log(`    · ${f.code}`);

  if (!CONFIRMED) {
    console.log('\n  DRY RUN — nothing changed.');
    console.log('  Re-run with CONFIRM_FIX=1 to apply.');
    return;
  }

  console.log('\n  updating…');
  let done = 0;
  for (const f of needFix) {
    // item_defaults is a child table: send it whole, preserving whatever is
    // already there and only filling in the warehouse.
    const defaults: any[] = Array.isArray(f.doc.item_defaults) && f.doc.item_defaults.length
      ? f.doc.item_defaults.map((d: any) => ({
          ...d,
          company: d.company ?? COMPANY,
          default_warehouse: d.default_warehouse ?? WAREHOUSE,
          income_account: d.income_account ?? INCOME_ACCOUNT,
        }))
      : [{ company: COMPANY, default_warehouse: WAREHOUSE, income_account: INCOME_ACCOUNT }];

    try {
      await erpPut('Item', f.code, { is_stock_item: 1, item_defaults: defaults });
      done++;
      console.log(`    ✓ ${f.code}`);
    } catch (e: any) {
      console.log(`    ✗ ${f.code}: ${String(e.message).slice(0, 220)}`);
    }
  }
  console.log(`\n✔ updated ${done} of ${needFix.length} item(s)`);
  if (done < needFix.length) console.log('  Re-running skips the ones that succeeded.');
}

main()
  .catch(e => { console.error('\n✗ failed —', e.message ?? e); process.exitCode = 1; })
  .finally(() => pool.end());

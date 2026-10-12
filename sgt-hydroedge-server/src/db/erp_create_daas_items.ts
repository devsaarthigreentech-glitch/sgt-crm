/// <reference types="node" />
// =====================================================================
// erp_create_daas_items.ts
// Creates the two ERPNext items every DaaS quotation is raised on:
//
//   DaaS-Upfront   "Upfront Payment"     30% of the price after discount
//   DaaS-Rent      "Rent on DaaS Model"  one month's rent, in advance
//
// The names match the owner's proforma SAL-QTN-2026-00021, and so does the
// SAC: 997319, rental of machinery. Both are non-stock SERVICE items with
// NO Item Price — the amount differs per machine and tenure, so every
// quotation line carries its own rate (sent as an exact rate). And no
// partner commission: DaaS is SGT's own rental (staff only).
//
// DRY RUN BY DEFAULT.
//
//   npx tsx src/db/erp_create_daas_items.ts
//   CONFIRM_CREATE=1 npx tsx src/db/erp_create_daas_items.ts
//
// Existing items are never modified.
// =====================================================================

import 'dotenv/config';
import { DAAS_UPFRONT_ITEM, DAAS_RENT_ITEM, DAAS_SAC } from '../domain/daas.js';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;
const COMPANY = process.env.ERP_COMPANY ?? 'SGT Hydroedge Private Limited';
const INCOME_ACCOUNT = process.env.ERP_INCOME_ACCOUNT ?? 'Sales - SGT';
const ITEM_GROUP = process.env.ERP_AMC_ITEM_GROUP ?? 'Services';
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

async function exists(doctype: string, name: string): Promise<boolean> {
  const res = await fetch(`${BASE}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, { headers });
  return res.ok;
}

const ITEMS = [
  { code: DAAS_UPFRONT_ITEM, name: 'Upfront Payment',
    description: 'Upfront payment under the DaaS rental model.' },
  { code: DAAS_RENT_ITEM, name: 'Rent on DaaS Model',
    description: 'Monthly rental under the DaaS model, payable in advance.' },
];

async function main() {
  console.log(CONFIRMED ? `▶ Creating DaaS items in ${BASE}\n` : `▶ DRY RUN — nothing will be created. ${BASE}\n`);
  if (!await exists('Item Group', ITEM_GROUP)) throw new Error(`Item Group "${ITEM_GROUP}" not found — set ERP_AMC_ITEM_GROUP`);
  const acct = await exists('Account', INCOME_ACCOUNT);

  const todo = [];
  for (const it of ITEMS) {
    const has = await exists('Item', it.code);
    console.log(`  · ${it.code.padEnd(14)} "${it.name}"  SAC ${DAAS_SAC}  ${has ? 'exists — left untouched' : 'to create'}`);
    if (!has) todo.push(it);
  }
  if (!todo.length) { console.log('\n✔ Nothing to do.'); return; }
  if (!CONFIRMED) { console.log('\n  DRY RUN — re-run with CONFIRM_CREATE=1 to create.'); return; }

  let failed = 0;
  for (const it of todo) {
    const res = await fetch(`${BASE}/api/resource/Item`, {
      method: 'POST', headers,
      body: JSON.stringify({
        doctype: 'Item',
        item_code: it.code, item_name: it.name, description: it.description,
        item_group: ITEM_GROUP, gst_hsn_code: DAAS_SAC, stock_uom: 'Nos',
        is_stock_item: 0, is_sales_item: 1, is_purchase_item: 0,
        grant_commission: 0, include_item_in_manufacturing: 0, end_of_life: '2099-12-31',
        uoms: [{ uom: 'Nos', conversion_factor: 1 }],
        item_defaults: [acct ? { company: COMPANY, income_account: INCOME_ACCOUNT } : { company: COMPANY }],
      }),
    });
    if (res.ok) console.log(`    ✓ ${it.code}`);
    else { failed++; console.log(`    ✗ ${it.code}: ${(await res.text()).slice(0, 200)}`); }
  }
  if (failed) { console.log(`\n✗ ${failed} failed — see above.`); process.exitCode = 1; }
  else console.log('\n✔ done.');
}

main().catch(e => { console.error('\n✗ failed —', e.message ?? e); process.exitCode = 1; });

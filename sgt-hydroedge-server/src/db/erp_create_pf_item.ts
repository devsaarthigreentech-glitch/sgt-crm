/// <reference types="node" />
// =====================================================================
// erp_create_pf_item.ts
// Creates the ERPNext item a GreenDrive quotation's optional Packing &
// Forwarding line is raised on:
//
//   Packing-Forwarding   "Packing & Forwarding Charges"
//
// Non-stock, NO Item Price (the amount is 5% of each quotation's machine
// value, sent as an exact rate), and grant_commission = 0 so the dealer's
// commission stays on the machines only. HSN = the machine's (85433000):
// P&F billed with the goods is part of a composite supply and takes the
// principal supply's classification and GST rate.
//
// DRY RUN BY DEFAULT.
//
//   npx tsx src/db/erp_create_pf_item.ts
//   CONFIRM_CREATE=1 npx tsx src/db/erp_create_pf_item.ts
//
// An existing item is never modified.
// =====================================================================

import 'dotenv/config';
import { GD_PF_ITEM, GD_HSN } from '../domain/greenDrive.js';

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

async function main() {
  console.log(CONFIRMED ? `▶ Creating the P&F item in ${BASE}\n` : `▶ DRY RUN — nothing will be created. ${BASE}\n`);
  if (!await exists('Item Group', ITEM_GROUP)) throw new Error(`Item Group "${ITEM_GROUP}" not found — set ERP_AMC_ITEM_GROUP`);
  const acct = await exists('Account', INCOME_ACCOUNT);

  const has = await exists('Item', GD_PF_ITEM);
  console.log(`  · ${GD_PF_ITEM}  "Packing & Forwarding Charges"  HSN ${GD_HSN}  ${has ? 'exists — left untouched' : 'to create'}`);
  if (has) { console.log('\n✔ Nothing to do.'); return; }
  if (!CONFIRMED) { console.log('\n  DRY RUN — re-run with CONFIRM_CREATE=1 to create.'); return; }

  const res = await fetch(`${BASE}/api/resource/Item`, {
    method: 'POST', headers,
    body: JSON.stringify({
      doctype: 'Item',
      item_code: GD_PF_ITEM, item_name: 'Packing & Forwarding Charges',
      description: 'Packing & Forwarding charges.',
      item_group: ITEM_GROUP, gst_hsn_code: GD_HSN, stock_uom: 'Nos',
      is_stock_item: 0, is_sales_item: 1, is_purchase_item: 0,
      grant_commission: 0, include_item_in_manufacturing: 0, end_of_life: '2099-12-31',
      uoms: [{ uom: 'Nos', conversion_factor: 1 }],
      item_defaults: [acct ? { company: COMPANY, income_account: INCOME_ACCOUNT } : { company: COMPANY }],
    }),
  });
  if (res.ok) console.log(`    ✓ ${GD_PF_ITEM}\n\n✔ done.`);
  else { console.log(`    ✗ ${GD_PF_ITEM}: ${(await res.text()).slice(0, 300)}`); process.exitCode = 1; }
}

main().catch(e => { console.error('\n✗ failed —', e.message ?? e); process.exitCode = 1; });

/// <reference types="node" />
// =====================================================================
// erp_create_pf_item.ts
// Creates the ERPNext items a GreenDrive quotation's optional charge lines
// are raised on:
//
//   Packing-Forwarding     "Packing & Forwarding Charges"  7.5% of machine value SAC 998540
//   Installation-Charges   "Installation Charges"          fixed ₹7,000, India   SAC 998736
//
// Non-stock, NO Item Price (each quotation sends the amount as an exact
// rate), and grant_commission = 0 so the dealer's commission stays on the
// machines only.
//
// Codes (owner asked 2026-11-11 for the right ones, not the machine's HSN):
//   998540  Packaging services — packing & forwarding.
//   998736  Installation services of electrical machinery and apparatus
//           n.e.c. — GreenDrive is HSN 85433000, an electrical apparatus.
// Both 18% GST, the same as the machine. Override with ERP_PF_HSN /
// ERP_INSTALL_HSN if your CA classifies them differently.
//
// DRY RUN BY DEFAULT.
//
//   npx tsx src/db/erp_create_pf_item.ts
//   CONFIRM_CREATE=1 npx tsx src/db/erp_create_pf_item.ts
//
// Creates missing items. On an item that already exists it changes ONE
// thing, the HSN/SAC, and only when it differs from the code above —
// Packing-Forwarding was first created with the machine's 85433000.
// Quotations already raised keep the code they were made with.
// =====================================================================

import 'dotenv/config';
import { GD_PF_ITEM, GD_INSTALL_ITEM } from '../domain/greenDrive.js';

const ITEMS = [
  { code: GD_PF_ITEM, name: 'Packing & Forwarding Charges',
    description: 'Packing & Forwarding charges.', hsn: process.env.ERP_PF_HSN ?? '998540' },
  { code: GD_INSTALL_ITEM, name: 'Installation Charges',
    description: 'Installation charges.', hsn: process.env.ERP_INSTALL_HSN ?? '998736' },
];

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

const url = (doctype: string, name?: string) =>
  `${BASE}/api/resource/${encodeURIComponent(doctype)}${name ? `/${encodeURIComponent(name)}` : ''}`;

async function exists(doctype: string, name: string): Promise<boolean> {
  return (await fetch(url(doctype, name), { headers })).ok;
}

/** The item's current HSN, or undefined when the item does not exist. */
async function currentHsn(code: string): Promise<string | null | undefined> {
  const res = await fetch(url('Item', code), { headers });
  if (!res.ok) return undefined;
  return (await res.json()).data?.gst_hsn_code ?? null;
}

async function main() {
  console.log(CONFIRMED
    ? `▶ GreenDrive charge items in ${BASE}\n`
    : `▶ DRY RUN — nothing will be changed. ${BASE}\n`);
  if (!await exists('Item Group', ITEM_GROUP)) throw new Error(`Item Group "${ITEM_GROUP}" not found — set ERP_AMC_ITEM_GROUP`);
  const acct = await exists('Account', INCOME_ACCOUNT);

  const toCreate: typeof ITEMS = [];
  const toFix: typeof ITEMS = [];
  for (const it of ITEMS) {
    const hsn = await currentHsn(it.code);
    const state = hsn === undefined ? 'to create'
      : hsn === it.hsn ? 'exists — correct'
      : `exists with ${hsn ?? 'no code'} — HSN/SAC to change`;
    console.log(`  · ${it.code.padEnd(22)} "${it.name}"  SAC ${it.hsn}  ${state}`);
    if (hsn === undefined) toCreate.push(it);
    else if (hsn !== it.hsn) toFix.push(it);
  }
  if (!toCreate.length && !toFix.length) { console.log('\n✔ Nothing to do.'); return; }
  if (!CONFIRMED) { console.log('\n  DRY RUN — re-run with CONFIRM_CREATE=1 to apply.'); return; }

  let failed = 0;
  for (const it of toCreate) {
    const res = await fetch(url('Item'), {
      method: 'POST', headers,
      body: JSON.stringify({
        doctype: 'Item',
        item_code: it.code, item_name: it.name, description: it.description,
        item_group: ITEM_GROUP, gst_hsn_code: it.hsn, stock_uom: 'Nos',
        is_stock_item: 0, is_sales_item: 1, is_purchase_item: 0,
        grant_commission: 0, include_item_in_manufacturing: 0, end_of_life: '2099-12-31',
        uoms: [{ uom: 'Nos', conversion_factor: 1 }],
        item_defaults: [acct ? { company: COMPANY, income_account: INCOME_ACCOUNT } : { company: COMPANY }],
      }),
    });
    if (res.ok) console.log(`    ✓ created ${it.code}`);
    else { failed++; console.log(`    ✗ ${it.code}: ${(await res.text()).slice(0, 300)}`); }
  }
  for (const it of toFix) {
    const res = await fetch(url('Item', it.code), {
      method: 'PUT', headers, body: JSON.stringify({ gst_hsn_code: it.hsn }),
    });
    if (res.ok) console.log(`    ✓ ${it.code} HSN/SAC → ${it.hsn}`);
    else { failed++; console.log(`    ✗ ${it.code}: ${(await res.text()).slice(0, 300)}`); }
  }
  if (failed) {
    console.log(`\n✗ ${failed} failed — see above. "Could not find GST HSN Code" means that ` +
                `code is not in ERPNext's HSN list yet: add it there, or set ERP_PF_HSN / ERP_INSTALL_HSN.`);
    process.exitCode = 1;
  } else console.log('\n✔ done.');
}

main().catch(e => { console.error('\n✗ failed —', e.message ?? e); process.exitCode = 1; });

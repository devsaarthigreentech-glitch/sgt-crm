/// <reference types="node" />
// =====================================================================
// erp_create_amc_item.ts
// Creates the AMC service item quotations bill maintenance against.
//
// DRY RUN BY DEFAULT.
//
//   npx tsx src/db/erp_create_amc_item.ts
//   CONFIRM_CREATE=1 npx tsx src/db/erp_create_amc_item.ts
//
// A service, not a machine: is_stock_item = 0 and is_purchase_item = 0.
// It carries no fixed price — the rate is 10% of whichever GreenX unit it
// accompanies, so it is set per quotation line rather than in Item Price.
//
// ── One thing you must set yourself ─────────────────────────────────
// The SAC code. AMC is a SERVICE, so it does not share the machine's HSN
// 85433000; services are classified separately and getting it wrong
// misstates your GST returns. The script leaves it blank unless you pass
// ERP_AMC_SAC, because guessing a tax classification is not something a
// deployment script should do. Set it in ERPNext, or:
//
//   ERP_AMC_SAC=998719 CONFIRM_CREATE=1 npx tsx src/db/erp_create_amc_item.ts
// =====================================================================

import 'dotenv/config';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;

const CODE = process.env.ERP_AMC_ITEM ?? 'GreenX-AMC';
const COMPANY = process.env.ERP_COMPANY ?? 'SGT Hydroedge Private Limited';
const INCOME_ACCOUNT = process.env.ERP_INCOME_ACCOUNT ?? 'Sales - SGT';
const ITEM_GROUP = process.env.ERP_AMC_ITEM_GROUP ?? 'Services';
const SAC = process.env.ERP_AMC_SAC ?? '';
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

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, json, text };
}

async function main() {
  console.log(CONFIRMED
    ? `▶ Creating AMC item "${CODE}" — ${BASE}\n`
    : `▶ DRY RUN — nothing will be created. ${BASE}\n`);

  const found = await call('GET',
    `/api/resource/Item/${encodeURIComponent(CODE)}`);
  if (found.ok) {
    const d = found.json.data;
    console.log(`✔ "${CODE}" already exists — left untouched.`);
    console.log(`  group=${d.item_group} · stock=${d.is_stock_item} · sales=${d.is_sales_item} · sac/hsn=${d.gst_hsn_code || '(none)'}`);
    if (!d.gst_hsn_code) {
      console.log('  ⚠ No SAC set. AMC is a service and needs its own classification —');
      console.log('    set it on the Item in ERPNext before invoicing against it.');
    }
    return;
  }

  // The item group must exist; Services is not present on every site.
  const grp = await call('GET', `/api/resource/${encodeURIComponent('Item Group')}/${encodeURIComponent(ITEM_GROUP)}`);
  if (!grp.ok) {
    const all = await call('GET',
      `/api/resource/${encodeURIComponent('Item Group')}?fields=${encodeURIComponent('["name"]')}&limit_page_length=50`);
    const names = (all.json?.data ?? []).map((g: any) => g.name).join(', ');
    console.error(`✗ Item Group "${ITEM_GROUP}" does not exist.`);
    console.error(`  Available: ${names.slice(0, 400)}`);
    console.error('  Set ERP_AMC_ITEM_GROUP to one of them.');
    process.exit(1);
  }

  console.log(`  Would create "${CODE}":`);
  console.log(`    group=${ITEM_GROUP} · non-stock service · sales only`);
  console.log(`    SAC=${SAC || '(blank — set it in ERPNext before invoicing)'}`);
  console.log(`    no Item Price: the rate is 10% of the machine it accompanies,`);
  console.log(`    so it is set per quotation line.`);

  if (!CONFIRMED) {
    console.log('\n  DRY RUN — nothing created.');
    console.log('  Re-run with CONFIRM_CREATE=1 to create it.');
    return;
  }

  const r = await call('POST', '/api/resource/Item', {
    doctype: 'Item',
    item_code: CODE,
    item_name: 'GreenX Annual Maintenance Contract',
    description:
      'Annual maintenance contract for a GreenX Controlled Hydrogen Fuel Assist unit. ' +
      'Charged per year, commencing after the standard warranty period.',
    item_group: ITEM_GROUP,
    stock_uom: 'Nos',
    is_stock_item: 0,
    is_sales_item: 1,
    is_purchase_item: 0,
    grant_commission: 1,
    include_item_in_manufacturing: 0,
    end_of_life: '2099-12-31',
    ...(SAC ? { gst_hsn_code: SAC } : {}),
    uoms: [{ uom: 'Nos', conversion_factor: 1 }],
    item_defaults: [{ company: COMPANY, income_account: INCOME_ACCOUNT }],
  });

  if (!r.ok) {
    const why = r.json?.exception ?? r.text.slice(0, 300);
    console.error(`\n✗ could not create: ${String(why).replace(/\s+/g, ' ').slice(0, 300)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n✔ created "${r.json.data.name}"`);
  if (!SAC) {
    console.log('  ⚠ No SAC code set. Add one on the Item in ERPNext before you');
    console.log('    invoice against it — a service under a machine HSN is wrong.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });

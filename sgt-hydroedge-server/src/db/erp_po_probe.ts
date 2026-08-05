/// <reference types="node" />
// =====================================================================
// erp_po_probe.ts
// Why is the tax table on a dealer PO empty?
//
// READ-ONLY BY DEFAULT.
//
//   npx tsx src/db/erp_po_probe.ts                  # newest PO
//   npx tsx src/db/erp_po_probe.ts SGT-PO-202627-0001
//   REPAIR=1 npx tsx src/db/erp_po_probe.ts SGT-PO-202627-0001
//                                                   # re-attach the rows
//
// The tax rows and the item rows are written by ONE POST, through one
// code path, from one source document. So "items landed and taxes did
// not" narrows to a small number of causes, and this checks all of them
// in order rather than guessing:
//
//   1. Does the child doctype exist at all, and is it a child table?
//   2. Do its fieldnames match what services/dealerPo.ts sends?
//   3. Does the parent's `taxes` field point at exactly that doctype?
//      (A Table field whose options name a doctype that does not exist
//      is silently dropped by Frappe on write — no error, no rows.)
//   4. Did the SOURCE quotation have tax rows to copy in the first place?
//   5. What does the PO actually hold now?
//   6. If rows are missing, PUT them back and print the RAW Frappe
//      response, which is the only thing that names the real cause.
//
// Step 6 is the one that matters. Everything above it is elimination.
// =====================================================================

import 'dotenv/config';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;
const REPAIR = process.env.REPAIR === '1';

const DOCTYPE = process.env.ERP_PO_DOCTYPE ?? 'SGT Dealer PO';
const ITEM_DOCTYPE = `${DOCTYPE} Item`;
const TAX_DOCTYPE = `${DOCTYPE} Tax`;

const WANT_TAX_FIELDS = ['description', 'rate', 'tax_amount'];
const WANT_ITEM_FIELDS = [
  'item_code', 'item_name', 'gst_hsn_code', 'description', 'qty', 'uom',
  'price_list_rate', 'discount_percentage', 'discount_amount', 'rate', 'amount',
];

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

/** Frappe buries the useful line in a traceback; dig it out. */
function frappeError(text: string): string {
  try {
    const j = JSON.parse(text);
    const msgs = j._server_messages ? JSON.parse(j._server_messages) : null;
    if (Array.isArray(msgs) && msgs.length) {
      try { return JSON.parse(msgs[0]).message ?? String(msgs[0]); }
      catch { return String(msgs[0]); }
    }
    return String(j.exception ?? j.message ?? text);
  } catch {
    return text;
  }
}

const flat = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

async function getDoc(doctype: string, name: string) {
  const r = await call('GET',
    `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  return r.ok ? r.json?.data ?? null : null;
}

async function main() {
  console.log(`▶ dealer PO probe — ${BASE}\n`);

  // ---- 1 & 2. The child doctypes ---------------------------------------
  console.log('1. Child doctypes');
  const children: Array<[string, string[]]> = [
    [ITEM_DOCTYPE, WANT_ITEM_FIELDS],
    [TAX_DOCTYPE, WANT_TAX_FIELDS],
  ];
  const childOk = new Map<string, boolean>();
  for (const [name, want] of children) {
    const dt = await getDoc('DocType', name);
    if (!dt) {
      console.log(`   ✗ "${name}" DOES NOT EXIST`);
      console.log('       → this alone explains empty rows: Frappe drops a Table field');
      console.log('         whose child doctype is missing, without raising anything.');
      console.log('       → fix: CONFIRM_CREATE=1 npx tsx src/db/erp_create_dealer_po_doctype.ts');
      childOk.set(name, false);
      continue;
    }
    const fields: string[] = (dt.fields ?? []).map((f: any) => String(f.fieldname));
    const missing = want.filter(f => !fields.includes(f));
    console.log(`   ${missing.length ? '⚠' : '✓'} "${name}"  istable=${dt.istable ?? 0}  ` +
                `custom=${dt.custom ?? 0}  ${fields.length} field(s)`);
    console.log(`       has: ${fields.join(', ') || '(none)'}`);
    if (missing.length) {
      console.log(`       MISSING: ${missing.join(', ')}`);
      console.log('       → values for fields the child doctype does not have are discarded.');
    }
    if (!dt.istable) {
      console.log('       ✗ istable is 0 — this is not a child table and cannot hold rows.');
    }
    childOk.set(name, !!dt.istable && !missing.length);
  }

  // ---- 3. The parent's Table fields -------------------------------------
  console.log('\n2. Parent Table fields');
  const parent = await getDoc('DocType', DOCTYPE);
  if (!parent) {
    console.error(`   ✗ "${DOCTYPE}" does not exist. Run erp_create_dealer_po_doctype.ts.`);
    process.exit(1);
  }
  for (const fn of ['items', 'taxes']) {
    const f = (parent.fields ?? []).find((x: any) => x.fieldname === fn);
    if (!f) { console.log(`   ✗ no "${fn}" field on ${DOCTYPE}`); continue; }
    const target = String(f.options ?? '');
    const exists = childOk.has(target);
    console.log(`   ${exists ? '✓' : '✗'} ${fn}: fieldtype=${f.fieldtype} options="${target}"`);
    if (!exists) {
      console.log(`       → options name a doctype this probe did not check/find.`);
      console.log('         A Table field pointing at a missing doctype writes nothing.');
    }
  }

  // ---- 4 & 5. The documents ---------------------------------------------
  let poName = process.argv[2];
  if (!poName) {
    const r = await call('GET',
      `/api/resource/${encodeURIComponent(DOCTYPE)}` +
      `?fields=${encodeURIComponent('["name"]')}&limit_page_length=1&order_by=creation desc`);
    poName = r.json?.data?.[0]?.name ?? '';
  }
  if (!poName) {
    console.log('\n3. No PO to inspect — raise one, then re-run this with its name.');
    return;
  }

  console.log(`\n3. The PO: ${poName}`);
  const po = await getDoc(DOCTYPE, poName);
  if (!po) { console.error(`   ✗ ${poName} could not be read`); process.exit(1); }
  console.log(`   items: ${po.items?.length ?? 0} row(s)   taxes: ${po.taxes?.length ?? 0} row(s)`);
  console.log(`   net_total=${po.net_total}  total_taxes_and_charges=${po.total_taxes_and_charges}  ` +
              `grand_total=${po.grand_total}`);
  for (const t of po.taxes ?? []) {
    console.log(`     · ${t.description} ${t.rate} → ${t.tax_amount}`);
  }

  const qtnName = String(po.quotation_ref ?? '');
  console.log(`\n4. The source quotation: ${qtnName || '(none recorded)'}`);
  let qtnTaxes: any[] = [];
  if (qtnName) {
    const qtn = await getDoc('Quotation', qtnName);
    if (!qtn) {
      console.log('   ✗ could not be read — deleted?');
    } else {
      qtnTaxes = Array.isArray(qtn.taxes) ? qtn.taxes : [];
      console.log(`   taxes: ${qtnTaxes.length} row(s)   ` +
                  `total_taxes_and_charges=${qtn.total_taxes_and_charges}`);
      for (const t of qtnTaxes) {
        console.log(`     · description="${t.description}" rate=${t.rate} tax_amount=${t.tax_amount}`);
      }
      if (!qtnTaxes.length) {
        console.log('   → NOTHING TO COPY. The PO is right and the quotation is the problem:');
        console.log('     it carries no tax rows. Check its tax template in ERPNext.');
      }
    }
  }

  // ---- 6. The repair, which is what names the real cause -----------------
  const shouldHave = qtnTaxes.length;
  const has = po.taxes?.length ?? 0;
  if (!shouldHave || has >= shouldHave) {
    console.log('\n✔ nothing to repair.');
    return;
  }

  const rows = qtnTaxes.map(t => ({
    description: t.description ?? null,
    rate: t.rate ?? null,
    tax_amount: t.tax_amount ?? null,
  }));

  console.log(`\n5. ${poName} should have ${shouldHave} tax row(s) and has ${has}.`);
  if (!REPAIR) {
    console.log('   Re-run with REPAIR=1 to PUT them back. That write is the useful test:');
    console.log('   whatever Frappe says when it refuses is the actual cause, and this');
    console.log('   prints it raw rather than summarising it away.');
    console.log(`   Would send: ${JSON.stringify(rows)}`);
    return;
  }

  console.log('   PUTting the tax rows…');
  const put = await call('PUT',
    `/api/resource/${encodeURIComponent(DOCTYPE)}/${encodeURIComponent(poName)}`,
    { taxes: rows });
  console.log(`   HTTP ${put.status}`);
  if (!put.ok) {
    console.log(`   ✗ ${flat(frappeError(put.text)).slice(0, 600)}`);
    console.log('\n   RAW RESPONSE (first 1200 chars), because the summary above drops detail:');
    console.log('   ' + flat(put.text).slice(0, 1200));
    process.exitCode = 1;
    return;
  }

  const after = await getDoc(DOCTYPE, poName);
  const now = after?.taxes?.length ?? 0;
  console.log(now >= shouldHave
    ? `   ✓ repaired — ${now} tax row(s) now on ${poName}. Re-print it.`
    : `   ✗ PUT returned 200 but ${poName} still holds ${now} row(s).`);
  if (now < shouldHave) {
    console.log('     Frappe accepted the write and stored nothing, which means the rows are');
    console.log('     being dropped rather than rejected — look again at section 1: a child');
    console.log('     doctype missing a fieldname discards that value without complaining.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });

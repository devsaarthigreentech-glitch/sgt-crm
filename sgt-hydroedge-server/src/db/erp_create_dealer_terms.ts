/// <reference types="node" />
// =====================================================================
// erp_create_dealer_terms.ts
// Creates the GreenX dealer quotation Terms and Conditions in ERPNext.
//
// DRY RUN BY DEFAULT.
//
//   npx tsx src/db/erp_create_dealer_terms.ts                  # report
//   CONFIRM_CREATE=1 npx tsx src/db/erp_create_dealer_terms.ts # create
//
// The existing "Quotation Terms and Conditions" is NOT touched — this
// adds a second template alongside it, so SGT-direct quotes can keep the
// longer terms while dealer quotes carry the short set.
//
// Markup matches the existing template's shape (Quill's ql-editor list
// structure) so both render identically in ERPNext's editor and print
// formats. Plain <ul>/<p> would look subtly different next to it.
// =====================================================================

import 'dotenv/config';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;
const TITLE = process.env.ERP_DEALER_TERMS ?? 'GreenX Dealer Quotation Terms';
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

// "Proforma" is spelled correctly here — the source note had "Performama".
// This text reaches customers, so the typo is not carried through.
const TERMS = [
  'Delivery included.',
  'GST excluded.',
  '1 year warranty from the date of installation.',
  '30% advance with order.',
  'Balance 70% against proforma invoice before despatch.',
];

const html =
  '<div class="ql-editor read-mode"><ol>' +
  TERMS.map(t =>
    `<li data-list="ordered"><span class="ql-ui" contenteditable="false"></span>${t}</li>`).join('') +
  '</ol></div>';

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
    ? `▶ Creating terms "${TITLE}" — ${BASE}\n`
    : `▶ DRY RUN — nothing will be created. ${BASE}\n`);

  const existing = await call('GET',
    `/api/resource/${encodeURIComponent('Terms and Conditions')}` +
    `?fields=${encodeURIComponent('["name","selling","disabled"]')}&limit_page_length=50`);
  if (!existing.ok) {
    console.error(`✗ cannot read Terms and Conditions: HTTP ${existing.status}`);
    process.exit(1);
  }
  const all = existing.json?.data ?? [];
  console.log(`  ${all.length} template(s) already in ERPNext:`);
  for (const t of all) {
    console.log(`    · ${t.name}${t.selling ? ' [selling]' : ''}${t.disabled ? ' (disabled)' : ''}`);
  }

  if (all.some((t: any) => String(t.name) === TITLE)) {
    console.log(`\n✔ "${TITLE}" already exists — left untouched.`);
    console.log('  Delete or rename it in ERPNext if you want this script to recreate it.');
    return;
  }

  console.log(`\n  Would create "${TITLE}" with ${TERMS.length} terms:`);
  TERMS.forEach((t, i) => console.log(`    ${i + 1}. ${t}`));

  if (!CONFIRMED) {
    console.log('\n  DRY RUN — nothing created.');
    console.log('  Re-run with CONFIRM_CREATE=1 to create it.');
    return;
  }

  const r = await call('POST', `/api/resource/${encodeURIComponent('Terms and Conditions')}`, {
    doctype: 'Terms and Conditions',
    __newname: TITLE,
    title: TITLE,
    selling: 1,
    buying: 0,
    hr: 0,
    disabled: 0,
    terms: html,
  });
  if (!r.ok) {
    const why = r.json?.exception ?? r.text.slice(0, 300);
    console.error(`\n✗ could not create: ${String(why).replace(/\s+/g, ' ').slice(0, 300)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n✔ created "${r.json.data.name}"`);
  console.log(`  Set ERP_DEALER_TERMS="${r.json.data.name}" in .env if you renamed it.`);
}

main().catch(e => { console.error(e); process.exit(1); });

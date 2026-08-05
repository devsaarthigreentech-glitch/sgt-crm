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
// The existing "Quotation Terms and Conditions" is NOT touched — this is a
// separate template, so SGT-direct quotes keep their own wording.
//
// Re-running REPLACES this template's body, so it is the one place to push
// the dealer terms out. The CLAUSES themselves moved to
// src/domain/dealerTerms.ts when the dealer PO gained its own template —
// edit them there, and both this script and erp_create_dealer_po_terms.ts
// pick the change up.
//
// Markup matches the existing template's shape (Quill's ql-editor list
// structure) so both render identically in ERPNext's editor and print
// formats. Plain <ul>/<p> would look subtly different next to it.
// =====================================================================

import 'dotenv/config';
import { DEALER_QUOTATION_TERMS, clausesToHtml } from '../domain/dealerTerms.js';

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

// The clause set now lives in domain/dealerTerms.ts, which carries the
// full history of the wording — what was merged in, what was dropped, and
// why. Named locally so the report below reads as it always did.
const TERMS = DEALER_QUOTATION_TERMS;
const html = clausesToHtml(TERMS);


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

  const exists = all.some((t: any) => String(t.name) === TITLE);
  if (exists) {
    console.log(`\n  "${TITLE}" already exists — this run REPLACES its wording.`);
    console.log('  Hand-edits made to that template in ERPNext will be lost.');
    console.log('  Every other template, including "Quotation Terms and Conditions",');
    console.log('  is left completely untouched.');
  }

  console.log(`\n  ${exists ? 'Would replace' : 'Would create'} "${TITLE}" with ${TERMS.length} clauses:`);
  TERMS.forEach(([h, b], i) =>
    console.log(`    ${i + 1}. ${h} — ${b.slice(0, 84)}${b.length > 84 ? '…' : ''}`));

  console.log('\n  Two clauses from "Quotation Terms and Conditions" are deliberately NOT');
  console.log('  carried over, because the new terms contradict them:');
  console.log('    · ex-factory, shipping excluded    → superseded by "Delivery included"');
  console.log('    · 50% on order + 50% on dispatch   → superseded by 30% advance / 70% proforma');
  console.log('  The signed price list supports the new wording in both cases.');

  if (!CONFIRMED) {
    console.log('\n  DRY RUN — nothing written.');
    console.log('  Re-run with CONFIRM_CREATE=1 to apply.');
    return;
  }

  const body = {
    doctype: 'Terms and Conditions',
    title: TITLE,
    selling: 1,
    buying: 0,
    hr: 0,
    disabled: 0,
    terms: html,
  };
  const r = exists
    ? await call('PUT', `/api/resource/${encodeURIComponent('Terms and Conditions')}/${encodeURIComponent(TITLE)}`, body)
    : await call('POST', `/api/resource/${encodeURIComponent('Terms and Conditions')}`, { ...body, __newname: TITLE });
  if (!r.ok) {
    const why = r.json?.exception ?? r.text.slice(0, 300);
    console.error(`\n✗ could not ${exists ? 'update' : 'create'}: ${String(why).replace(/\s+/g, ' ').slice(0, 300)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n✔ ${exists ? 'updated' : 'created'} "${r.json.data.name}" with ${TERMS.length} clauses`);
  console.log(`  Set ERP_DEALER_TERMS="${r.json.data.name}" in .env if you renamed it.`);
}

main().catch(e => { console.error(e); process.exit(1); });

/// <reference types="node" />
// =====================================================================
// erp_create_export_terms.ts
// Creates "GreenDrive Export Quotation Terms" in ERPNext — the terms every
// export (USD) GreenDrive quotation uses — by COPYING the domestic
// template as it stands in ERPNext today and swapping in the three export
// clauses:
//
//   Delivery          FOB, Incoterms 2020          (EXPORT_FOB_PORT)
//   Taxes and Duties  zero-rated under the LUT     (EXPORT_LUT_NO / _VALID_TILL)
//   Payment Terms     50/50 in USD by SWIFT wire
//
// Copied from ERPNext, not from this repo, because the owner edits the
// domestic template there and those edits must carry across. From then on
// the two templates are separate: edit each in ERPNext.
//
// DRY RUN BY DEFAULT — prints the clause list and writes nothing.
//
//   npx tsx src/db/erp_create_export_terms.ts
//   CONFIRM_CREATE=1 npx tsx src/db/erp_create_export_terms.ts
//
// SAFE TO RE-RUN: an export template that already exists is NEVER
// overwritten (it may hold edits). To rebuild it from the domestic one on
// purpose, add REPLACE=1.
// =====================================================================

import 'dotenv/config';
import { exportClausesIntoHtml } from '../domain/dealerTerms.js';
import { GREENDRIVE_TERMS, GREENDRIVE_EXPORT_TERMS } from '../domain/greenDrive.js';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;
const CONFIRMED = process.env.CONFIRM_CREATE === '1';
const REPLACE = process.env.REPLACE === '1';

if (!BASE || !KEY || !SECRET) {
  console.error('✗ ERPNEXT_URL / ERPNEXT_API_KEY / ERPNEXT_API_SECRET must be set');
  process.exit(1);
}
const headers = {
  Authorization: `token ${KEY}:${SECRET}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};
const T = encodeURIComponent('Terms and Conditions');

async function getTemplate(name: string): Promise<any | null> {
  const res = await fetch(`${BASE}/api/resource/${T}/${encodeURIComponent(name)}`, { headers });
  return res.ok ? (await res.json()).data : null;
}

const plain = (html: string) =>
  html.replace(/<\/li>/g, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .split('\n').map(l => l.trim()).filter(Boolean);

async function main() {
  console.log(CONFIRMED ? `▶ Creating "${GREENDRIVE_EXPORT_TERMS}" — ${BASE}\n` : `▶ DRY RUN — nothing will be written. ${BASE}\n`);

  const domestic = await getTemplate(GREENDRIVE_TERMS);
  if (!domestic?.terms) throw new Error(`"${GREENDRIVE_TERMS}" was not found in ERPNext, or is empty — nothing to copy.`);
  const existing = await getTemplate(GREENDRIVE_EXPORT_TERMS);
  if (existing && !REPLACE) {
    console.log(`  "${GREENDRIVE_EXPORT_TERMS}" already exists and is left untouched (it may hold edits).`);
    console.log('  Edit it in ERPNext, or re-run with REPLACE=1 to rebuild it from the domestic template.');
    return;
  }

  const { html, replaced, appended } = exportClausesIntoHtml(String(domestic.terms));
  console.log(`  copied from "${GREENDRIVE_TERMS}" as it stands in ERPNext`);
  console.log(`  replaced: ${replaced.join(', ') || '—'}${appended.length ? `   appended (heading not found): ${appended.join(', ')}` : ''}\n`);
  plain(html).forEach((l, i) => console.log(`    ${String(i + 1).padStart(2)}. ${l.slice(0, 110)}${l.length > 110 ? '…' : ''}`));

  if (!CONFIRMED) {
    console.log('\n  DRY RUN — re-run with CONFIRM_CREATE=1 to write it.');
    return;
  }
  const body = { doctype: 'Terms and Conditions', title: GREENDRIVE_EXPORT_TERMS, selling: 1, buying: 0, hr: 0, disabled: 0, terms: html };
  const res = existing
    ? await fetch(`${BASE}/api/resource/${T}/${encodeURIComponent(GREENDRIVE_EXPORT_TERMS)}`, { method: 'PUT', headers, body: JSON.stringify(body) })
    : await fetch(`${BASE}/api/resource/${T}`, { method: 'POST', headers, body: JSON.stringify({ ...body, __newname: GREENDRIVE_EXPORT_TERMS }) });
  if (!res.ok) throw new Error(`ERPNext refused: ${(await res.text()).slice(0, 300)}`);
  console.log(`\n✔ ${existing ? 'rebuilt' : 'created'} "${GREENDRIVE_EXPORT_TERMS}". Export quotes use it from now on; edit it in ERPNext.`);
}

main().catch(e => { console.error('✗', e.message ?? e); process.exitCode = 1; });

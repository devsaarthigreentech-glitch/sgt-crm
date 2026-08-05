/// <reference types="node" />
// =====================================================================
// erp_create_dealer_po_terms.ts
// Creates the GreenX dealer PURCHASE ORDER Terms and Conditions in ERPNext.
//
// DRY RUN BY DEFAULT.
//
//   npx tsx src/db/erp_create_dealer_po_terms.ts                  # report
//   CONFIRM_CREATE=1 npx tsx src/db/erp_create_dealer_po_terms.ts # create
//
// The sibling of erp_create_dealer_terms.ts, and deliberately a SEPARATE
// template rather than the PO reusing the quotation's. The two documents
// are read by different people at different points in the deal, and the
// owner will want them to say different things eventually. Splitting them
// now costs one script; splitting them after a hundred POs have gone out
// under a shared template costs an argument about which version a given
// customer was shown.
//
// Both templates are seeded from the SAME clause list in
// src/domain/dealerTerms.ts, which is what makes "the PO terms are the
// same as the quotation terms" a fact rather than a claim. Change
// DEALER_PO_TERMS there and re-run this; the quotation template is not
// touched by either operation.
//
// Nothing else in ERPNext is modified. "Quotation Terms and Conditions"
// and "GreenX Dealer Quotation Terms" are both left exactly as they are.
// =====================================================================

import 'dotenv/config';
import {
  DEALER_PO_TERMS, DEALER_QUOTATION_TERMS, clausesToHtml, clausesNamingQuotation,
} from '../domain/dealerTerms.js';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;
const TITLE = process.env.ERP_DEALER_PO_TERMS ?? 'GreenX Dealer PO Terms';
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

const TERMS = DEALER_PO_TERMS;
const html = clausesToHtml(TERMS);

/**
 * selling = 1, buying = 0 — the same as the quotation template.
 *
 * That looks wrong on a document called a "purchase order" and is not.
 * The flags describe which ERPNext transaction types may PICK the
 * template, and this one is picked by the SGT Dealer PO doctype, which
 * lives in Selling. `buying` would attach it to ERPNext's own Purchase
 * Order — SGT's procurement documents to component suppliers, raised by
 * services/buildable.ts — which is a different document to a different
 * party and must not offer these clauses.
 */
const SELLING = 1;
const BUYING = 0;

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
    `?fields=${encodeURIComponent('["name","selling","buying","disabled"]')}&limit_page_length=50`);
  if (!existing.ok) {
    console.error(`✗ cannot read Terms and Conditions: HTTP ${existing.status}`);
    process.exit(1);
  }
  const all = existing.json?.data ?? [];
  console.log(`  ${all.length} template(s) already in ERPNext:`);
  for (const t of all) {
    console.log(`    · ${t.name}${t.selling ? ' [selling]' : ''}${t.buying ? ' [buying]' : ''}` +
                `${t.disabled ? ' (disabled)' : ''}`);
  }

  const exists = all.some((t: any) => String(t.name) === TITLE);
  if (exists) {
    console.log(`\n  "${TITLE}" already exists — this run REPLACES its wording.`);
    console.log('  Hand-edits made to that template in ERPNext will be lost.');
  }

  console.log(`\n  ${exists ? 'Would replace' : 'Would create'} "${TITLE}" with ${TERMS.length} clauses:`);
  TERMS.forEach(([h, b], i) =>
    console.log(`    ${i + 1}. ${h} — ${b.slice(0, 84)}${b.length > 84 ? '…' : ''}`));

  // Whether the two sets have diverged yet. Printed either way, because
  // "are the PO terms still the quotation terms?" is the question this
  // script exists to answer and nobody should have to read source to.
  const identical =
    TERMS.length === DEALER_QUOTATION_TERMS.length &&
    TERMS.every(([h, b], i) =>
      h === DEALER_QUOTATION_TERMS[i][0] && b === DEALER_QUOTATION_TERMS[i][1]);
  console.log('');
  console.log(identical
    ? '  These are IDENTICAL to the GreenX Dealer Quotation Terms, as instructed.'
    : '  These have DIVERGED from the GreenX Dealer Quotation Terms.');

  const stale = clausesNamingQuotation(TERMS);
  if (stale.length) {
    console.log('');
    console.log(`  ⚠ ${stale.length} clause(s) still say "quotation" and will print that way`);
    console.log(`     on a purchase order: ${stale.join(', ')}.`);
    console.log('     Expected while the two sets are shared. To fix, give DEALER_PO_TERMS');
    console.log('     its own bodies in src/domain/dealerTerms.ts and re-run this script.');
  }

  if (!CONFIRMED) {
    console.log('\n  DRY RUN — nothing written.');
    console.log('  Re-run with CONFIRM_CREATE=1 to apply.');
    return;
  }

  const body = {
    doctype: 'Terms and Conditions',
    title: TITLE,
    selling: SELLING,
    buying: BUYING,
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
  console.log(`  Set ERP_DEALER_PO_TERMS="${r.json.data.name}" in .env if you renamed it.`);
}

main().catch(e => { console.error(e); process.exit(1); });

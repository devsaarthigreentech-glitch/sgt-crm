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
// Re-running REPLACES this template's body, so it is the one place to edit
// the dealer terms in source and push them out.
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

// The dealer terms: the owner's five new points MERGED with the surviving
// clauses from the existing "Quotation Terms and Conditions", rewritten in
// a consistent corporate register.
//
// TWO EXISTING CLAUSES ARE DELIBERATELY NOT CARRIED OVER, because the new
// terms contradict them and the signed price list backs the new ones:
//
//   dropped: "Price mentioned is ex-factory and exclusive of any shipping
//            & logistics costs"        -> superseded by "Delivery included".
//            The price list says freight and transit insurance are included
//            to a dealer-designated location in India.
//
//   dropped: "50% upon placing the order and 50% on presentation of
//            dispatch invoice"         -> superseded by 30% / 70%.
//            The price list says 30% advance with PO, 70% against proforma
//            before dispatch.
//
// Appending instead of merging would have put two payment schedules and
// two freight positions on the same customer-facing document.
//
// "Proforma" is spelled correctly here — the source note had "Performama".
//
// REVISION, 2026-07-30 — six clauses added or rewritten:
//
//   Validity          new. 30 days, matching DEFAULT_VALID_DAYS in
//                     erpQuotation.ts. If either changes, change both:
//                     a document whose valid_till disagrees with its own
//                     terms is a document the customer can argue with.
//   Scope of Supply   new. What is quoted is what is listed.
//   Buyer's Scope     new. The water tank and its supply are the
//                     customer's, which was previously said verbally.
//   Exclusions        new. The owner's list, with one qualifier added:
//                     AMC is excluded UNLESS it appears as a line on the
//                     quotation, because quotations can now carry an AMC
//                     line and a flat exclusion would contradict it.
//   Payment Terms     rewritten. Payment goes to the account named on
//                     the quotation, not to SGT — the partner collects.
//   Arbitration       new. Arbitration and Conciliation Act 1996,
//                     seated at Jaipur.
const TERMS: [string, string][] = [
  ['Validity',
   'This offer remains valid for thirty (30) days from its date. Thereafter it is subject to our confirmation, and to revision if any.'],
  ['Scope of Supply',
   'Our offer is confined to what is specifically included and stipulated in the technical and commercial clauses of this quotation, and is subject to such changes as may be agreed between the parties during negotiation.'],
  ['Buyer’s Scope',
   'The water tank, its foundation and the supply of water to the equipment are to be arranged by the Buyer at the Buyer’s cost, and are to be ready before installation begins. The Buyer shall also ensure a continuous supply of water of the quality specified for the equipment.'],
  ['Exclusions',
   'Our scope does not include civil works, exhaust system, cabling, earthing pits and strips, cooling towers, piping, CEIG approvals, a higher size alternator, first fill of diesel for the inbuilt day oil tank, ventilation system, any other electrical panel (isolator, synchronisation), factory inspection charges, spare parts, other consumables, or annual maintenance — save where any of these appears as a priced line on this quotation.'],
  ['Delivery',
   'Delivery to the Buyer’s designated location within India is included in the quoted price, together with transit insurance.'],
  ['Taxes and Duties',
   'Prices quoted are exclusive of GST, which shall be charged additionally at the prevailing statutory rate. All other local taxes, duties and levies shall be borne and discharged by the Buyer directly.'],
  ['Payment Terms',
   '30% of the order value is payable in advance against the purchase order. The balance 70% is payable against proforma invoice, prior to despatch. Payment is to be made only to the bank account named on this quotation, and to no other account; where any doubt arises, please confirm the account with us in writing before remitting.'],
  ['Warranty',
   'The equipment carries a warranty of twelve (12) months from the date of installation against defects in materials and workmanship under normal operating conditions.'],
  ['Installation and Commissioning',
   'Installation and testing services are provided at no additional charge, subject to the Buyer’s scope above being ready at site.'],
  ['Annual Maintenance',
   'Annual maintenance charges become applicable twelve (12) months after installation, at 15% of the sale price per annum, unless an annual maintenance contract is quoted as a line on this quotation.'],
  ['Data Capture and Reporting',
   'Data capture and reporting shall be provided in accordance with the scope agreed with the Buyer.'],
  ['Returns and Refunds',
   'Goods once sold are neither returnable nor refundable. Taxes, duties, installation services, transportation and logistics charges are likewise non-refundable.'],
  ['Arbitration',
   'In the event of any dispute or difference arising between the parties out of or relating to the validity, construction, meaning, operation or effect of this offer, or of any amendment or other document relating to it, or the breach of the terms of any document agreed between the parties, the same shall be referred to arbitration in accordance with the provisions of the Arbitration and Conciliation Act, 1996. The arbitration proceedings shall be held at Jaipur.'],
];

const html =
  '<div class="ql-editor read-mode"><ol>' +
  TERMS.map(([h, b]) =>
    `<li data-list="ordered"><span class="ql-ui" contenteditable="false"></span><strong>${h}</strong> — ${b}</li>`).join('') +
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

// =====================================================================
// domain/dealerTerms.ts — the dealer clause sets, in one place.
//
// Extracted from src/db/erp_create_dealer_terms.ts when the dealer PO
// gained a terms template of its own. Two scripts now push clauses into
// ERPNext:
//
//   erp_create_dealer_terms.ts     -> "GreenX Dealer Quotation Terms"
//   erp_create_dealer_po_terms.ts  -> "GreenX Dealer PO Terms"
//
// Both read from here, so "the PO terms are the same as the quotation
// terms" stays TRUE rather than being true on the day it was typed. When
// the owner wants them to diverge, edit PO_TERMS below and re-run the PO
// script — that is the whole change, and the quotation terms are not
// touched by it.
//
// ── The history behind the wording ───────────────────────────────────
// The clauses are the owner's five new points MERGED with the surviving
// clauses from the existing "Quotation Terms and Conditions", rewritten
// in a consistent corporate register.
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
//
// REVISION, 2026-10-12 — the owner's instruction, for GreenX AND
// GreenDrive (the GreenDrive template is a copy of this array):
//
//   Delivery          rewritten. Prices are EX-FACTORY again; freight is
//                     extra when SGT arranges it, or the Buyer collects.
//                     This reverses the 2026-07 "delivery included".
//   Payment Terms     50% advance / 50% before despatch (was 30 / 70).
//                     This too is the original schedule, now restored.
//   Installation and  rewritten. Installation is NOT included. Remote
//   Commissioning     support is free; an engineer at site is charged.
//   Annual            unchanged at 15% — the owner confirmed 15 is the
//   Maintenance       AMC figure everywhere (AMC_PCT moved 10 -> 15).
// =====================================================================

/** One clause: its heading, and its body. */
export type Clause = [heading: string, body: string];

export const DEALER_QUOTATION_TERMS: Clause[] = [
  ['Validity',
   'This offer remains valid for thirty (30) days from its date. Thereafter it is subject to our confirmation, and to revision if any.'],
  ['Scope of Supply',
   'Our offer is confined to what is specifically included and stipulated in the technical and commercial clauses of this quotation, and is subject to such changes as may be agreed between the parties during negotiation.'],
  ['Buyer’s Scope',
   'The water tank, its foundation and the supply of water to the equipment are to be arranged by the Buyer at the Buyer’s cost, and are to be ready before installation begins. The Buyer shall also ensure a continuous supply of water of the quality specified for the equipment.'],
  ['Exclusions',
   'Our scope does not include civil works, exhaust system, cabling, earthing pits and strips, cooling towers, piping, CEIG approvals, a higher size alternator, first fill of diesel for the inbuilt day oil tank, ventilation system, any other electrical panel (isolator, synchronisation), factory inspection charges, spare parts, other consumables, or annual maintenance — save where any of these appears as a priced line on this quotation.'],
  ['Delivery',
   'Prices are ex-factory. Freight, transit insurance and handling are not included: where SGT arranges transport to the Buyer’s site, they are charged additionally at actuals; alternatively, the Buyer may arrange its own transport and collect the goods from our works.'],
  ['Taxes and Duties',
   'Prices quoted are exclusive of GST, which shall be charged additionally at the prevailing statutory rate. All other local taxes, duties and levies shall be borne and discharged by the Buyer directly.'],
  ['Payment Terms',
   '50% of the order value is payable in advance against the purchase order. The balance 50% is payable against proforma invoice, prior to despatch. Payment is to be made only to the bank account named on this quotation, and to no other account; where any doubt arises, please confirm the account with us in writing before remitting.'],
  ['Warranty',
   'The equipment carries a warranty of twelve (12) months from the date of installation against defects in materials and workmanship under normal operating conditions.'],
  ['Installation and Commissioning',
   'Installation and commissioning are not included in the quoted price. Remote technical support is provided free of charge. Where an engineer is needed or requested at site — for installation, commissioning or service — the visit is charged additionally at SGT’s prevailing rates.'],
  ['Annual Maintenance',
   'Annual maintenance charges become applicable twelve (12) months after installation, at 15% of the sale price per annum, unless an annual maintenance contract is quoted as a line on this quotation.'],
  ['Data Capture and Reporting',
   'Data capture and reporting shall be provided in accordance with the scope agreed with the Buyer.'],
  ['Returns and Refunds',
   'Goods once sold are neither returnable nor refundable. Taxes, duties, installation services, transportation and logistics charges are likewise non-refundable.'],
  ['Arbitration',
   'In the event of any dispute or difference arising between the parties out of or relating to the validity, construction, meaning, operation or effect of this offer, or of any amendment or other document relating to it, or the breach of the terms of any document agreed between the parties, the same shall be referred to arbitration in accordance with the provisions of the Arbitration and Conciliation Act, 1996. The arbitration proceedings shall be held at Jaipur.'],
];

/**
 * The dealer PO terms.
 *
 * IDENTICAL to the quotation terms, on the owner's instruction of
 * 2026-08-05 ("the same for now"). Deliberately a separate export rather
 * than the same constant re-exported, because the two are expected to
 * diverge and the seam should already exist when they do.
 *
 * KNOWN WORDING MISMATCH, and it is intentional rather than overlooked:
 * several clauses say "this quotation" (Scope of Supply, Exclusions,
 * Payment Terms, Annual Maintenance). On a purchase order that reads
 * oddly. Fixing it means writing PO-specific bodies here — which is
 * exactly the divergence this array exists to allow, and exactly the
 * decision that was deferred. The setup script prints this warning too,
 * so it cannot be discovered for the first time on a customer's desk.
 */
export const DEALER_PO_TERMS: Clause[] = DEALER_QUOTATION_TERMS;

/**
 * The GreenDrive quotation terms — a COPY of the GreenX ones, on the
 * owner's instruction of 2026-10-09. Separate export for the same reason
 * as the PO terms: they are expected to diverge.
 *
 * Known to need GreenDrive wording when the owner gets to it: Buyer's
 * Scope (water tank) and Exclusions (alternator, CEIG, diesel day tank)
 * were written for DG sets, and Annual Maintenance quotes 15%.
 */
export const GREENDRIVE_QUOTATION_TERMS: Clause[] = DEALER_QUOTATION_TERMS;

/** Clauses that still say "quotation". Reported by the PO terms script. */
export function clausesNamingQuotation(clauses: Clause[]): string[] {
  return clauses.filter(([, body]) => /\bquotation\b/i.test(body)).map(([h]) => h);
}

/**
 * Clauses -> the markup ERPNext stores.
 *
 * Quill's ql-editor list structure, matching the existing templates, so
 * every terms template on the site renders identically in the editor and
 * in every print format. Plain <ul>/<p> would look subtly different next
 * to the ones already there.
 */
export function clausesToHtml(clauses: Clause[]): string {
  return (
    '<div class="ql-editor read-mode"><ol>' +
    clauses
      .map(([h, b]) =>
        `<li data-list="ordered"><span class="ql-ui" contenteditable="false"></span><strong>${h}</strong> — ${b}</li>`)
      .join('') +
    '</ol></div>'
  );
}

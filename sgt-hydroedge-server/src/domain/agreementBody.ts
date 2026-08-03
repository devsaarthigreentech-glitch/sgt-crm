// =====================================================================
// domain/agreementBody.ts — the operative clauses of the dealer
// agreement, as something a person can edit.
//
// What lives here and what does NOT
// ---------------------------------
// The agreement splits cleanly in two, and the split is the whole design:
//
//   DATA   — the parties, their codes, addresses, signatories, the
//            Annexure A table, the Annexure B sticker, the signature
//            block. All of it is DERIVED from quote_service.org and
//            rendered by the print format. Nobody retypes it, so nobody
//            can mistype it.
//
//   PROSE  — sections 1 to 13. The legal text. That is this file.
//
// Only the prose is editable, and it is editable PER AGREEMENT rather
// than per template: the body is copied onto the ERPNext document when
// the agreement is created, and edited there. Changing the default below
// changes what the NEXT agreement starts from and leaves every agreement
// already raised exactly as it was signed. A contract that silently
// rewords itself after execution is not a contract.
//
// Locking it later is a one-line change — set read_only on the
// agreement_body field in erp_create_agreement_doctype.ts. The wording
// is then whatever this file says, and nothing else.
//
// The editing format
// ------------------
// The screen edits TEXT, not HTML, for the same reason quoteTerms.ts
// does: asking someone to proofread a contract through angle brackets is
// asking for a mistake nobody catches.
//
//   blank line separates blocks
//   "N.  Title"      -> a section heading
//   "N.N  Body"      -> a clause
//   **bold**         -> <strong>
//
// The round trip is deliberately lossy. Anything richer than headings,
// clauses and bold is dropped, because anything richer has no business
// in a contract and would otherwise survive as markup the next editor
// cannot see.
//
// See also quoteTerms.ts, which does the same job for quotation terms.
// They are separate because the OUTPUT shapes differ — terms are an
// <ol> of clauses, an agreement is headed sections — and merging them
// would mean a flag at every call site.
// =====================================================================

/**
 * Sections 1–13 of the Tripartite Dealer Appointment Agreement,
 * transcribed from the executed Word template.
 *
 * This is the STARTING POINT for a new agreement, not the agreement. It
 * is authoritative only until the first agreement is raised from it.
 *
 * Cross-references inside the text (Clause 2.2, Clause 8.2, Section 5,
 * Annexure B) are written out rather than auto-numbered. Renumber a
 * section and you must fix them by hand — auto-numbering a contract is
 * a way to silently change what a clause points at.
 *
 * Clause 9.1's "(Annexure B)" is a case in point: the sticker annexure was
 * lettered C in the Word original, with no B in between. Renaming it to B
 * meant changing the print format AND this line, because they live in
 * different places — the heading in the print format, the reference here,
 * copied onto each document at creation. Editing only the print format
 * would leave every clause pointing at an annexure that no longer exists.
 */
export const DEFAULT_AGREEMENT_BODY_TEXT = `1.  What this Agreement does

1.1  **Appointment.**  SGT, with the Distributor, appoints the Dealer to promote, sell, install and service the Products under the Distributor's ecosystem. The Dealer is an independent business — not an agent, employee, partner or joint-venture of SGT or the Distributor — and shall not hold itself out as such.

1.2  **Non-exclusive.**  The Dealer's appointment is non-exclusive and carries no exclusive territory or customer. The Distributor alone is exclusive for its Region; the Dealer must never act in a way that harms another Distributor's exclusivity (Clause 8.2).

1.3  **SGT's role.**  SGT is a Party to register the Dealer, allot its Dealer Code, provide CRM access, deliver training, warranty and platform support, run the settlement in Section 5, and hold the Dealer directly to SGT's brand, safety, IP and confidentiality standards.

1.4  **Back-to-back.**  This Agreement sits under the SGT–Distributor Distribution Agreement. Where a term here is silent, that agreement applies; on the Products, brand, safety or IP, SGT's written terms prevail.

2.  Dealer Code and Type

2.1  **Code and linkage.**  The Dealer Code has the format {DISTRIBUTOR_CODE}-TTNN — the Distributor Code, a two-letter type (SM = Sales & Marketing / sales only; SS = Sales & Service / sells, installs and services), and a two-digit serial. This Dealer is {DEALER_CODE} ({DEALER_TYPE}). The Code links the Dealer to the Distributor for every lead, quotation, deployment, warranty, settlement and report, and must be quoted on all CRM entries and SGT correspondence.

2.2  **Who does what.**  All dealers may generate leads, quote and sell through the CRM. Only SS dealers install, service, and deliver AMC and warranty work. Where an SM dealer books a sale, a linked SS dealer (assigned by the Distributor) performs the installation, AMC and service and is recorded against the deployment in the CRM.

3.  Selling — everything through the CRM

3.1  **One system of record.**  SGT provides CRM access to the Distributor and every Dealer. The CRM is the single system of record for all leads, customers, quotations, deployments and service.

3.2  **Capture and quote.**  Every lead — however sourced — is captured in the CRM under the Dealer Code. To book an order, the Dealer creates the customer and generates the quotation from its own CRM login. The Dealer keeps all records current; CRM data is SGT's confidential information, used for orders, settlement, warranty, GreenVision and generating further leads for the channel.

4.  Pricing and Discount

4.1  **Prices set by SGT.**  SGT sets the Dealer Price (net floor) and the MRP for each Product per the current price list. The Dealer quotes any price up to the MRP, within its allotted discount limit. A deeper discount needs the Distributor's approval, and beyond the Distributor's limit, SGT's approval — all recorded in the CRM.

5.  Payment, Delivery and Settlement

5.1  **Ordering and billing — default through the channel.**  By default, orders to customers are placed and billed through the Dealer / Distributor, who collects the customer's payment. The Dealer / Distributor raises the order to SGT at the approved Dealer Rate, with the advance and payment schedule set out in the approved rate list.

5.2  **Direct billing by SGT — by exception.**  On a case-to-case basis, where a customer specifically requires SGT to bill and supply it directly, SGT may do so. In that case SGT bills the customer directly and shares the Dealer's / Distributor's margin with them as per the approved rate chart. Installation, service and support for that customer continue to be driven by the Dealer.

5.3  **Delivery.**  SGT delivers the Product directly to the installation site against completion of the agreed payment schedule (balance before final delivery).

5.4  **Settlement.**  SGT settles strictly per the shares recorded or instructed in the CRM / approved rate chart, and takes no share of, and is not a party to, any separate arrangement between the Distributor and the Dealer beyond making the recorded payment.

6.  Installation and Support (SS Dealer)

6.1  **Install to protocol.**  The Dealer installs and commissions every Product strictly per SGT's protocol, confirms optimal operating status before handover (emission report and, where available, fuel-consumption data), and records it in the CRM / GreenVision. A non-compliant installation is corrected within thirty (30) days; until corrected, that unit's warranty is suspended.

6.2  **Site report.**  Within seven (7) days of every installation the Dealer uploads to the CRM: (a) installation photographs; (b) the NABL-accredited emission report (PM, NOx, CO₂, HC, CO and fuel savings); and (c) the customer's signed acceptance — quoting the Dealer Code — until GreenVision activation becomes the standard trigger.

6.3  **Certified people, approved parts.**  Only SGT-certified personnel install, operate, maintain or service the Products. The Dealer uses only SGT-approved marketing materials and SGT-qualified fitments, and registers every deployment in GreenVision under its Dealer Code.

6.4  **Fuel measurement.**  Fuel measurement is a separate, separately-scoped project (possible only via CAN data from the DG or a manual field update) and is not included under this Agreement unless specifically agreed in writing.

7.  Warranty, AMC and Machine Swap

7.1  **Warranty.**  Each Product carries SGT's standard one (1) year manufacturer warranty on CHFA™ Licensed Product components only — not the engine, alternator, ECU/ECM, panels, batteries or third-party parts. It is void on unauthorised opening, modification, non-approved parts or water, or a non-compliant installation.

7.2  **AMC / extended warranty.**  After the first year, AMC or extended warranty is offered on a case-to-case quotation basis at ten to twenty percent (10%–20%) of the Product's MRP per year. The AMC value is shared fifty percent (50%) to SGT and fifty percent (50%) to the channel (Distributor / Dealer as they agree), and is delivered only through SS (Service) Dealers.

7.3  **Machine swap.**  Where a defective unit cannot be repaired in the field, SGT will, wherever possible, swap it for a new one; the defective unit is returned to SGT under the applicable warranty terms.

8.  Training, SGT Support and Territory Discipline

8.1  **Enablement and support.**  SGT, with the Distributor, trains and certifies the Dealer's team, provides GreenVision remote monitoring and a central station for Level-2/3 escalation, and supplies brand assets and product updates — standard modules at no charge.

8.2  **Stay in the Region.**  The Dealer works within the Distributor's Region and shall not solicit or close customers in another Distributor's exclusive Region except by arrangement with that Distributor. Conduct that harms another Distributor's exclusivity is a material breach and may lead to withdrawal of the appointment.

9.  Branding and Deployment Tracking

9.1  **Marking.**  Every unit carries SGT branding, the Dealer identification (Annexure B) and DG-specific signage (including kVA rating). The "Manufactured by SGT HydroEdge" marking and all patent / certification markings shall not be altered, obscured or removed. Each deployment is registered in GreenVision under the Dealer Code before handover.

10.  Confidentiality, IP, Non-Compete and Non-Circumvention

10.1  **Confidentiality.**  Pricing, the Dealer Price, margins, discount limits, and CRM / customer data are confidential and shall not be disclosed to any customer, competitor or third party. These obligations continue for five (5) years after termination; obligations for the patented CHFA™ technology and know-how continue in perpetuity. SGT may enforce this directly against the Dealer.

10.2  **Intellectual property.**  All IP in the Products and the CHFA™ technology (Indian Patent No. 582824) remains with SGT. The Dealer shall not reverse engineer or replicate the Products, or assist any third party to do so, and acquires no IP rights.

10.3  **Non-compete and non-circumvention.**  During the term and for twelve (12) months after termination, the Dealer shall not market, sell, install or service any competing hydrogen / HHO / retrofit emission system, nor migrate any SGT or AMC customer to such a system. The Dealer shall not bypass the Distributor or SGT — via the CRM or customer relationships — to deal directly or avoid any settlement or AMC obligation.

11.  Liability

11.1  **Indemnity and limitation.**  The Dealer shall indemnify SGT and the Distributor against any third-party claim, loss or damage — including fire, injury, death or property damage — arising from the Dealer's installation, commissioning, service or handling of the Products, or from a non-compliant installation or its negligence. Save for SGT's warranty and replacement obligations, SGT has no further liability. Neither SGT nor the Distributor is liable for indirect or consequential loss; nothing limits any liability that cannot be limited under Applicable Law.

12.  Term and Termination

12.1  **Term.**  This Agreement takes effect on the Effective Date and continues co-terminously with the Distribution Agreement, subject to earlier termination.

12.2  **Termination.**  Any Party may terminate for material breach not remedied within thirty (30) days of written notice. SGT may direct suspension or termination of the Dealer on withdrawal of approval (Clause 2.2) or breach of territory discipline (Clause 8.2). If the Distribution Agreement ends or the Distributor's exclusivity is withdrawn, this appointment ends automatically, unless SGT agrees in writing to re-link the Dealer to another Distributor.

12.3  **Survival.**  Accrued rights, in-warranty support, confidentiality, IP, non-compete, indemnity and dispute resolution survive termination.

13.  General

13.1  **Assignment.**  This Agreement and the Dealer's rights are personal to the Dealer and may not be assigned or transferred, nor may control of the Dealer change, without the prior written consent of both SGT and the Distributor.

13.2  **Governing law and disputes.**  This Agreement is governed by the laws of India. The Parties shall first attempt good-faith mediation for thirty (30) days; failing resolution, the dispute is finally resolved by a sole arbitrator under the Arbitration and Conciliation Act, 1996, seat and venue Pune, Maharashtra, in English. The courts at Pune have exclusive jurisdiction for interim relief and supervision of the arbitration.

13.3  **Notices, amendment, entirety.**  Notices shall be in writing to the addresses above. This Agreement, with its Annexures and the back-to-back terms of the Distribution Agreement, is the entire agreement for the Dealer appointment and may be amended only in writing signed by all three Parties. If any provision is unenforceable, the rest continues. It may be executed in counterparts.`;

/**
 * The three placeholders the default body carries.
 *
 * Clause 2.1 has to state THIS dealer's code and type in prose — the
 * Word template does, and a clause that describes the code format
 * without naming the code is weaker. They are substituted once, when the
 * agreement is created, so what lands on the document is plain text a
 * person can edit. They are NOT re-substituted at print time: an
 * agreement is a fixed document, and a clause that re-resolves itself
 * whenever the org record changes is a clause nobody can rely on.
 */
export interface BodyTokens {
  distributorCode: string;
  dealerCode: string;
  dealerType: string;
}

export function fillBodyTokens(text: string, t: BodyTokens): string {
  return String(text ?? '')
    .replace(/\{DISTRIBUTOR_CODE\}/g, t.distributorCode || '—')
    .replace(/\{DEALER_CODE\}/g, t.dealerCode || '—')
    .replace(/\{DEALER_TYPE\}/g, t.dealerType || '—');
}

// ---------------------------------------------------------------------
// text <-> html
// ---------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
  '&mdash;': '—', '&ndash;': '–', '&rsquo;': '’', '&lsquo;': '‘',
  '&ldquo;': '“', '&rdquo;': '”',
};

function decodeEntities(s: string): string {
  return s.replace(/&[a-zA-Z]+;|&#\d+;/g, m => {
    if (ENTITIES[m]) return ENTITIES[m];
    const num = /^&#(\d+);$/.exec(m);
    return num ? String.fromCharCode(Number(num[1])) : m;
  });
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * "12.  Term and Termination" is a heading. "12.1  Term." is a clause.
 *
 * The distinction is the SECOND number, not indentation or casing, so a
 * heading someone retyped without its trailing spaces still reads as a
 * heading and a clause never gets promoted into one.
 */
const HEADING = /^\d+\.(?!\d)\s+\S/;

/**
 * Editor text -> the HTML stored on the ERPNext document and printed.
 *
 * Blank in, blank out: an agreement with no body must not acquire an
 * empty section just by being opened.
 */
export function textToBody(text: string | null | undefined): string {
  const blocks = String(text ?? '')
    .split(/\n\s*\n/)
    .map(b => b.trim())
    .filter(Boolean);

  if (!blocks.length) return '';

  const html = blocks.map(block => {
    const body = esc(block)
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    return HEADING.test(block)
      ? `<h3 class="ag-h">${body}</h3>`
      : `<p class="ag-c">${body}</p>`;
  }).join('');

  return `<div class="ag-body">${html}</div>`;
}

/**
 * Stored body -> what the editor shows.
 *
 * Headings come back with a blank line after them like every other
 * block, so the text that goes in is the text that comes out and an
 * edit-save-edit cycle does not reflow the document.
 */
export function bodyToText(html: string | null | undefined): string {
  const src = String(html ?? '');
  if (!src.trim()) return '';

  return decodeEntities(
    src
      .replace(/<\s*(strong|b)\s*>/gi, '**')
      .replace(/<\s*\/\s*(strong|b)\s*>/gi, '**')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*(h[1-6]|p|li|div|tr)\s*>/gi, '\n\n')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The default body, as HTML, with this agreement's tokens resolved. */
export function defaultAgreementBody(t: BodyTokens): string {
  return textToBody(fillBodyTokens(DEFAULT_AGREEMENT_BODY_TEXT, t));
}

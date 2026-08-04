/// <reference types="node" />
// =====================================================================
// erp_create_agreement_doctype.ts
// Creates the "SGT Dealer Agreement" DocType and its Print Format in
// ERPNext.
//
// DRY RUN BY DEFAULT.
//
//   npx tsx src/db/erp_create_agreement_doctype.ts                  # report
//   CONFIRM_CREATE=1 npx tsx src/db/erp_create_agreement_doctype.ts # apply
//   CONFIRM_CREATE=1 SAMPLE=1 npx tsx src/db/erp_create_agreement_doctype.ts
//                                                                   # + one draft to eyeball
//
// Why ERPNext holds this document at all
// --------------------------------------
// The agreement is not an ERPNext concept and never will be. What
// ERPNext has that we do not is a working PDF renderer — the same one
// behind fetchQuotationPdf() in services/erpQuotation.ts, proven in
// production. Building a second one here would mean putting a browser
// engine on the droplet and owning page-break bugs forever.
//
// So the split matches quotations exactly, and for the same reasons:
//
//   ERPNext   renders and mails the document. It is the printable
//             artefact and the sent-copy audit trail.
//   Postgres  is what the CRM lists, scopes and tracks — status,
//             who raised it, which distributor may see it, where the
//             signed scan lives. quote_service.agreement_ref, shaped
//             like quotation_ref.
//
// Nothing here is additive to an existing doctype. This creates a NEW
// custom doctype with its own naming series and touches no ERPNext
// document type that already exists.
//
// Data vs prose
// -------------
// Every party field below is SNAPSHOTTED by the CRM at creation, never
// looked up at print time — same rule as the quotation's partner block.
// An agreement reprinted in 2029 must show the dealer as they were when
// it was signed. A contract that silently updates itself when someone
// edits an org record is not a contract.
//
// The only free text is `agreement_body`: sections 1–13, seeded from
// domain/agreementBody.ts and editable on THIS agreement. To lock the
// wording later, set read_only: 1 on that field and re-run.
//
// Re-running is safe. An existing doctype gains any fields missing from
// it and keeps the rest; the print format is always REPLACED, so this
// file is the one place to edit the layout and push it out.
// =====================================================================

import 'dotenv/config';
import { DEFAULT_AGREEMENT_BODY_TEXT, fillBodyTokens, textToBody } from '../domain/agreementBody.js';
import { shortFiscalYear } from '../domain/fiscalYear.js';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;
const CONFIRMED = process.env.CONFIRM_CREATE === '1';
const WANT_SAMPLE = process.env.SAMPLE === '1';

// Frappe requires a real Module Def to hang a custom doctype off. Selling
// is the closest existing home and is guaranteed present in ERPNext.
const MODULE = process.env.ERP_AGREEMENT_MODULE ?? 'Selling';

const DOCTYPE = process.env.ERP_AGREEMENT_DOCTYPE ?? 'SGT Dealer Agreement';
const FORMAT = process.env.ERP_AGREEMENT_PRINT_FORMAT ?? 'SGT Tripartite Dealer Agreement';

// Document name series, e.g. SGT-AG-202627-0001.
//
// {custom_short_fiscal_year} is a FIELD on the document, not a date token —
// the same field and the same short form the Sales Order series already uses
// (SAL-ORD-.{custom_short_fiscal_year}.-.###). A calendar year would put an
// agreement signed in February 2027 in "2027" while every order raised beside
// it says 202627; this keeps one financial year across all of them.
//
// Because Frappe counts per RESOLVED prefix, the counter restarts at 0001 on
// 1 April each year, which is the behaviour of the rest of the series.
//
// Only applied when the doctype is created — Frappe keeps the existing
// autoname on a doctype that is already there.
// DOTTED, and driven by the naming_series field — NOT `format:`.
//
// `format:SGT-AG-{custom_short_fiscal_year}-{####}` looks equivalent and is
// not. Frappe's _format_autoname hands each {…} to parse_naming_series
// SEPARATELY, so when {####} is parsed the accumulated prefix is empty and
// the counter is keyed on "" — a single site-wide sequence shared with every
// other format-named doctype. Proved live: the second agreement ever raised
// was numbered 0313.
//
// The dotted form is parsed in ONE pass, so the counter key is the resolved
// prefix ("SGT-AG-202627-") and the number restarts at 1 each financial year,
// per doctype. It is also exactly the form the Sales Order series already
// uses on this site.
const SERIES = process.env.ERP_AGREEMENT_SERIES ??
  'SGT-AG-.{custom_short_fiscal_year}.-.####';

// Indian financial year: 1 April – 31 March. Now shared with
// services/agreements.ts, which is the path that ACTUALLY creates every
// agreement the CRM raises — and which had no copy of this at all, so it
// left the field empty and produced "SGT-AG--0313". One rule, three
// callers; see domain/fiscalYear.ts.

// What the series looks like once resolved, for the dry-run report.
const seriesExample = SERIES
  .replace('.{custom_short_fiscal_year}.', shortFiscalYear())
  .replace(/\.(#+)$/, (_m, h: string) => '1'.padStart(h.length, '0'));

if (!BASE || !KEY || !SECRET) {
  console.error('✗ ERPNEXT_URL / ERPNEXT_API_KEY / ERPNEXT_API_SECRET must be set');
  process.exit(1);
}
const headers = {
  Authorization: `token ${KEY}:${SECRET}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

// ---------------------------------------------------------------------
// Fields
//
// Everything carries print_hide: 1. The print format below is a
// custom_format, so it draws every value explicitly and the automatic
// field list must not also print them underneath. print_hide is what
// stops that if anyone ever prints with the Standard format.
// ---------------------------------------------------------------------

interface Field {
  fieldname: string;
  label?: string;
  fieldtype: string;
  options?: string;
  reqd?: 0 | 1;
  read_only?: 0 | 1;
  in_list_view?: 0 | 1;
  no_copy?: 0 | 1;
  default?: string;
  description?: string;
}

const FIELDS: Field[] = [
  // ---- Agreement -----------------------------------------------------
  { fieldname: 'sec_agreement', fieldtype: 'Section Break', label: 'Agreement' },
  {
    fieldname: 'agreement_status', label: 'Status', fieldtype: 'Select',
    options: 'Draft\nGenerated\nSent\nSigned\nCancelled',
    default: 'Draft', read_only: 1, in_list_view: 1,
    description: 'Mirrored from the CRM. quote_service.agreement_ref is authoritative.',
  },
  {
    fieldname: 'effective_date', label: 'Effective Date', fieldtype: 'Date', reqd: 1,
    description: 'The date the appointment takes effect. Printed in the opening recital.',
  },
  {
    fieldname: 'naming_series', label: 'Series', fieldtype: 'Select',
    options: SERIES, default: SERIES, no_copy: 1,
    description:
      'Drives the document ID. The counter is keyed on the resolved prefix, so it ' +
      'restarts at 0001 each financial year.',
  },
  {
    fieldname: 'custom_short_fiscal_year', label: 'Short Fiscal Year', fieldtype: 'Data',
    read_only: 1, no_copy: 1,
    description:
      'e.g. 202627. The same field the Sales Order series uses. Feeds the document name, so ' +
      'it is fixed at creation — editing it afterwards does not rename anything.',
  },
  { fieldname: 'col_agreement', fieldtype: 'Column Break' },
  {
    fieldname: 'raised_by', label: 'Raised By', fieldtype: 'Data', read_only: 1,
    description: 'The person who created this agreement in the SGT CRM. Stamped automatically.',
  },
  {
    fieldname: 'raised_by_org', label: 'Raised By (Partner Code)', fieldtype: 'Data', read_only: 1,
    description: 'Blank when SGT raised it directly; the distributor code when they did.',
  },
  {
    fieldname: 'raised_via', label: 'Raised Via', fieldtype: 'Data', read_only: 1,
    description: 'Which surface it came from — the CRM, or the partner portal.',
  },

  // ---- Distributor ---------------------------------------------------
  { fieldname: 'sec_distributor', fieldtype: 'Section Break', label: 'Distributor' },
  { fieldname: 'distributor_name', label: 'Distributor Legal Name', fieldtype: 'Data', reqd: 1 },
  { fieldname: 'distributor_code', label: 'Distributor Code', fieldtype: 'Data', reqd: 1 },
  {
    fieldname: 'distributor_associate', label: 'Associate Concern', fieldtype: 'Data',
    description: 'Named in the recital as "(with its associate …)". Blank if there is none.',
  },
  {
    fieldname: 'distributor_region', label: 'Exclusive Region', fieldtype: 'Data',
    description:
      'The BARE region name, e.g. "Rajasthan" — no "the State of". The recital adds that ' +
      'wording itself; the Annexure B sticker needs it without. One field, two grammatical ' +
      'positions, which is why it must not be pre-worded.',
  },
  { fieldname: 'distributor_email', label: 'Distributor Email', fieldtype: 'Data' },
  { fieldname: 'col_distributor', fieldtype: 'Column Break' },
  { fieldname: 'distributor_address', label: 'Registered Office', fieldtype: 'Small Text' },
  {
    fieldname: 'distributor_signatory', label: 'Authorised Signatories', fieldtype: 'Data',
    description: 'All signatories, as named in the recital. May be more than one.',
  },
  { fieldname: 'distributor_signatory_designation', label: 'Designation', fieldtype: 'Data' },
  {
    fieldname: 'distributor_sign_name', label: 'Signature Block Name', fieldtype: 'Data',
    description: 'The ONE person who actually signs. Printed in the signature table.',
  },
  {
    fieldname: 'distributor_sign_designation', label: 'Signature Block Designation', fieldtype: 'Data',
    description:
      'Singular, e.g. "Authorised Signatory". Separate from the recital designation, which is ' +
      'plural when a partner has more than one signatory — only one of them signs.',
  },
  {
    fieldname: 'distributor_signature_url', label: 'Signature Image URL', fieldtype: 'Data',
    description: 'Optional. Drawn into the signature block in place of the blank rule.',
  },

  // ---- Dealer --------------------------------------------------------
  { fieldname: 'sec_dealer', fieldtype: 'Section Break', label: 'Dealer' },
  { fieldname: 'dealer_name', label: 'Dealer Legal Name', fieldtype: 'Data', reqd: 1, in_list_view: 1 },
  { fieldname: 'dealer_code', label: 'Dealer Code', fieldtype: 'Data', reqd: 1, in_list_view: 1 },
  {
    fieldname: 'dealer_type', label: 'Dealer Type', fieldtype: 'Select', options: 'SS\nSM',
    reqd: 1, in_list_view: 1,
    description: 'SS = Sales & Service. SM = Sales & Marketing. Drives Clause 2.1, Annexure A and the Annexure B sticker.',
  },
  {
    fieldname: 'dealer_constitution', label: 'Constitution', fieldtype: 'Data',
    description: 'As it reads in the recital, e.g. "a proprietorship concern".',
  },
  { fieldname: 'dealer_gstin', label: 'Dealer GSTIN', fieldtype: 'Data' },
  { fieldname: 'dealer_operating_area', label: 'Operating Area', fieldtype: 'Data' },
  { fieldname: 'col_dealer', fieldtype: 'Column Break' },
  { fieldname: 'dealer_address', label: 'Registered Office', fieldtype: 'Small Text' },
  { fieldname: 'dealer_signatory', label: 'Authorised Signatory', fieldtype: 'Data' },
  { fieldname: 'dealer_signatory_designation', label: 'Designation', fieldtype: 'Data' },
  { fieldname: 'dealer_email', label: 'Dealer Email', fieldtype: 'Data' },
  { fieldname: 'dealer_mobile', label: 'Dealer Mobile', fieldtype: 'Data' },

  // ---- SGT -----------------------------------------------------------
  { fieldname: 'sec_sgt', fieldtype: 'Section Break', label: 'SGT HydroEdge' },
  { fieldname: 'sgt_signatory', label: 'SGT Signatory', fieldtype: 'Data' },
  { fieldname: 'sgt_signatory_designation', label: 'Designation', fieldtype: 'Data' },
  { fieldname: 'col_sgt', fieldtype: 'Column Break' },
  {
    fieldname: 'sgt_signature_url', label: 'Signature Image URL', fieldtype: 'Data',
    description: 'Optional. Upload the signature to ERPNext and put its /files/… URL here.',
  },

  // ---- The prose -----------------------------------------------------
  { fieldname: 'sec_body', fieldtype: 'Section Break', label: 'Operative Clauses' },
  {
    fieldname: 'agreement_body', label: 'Sections 1–13', fieldtype: 'Text Editor',
    description:
      'The operative clauses, seeded from domain/agreementBody.ts when the agreement is ' +
      'created and editable on THIS agreement only. Editing here does not change any other ' +
      'agreement, raised or unraised.',
  },
];

const PERMISSIONS = [
  {
    role: 'System Manager',
    read: 1, write: 1, create: 1, delete: 1,
    report: 1, export: 1, print: 1, email: 1, share: 1,
  },
];

// ---------------------------------------------------------------------
// Client Script
//
// Fills custom_short_fiscal_year for anyone creating an agreement by hand
// in the ERPNext desk — the same job the "Payment Entry Series" script does
// there, asking ERPNext for the Fiscal Year rather than assuming April, so
// it follows the Fiscal Year records if they ever move.
//
// The CRM does not rely on this. Documents raised over the REST API never
// run client scripts, so that path sets the field itself (shortFiscalYear
// above). This exists so a desk-created agreement is not named SGT-AG--0001.
//
// It reads effective_date when one is already filled in, so an agreement
// back-dated to March lands in the financial year it belongs to, and stops
// once the document is saved — by then the name is fixed.
// ---------------------------------------------------------------------

const SCRIPT_NAME = process.env.ERP_AGREEMENT_CLIENT_SCRIPT ?? `${DOCTYPE} Series`;

const CLIENT_SCRIPT = `frappe.ui.form.on('${DOCTYPE}', {
    onload: function(frm) { set_short_fiscal_year(frm); },
    effective_date: function(frm) { set_short_fiscal_year(frm); }
});

function set_short_fiscal_year(frm) {
    if (!frm.is_new()) { return; }
    frappe.call({
        method: 'erpnext.accounts.utils.get_fiscal_year',
        args: { date: frm.doc.effective_date || frappe.datetime.get_today() },
        callback: function(r) {
            if (!r.message) { return; }
            var fy = r.message[0];               // fiscal year name, e.g. "2026-2027"
            frm.set_value('custom_short_fiscal_year',
                fy && fy.includes('-') ? fy.split('-')[0] + fy.split('-')[1].slice(-2) : fy);
        }
    });
}`;

// ---------------------------------------------------------------------
// Print format
//
// A rebuild of the Word template in HTML, not a conversion of it. The
// recitals, Annexure A, the Annexure B sticker and the signature table
// are all BUILT from the fields above, so they cannot disagree with the
// data the CRM holds — which was the failure mode of filling in a Word
// file by hand.
//
// Rendered with no_letterhead=1, so the masthead here is the only one.
// ---------------------------------------------------------------------

const PRINT_HTML = `<style>
  .ag { font-family: "Times New Roman", Georgia, serif; font-size: 10.5pt; line-height: 1.5; color: #1c1c1c; }
  .ag p { margin: 0 0 8pt 0; text-align: justify; }
  .ag .mast { text-align: center; border-bottom: 2pt solid #14532d; padding-bottom: 6pt; margin-bottom: 14pt; }
  .ag .mast .co { font-size: 13pt; font-weight: bold; letter-spacing: 0.06em; color: #14532d; }
  .ag .mast .addr { font-size: 8pt; color: #555; margin-top: 3pt; }
  .ag .title { text-align: center; font-size: 14pt; font-weight: bold; letter-spacing: 0.04em; margin-bottom: 2pt; }
  .ag .subtitle { text-align: center; font-size: 9.5pt; font-style: italic; color: #444; margin-bottom: 6pt; }
  .ag .parties { text-align: center; font-size: 9pt; color: #14532d; border-top: 0.5pt solid #cfd8d2;
                 border-bottom: 0.5pt solid #cfd8d2; padding: 4pt 0; margin-bottom: 12pt; }
  .ag .recital { margin-bottom: 8pt; }
  .ag h3.ag-h { font-size: 11pt; font-weight: bold; color: #14532d; margin: 14pt 0 6pt 0;
                page-break-after: avoid; }
  .ag p.ag-c { margin: 0 0 7pt 0; }
  .ag .annex { font-size: 12pt; font-weight: bold; color: #14532d; margin: 16pt 0 8pt 0;
               border-bottom: 0.5pt solid #cfd8d2; padding-bottom: 3pt; page-break-after: avoid; }
  .ag table.axa { width: 100%; border-collapse: collapse; font-size: 10pt; }
  .ag table.axa td { padding: 4pt 6pt; border-bottom: 0.5pt solid #e2e8e5; vertical-align: top; }
  .ag table.axa td.k { width: 33%; font-weight: bold; color: #333; }
  .ag .sticker { border: 0.75pt solid #14532d; padding: 8pt 10pt; margin: 8pt 0; font-style: italic; }
  .ag table.sign { width: 100%; border-collapse: collapse; margin-top: 10pt; page-break-inside: avoid; }
  .ag table.sign td { width: 33.33%; vertical-align: top; padding: 6pt 8pt; border: 0.5pt solid #cfd8d2; font-size: 9.5pt; }
  .ag table.sign .for { font-weight: bold; color: #14532d; margin-bottom: 4pt; }
  .ag .sigimg { max-height: 60pt; max-width: 100%; display: block; margin: 4pt 0; }
  /* Somewhere to actually sign. A party who has not signed yet was getting an
     inline rule on the same line as the label — nowhere to put a signature or
     a stamp. Height matches .sigimg so a signed column and an unsigned one
     stay the same depth and the three blocks line up. */
  .ag .siglabel { margin: 4pt 0 2pt; }
  .ag .sigspace { height: 60pt; border-bottom: 1px solid #555; margin-bottom: 6pt; }
  /* 1px, not 0.5pt. A half-point border rounds to zero in wkhtmltopdf and in
     the browser print preview, so the line someone is meant to sign or date
     on simply was not there. Width in px for the same reason. */
  .ag .rule { display: inline-block; min-width: 120px; border-bottom: 1px solid #555;
              line-height: 1.6; }
  .ag .sigrow { margin-bottom: 5pt; }
  .ag .endnote { text-align: center; font-size: 8pt; letter-spacing: 0.12em; text-transform: uppercase;
                 color: #8a867c; margin-top: 14pt; }
  .ag .pb { page-break-before: always; }
</style>

{%- set dtype = doc.dealer_type or "SS" -%}
{%- set dtype_phrase = "a full-spectrum Sales & Service (SS) Dealer" if dtype == "SS" else "a Sales & Marketing (SM) Dealer" -%}
{%- set sticker_verb = "Sold, installed and serviced by" if dtype == "SS" else "Sold by" -%}
{%- set eff = doc.get_formatted("effective_date") if doc.effective_date else "" -%}

<div class="ag">

  <div class="mast">
    <div class="co">SGT HYDROEDGE PRIVATE LIMITED</div>
    <div class="addr">A3-202, Lunkad Sky Vie, Viman Nagar, Pune 411014, Maharashtra, India
      &nbsp;|&nbsp; contact@sgthydroedge.com &nbsp;|&nbsp; CIN: U28110PN2023PTC223880</div>
  </div>

  <div class="title">TRIPARTITE DEALER APPOINTMENT AGREEMENT</div>
  <div class="subtitle">GreenX&trade; CHFA Hydrogen Fuel-Assist Systems for Diesel Generator Sets</div>

  <div class="parties">
    SGT HydroEdge &nbsp;&middot;&nbsp; Distributor: <strong>{{ doc.distributor_name }} ({{ doc.distributor_code }})</strong>
    &nbsp;&middot;&nbsp; Dealer: <strong>{{ doc.dealer_name }} ({{ doc.dealer_code }})</strong>
  </div>

  <p>This Tripartite Dealer Appointment Agreement (the &ldquo;Agreement&rdquo;) is made on
    {% if eff %}<strong>{{ eff }}</strong>{% else %}<span class="rule">&nbsp;</span>{% endif %}
    (the &ldquo;Effective Date&rdquo;) between:</p>

  <p class="recital">(1)&nbsp;&nbsp;<strong>SGT HydroEdge Private Limited</strong>, CIN U28110PN2023PTC223880,
    having its registered office at A3-202, Lunkad Sky Vie, Viman Nagar, Pune 411014, Maharashtra
    (&ldquo;SGT&rdquo; or the &ldquo;Principal&rdquo;);</p>

  <p class="recital">(2)&nbsp;&nbsp;<strong>{{ doc.distributor_name }}</strong>{% if doc.distributor_associate %}
    (with its associate {{ doc.distributor_associate }}){% endif %}{% if doc.distributor_signatory %},
    acting through {{ doc.distributor_signatory }}{% if doc.distributor_signatory_designation %}
    ({{ doc.distributor_signatory_designation }}){% endif %}{% endif %}{% if doc.distributor_address %},
    registered office at {{ doc.distributor_address }}{% endif %}{% if doc.distributor_email %};
    email {{ doc.distributor_email }}{% endif %} &mdash; SGT&rsquo;s Exclusive Distributor for
    {% if doc.distributor_region %}the State of {{ doc.distributor_region }}{% else %}its Region{% endif %},
    Distributor Code {{ doc.distributor_code }}
    (the &ldquo;Distributor&rdquo;); and</p>

  <p class="recital">(3)&nbsp;&nbsp;<strong>{{ doc.dealer_name }}</strong>{% if doc.dealer_constitution %},
    {{ doc.dealer_constitution }}{% endif %}{% if doc.dealer_gstin %} (GSTIN {{ doc.dealer_gstin }}){% endif %}{% if doc.dealer_signatory %},
    acting through {{ doc.dealer_signatory }}{% if doc.dealer_signatory_designation %}
    ({{ doc.dealer_signatory_designation }}){% endif %}{% endif %}{% if doc.dealer_address %},
    registered office at {{ doc.dealer_address }}{% endif %}{% if doc.dealer_email %};
    email {{ doc.dealer_email }}{% endif %}{% if doc.dealer_mobile %}; mobile {{ doc.dealer_mobile }}{% endif %}
    &mdash; appointed under the Distributor with Dealer Code {{ doc.dealer_code }},
    {{ dtype_phrase }} (the &ldquo;Dealer&rdquo;).</p>

  <p>SGT, the Distributor and the Dealer are each a &ldquo;Party&rdquo; and together the
    &ldquo;Parties&rdquo;. By this Agreement, SGT &mdash; together with the Distributor &mdash; appoints the
    Dealer to sell and service the GreenX&trade; Products within the Distributor&rsquo;s ecosystem. The
    Products are SGT&rsquo;s GreenX&trade; CHFA&trade; systems for diesel generator sets
    (Indian Patent No. 582824).</p>

  {{ doc.agreement_body or "" }}

  <div class="annex">Annexure A &mdash; Dealer Details, Code, Type &amp; Linkage</div>
  <table class="axa">
    <tr><td class="k">Dealer legal name</td><td>{{ doc.dealer_name }}</td></tr>
    <tr><td class="k">Constitution &amp; GSTIN</td><td>{% if doc.dealer_constitution %}{{ doc.dealer_constitution }}{% else %}&mdash;{% endif %}{% if doc.dealer_gstin %} &nbsp;&middot;&nbsp; GSTIN {{ doc.dealer_gstin }}{% endif %}</td></tr>
    <tr><td class="k">Authorised signatory</td><td>{% if doc.dealer_signatory %}{{ doc.dealer_signatory }}{% else %}&mdash;{% endif %}{% if doc.dealer_signatory_designation %}, {{ doc.dealer_signatory_designation }}{% endif %}</td></tr>
    <tr><td class="k">Registered address</td><td>{% if doc.dealer_address %}{{ doc.dealer_address }}{% else %}&mdash;{% endif %}</td></tr>
    <tr><td class="k">Contact</td><td>{{ doc.dealer_mobile or "" }}{% if doc.dealer_mobile and doc.dealer_email %} &nbsp;&middot;&nbsp; {% endif %}{{ doc.dealer_email or "" }}</td></tr>
    <tr><td class="k">Linked Distributor</td><td>{{ doc.distributor_name }} ({{ doc.distributor_code }})</td></tr>
    <tr><td class="k">Dealer Code</td><td><strong>{{ doc.dealer_code }}</strong></td></tr>
    <tr><td class="k">Dealer Type</td><td>
      {% if dtype == "SM" %}&#9746;{% else %}&#9744;{% endif %} SM &mdash; Sales &amp; Marketing (sales only)
      &nbsp;&nbsp;&nbsp;&nbsp;
      {% if dtype == "SS" %}&#9746;{% else %}&#9744;{% endif %} SS &mdash; Full-spectrum (Sales &amp; Service)
    </td></tr>
    <tr><td class="k">Operating area</td><td>{% if doc.dealer_operating_area %}{{ doc.dealer_operating_area }}{% else %}&mdash;{% endif %}</td></tr>
  </table>

  <div class="annex">Annexure B &mdash; Dealer Branding / Sticker Specification</div>
  <p>Every unit deployed through the Dealer carries SGT branding plus the sticker below, applied
    before handover; each deployment registered in GreenVision under the Dealer Code.</p>
  <div class="sticker">
    &ldquo;{{ sticker_verb }}: <strong>{{ doc.dealer_name }}</strong>, authorised GreenX&trade; Dealer
    (<strong>{{ doc.dealer_code }}</strong>) under {{ doc.distributor_name }}
    (Distributor{% if doc.distributor_region %}, {{ doc.distributor_region }}{% endif %}).
    Contact: {{ doc.dealer_mobile or "" }}{% if doc.dealer_mobile and doc.dealer_email %} &middot; {% endif %}{{ doc.dealer_email or "" }}.&rdquo;
  </div>
  <p>&ldquo;Manufactured by SGT HydroEdge Private Limited&rdquo; (existing manufacturer marking &mdash; retained).</p>
  <p>Placement, size and artwork per SGT brand guidelines; SGT supplies the template. The Dealer may
    not alter, obscure or remove the SGT manufacturer marking or any patent / certification markings.</p>

  <div class="annex">Signatures</div>
  <p>Agreed and accepted by the Parties as of the Effective Date.</p>
  <table class="sign">
    <tr>
      <td>
        <div class="for">For SGT HydroEdge Private Limited</div>
        {% if doc.sgt_signature_url %}<img class="sigimg" src="{{ doc.sgt_signature_url }}">
        {% else %}<div class="siglabel">Signature:</div><div class="sigspace"></div>{% endif %}
        <div class="sigrow">Name: {% if doc.sgt_signatory %}{{ doc.sgt_signatory }}{% else %}<span class="rule">&nbsp;</span>{% endif %}</div>
        <div class="sigrow">Designation: {% if doc.sgt_signatory_designation %}{{ doc.sgt_signatory_designation }}{% else %}<span class="rule">&nbsp;</span>{% endif %}</div>
        {#- Dated only where the party has ALREADY signed: a signature image on
            file means this copy goes out executed, and an executed signature
            with no date is incomplete. A party who has yet to sign gets a rule
            to date by hand, because we cannot know when they will. -#}
        <div class="sigrow">Date: {% if doc.sgt_signature_url and eff %}{{ eff }}{% else %}<span class="rule">&nbsp;</span>{% endif %}</div>
      </td>
      <td>
        <div class="for">For {{ doc.distributor_name }}</div>
        {% if doc.distributor_signature_url %}<img class="sigimg" src="{{ doc.distributor_signature_url }}">
        {% else %}<div class="siglabel">Signature:</div><div class="sigspace"></div>{% endif %}
        <div class="sigrow">Name: {% if doc.distributor_sign_name %}{{ doc.distributor_sign_name }}{% elif doc.distributor_signatory %}{{ doc.distributor_signatory }}{% else %}<span class="rule">&nbsp;</span>{% endif %}</div>
        <div class="sigrow">Designation: {% if doc.distributor_sign_designation %}{{ doc.distributor_sign_designation }}{% else %}Authorised Signatory{% endif %}
          (Distributor &middot; {{ doc.distributor_code }})</div>
        <div class="sigrow">Date: {% if doc.distributor_signature_url and eff %}{{ eff }}{% else %}<span class="rule">&nbsp;</span>{% endif %}</div>
      </td>
      <td>
        <div class="for">For {{ doc.dealer_name }}</div>
        {#- The dealer never has a signature on file: this copy goes to them to
            sign. Always the signing space, never an image. -#}
        <div class="siglabel">Signature:</div><div class="sigspace"></div>
        <div class="sigrow">Name: {% if doc.dealer_signatory %}{{ doc.dealer_signatory }}{% else %}<span class="rule">&nbsp;</span>{% endif %}</div>
        <div class="sigrow">Designation: {% if doc.dealer_signatory_designation %}{{ doc.dealer_signatory_designation }} {% endif %}(Dealer &middot; {{ doc.dealer_code }})</div>
        <div class="sigrow">Date: <span class="rule">&nbsp;</span></div>
      </td>
    </tr>
  </table>

  <div class="endnote">&mdash; End of Agreement &mdash;</div>
</div>`;

// ---------------------------------------------------------------------
// The sample. Off unless SAMPLE=1.
//
// The exact data from the executed Word template, so the rendered PDF
// can be held next to the original and compared line for line. It is a
// normal draft document and is safe to delete once it has served that
// purpose.
// ---------------------------------------------------------------------

const SAMPLE: Record<string, string> = {
  agreement_status: 'Draft',
  effective_date: new Date().toISOString().slice(0, 10),
  custom_short_fiscal_year: shortFiscalYear(),
  raised_by: 'sample',
  raised_via: 'script',

  distributor_name: 'Continental Power System',
  distributor_code: 'EDINGX001',
  distributor_associate: 'Triumph Engineer',
  distributor_region: 'Rajasthan',
  distributor_email: 'cpsdgsets@gmail.com',
  distributor_address: 'F-6/200, Chitrakoot Scheme, Ajmer Road, Jaipur 302021, Rajasthan',
  distributor_signatory: 'Mr. Mahadev (M. D.) Jethani and Ms. Sanya Jethani',
  distributor_signatory_designation: 'Authorised Signatories',
  distributor_sign_name: 'Mr. Mahadev (M. D.) Jethani',
  distributor_sign_designation: 'Authorised Signatory',
  // The real signature files. Relative on purpose — the PDF renderer
  // resolves them against the site, same as ERP_TERMS_STAMP_URLS. Present
  // here so the sample exercises the signed-and-dated branch of the
  // signature block rather than only the blank-rule one.
  distributor_signature_url: '/files/cps-sign.png',

  dealer_name: 'GEN.TECH. ENGINEERS',
  dealer_code: 'EDINGX001-SS01',
  dealer_type: 'SS',
  dealer_constitution: 'a proprietorship concern',
  dealer_gstin: '08AGTPJ5674L1ZI',
  dealer_operating_area: 'Jaipur, Rajasthan (within the Distributor’s Region)',
  dealer_address: 'Plot No. 45F2, Vikas Nagar, Murlipura, Jaipur 302039, Rajasthan, India',
  dealer_signatory: 'Mr. Hemant Jangid',
  dealer_signatory_designation: 'Proprietor',

  sgt_signatory: 'Alok Kumar',
  sgt_signatory_designation: 'Managing Director',
  sgt_signature_url: '/files/sign.jpg',
  dealer_email: 'engineersgentech@gmail.com',
  dealer_mobile: '+91-8619383752 / +91-9414775611',

  agreement_body: textToBody(fillBodyTokens(DEFAULT_AGREEMENT_BODY_TEXT, {
    distributorCode: 'EDINGX001',
    dealerCode: 'EDINGX001-SS01',
    dealerType: 'SS',
  })),
};

// ---------------------------------------------------------------------

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, json, text };
}

const why = (r: { json: any; text: string }) =>
  String(r.json?.exception ?? r.json?.message ?? r.text).replace(/\s+/g, ' ').slice(0, 300);

async function getDoc(doctype: string, name: string) {
  const r = await call('GET',
    `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  return r.ok ? r.json?.data ?? null : null;
}

async function main() {
  console.log(CONFIRMED
    ? `▶ Creating "${DOCTYPE}" + print format "${FORMAT}" — ${BASE}\n`
    : `▶ DRY RUN — nothing will be created. ${BASE}\n`);

  // ---- Preflight: can this key even see DocType? ----------------------
  const probe = await call('GET',
    `/api/resource/DocType?filters=${encodeURIComponent('[["custom","=",1]]')}` +
    `&fields=${encodeURIComponent('["name","module"]')}&limit_page_length=50`);
  if (!probe.ok) {
    console.error(`✗ cannot read DocType: HTTP ${probe.status} — ${why(probe)}`);
    console.error('  The API key\'s role almost certainly lacks System Manager.');
    process.exit(1);
  }
  const customs = probe.json?.data ?? [];
  console.log(`  ${customs.length} custom doctype(s) already in ERPNext` +
              (customs.length ? `: ${customs.map((d: any) => d.name).join(', ')}` : ''));

  // ---- Preflight: the module must exist -------------------------------
  const mod = await getDoc('Module Def', MODULE);
  if (!mod) {
    const list = await call('GET',
      `/api/resource/${encodeURIComponent('Module Def')}` +
      `?fields=${encodeURIComponent('["name"]')}&limit_page_length=100`);
    console.error(`✗ Module Def "${MODULE}" does not exist in this ERPNext.`);
    console.error('  Available: ' +
      (list.json?.data ?? []).map((m: any) => m.name).join(', '));
    console.error('  Set ERP_AGREEMENT_MODULE to one of them and re-run.');
    process.exit(1);
  }
  console.log(`  module "${MODULE}" ✓`);

  // ---- What exists already --------------------------------------------
  const existingDt = await getDoc('DocType', DOCTYPE);
  const existingFmt = await getDoc('Print Format', FORMAT);
  const existingScript = await getDoc('Client Script', SCRIPT_NAME);

  const have = new Set<string>(
    (existingDt?.fields ?? []).map((f: any) => String(f.fieldname)));
  const missing = FIELDS.filter(f => !have.has(f.fieldname));
  // The doctype's live autoname. Read in the report, acted on in the write,
  // so it is scoped across both.
  let live = '';

  console.log('');
  if (existingDt) {
    console.log(`  DocType "${DOCTYPE}" EXISTS with ${have.size} field(s).`);
    if (existingDt.custom !== 1) {
      console.error('✗ …but it is not a CUSTOM doctype. Refusing to touch it.');
      process.exit(1);
    }
    console.log(missing.length
      ? `    ${missing.length} field(s) would be ADDED: ${missing.map(f => f.fieldname).join(', ')}`
      : '    all fields present — no field changes');
    console.log('    Existing fields and any hand-edits to them are left alone.');

    // Naming IS repaired on an existing doctype — it was previously left
    // alone, and that is how a live doctype kept minting "SGT-AG--0313"
    // long after the script knew better. Existing documents keep the names
    // they were given; only the next one is affected.
    live = String(existingDt.autoname ?? '');
    if (live !== 'naming_series:') {
      console.log(`    ⚠ autoname is "${live || '(unset)'}" and would be CHANGED to "naming_series:"`);
      if (live.startsWith('format:')) {
        console.log('      A format: series numbers from a single site-wide counter — that is');
        console.log('      why the numbering jumped. The naming_series field counts per prefix.');
      }
      console.log(`      Series: ${SERIES}   next: ${seriesExample}`);
      console.log('      Documents already named keep their names.');
    }
  } else {
    console.log(`  DocType "${DOCTYPE}" would be CREATED:`);
    console.log(`    module ${MODULE} · custom · autoname ${SERIES} · not submittable`);
    console.log(`      → first document of this financial year: ${seriesExample}`);
    console.log(`    ${FIELDS.filter(f => !f.fieldtype.includes('Break')).length} data field(s), ` +
                `${FIELDS.filter(f => f.fieldtype.includes('Break')).length} layout break(s)`);
  }

  console.log('');
  console.log(existingFmt
    ? `  Print Format "${FORMAT}" EXISTS — this run REPLACES its HTML.\n` +
      '    Hand-edits made to it in ERPNext will be lost. This file is the source.'
    : `  Print Format "${FORMAT}" would be CREATED (custom HTML/Jinja, ${PRINT_HTML.length} chars).`);

  console.log(existingScript
    ? `  Client Script "${SCRIPT_NAME}" EXISTS — this run REPLACES its code.`
    : `  Client Script "${SCRIPT_NAME}" would be CREATED.`);
  console.log('    Fills custom_short_fiscal_year on desk-created agreements, from the ERPNext');
  console.log('    Fiscal Year. Agreements raised by the CRM set it over the API instead.');

  console.log('');
  console.log('  The format builds from the fields, not from free text:');
  console.log('    · recitals (2) and (3)     from the distributor / dealer blocks');
  console.log('    · Annexure A               9 rows, dealer type as a ☒/☐ pair');
  console.log('    · Annexure B sticker       "Sold, installed and serviced by" for SS, "Sold by" for SM');
  console.log('    · signature table          3 columns, signature images when a URL is set');
  console.log('    · sections 1–13            from agreement_body on each document');

  if (WANT_SAMPLE) {
    console.log('');
    console.log(`  SAMPLE=1 — one draft would be created: ${SAMPLE.dealer_name} (${SAMPLE.dealer_code})`);
    console.log('    Populated from the Word template so the PDF can be compared to it.');
    console.log('    Safe to delete afterwards.');
  }

  if (!CONFIRMED) {
    console.log('\n  DRY RUN — nothing written.');
    console.log('  Re-run with CONFIRM_CREATE=1 to apply' +
                (WANT_SAMPLE ? '' : ', or CONFIRM_CREATE=1 SAMPLE=1 to also get a draft to print') + '.');
    return;
  }

  // ---- DocType ---------------------------------------------------------
  console.log('\n  writing…');
  if (existingDt) {
    // Fields and naming in ONE write. Two PUTs would leave the doctype
    // briefly naming_series-ruled with no naming_series field on it, and
    // anyone creating an agreement in that window gets an unnamed document.
    const patch: Record<string, unknown> = {};
    if (missing.length) patch.fields = [...(existingDt.fields ?? []), ...missing];
    if (live !== 'naming_series:') {
      patch.naming_rule = 'By "Naming Series" field';
      patch.autoname = 'naming_series:';
    }
    if (Object.keys(patch).length) {
      const r = await call('PUT', `/api/resource/DocType/${encodeURIComponent(DOCTYPE)}`, patch);
      if (!r.ok) { console.error(`    ✗ could not update doctype: ${why(r)}`); process.exitCode = 1; return; }
      if (missing.length) console.log(`    ✓ added ${missing.length} field(s)`);
      if (patch.autoname) console.log(`    ✓ naming repaired — next: ${seriesExample}`);
    } else {
      console.log('    · doctype unchanged');
    }
  } else {
    const r = await call('POST', '/api/resource/DocType', {
      doctype: 'DocType',
      name: DOCTYPE,
      __newname: DOCTYPE,
      module: MODULE,
      custom: 1,
      is_submittable: 0,
      issingle: 0,
      istable: 0,
      editable_grid: 0,
      track_changes: 1,
      allow_rename: 0,
      naming_rule: 'By "Naming Series" field',
      autoname: 'naming_series:',
      title_field: 'dealer_name',
      search_fields: 'dealer_code,dealer_name,effective_date',
      sort_field: 'creation',
      sort_order: 'DESC',
      fields: FIELDS,
      permissions: PERMISSIONS,
    });
    if (!r.ok) { console.error(`    ✗ could not create doctype: ${why(r)}`); process.exitCode = 1; return; }
    console.log(`    ✓ created doctype "${r.json?.data?.name ?? DOCTYPE}"`);
  }

  // ---- Print Format ----------------------------------------------------
  const fmtBody = {
    doctype: 'Print Format',
    name: FORMAT,
    doc_type: DOCTYPE,
    module: MODULE,
    standard: 'No',
    custom_format: 1,
    print_format_type: 'Jinja',
    disabled: 0,
    font_size: 0,
    margin_top: 15,
    margin_bottom: 15,
    margin_left: 15,
    margin_right: 15,
    default_print_language: 'en',
    html: PRINT_HTML,
  };
  const fr = existingFmt
    ? await call('PUT', `/api/resource/${encodeURIComponent('Print Format')}/${encodeURIComponent(FORMAT)}`, fmtBody)
    : await call('POST', `/api/resource/${encodeURIComponent('Print Format')}`, { ...fmtBody, __newname: FORMAT });
  if (!fr.ok) { console.error(`    ✗ could not write print format: ${why(fr)}`); process.exitCode = 1; return; }
  console.log(`    ✓ ${existingFmt ? 'replaced' : 'created'} print format "${FORMAT}"`);

  // Pin it as the default, so download_pdf renders this one even if
  // someone later adds a second format. Done AFTER the format exists —
  // it is a Link field and would fail validation before that.
  const dr = await call('PUT', `/api/resource/DocType/${encodeURIComponent(DOCTYPE)}`,
    { default_print_format: FORMAT });
  console.log(dr.ok
    ? '    ✓ pinned as the doctype default print format'
    : `    ⚠ could not pin as default (${why(dr)}) — set ERP_AGREEMENT_PRINT_FORMAT instead`);

  // ---- Client Script ---------------------------------------------------
  const scriptBody = {
    doctype: 'Client Script',
    name: SCRIPT_NAME,
    dt: DOCTYPE,
    view: 'Form',
    enabled: 1,
    script: CLIENT_SCRIPT,
  };
  const cr = existingScript
    ? await call('PUT', `/api/resource/${encodeURIComponent('Client Script')}/${encodeURIComponent(SCRIPT_NAME)}`, scriptBody)
    : await call('POST', `/api/resource/${encodeURIComponent('Client Script')}`, { ...scriptBody, __newname: SCRIPT_NAME });
  console.log(cr.ok
    ? `    ✓ ${existingScript ? 'replaced' : 'created'} client script "${SCRIPT_NAME}"`
    : `    ⚠ could not write client script (${why(cr)}) — desk-created agreements will need ` +
      'custom_short_fiscal_year filled by hand');

  // ---- Sample ----------------------------------------------------------
  if (WANT_SAMPLE) {
    const sr = await call('POST', `/api/resource/${encodeURIComponent(DOCTYPE)}`,
      { doctype: DOCTYPE, ...SAMPLE });
    if (sr.ok) {
      const name = sr.json?.data?.name;
      console.log(`    ✓ sample draft ${name}`);
      console.log(`\n  Print it:  ${BASE}/api/method/frappe.utils.print_format.download_pdf` +
                  `?doctype=${encodeURIComponent(DOCTYPE)}&name=${encodeURIComponent(name)}` +
                  `&format=${encodeURIComponent(FORMAT)}&no_letterhead=1`);
      console.log(`  Or open:   ${BASE}/app/${DOCTYPE.toLowerCase().replace(/ /g, '-')}/${name}`);
    } else {
      console.log(`    ✗ sample: ${why(sr)}`);
    }
  }

  console.log(`\n✔ done. Set these in .env if you renamed anything:`);
  console.log(`    ERP_AGREEMENT_DOCTYPE="${DOCTYPE}"`);
  console.log(`    ERP_AGREEMENT_PRINT_FORMAT="${FORMAT}"`);
}

main().catch(e => { console.error(e); process.exit(1); });

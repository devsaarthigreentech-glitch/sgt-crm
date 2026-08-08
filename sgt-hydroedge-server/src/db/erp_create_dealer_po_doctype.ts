/// <reference types="node" />
// =====================================================================
// erp_create_dealer_po_doctype.ts
// Creates the "SGT Dealer PO" DocType, its two child tables and its
// Print Format in ERPNext.
//
// DRY RUN BY DEFAULT.
//
//   npx tsx src/db/erp_create_dealer_po_doctype.ts                  # report
//   CONFIRM_CREATE=1 npx tsx src/db/erp_create_dealer_po_doctype.ts # apply
//   CONFIRM_CREATE=1 CLONE_FROM_QUOTATION=1 npx tsx src/db/erp_create_dealer_po_doctype.ts
//                                        # take the Quotation format's HTML verbatim
//
// Why a custom doctype and not ERPNext's Purchase Order
// -----------------------------------------------------
// Two reasons, and the second is the load-bearing one.
//
//   1. Direction. ERPNext's "Purchase Order" is SGT BUYING. This document
//      is the dealer's order for GreenX sets — the opposite side of the
//      ledger — so putting it there would file it against payables.
//
//   2. It is already taken. services/buildable.ts raises draft ERPNext
//      Purchase Orders to component suppliers as part of procurement.
//      Dealer POs landing in that same list would corrupt a working
//      workflow, not merely look untidy.
//
// A Sales Order was the other candidate and was rejected on the owner's
// instruction (2026-08-05): this document is paperwork, not an order that
// should trigger delivery, invoicing or the Outstanding Orders dashboard.
// It has NO accounting effect. If that changes, the migration is to point
// services/dealerPo.ts at a Sales Order instead — the fields below are
// already named after ERPNext's, precisely so that stays cheap.
//
// Why the fieldnames look like ERPNext's
// --------------------------------------
// `items`, `taxes`, `customer_name`, `net_total`, `grand_total`, `terms`,
// `custom_partner_*` — all named exactly as the Quotation names them.
// That is what lets CLONE_FROM_QUOTATION=1 lift the live quotation print
// format's HTML onto this doctype and have it render unchanged, which is
// the strictest available reading of "a replica of the Quotation". The
// built-in format below is the fallback for sites whose quotation format
// is a standard or Print Designer one, where there is no HTML to clone.
//
// Everything on the document is SNAPSHOTTED from the quotation it was
// raised against — same rule as the quotation's own partner block. A PO
// reprinted next year must show what the dealer ordered, at the prices
// they ordered it at, under the partner details current at the time.
//
// Re-running is safe, and safe in BOTH directions. An existing doctype
// gains any fields missing from it and keeps the rest, and an existing
// print format is LEFT ALONE — the layout on this site is maintained in
// ERPNext's Print Format Builder, not in this file. PRINT_HTML below is
// only a seed for a site that has no format yet. Pass
// REPLACE_PRINT_FORMAT=1 to push it over an existing one.
//
// That matters because adding a field to the doctype is a thing that
// keeps needing to happen, and it must never cost somebody their layout.
// =====================================================================

import 'dotenv/config';
import { shortFiscalYear } from '../domain/fiscalYear.js';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;
const CONFIRMED = process.env.CONFIRM_CREATE === '1';
const WANT_CLONE = process.env.CLONE_FROM_QUOTATION === '1';

/**
 * Overwrite a print format that already exists.
 *
 * OFF by default, and that default changed on 2026-08-06 after the owner
 * built the PO layout in ERPNext's Print Format Builder instead. A
 * builder format keeps its layout in `format_data` with
 * `custom_format = 0`; this script writes `html` with
 * `custom_format = 1`. Replacing one with the other does not merge, it
 * REPLACES — and it would happen on a run whose only purpose was adding
 * a field to the doctype, which is a thing that keeps needing to happen.
 *
 * So the rule is now: CREATE a print format when none exists, never
 * touch one that does. REPLACE_PRINT_FORMAT=1 restores the old
 * behaviour for anyone maintaining the layout in this file.
 */
const REPLACE_FORMAT = process.env.REPLACE_PRINT_FORMAT === '1';

// Frappe requires a real Module Def to hang a custom doctype off. Selling
// is where this belongs and is guaranteed present in ERPNext.
const MODULE = process.env.ERP_PO_MODULE ?? 'Selling';

const DOCTYPE = process.env.ERP_PO_DOCTYPE ?? 'SGT Dealer PO';
const ITEM_DOCTYPE = `${DOCTYPE} Item`;
const TAX_DOCTYPE = `${DOCTYPE} Tax`;
// MUST match PO_FORMAT in services/erpDealerPo.ts. They are separate
// literals because this script imports nothing from the running server,
// so the two are kept in step by hand — and a mismatch is silent: the
// script would create or update a format under one name while
// fetchPoPdf() renders under another, leaving POs printing from a stale
// layout or failing outright.
const FORMAT = process.env.ERP_PO_PRINT_FORMAT ?? 'SGT-Dealer PO';

// Document name series, e.g. SGT-PO-202627-0001.
//
// DOTTED and driven by the naming_series field, NOT `format:`. The
// agreement doctype learned this the hard way: Frappe's _format_autoname
// hands each {…} to parse_naming_series SEPARATELY, so `{####}` sees an
// empty prefix and draws from one site-wide counter — the second
// agreement ever raised came out as SGT-AG--0313. The dotted form is
// parsed in one pass and counts per resolved prefix, restarting at 0001
// each financial year. See erp_create_agreement_doctype.ts.
const SERIES = process.env.ERP_PO_SERIES ?? 'SGT-PO-.{custom_short_fiscal_year}.-.####';

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
  precision?: string;
  print_hide?: 0 | 1;
  description?: string;
}

// ---------------------------------------------------------------------
// The item rows.
//
// Named after Quotation Item, field for field, so the same Jinja renders
// both. `description` carries the spec block that domain/quoteSpec.ts
// builds — it is already HTML on the quotation and is copied across as
// HTML, which is why it is a Text Editor rather than a Small Text.
// ---------------------------------------------------------------------

const ITEM_FIELDS: Field[] = [
  { fieldname: 'item_code', label: 'Item Code', fieldtype: 'Data', in_list_view: 1, reqd: 1 },
  { fieldname: 'item_name', label: 'Item Name', fieldtype: 'Data', in_list_view: 1 },
  {
    fieldname: 'gst_hsn_code', label: 'HSN/SAC', fieldtype: 'Data',
    description: 'Copied off the quotation line. The quotation prints it as a column, so this must too.',
  },
  {
    fieldname: 'description', label: 'Description', fieldtype: 'Text Editor',
    description: 'The specification block, as it was printed on the quotation.',
  },
  { fieldname: 'qty', label: 'Quantity', fieldtype: 'Float', in_list_view: 1, default: '1' },
  { fieldname: 'uom', label: 'UOM', fieldtype: 'Data' },
  {
    fieldname: 'price_list_rate', label: 'List Rate', fieldtype: 'Currency', precision: '2',
    description: 'Before discount. Printed as the struck-through figure when a discount applies.',
  },
  { fieldname: 'discount_percentage', label: 'Discount (%)', fieldtype: 'Percent' },
  {
    fieldname: 'discount_amount', label: 'Discount Amount', fieldtype: 'Currency', precision: '2',
    description: 'PER UNIT, as ERPNext stores it on a Quotation Item. Not the line total.',
  },
  { fieldname: 'rate', label: 'Rate', fieldtype: 'Currency', in_list_view: 1, precision: '2' },
  { fieldname: 'amount', label: 'Amount', fieldtype: 'Currency', in_list_view: 1, precision: '2' },
];

// One row per tax line, copied off the quotation rather than recomputed.
// Recomputing would mean re-deriving the CGST+SGST / IGST split here, and
// two implementations of that is exactly how a document ends up disagreeing
// with the quotation it came from.
const TAX_FIELDS: Field[] = [
  { fieldname: 'description', label: 'Description', fieldtype: 'Data', in_list_view: 1 },
  { fieldname: 'rate', label: 'Rate', fieldtype: 'Float', in_list_view: 1 },
  { fieldname: 'tax_amount', label: 'Amount', fieldtype: 'Currency', in_list_view: 1, precision: '2' },
];

// ---------------------------------------------------------------------
// The document.
//
// print_hide: 1 on everything. The print format is a custom_format and
// draws every value explicitly; without print_hide the automatic field
// list would print them all a second time underneath if anyone ever
// rendered with the Standard format.
// ---------------------------------------------------------------------

const FIELDS: Field[] = [
  // ---- The order ------------------------------------------------------
  { fieldname: 'sec_po', fieldtype: 'Section Break', label: 'Purchase Order' },
  {
    fieldname: 'po_status', label: 'Status', fieldtype: 'Select',
    options: 'Draft\nGenerated\nCancelled',
    default: 'Generated', read_only: 1, in_list_view: 1, print_hide: 1,
    description: 'Mirrored from the CRM. quote_service.dealer_po_ref is authoritative.',
  },
  {
    fieldname: 'transaction_date', label: 'PO Date', fieldtype: 'Date', reqd: 1, print_hide: 1,
    description: 'Named as ERPNext names it, so a cloned Quotation print format finds it.',
  },
  { fieldname: 'valid_till', label: 'Valid Till', fieldtype: 'Date', print_hide: 1 },
  {
    fieldname: 'quotation_ref', label: 'Against Quotation', fieldtype: 'Data',
    read_only: 1, in_list_view: 1, print_hide: 1,
    description: 'The ERPNext Quotation this PO was raised from, e.g. SAL-QTN-2026-00013.',
  },
  {
    fieldname: 'naming_series', label: 'Series', fieldtype: 'Select',
    options: SERIES, default: SERIES, no_copy: 1, print_hide: 1,
    description:
      'Drives the document ID. The counter is keyed on the resolved prefix, so it ' +
      'restarts at 0001 each financial year.',
  },
  {
    fieldname: 'custom_short_fiscal_year', label: 'Short Fiscal Year', fieldtype: 'Data',
    read_only: 1, no_copy: 1, print_hide: 1,
    description:
      'e.g. 202627. Feeds the document name, so it is fixed at creation — editing it ' +
      'afterwards does not rename anything.',
  },
  { fieldname: 'col_po', fieldtype: 'Column Break' },
  {
    fieldname: 'custom_raised_by', label: 'Raised By', fieldtype: 'Data',
    read_only: 1, print_hide: 1,
    description: 'The person who raised this PO in the SGT CRM. Stamped automatically.',
  },
  {
    fieldname: 'custom_raised_by_org', label: 'Raised By (Partner Code)', fieldtype: 'Data',
    read_only: 1, print_hide: 1,
    description: 'Blank when SGT raised it directly; the partner code when they did.',
  },
  {
    fieldname: 'custom_raised_via', label: 'Raised Via', fieldtype: 'Data',
    read_only: 1, print_hide: 1,
    description: 'Which surface it came from — the CRM, or the partner portal.',
  },
  {
    fieldname: 'sales_partner', label: 'Sales Partner', fieldtype: 'Data',
    read_only: 1, print_hide: 1,
    description: 'The partner code. Named as ERPNext names it on a Quotation.',
  },
  // THE reason the printed PO matches the quotation. See the note above
  // PRINT_HTML: the three-column masthead is a Letter Head, not part of any
  // print format, and Frappe renders a Letter Head's content through Jinja
  // with `doc` in scope — which is how the partner logo gets into it and
  // repeats on every page. Copied from the source quotation at raise time,
  // so the PO inherits whatever masthead that quotation printed with.
  {
    fieldname: 'letter_head', label: 'Letter Head', fieldtype: 'Link', options: 'Letter Head',
    print_hide: 1,
    description:
      'Supplies the masthead and the footer. Inherited from the quotation this PO was raised ' +
      'from; pin a different one with ERP_PO_LETTER_HEAD.',
  },

  // ---- The buyer ------------------------------------------------------
  { fieldname: 'sec_customer', fieldtype: 'Section Break', label: 'Customer' },
  {
    fieldname: 'customer_name', label: 'Customer', fieldtype: 'Data',
    reqd: 1, in_list_view: 1, print_hide: 1,
  },
  { fieldname: 'customer_gstin', label: 'Customer GSTIN', fieldtype: 'Data', print_hide: 1 },
  { fieldname: 'col_customer', fieldtype: 'Column Break' },
  { fieldname: 'customer_address_display', label: 'Billing Address', fieldtype: 'Small Text', print_hide: 1 },
  {
    fieldname: 'contact_email', label: 'Customer Email', fieldtype: 'Data', print_hide: 1,
    description: 'Snapshotted from the quotation, for reference on the document.',
  },

  // ---- The partner ----------------------------------------------------
  // Fieldnames match the Quotation's custom fields exactly (see
  // erp_create_custom_fields.ts), which is what makes the cloned format
  // render this block without edits.
  { fieldname: 'sec_partner', fieldtype: 'Section Break', label: 'Raised By (Partner)' },
  { fieldname: 'custom_partner_name', label: 'PO Raised By', fieldtype: 'Data', print_hide: 1 },
  { fieldname: 'custom_partner_address', label: 'Partner Address', fieldtype: 'Small Text', print_hide: 1 },
  { fieldname: 'custom_partner_contact', label: 'Partner Contact', fieldtype: 'Data', print_hide: 1 },
  { fieldname: 'col_partner', fieldtype: 'Column Break' },
  { fieldname: 'custom_partner_gstin', label: 'Partner GSTIN', fieldtype: 'Data', print_hide: 1 },
  { fieldname: 'custom_partner_bank', label: 'Payment To', fieldtype: 'Small Text', print_hide: 1 },
  {
    fieldname: 'custom_partner_logo', label: 'Partner Logo URL', fieldtype: 'Data', print_hide: 1,
    description: 'Absolute URL of the partner logo shown in the printed header.',
  },
  {
    fieldname: 'custom_partner_sign', label: 'Partner Signature URL', fieldtype: 'Data',
    print_hide: 1,
    description:
      'Absolute URL of the partner signature printed under the terms, beside SGT\'s. ' +
      'Snapshotted from the quotation — the PO is signed by whoever signed the offer it accepts.',
  },

  // ---- The lines ------------------------------------------------------
  { fieldname: 'sec_items', fieldtype: 'Section Break', label: 'Items' },
  {
    fieldname: 'items', label: 'Items', fieldtype: 'Table', options: ITEM_DOCTYPE,
    reqd: 1, print_hide: 1,
  },

  // ---- The money ------------------------------------------------------
  { fieldname: 'sec_totals', fieldtype: 'Section Break', label: 'Totals' },
  { fieldname: 'currency', label: 'Currency', fieldtype: 'Data', default: 'INR', print_hide: 1 },
  // `total` AND `net_total`, because ERPNext means different things by
  // them: total is the sum of the item amounts, net_total is after a
  // document-level discount has been apportioned across the lines. They
  // are equal on most quotations and silently differ on discounted ones.
  // The quotation's totals block prints `total` as the Sub Total, so the
  // PO must carry it or the sub total would quietly change meaning.
  { fieldname: 'total', label: 'Total', fieldtype: 'Currency', precision: '2', print_hide: 1 },
  { fieldname: 'net_total', label: 'Net Total', fieldtype: 'Currency', precision: '2', print_hide: 1 },
  {
    fieldname: 'discount_amount', label: 'Document Discount', fieldtype: 'Currency',
    precision: '2', print_hide: 1,
    description:
      'A discount on the WHOLE document, distinct from the per-line discounts on the item ' +
      'rows. The CRM does not raise these — line discounts are what the quote screen writes — ' +
      'but one applied by hand in ERPNext must still print.',
  },
  { fieldname: 'taxes', label: 'Taxes', fieldtype: 'Table', options: TAX_DOCTYPE, print_hide: 1 },
  { fieldname: 'col_totals', fieldtype: 'Column Break' },
  {
    fieldname: 'total_taxes_and_charges', label: 'Total Taxes', fieldtype: 'Currency',
    precision: '2', print_hide: 1,
  },
  {
    fieldname: 'grand_total', label: 'Grand Total', fieldtype: 'Currency',
    precision: '2', in_list_view: 1, print_hide: 1,
  },
  {
    fieldname: 'rounded_total', label: 'Rounded Total', fieldtype: 'Currency',
    precision: '2', print_hide: 1,
    description: 'Copied off the quotation. Printed beneath the grand total, as the quotation prints it.',
  },
  {
    fieldname: 'in_words', label: 'Amount in Words', fieldtype: 'Small Text', print_hide: 1,
    description:
      'Copied off the quotation rather than recomputed. Frappe builds this with money_in_words() ' +
      'against the company currency, and a second implementation here would eventually disagree ' +
      'with the quotation it was raised from.',
  },

  // ---- Terms ----------------------------------------------------------
  { fieldname: 'sec_terms', fieldtype: 'Section Break', label: 'Terms and Conditions' },
  {
    fieldname: 'tc_name', label: 'Terms Template', fieldtype: 'Data', print_hide: 1,
    description: 'Which Terms and Conditions template the body was taken from.',
  },
  {
    fieldname: 'terms', label: 'Terms', fieldtype: 'Text Editor', print_hide: 1,
    description:
      'Copied onto THIS document when it is raised, and editable here only. Editing it ' +
      'does not change the template or any other PO. The closing rule and company stamps ' +
      'are appended by domain/quoteTerms.ts and are already part of this value.',
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
// Client Script — fills custom_short_fiscal_year for anyone raising a PO
// by hand in the ERPNext desk.
//
// The CRM does not rely on it: documents created over the REST API never
// run client scripts, so services/dealerPo.ts sets the field itself. This
// exists so a desk-created PO is not named SGT-PO--0001, which is the
// exact failure the agreement doctype hit in production.
// ---------------------------------------------------------------------

const SCRIPT_NAME = process.env.ERP_PO_CLIENT_SCRIPT ?? `${DOCTYPE} Series`;

const CLIENT_SCRIPT = `frappe.ui.form.on('${DOCTYPE}', {
    onload: function(frm) { set_short_fiscal_year(frm); },
    transaction_date: function(frm) { set_short_fiscal_year(frm); }
});

function set_short_fiscal_year(frm) {
    if (!frm.is_new()) { return; }
    frappe.call({
        method: 'erpnext.accounts.utils.get_fiscal_year',
        args: { date: frm.doc.transaction_date || frappe.datetime.get_today() },
        callback: function(r) {
            if (!r.message) { return; }
            var fy = r.message[0];               // fiscal year name, e.g. "2026-2027"
            frm.set_value('custom_short_fiscal_year',
                fy && fy.includes('-') ? fy.split('-')[0] + fy.split('-')[1].slice(-2) : fy);
        }
    });
}`;

// ---------------------------------------------------------------------
// The print format.
//
// Modelled line for line on the quotation format (SAL-QTN-2026-00055 was
// the reference), because the owner's requirement is that a dealer
// holding both documents sees one house style, not two.
//
// ── WHERE THE MASTHEAD COMES FROM, and why this file does not draw one ──
// The three-column header on the quotation — SGT's mark, "OFFERED
// THROUGH" with the PARTNER's logo, and the registered office — is not
// part of the quotation's print format at all. It is a **Letter Head**.
//
// That matters, and it is not obvious. A Letter Head is normally static
// HTML, but frappe.www.printview.get_letter_head() renders its content
// through Jinja with `doc` in scope, so it can read doc.custom_partner_logo
// and doc.custom_partner_name — which is how a per-document partner logo
// gets into a masthead. And because Frappe hands the letter head to
// wkhtmltopdf as --header-html, it REPEATS on every page. Page 2 of the
// reference quotation proves both.
//
// So this format draws the BODY ONLY, the PO document carries the same
// `letter_head` its quotation carried, and fetchPoPdf() renders with
// no_letterhead=0. Drawing a masthead here as well would print two.
//
// The consequence to know about: a PO whose quotation had no letter head
// prints with no masthead. That is the same document the quotation would
// have been, which is the right failure — the setup script reports which
// letter head your quotations actually use so this is visible up front.
//
// Frappe supplies the "This is a Computer Generated Document" and
// "Page X of Y" lines itself, and the letter head supplies the contact /
// CIN footer above them. None of the three belong here.
//
// ── What is hardcoded, and why ────────────────────────────────────────
// SGT's own company name, factory address and GSTIN are literals below,
// exactly as the quotation format has them. They are not on the doctype
// because they are not per-document facts, and putting them in a field
// would mean every PO carried a copy that could drift from the letter
// head printed above it. Override with ERP_PO_COMPANY_* if the entity
// details change.
// ---------------------------------------------------------------------

const CO_NAME = process.env.ERP_PO_COMPANY_NAME ?? 'SGT Hydroedge Private Limited';
const CO_FACTORY = process.env.ERP_PO_COMPANY_FACTORY ??
  'P No-14, G No-357/86, 1, P No-14, G No-357/86, Kharabwadi, Dehu, Pune, Maharashtra, India - 410501';
const CO_GSTIN = process.env.ERP_PO_COMPANY_GSTIN ?? '27ABLCS6583R1Z4';

const PRINT_TITLE = process.env.ERP_PO_PRINT_TITLE ?? 'Purchase Order';

const PRINT_HTML = `<style>
  /* No font-family and no base font-size, deliberately. Frappe's print
     stylesheet sets both, and the quotation inherits them — naming a
     typeface here is how a PO ends up in Helvetica beside a quotation in
     the house font. Everything below sizes in em, off whatever that is. */
  .po { line-height: 1.45; color: #1c1c1c; }
  .po .title { text-align: center; font-size: 1.45em; font-weight: bold; margin: 0 0 16px; }
  .po table.grid { width: 100%; border-collapse: collapse; }
  .po table.grid > tbody > tr > td { vertical-align: top; padding: 0; }
  .po table.grid > tbody > tr > td.l { padding-right: 14px; width: 50%; }
  .po table.grid > tbody > tr > td.r { padding-left: 14px; width: 50%; }
  .po .k { font-weight: bold; }
  .po .docno { text-align: right; margin-bottom: 2px; }
  .po .blk { margin-bottom: 2px; }
  /* The address arrives with newlines in it — ERPNext's address_display is
     <br>-separated and services/dealerPo.ts turns those into \\n. Without
     pre-line the PIN code runs onto the end of the street, which is not
     how the quotation prints it. */
  .po .addr { white-space: pre-line; }
  .po .pay { border: 1px solid #d9d9d9; border-radius: 3px; padding: 9px 11px; margin-top: 12px;
             white-space: pre-line; }
  .po .pay .h { font-weight: bold; margin-bottom: 4px; }
  .po .gen { margin-top: 12px; }
  .po .gen .h { font-weight: bold; margin-bottom: 4px; }
  .po .gen .lines { white-space: pre-line; }
  .po table.items { width: 100%; border-collapse: collapse; margin: 18px 0 0; }
  .po table.items th { background: #f5f5f5; font-weight: bold; text-align: left;
                       padding: 8px 9px; border: 1px solid #d9d9d9; }
  .po table.items td { padding: 8px 9px; border: 1px solid #d9d9d9; vertical-align: middle; }
  .po table.items th.num, .po table.items td.num { text-align: right; white-space: nowrap; }
  /* The quantity cell carries the UOM on the left and the figure on the
     right, as the quotation does. A nested table rather than flexbox:
     wkhtmltopdf's flex support is unreliable and silently collapses. */
  .po table.qty { width: 100%; border-collapse: collapse; }
  .po table.qty td { border: none; padding: 0; }
  .po table.qty td.u { font-size: 0.8em; color: #666; text-align: left; }
  .po table.qty td.q { text-align: right; }
  .po .spec { margin-top: 18px; }
  .po .spec .cap { font-size: 0.9em; font-weight: bold; letter-spacing: 0.04em;
                   text-transform: uppercase; color: #8a867c;
                   border-bottom: 1px solid #d9d9d9; padding-bottom: 5px; margin-bottom: 9px; }
  .po .spec .item { margin-bottom: 9px; }
  .po .spec .item .n { font-weight: bold; margin-bottom: 2px; }
  /* No rules for the totals block: it is pasted from the quotation format
     and carries its own inline styles. Styling it from here would be the
     first step in the two drifting apart. */
  .po .terms { margin-top: 20px; }
  .po .terms ol { padding-left: 18px; margin: 0; }
  .po .terms li { margin-bottom: 7px; text-align: left; }
  .po .terms .ql-ui { display: none; }
</style>

{#- Money is formatted with frappe.utils.fmt_money(x, currency=doc.currency),
    the same call the quotation format uses. An earlier version of this file
    used doc.get_formatted() instead, on the assumption that frappe.utils
    might not be reachable from the print sandbox — the live quotation format
    proves it is. fmt_money is also the more correct of the two here: these
    Currency fields carry no options naming a currency field, so
    get_formatted() falls back to the system default rather than to the
    currency actually on the document. -#}

<div class="po">

  <div class="title">${PRINT_TITLE}</div>

  <table class="grid">
    <tr>
      <td class="l">
        <div class="blk"><span class="k">Date:</span> {{ doc.get_formatted("transaction_date") if doc.transaction_date else "" }}</div>
        <div class="blk"><span class="k">Customer Name:</span> {{ doc.customer_name or "" }}</div>
        {% if doc.customer_address_display %}
        <div class="blk addr"><span class="k">Billing Address:</span> {{ doc.customer_address_display }}</div>
        {% endif %}
        {% if doc.customer_gstin %}
        <div class="blk"><span class="k">Customer GSTIN:</span> {{ doc.customer_gstin }}</div>
        {% endif %}
        {#- The line back to the quotation. The quotation format has no
            equivalent, but a PO that cannot be tied to the offer it
            accepts is a PO somebody has to go and look up. -#}
        {% if doc.quotation_ref %}
        <div class="blk"><span class="k">Against Quotation:</span> {{ doc.quotation_ref }}</div>
        {% endif %}
      </td>
      <td class="r">
        <div class="docno">{{ doc.name }}</div>
        <div class="blk"><span class="k">Company Name:</span> ${CO_NAME}</div>
        <div class="blk"><span class="k">Factory Address:</span> ${CO_FACTORY}</div>
        <div class="blk"><span class="k">GSTIN:</span> ${CO_GSTIN}</div>
      </td>
    </tr>
    <tr>
      <td class="l">
        {#- Where the customer pays. Omitted entirely when the partner has
            no account on file: a payment box naming a bank and no account
            is worse than no box at all. -#}
        {% if doc.custom_partner_bank %}
        <div class="pay"><div class="h">Payment To</div>{{ doc.custom_partner_bank }}</div>
        {% endif %}
      </td>
      <td class="r">
        {#- The quotation's "Quote Generated by" block, relabelled. Absent
            on an SGT-direct PO, where there is no partner. -#}
        {% if doc.custom_partner_name %}
        <div class="gen">
          <div class="h">PO Raised By</div>
          <div class="lines">{{ doc.custom_partner_name }}</div>
          {% if doc.custom_partner_address %}<div class="lines">{{ doc.custom_partner_address }}</div>{% endif %}
          {% if doc.custom_partner_contact %}<div class="lines">{{ doc.custom_partner_contact }}</div>{% endif %}
          {% if doc.custom_partner_gstin %}<div class="lines">GSTIN: {{ doc.custom_partner_gstin }}</div>{% endif %}
        </div>
        {% endif %}
      </td>
    </tr>
  </table>

  <table class="items">
    <thead>
      <tr>
        <th style="width:5%;">Sr</th>
        <th style="width:20%;">Item Name</th>
        <th style="width:13%;">HSN/SAC</th>
        <th style="width:11%;">Quantity</th>
        <th class="num" style="width:17%;">Price List Rate</th>
        <th class="num" style="width:17%;">Discount<br>Amount Per Unit</th>
        <th class="num" style="width:17%;">Net Amount</th>
      </tr>
    </thead>
    <tbody>
      {% for it in doc.items %}
      <tr>
        <td>{{ loop.index }}</td>
        <td>{{ it.item_name or it.item_code }}</td>
        <td>{{ it.gst_hsn_code or "" }}</td>
        <td>
          <table class="qty"><tr>
            <td class="u">{{ it.uom or "" }}</td>
            <td class="q">{{ it.qty | int }}</td>
          </tr></table>
        </td>
        <td class="num">{{ frappe.utils.fmt_money(it.price_list_rate, currency=doc.currency) }}</td>
        <td class="num">{% if it.discount_amount %}{{ frappe.utils.fmt_money(it.discount_amount, currency=doc.currency) }}{% endif %}</td>
        <td class="num">{{ frappe.utils.fmt_money(it.amount, currency=doc.currency) }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>

  <table class="grid">
    <tr>
      <td class="l">
        {#- The specification, lifted from each line's description exactly
            as the quotation prints it. Lines with no specification — an
            AMC, say — are skipped rather than printed as empty headings. -#}
        {#- Built with a namespace loop rather than a selectattr filter:
            selectattr goes through Jinja's attribute getter, which is
            sandboxed here, and a plain loop cannot be withdrawn from under
            us. (No backticks in this string — it is a JS template literal.) -#}
        {% set ns = namespace(specced=[]) %}
        {% for it in doc.items %}
          {% if it.description %}{% set ns.specced = ns.specced + [it] %}{% endif %}
        {% endfor %}
        {% if ns.specced %}
        <div class="spec">
          <div class="cap">Equipment Specification</div>
          {% for it in ns.specced %}
          <div class="item">
            <div class="n">{{ loop.index }}. {{ it.item_name or it.item_code }}{% if it.qty and it.qty > 1 %} &times; {{ it.qty | int }}{% endif %}</div>
            <div>{{ it.description }}</div>
          </div>
          {% endfor %}
        </div>
        {% endif %}
      </td>
      <td class="r">
{#- ==================================================================
            THE QUOTATION'S OWN TOTALS BLOCK.

            Lifted from the live Quotation print format rather than
            rebuilt, on the owner's instruction (2026-08-05). Keep it that
            way: when the quotation's totals change, paste the new version
            here rather than editing this one to match, so the two cannot
            drift apart a line at a time.

            Its inline styles are deliberately left alone for the same
            reason — restyling it with this format's CSS classes is
            exactly the drift that is being avoided. It reads doc.total,
            doc.taxes, doc.discount_amount, doc.rounded_total and
            doc.in_words, and the PO doctype carries all five under
            ERPNext's own names, which is why it needed no edits.
            ================================================================== -#}
        <div style="width:100%; line-height:1.2;">
          <table style="width:100%; border-collapse:collapse;">
            {# Sub Total — doc.total = sum of item amounts before tax #}
            <tr>
              <td style="text-align:right; padding:4px 16px 4px 0; font-weight:bold; font-size:12px; color:black">Sub Total:</td>
              <td style="text-align:right; padding:4px 0; white-space:nowrap; font-size:12px;">
                {{ frappe.utils.fmt_money(doc.total, currency=doc.currency) }}
              </td>
            </tr>
            {# Every tax row. On a Quotation doc.taxes IS the Sales Taxes and Charges table. #}
            {%- for tax in doc.taxes -%}
              {%- if tax.tax_amount %}
              <tr>
                <td style="text-align:right; padding:4px 16px 4px 0; font-weight:bold; font-size:12px; color:black">{{ tax.description }}</td>
                <td style="text-align:right; padding:4px 0; white-space:nowrap; font-size:12px;">
                  {{ frappe.utils.fmt_money(tax.tax_amount, currency=doc.currency) }}
                </td>
              </tr>
              {%- endif -%}
            {%- endfor -%}
            {#- ADDED, and the only addition: a floor under the tax rows.
                If they are missing but the tax TOTAL is not, print the
                total on one line — a document showing a sub total and a
                larger grand total with nothing in between does not add up
                on the page, and the customer is the one left reconciling
                it. Never fires once the rows attach properly; delete it
                if you would rather the gap be visible. -#}
            {%- if not doc.taxes and doc.total_taxes_and_charges %}
              <tr>
                <td style="text-align:right; padding:4px 16px 4px 0; font-weight:bold; font-size:12px; color:black">GST</td>
                <td style="text-align:right; padding:4px 0; white-space:nowrap; font-size:12px;">
                  {{ frappe.utils.fmt_money(doc.total_taxes_and_charges, currency=doc.currency) }}
                </td>
              </tr>
            {%- endif -%}
            {# Document-level discount, only if one exists #}
            {%- if doc.discount_amount %}
              <tr>
                <td style="text-align:right; padding:4px 16px 4px 0; font-weight:bold; font-size:12px; color:black">Discount:</td>
                <td style="text-align:right; padding:4px 0; white-space:nowrap; font-size:12px;">
                  - {{ frappe.utils.fmt_money(doc.discount_amount, currency=doc.currency) }}
                </td>
              </tr>
            {%- endif -%}
            {# Grand Total #}
            <tr>
              <td style="text-align:right; padding:7px 16px 4px 0; border-top:1px solid #d1d8dd; font-weight:bold; font-size:12px; color:black">Grand Total:</td>
              <td style="text-align:right; padding:7px 0 4px 0; border-top:1px solid #d1d8dd; white-space:nowrap; font-weight:bold; font-size:12px;">
                {{ frappe.utils.fmt_money(doc.grand_total, currency=doc.currency) }}
              </td>
            </tr>
            {# Rounded Total #}
            {%- set rounded_total = doc.rounded_total or doc.grand_total -%}
            {%- if rounded_total %}
              <tr>
                <td style="text-align:right; padding:4px 16px 4px 0; font-weight:bold; font-size:12px; color:black">Rounded Total:</td>
                <td style="text-align:right; padding:4px 0; white-space:nowrap; font-weight:bold; font-size:12px;">
                  {{ frappe.utils.fmt_money(rounded_total, currency=doc.currency) }}
                </td>
              </tr>
            {%- endif -%}
            {# Amount in words — right-aligned so it shares the right edge with the figures #}
            <tr>
              <td colspan="2" style="text-align:right; padding-top:9px; border-top:1px solid #d1d8dd; font-size:11px; line-height:1.45; color:black;">
                <strong>Amount in words</strong><br>
                {{ doc.in_words or frappe.utils.money_in_words(rounded_total, doc.currency) }}
              </td>
            </tr>
          </table>
        </div>
      </td>
    </tr>
  </table>

  {% if doc.terms %}
  {#- Already carries "— End of Terms —" and the company stamps: both are
      appended by withTermsFooter() in domain/quoteTerms.ts when the PO is
      raised, exactly as they are on a quotation. Adding either here would
      print it twice. -#}
  <div class="terms">{{ doc.terms }}</div>
  {% endif %}

</div>`;

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

/**
 * The live Quotation print format's HTML, when there is one to take.
 *
 * "A replica of the Quotation" is strictest if it IS the quotation's
 * layout rather than a rebuild of it — which is possible here only
 * because every fieldname above matches ERPNext's. It returns null, with
 * a reason, whenever cloning cannot honestly be done: a standard format
 * or a Print Designer one has no Jinja to lift.
 */
async function quotationFormatHtml(): Promise<{ html: string | null; from: string; why: string }> {
  const pinned = process.env.ERP_QUOTE_PRINT_FORMAT?.trim();
  let name = pinned ?? '';

  if (!name) {
    const dt = await getDoc('DocType', 'Quotation');
    if (dt?.default_print_format) name = String(dt.default_print_format);
  }
  if (!name) {
    const r = await call('GET',
      `/api/resource/${encodeURIComponent('Print Format')}` +
      `?filters=${encodeURIComponent('[["doc_type","=","Quotation"],["disabled","=",0],["custom_format","=",1]]')}` +
      `&fields=${encodeURIComponent('["name"]')}&limit_page_length=1&order_by=modified desc`);
    name = r.json?.data?.[0]?.name ? String(r.json.data[0].name) : '';
  }
  if (!name) {
    return { html: null, from: '', why: 'no Quotation print format could be found' };
  }

  const fmt = await getDoc('Print Format', name);
  if (!fmt) return { html: null, from: name, why: `"${name}" could not be read` };
  if (!fmt.custom_format || !String(fmt.html ?? '').trim()) {
    return {
      html: null, from: name,
      why: `"${name}" is a ${fmt.print_format_type ?? 'standard'} format with no custom HTML to copy`,
    };
  }
  return { html: String(fmt.html), from: name, why: '' };
}

/**
 * Which Letter Head the quotations actually print with.
 *
 * Reported rather than assumed, because it is the single thing that
 * decides whether the PO carries the same masthead — the SGT mark, the
 * "OFFERED THROUGH" partner block and the registered office all live
 * there, not in any print format. See the note above PRINT_HTML.
 *
 * Read off the most recently modified Quotation rather than off a
 * setting: what a document PRINTED with is a fact, and what a default
 * says it should print with is a hope.
 */
async function quotationLetterHead(): Promise<{ name: string | null; note: string }> {
  const pinned = process.env.ERP_PO_LETTER_HEAD?.trim();
  if (pinned) return { name: pinned, note: 'pinned by ERP_PO_LETTER_HEAD' };

  const r = await call('GET',
    `/api/resource/Quotation` +
    `?fields=${encodeURIComponent('["name","letter_head"]')}` +
    `&limit_page_length=5&order_by=modified desc`);
  const rows: any[] = r.json?.data ?? [];
  const hit = rows.find(q => String(q.letter_head ?? '').trim());
  if (hit) {
    return {
      name: String(hit.letter_head),
      note: `what quotation ${hit.name} printed with — each PO inherits its own quotation's`,
    };
  }

  const def = await call('GET',
    `/api/resource/${encodeURIComponent('Letter Head')}` +
    `?filters=${encodeURIComponent('[["is_default","=",1]]')}` +
    `&fields=${encodeURIComponent('["name"]')}&limit_page_length=1`);
  const d = def.json?.data?.[0]?.name;
  if (d) return { name: String(d), note: 'the site default — no quotation carries one of its own' };
  return { name: null, note: 'none found: POs would print with no masthead, as quotations do' };
}

/** Create or patch one child doctype. Returns false on failure. */
async function writeChild(name: string, fields: Field[]): Promise<boolean> {
  const existing = await getDoc('DocType', name);
  if (existing) {
    if (existing.custom !== 1) {
      console.error(`    ✗ "${name}" exists and is not custom. Refusing to touch it.`);
      return false;
    }
    const have = new Set<string>((existing.fields ?? []).map((f: any) => String(f.fieldname)));
    const missing = fields.filter(f => !have.has(f.fieldname));
    if (!missing.length) { console.log(`    · ${name} unchanged`); return true; }
    const r = await call('PUT', `/api/resource/DocType/${encodeURIComponent(name)}`,
      { fields: [...(existing.fields ?? []), ...missing] });
    if (!r.ok) { console.error(`    ✗ ${name}: ${why(r)}`); return false; }
    console.log(`    ✓ ${name} — added ${missing.length} field(s)`);
    return true;
  }
  const r = await call('POST', '/api/resource/DocType', {
    doctype: 'DocType',
    name, __newname: name,
    module: MODULE,
    custom: 1,
    istable: 1,
    editable_grid: 1,
    fields,
    permissions: [],
  });
  if (!r.ok) { console.error(`    ✗ ${name}: ${why(r)}`); return false; }
  console.log(`    ✓ created child table "${name}"`);
  return true;
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

  const mod = await getDoc('Module Def', MODULE);
  if (!mod) {
    const list = await call('GET',
      `/api/resource/${encodeURIComponent('Module Def')}` +
      `?fields=${encodeURIComponent('["name"]')}&limit_page_length=100`);
    console.error(`✗ Module Def "${MODULE}" does not exist in this ERPNext.`);
    console.error('  Available: ' + (list.json?.data ?? []).map((m: any) => m.name).join(', '));
    console.error('  Set ERP_PO_MODULE to one of them and re-run.');
    process.exit(1);
  }
  console.log(`  module "${MODULE}" ✓`);

  // ---- What exists already --------------------------------------------
  const existingDt = await getDoc('DocType', DOCTYPE);
  const existingItem = await getDoc('DocType', ITEM_DOCTYPE);
  const existingTax = await getDoc('DocType', TAX_DOCTYPE);
  const existingFmt = await getDoc('Print Format', FORMAT);
  const existingScript = await getDoc('Client Script', SCRIPT_NAME);

  const have = new Set<string>((existingDt?.fields ?? []).map((f: any) => String(f.fieldname)));
  const missing = FIELDS.filter(f => !have.has(f.fieldname));
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
    live = String(existingDt.autoname ?? '');
    if (live !== 'naming_series:') {
      console.log(`    ⚠ autoname is "${live || '(unset)'}" and would be CHANGED to "naming_series:"`);
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
  console.log(`  Child table "${ITEM_DOCTYPE}" ${existingItem ? 'EXISTS' : 'would be CREATED'} ` +
              `(${ITEM_FIELDS.length} fields)`);
  console.log(`  Child table "${TAX_DOCTYPE}"  ${existingTax ? 'EXISTS' : 'would be CREATED'} ` +
              `(${TAX_FIELDS.length} fields)`);

  // ---- Which layout ----------------------------------------------------
  console.log('');
  let html = PRINT_HTML;
  let source = 'the replica in this file';
  if (WANT_CLONE) {
    const cloned = await quotationFormatHtml();
    if (cloned.html) {
      html = cloned.html;
      source = `a VERBATIM copy of the Quotation format "${cloned.from}" (${cloned.html.length} chars)`;
      console.log(`  CLONE_FROM_QUOTATION=1 — the layout will be ${source}.`);
      console.log('    Every fieldname on this doctype matches ERPNext\'s Quotation, so that');
      console.log('    HTML renders here unchanged. It will say "Quotation" wherever the');
      console.log('    original does — including the title. Edit it in ERPNext afterwards,');
      console.log('    or drop the flag and use the replica, which says PURCHASE ORDER.');
    } else {
      console.log(`  CLONE_FROM_QUOTATION=1 but cloning is NOT possible: ${cloned.why}.`);
      console.log('    Falling back to the replica in this file.');
    }
  } else {
    console.log(`  Print Format "${FORMAT}" layout: ${source} (${PRINT_HTML.length} chars).`);
    console.log('    Modelled on the quotation body: two-column date / customer / company');
    console.log('    header, the boxed "Payment To", "PO Raised By", the seven-column item');
    console.log('    table with HSN and per-unit discount, the equipment specification');
    console.log(`    beside the totals, amount in words, and the terms. Titled "${PRINT_TITLE}".`);
    console.log('    Use CLONE_FROM_QUOTATION=1 to copy the live quotation HTML verbatim');
    console.log('    instead — it will then say "Quotation" wherever the original does.');
  }
  if (!existingFmt) {
    console.log('  It would be CREATED.');
  } else if (REPLACE_FORMAT) {
    console.log('  It EXISTS and REPLACE_PRINT_FORMAT=1 — this run REPLACES its layout.');
    if (!existingFmt.custom_format) {
      console.log('    ⚠ IT IS A PRINT FORMAT BUILDER FORMAT (custom_format = 0). Replacing');
      console.log('      it switches it to raw HTML from this file and its builder layout');
      console.log('      STOPS BEING USED. That is almost certainly not what you want.');
    }
  } else {
    console.log('  It EXISTS — LEFT ALONE. The layout is maintained in ERPNext, not here.');
    console.log(`    custom_format=${existingFmt.custom_format ?? 0}` +
                `${existingFmt.custom_format ? ' (raw HTML)' : ' (Print Format Builder)'}`);
    console.log('    Pass REPLACE_PRINT_FORMAT=1 to overwrite it from this file instead.');
  }

  // ---- REFUSE to hijack another doctype's print format ------------------
  // The write below sets doc_type AND html. Pointed at a format belonging
  // to some other doctype — a Quotation format, say, because
  // ERP_PO_PRINT_FORMAT was set to its name — it would rebind that format
  // to this doctype and overwrite its layout. The quotation would then
  // print from whatever this file contains, which is exactly the "my
  // quotation prints as a Purchase Order" failure.
  //
  // Checked here rather than trusted to the name being distinctive,
  // because the name comes from an env var somebody types.
  if (existingFmt && String(existingFmt.doc_type ?? '') !== DOCTYPE) {
    console.error('');
    console.error(`✗ Print Format "${FORMAT}" already exists and belongs to ` +
                  `"${existingFmt.doc_type}", not "${DOCTYPE}".`);
    console.error('  Refusing to touch it. Writing here would rebind that format to this');
    console.error(`  doctype and replace its layout, so every ${existingFmt.doc_type} would`);
    console.error('  start printing from this file.');
    console.error('');
    console.error('  Set ERP_PO_PRINT_FORMAT to a name that is not already taken, e.g.');
    console.error(`    ERP_PO_PRINT_FORMAT="SGT Dealer PO Print"`);
    console.error('  and make PO_FORMAT in src/services/erpDealerPo.ts agree with it.');
    process.exit(1);
  }

  // ---- The masthead ----------------------------------------------------
  // Worth its own paragraph: this, not the print format, is what makes a
  // PO look like a quotation, and it is the one part the script cannot
  // guarantee on its own.
  const lh = await quotationLetterHead();
  console.log('');
  console.log('  Masthead / footer come from a LETTER HEAD, not from the print format —');
  console.log('  which is why the partner logo repeats on page 2 of a quotation. Frappe');
  console.log('  renders a letter head through Jinja with `doc` in scope, so it can read');
  console.log('  doc.custom_partner_logo, and this doctype carries that field.');
  console.log(lh.name
    ? `    → "${lh.name}"  (${lh.note})`
    : `    ⚠ ${lh.note}`);
  console.log('    Each PO copies its own quotation\'s letter_head at raise time, so it');
  console.log('    prints under the same masthead that quotation printed under.');
  if (lh.name) {
    console.log(`    Confirm that letter head reads doc.custom_partner_name / _logo — if it`);
    console.log('    hardcodes the partner instead, the PO will show the wrong one.');
  }

  console.log(existingScript
    ? `  Client Script "${SCRIPT_NAME}" EXISTS — this run REPLACES its code.`
    : `  Client Script "${SCRIPT_NAME}" would be CREATED.`);
  console.log('    Fills custom_short_fiscal_year on desk-created POs. POs raised by the');
  console.log('    CRM set it over the API instead.');

  console.log('');
  console.log('  This doctype has NO accounting effect: no stock, no payables, no');
  console.log('  receivables, no delivery. It is the printable order, and');
  console.log('  quote_service.dealer_po_ref is what the CRM lists and scopes.');

  if (!CONFIRMED) {
    console.log('\n  DRY RUN — nothing written.');
    console.log('  Re-run with CONFIRM_CREATE=1 to apply.');
    return;
  }

  // ---- Children FIRST --------------------------------------------------
  // The parent's Table fields point at them by name, and Frappe validates
  // that link on save. Creating the parent first fails on options.
  console.log('\n  writing…');
  if (!await writeChild(ITEM_DOCTYPE, ITEM_FIELDS)) { process.exitCode = 1; return; }
  if (!await writeChild(TAX_DOCTYPE, TAX_FIELDS)) { process.exitCode = 1; return; }

  // ---- DocType ---------------------------------------------------------
  if (existingDt) {
    // Fields and naming in ONE write. Two PUTs would leave the doctype
    // briefly naming_series-ruled with no naming_series field on it, and
    // anyone raising a PO in that window gets an unnamed document.
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
      title_field: 'customer_name',
      search_fields: 'customer_name,quotation_ref,transaction_date',
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
    html,
  };
  if (existingFmt && !REPLACE_FORMAT) {
    // The layout is maintained in ERPNext. Touching it here would swap a
    // Print Format Builder layout for raw HTML on a run whose only job
    // was adding a field to the doctype.
    console.log(`    · print format "${FORMAT}" left alone (maintained in ERPNext)`);
  } else {
    const fr = existingFmt
      ? await call('PUT', `/api/resource/${encodeURIComponent('Print Format')}/${encodeURIComponent(FORMAT)}`, fmtBody)
      : await call('POST', `/api/resource/${encodeURIComponent('Print Format')}`, { ...fmtBody, __newname: FORMAT });
    if (!fr.ok) { console.error(`    ✗ could not write print format: ${why(fr)}`); process.exitCode = 1; return; }
    console.log(`    ✓ ${existingFmt ? 'replaced' : 'created'} print format "${FORMAT}" from ${source}`);
  }

  // Pin it as the doctype default, so download_pdf renders this one even
  // if someone later adds a second. AFTER the format exists — it is a
  // Link field and would fail validation before that.
  const dr = await call('PUT', `/api/resource/DocType/${encodeURIComponent(DOCTYPE)}`,
    { default_print_format: FORMAT });
  console.log(dr.ok
    ? '    ✓ pinned as the doctype default print format'
    : `    ⚠ could not pin as default (${why(dr)}) — set ERP_PO_PRINT_FORMAT instead`);

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
    : `    ⚠ could not write client script (${why(cr)}) — desk-created POs will need ` +
      'custom_short_fiscal_year filled by hand');

  console.log('\n✔ done. Set these in .env if you renamed anything:');
  console.log(`    ERP_PO_DOCTYPE="${DOCTYPE}"`);
  console.log(`    ERP_PO_PRINT_FORMAT="${FORMAT}"`);
  console.log('\n  Next:  npx tsx src/db/migrate_po_01.ts');
  console.log('         CONFIRM_CREATE=1 npx tsx src/db/erp_create_dealer_po_terms.ts');
  console.log('\n  If a raised PO comes out with an empty items or taxes table:');
  console.log('         npx tsx src/db/erp_po_probe.ts [PO name]');
}

main().catch(e => { console.error(e); process.exit(1); });

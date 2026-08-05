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
// Re-running is safe. An existing doctype gains any fields missing from
// it and keeps the rest; the print format is always REPLACED, so this
// file is the one place to edit the layout and push it out.
// =====================================================================

import 'dotenv/config';
import { shortFiscalYear } from '../domain/fiscalYear.js';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;
const CONFIRMED = process.env.CONFIRM_CREATE === '1';
const WANT_CLONE = process.env.CLONE_FROM_QUOTATION === '1';

// Frappe requires a real Module Def to hang a custom doctype off. Selling
// is where this belongs and is guaranteed present in ERPNext.
const MODULE = process.env.ERP_PO_MODULE ?? 'Selling';

const DOCTYPE = process.env.ERP_PO_DOCTYPE ?? 'SGT Dealer PO';
const ITEM_DOCTYPE = `${DOCTYPE} Item`;
const TAX_DOCTYPE = `${DOCTYPE} Tax`;
const FORMAT = process.env.ERP_PO_PRINT_FORMAT ?? 'SGT Dealer PO';

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

  // ---- The lines ------------------------------------------------------
  { fieldname: 'sec_items', fieldtype: 'Section Break', label: 'Items' },
  {
    fieldname: 'items', label: 'Items', fieldtype: 'Table', options: ITEM_DOCTYPE,
    reqd: 1, print_hide: 1,
  },

  // ---- The money ------------------------------------------------------
  { fieldname: 'sec_totals', fieldtype: 'Section Break', label: 'Totals' },
  { fieldname: 'currency', label: 'Currency', fieldtype: 'Data', default: 'INR', print_hide: 1 },
  { fieldname: 'net_total', label: 'Net Total', fieldtype: 'Currency', precision: '2', print_hide: 1 },
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
// A replica of the quotation: the same masthead, the same partner block,
// the same item table with the specification under each line, the same
// totals and tax breakup, the same terms. What differs is the word
// PURCHASE ORDER at the top and the line back to the quotation it came
// from — because a customer holding both should be able to see at a
// glance that they are the same deal.
//
// Rendered with no_letterhead=1: the masthead here is the only one.
// ---------------------------------------------------------------------

const PRINT_HTML = `<style>
  .po { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 9.5pt;
        line-height: 1.45; color: #1c1c1c; }
  .po .head { display: table; width: 100%; border-bottom: 2pt solid #14532d;
              padding-bottom: 7pt; margin-bottom: 12pt; }
  .po .head .l, .po .head .r { display: table-cell; vertical-align: middle; }
  .po .head .r { text-align: right; width: 30%; }
  .po .head .co { font-size: 13pt; font-weight: bold; letter-spacing: 0.05em; color: #14532d; }
  .po .head .addr { font-size: 7.8pt; color: #555; margin-top: 3pt; line-height: 1.4; }
  .po .head img { max-height: 46pt; max-width: 100%; }
  .po .title { text-align: center; font-size: 15pt; font-weight: bold; letter-spacing: 0.09em;
               color: #14532d; margin-bottom: 2pt; }
  .po .subtitle { text-align: center; font-size: 8.6pt; color: #666; margin-bottom: 11pt; }
  .po table.meta { width: 100%; border-collapse: collapse; font-size: 8.8pt; margin-bottom: 12pt;
                   border-top: 0.5pt solid #cfd8d2; border-bottom: 0.5pt solid #cfd8d2; }
  .po table.meta td { padding: 4pt 6pt; }
  .po table.meta td.k { color: #777; width: 13%; }
  .po table.meta td.v { font-weight: bold; width: 20%; }
  .po .parties { display: table; width: 100%; margin-bottom: 12pt; }
  .po .parties .p { display: table-cell; width: 50%; vertical-align: top; padding-right: 14pt; }
  .po .parties .p:last-child { padding-right: 0; padding-left: 14pt; }
  .po .cap { font-size: 7.6pt; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase;
             color: #14532d; margin-bottom: 4pt; }
  .po .who { font-weight: bold; font-size: 10pt; }
  .po .lines { font-size: 8.8pt; color: #444; white-space: pre-line; }
  .po table.items { width: 100%; border-collapse: collapse; font-size: 8.8pt; margin-bottom: 10pt; }
  .po table.items th { background: #F3F0E7; color: #14532d; font-size: 7.8pt; letter-spacing: 0.06em;
                       text-transform: uppercase; text-align: left; padding: 5pt 6pt;
                       border-bottom: 0.75pt solid #cfd8d2; }
  .po table.items td { padding: 6pt; border-bottom: 0.5pt solid #e2e8e5; vertical-align: top; }
  .po table.items .num { text-align: right; white-space: nowrap; }
  .po table.items .spec { font-size: 8pt; color: #555; margin-top: 3pt; }
  .po table.items .spec table { border-collapse: collapse; }
  .po table.items .spec td { padding: 1pt 8pt 1pt 0; border: none; }
  .po .was { color: #999; text-decoration: line-through; font-size: 8pt; }
  .po table.tot { width: 46%; border-collapse: collapse; font-size: 9pt; margin-left: auto;
                  page-break-inside: avoid; }
  .po table.tot td { padding: 4pt 6pt; }
  .po table.tot td.n { text-align: right; white-space: nowrap; }
  .po table.tot tr.grand td { border-top: 0.75pt solid #14532d; font-size: 11pt; font-weight: bold;
                              color: #14532d; padding-top: 6pt; }
  .po .terms { margin-top: 16pt; page-break-inside: auto; }
  .po .terms .cap { border-bottom: 0.5pt solid #cfd8d2; padding-bottom: 3pt; margin-bottom: 6pt; }
  .po .terms ol { padding-left: 16pt; margin: 0; }
  .po .terms li { margin-bottom: 5pt; text-align: justify; }
  .po .terms .ql-ui { display: none; }
  .po .endnote { text-align: center; font-size: 7.6pt; letter-spacing: 0.12em;
                 text-transform: uppercase; color: #8a867c; margin-top: 14pt; }
</style>

{%- set cur = doc.currency or "INR" -%}

<div class="po">

  <div class="head">
    <div class="l">
      <div class="co">SGT HYDROEDGE PRIVATE LIMITED</div>
      <div class="addr">A3-202, Lunkad Sky Vie, Viman Nagar, Pune 411014, Maharashtra, India<br>
        contact@sgthydroedge.com &nbsp;|&nbsp; CIN: U28110PN2023PTC223880</div>
    </div>
    {#- The partner's own mark, snapshotted at creation. Absent for an
        SGT-direct PO, and the header simply closes up. -#}
    {% if doc.custom_partner_logo %}
    <div class="r"><img src="{{ doc.custom_partner_logo }}" alt=""></div>
    {% endif %}
  </div>

  <div class="title">PURCHASE ORDER</div>
  <div class="subtitle">GreenX&trade; CHFA Hydrogen Fuel-Assist Systems for Diesel Generator Sets</div>

  <table class="meta">
    <tr>
      <td class="k">PO No.</td>
      <td class="v">{{ doc.name }}</td>
      <td class="k">Date</td>
      <td class="v">{{ doc.get_formatted("transaction_date") if doc.transaction_date else "&mdash;" }}</td>
      <td class="k">Valid Till</td>
      <td class="v">{{ doc.get_formatted("valid_till") if doc.valid_till else "&mdash;" }}</td>
    </tr>
    {% if doc.quotation_ref %}
    <tr>
      <td class="k">Against Quotation</td>
      <td class="v" colspan="5">{{ doc.quotation_ref }}</td>
    </tr>
    {% endif %}
  </table>

  <div class="parties">
    <div class="p">
      <div class="cap">Buyer</div>
      <div class="who">{{ doc.customer_name }}</div>
      {% if doc.customer_address_display %}<div class="lines">{{ doc.customer_address_display }}</div>{% endif %}
      {% if doc.customer_gstin %}<div class="lines">GSTIN: {{ doc.customer_gstin }}</div>{% endif %}
      {% if doc.contact_email %}<div class="lines">{{ doc.contact_email }}</div>{% endif %}
    </div>
    {#- The same block the quotation prints, relabelled. On an SGT-direct
        PO there is no partner, so the column is left out rather than
        printed empty. -#}
    {% if doc.custom_partner_name %}
    <div class="p">
      <div class="cap">PO Raised By</div>
      <div class="who">{{ doc.custom_partner_name }}</div>
      {% if doc.custom_partner_address %}<div class="lines">{{ doc.custom_partner_address }}</div>{% endif %}
      {% if doc.custom_partner_gstin %}<div class="lines">GSTIN: {{ doc.custom_partner_gstin }}</div>{% endif %}
      {% if doc.custom_partner_contact %}<div class="lines">{{ doc.custom_partner_contact }}</div>{% endif %}
      {% if doc.custom_partner_bank %}
        <div class="cap" style="margin-top:7pt;">Payment To</div>
        <div class="lines">{{ doc.custom_partner_bank }}</div>
      {% endif %}
    </div>
    {% endif %}
  </div>

  <table class="items">
    <thead>
      <tr>
        <th style="width:4%;">#</th>
        <th>Item</th>
        <th class="num" style="width:8%;">Qty</th>
        <th class="num" style="width:17%;">Rate</th>
        <th class="num" style="width:19%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      {% for it in doc.items %}
      <tr>
        <td>{{ loop.index }}</td>
        <td>
          <strong>{{ it.item_name or it.item_code }}</strong>
          {% if it.description %}<div class="spec">{{ it.description }}</div>{% endif %}
        </td>
        <td class="num">{{ it.qty | int }}{% if it.uom %} {{ it.uom }}{% endif %}</td>
        <td class="num">
          {#- The list rate is shown struck through only when the line was
              actually discounted, so a full-price line does not print the
              same number twice. -#}
          {% if (it.discount_percentage and it.discount_percentage > 0) or (it.discount_amount and it.discount_amount > 0) %}
            <div class="was">{{ frappe.utils.fmt_money(it.price_list_rate, currency=cur) }}</div>
          {% endif %}
          {{ frappe.utils.fmt_money(it.rate, currency=cur) }}
          {% if it.discount_percentage and it.discount_percentage > 0 %}
            <div style="font-size:7.8pt;color:#777;">less {{ it.discount_percentage }}%</div>
          {% endif %}
        </td>
        <td class="num">{{ frappe.utils.fmt_money(it.amount, currency=cur) }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>

  <table class="tot">
    <tr>
      <td>Net Total</td>
      <td class="n">{{ frappe.utils.fmt_money(doc.net_total, currency=cur) }}</td>
    </tr>
    {% for t in doc.taxes %}
    <tr>
      <td>{{ t.description }}</td>
      <td class="n">{{ frappe.utils.fmt_money(t.tax_amount, currency=cur) }}</td>
    </tr>
    {% endfor %}
    <tr class="grand">
      <td>Grand Total</td>
      <td class="n">{{ frappe.utils.fmt_money(doc.grand_total, currency=cur) }}</td>
    </tr>
  </table>

  {% if doc.terms %}
  <div class="terms">
    <div class="cap">Terms and Conditions</div>
    {#- Already carries its closing rule and the company stamps: they are
        appended by withTermsFooter() in domain/quoteTerms.ts when the PO
        is raised, exactly as they are on a quotation. -#}
    {{ doc.terms }}
  </div>
  {% endif %}

  <div class="endnote">&mdash; End of Purchase Order &mdash;</div>
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
    console.log('    A rebuild of the quotation layout — same masthead, partner block,');
    console.log('    item table with specifications, totals, tax breakup and terms —');
    console.log('    headed PURCHASE ORDER and carrying the quotation it came from.');
    console.log('    Use CLONE_FROM_QUOTATION=1 to copy the live quotation HTML instead.');
  }
  console.log(existingFmt
    ? `  It EXISTS — this run REPLACES its HTML. Hand-edits in ERPNext will be lost.`
    : '  It would be CREATED.');

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
  const fr = existingFmt
    ? await call('PUT', `/api/resource/${encodeURIComponent('Print Format')}/${encodeURIComponent(FORMAT)}`, fmtBody)
    : await call('POST', `/api/resource/${encodeURIComponent('Print Format')}`, { ...fmtBody, __newname: FORMAT });
  if (!fr.ok) { console.error(`    ✗ could not write print format: ${why(fr)}`); process.exitCode = 1; return; }
  console.log(`    ✓ ${existingFmt ? 'replaced' : 'created'} print format "${FORMAT}" from ${source}`);

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
}

main().catch(e => { console.error(e); process.exit(1); });

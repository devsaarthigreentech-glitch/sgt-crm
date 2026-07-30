// =====================================================================
// services/erpQuotation.ts — creating Quotations in ERPNext.
//
// ERPNext is the system of record for quotations. This module is the ONLY
// place that writes them, and the only place an external partner's
// request ever turns into an ERPNext call — a distributor never reaches
// ERPNext directly.
//
// Three things worth knowing:
//
// 1. CUSTOMER DEDUP IS GSTIN-FIRST HERE. The existing ensureErpCustomer()
//    in erpCustomer.ts matches on exact customer_name, so "Continental
//    Power System" and "Continental Power Systems" become two customers.
//    That was tolerable when it only ran on lead close; under SGT-direct
//    billing every end customer becomes an ERPNext Customer, so this
//    module matches on GSTIN first and falls back to name. The old
//    function is left alone — leads still use it.
//
// 2. TAXES ARE COPIED, NOT REFERENCED. Setting `taxes_and_charges` to a
//    template name does not reliably populate the tax rows over REST;
//    the client-side fetch that does it in the UI never runs. So the
//    template's rows are read and copied onto the quotation explicitly.
//
// 3. All calls go through erpLimit's erpFetch, like every other ERPNext
//    call in this codebase.
// =====================================================================

import { erpFetch } from './erpLimit.js';
import { renderSpecHtml, type ProductSpec } from '../domain/quoteSpec.js';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '') ?? '';
const KEY = process.env.ERPNEXT_API_KEY ?? '';
const SECRET = process.env.ERPNEXT_API_SECRET ?? '';

const COMPANY = process.env.ERP_COMPANY ?? 'SGT Hydroedge Private Limited';
const SELLING_PRICE_LIST = process.env.ERP_SELLING_PRICE_LIST ?? 'Standard Selling';
const CUSTOMER_GROUP = process.env.ERP_CUSTOMER_GROUP ?? 'Commercial';
const TERRITORY = process.env.ERP_TERRITORY ?? 'India';
const TAX_IN_STATE = process.env.ERP_TAX_IN_STATE ?? 'Output GST In-state - SGT';
const TAX_OUT_STATE = process.env.ERP_TAX_OUT_STATE ?? 'Output GST Out-state - SGT';
/** SGT's own state code, used to decide CGST+SGST vs IGST. */
const HOME_STATE_CODE = process.env.ERP_HOME_STATE_CODE ?? '';
/** Terms applied when the caller does not choose one. */
const DEFAULT_TERMS = process.env.ERP_DEALER_TERMS ?? 'GreenX Dealer Quotation Terms';
/**
 * How long a quotation stands. MUST match the Validity clause in
 * src/db/erp_create_dealer_terms.ts — a document whose valid_till says
 * one thing and whose printed terms say another is one the customer can
 * argue with, and they would be right.
 */
const DEFAULT_VALID_DAYS = Number(process.env.ERP_QUOTE_VALID_DAYS ?? '30');

function authHeaders() {
  return {
    Authorization: `token ${KEY}:${SECRET}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function get(doctype: string, params: Record<string, unknown> = {}): Promise<any[]> {
  const url = new URL(`${BASE}/api/resource/${encodeURIComponent(doctype)}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  const res = await erpFetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) throw new Error(`ERPNext GET ${doctype} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).data ?? [];
}

async function getDoc(doctype: string, name: string): Promise<any> {
  const res = await erpFetch(
    `${BASE}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
    { headers: authHeaders() });
  if (!res.ok) throw new Error(`ERPNext GET ${doctype}/${name} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).data;
}

/**
 * Keep only the fields that DEFINE a tax; let ERPNext compute the rest.
 *
 * get_taxes_and_charges also returns tax_amount, total, base_* and
 * dont_recompute_tax — all zero, because nothing has been calculated yet.
 * Sending those back risks ERPNext treating the zeros as final rather
 * than recalculating them against the line. `gst_tax_type` is kept: it is
 * india_compliance's own field and drives the CGST/SGST/IGST split.
 */
function normaliseTaxRow(t: any) {
  return {
    charge_type: t.charge_type,
    account_head: t.account_head,
    description: t.description,
    rate: t.rate,
    cost_center: t.cost_center,
    included_in_print_rate: t.included_in_print_rate ?? 0,
    ...(t.row_id != null ? { row_id: t.row_id } : {}),
    ...(t.gst_tax_type ? { gst_tax_type: t.gst_tax_type } : {}),
  };
}

/**
 * Expand a tax template into rows.
 *
 * Frappe's own `get_taxes_and_charges` is the canonical expansion — it is
 * what the ERPNext UI calls when you pick a template — so try that first
 * and only fall back to reading the template document by hand.
 *
 * An earlier version swallowed failures here, which produced quotations
 * with `taxes: []` that india_compliance then treated as Nil-Rated: zero
 * GST on a document that looked complete. Failures now propagate.
 */
export async function expandTaxTemplate(template: string): Promise<any[]> {
  const url =
    `${BASE}/api/method/erpnext.controllers.accounts_controller.get_taxes_and_charges` +
    `?master_doctype=${encodeURIComponent('Sales Taxes and Charges Template')}` +
    `&master_name=${encodeURIComponent(template)}`;
  try {
    const res = await erpFetch(url, { headers: authHeaders() });
    if (res.ok) {
      const rows = (await res.json()).message;
      if (Array.isArray(rows) && rows.length) return rows.map(normaliseTaxRow);
    }
  } catch { /* fall through to the manual copy */ }

  const doc = await getDoc('Sales Taxes and Charges Template', template);
  const rows = Array.isArray(doc?.taxes) ? doc.taxes : [];
  return rows.map(normaliseTaxRow);
}

async function post(doctype: string, doc: Record<string, unknown>): Promise<any> {
  const res = await erpFetch(`${BASE}/api/resource/${encodeURIComponent(doctype)}`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(doc),
  });
  const text = await res.text();
  if (!res.ok) {
    // Frappe buries the useful line in a giant traceback.
    let msg = text.slice(0, 400);
    try {
      const j = JSON.parse(text);
      msg = j.exception ?? j._server_messages ?? msg;
    } catch { /* keep the raw text */ }
    throw new Error(`ERPNext could not create the ${doctype}: ${String(msg).slice(0, 400)}`);
  }
  return JSON.parse(text).data;
}

/**
 * Terms templates available for selling documents.
 * Powers the dropdown, so a user picks a real template rather than typing one.
 */
export async function listTermsTemplates(): Promise<{ name: string }[]> {
  try {
    return await get('Terms and Conditions', {
      filters: [['selling', '=', 1], ['disabled', '=', 0]],
      fields: ['name'], limit_page_length: 50, order_by: 'name asc',
    });
  } catch {
    return [];
  }
}

/**
 * The terms HTML for a template.
 *
 * Same trap as the tax rows: setting `tc_name` alone does not populate
 * `terms` over REST, because the client-side fetch that does it only runs
 * in the ERPNext UI. Both fields have to be sent, so the text is read here.
 */
export async function fetchTerms(template: string): Promise<string | null> {
  try {
    const doc = await getDoc('Terms and Conditions', template);
    const t = doc?.terms;
    return typeof t === 'string' && t.trim() ? t : null;
  } catch {
    return null;
  }
}

/** Item Price for a code in the selling list. Null when there is none. */
export async function itemPrice(itemCode: string): Promise<string | null> {
  const rows = await get('Item Price', {
    filters: [['item_code', '=', itemCode], ['price_list', '=', SELLING_PRICE_LIST]],
    fields: ['price_list_rate'],
    limit_page_length: 1,
  });
  const r = rows[0]?.price_list_rate;
  return r === undefined || r === null ? null : String(r);
}

/** Search the customer master. Used by the picker so nothing is created by typing. */
export async function searchCustomers(q: string): Promise<any[]> {
  const term = String(q ?? '').trim();
  if (term.length < 2) return [];
  const fields = ['name', 'customer_name', 'gstin', 'primary_address'];
  const byName = await get('Customer', {
    filters: [['customer_name', 'like', `%${term}%`]],
    fields, limit_page_length: 15, order_by: 'customer_name asc',
  });
  // A GSTIN search is a different question, so run it too and merge.
  let byGstin: any[] = [];
  if (/^[0-9A-Z]{2,15}$/i.test(term)) {
    try {
      byGstin = await get('Customer', {
        filters: [['gstin', 'like', `${term.toUpperCase()}%`]],
        fields, limit_page_length: 10,
      });
    } catch { /* field may not exist without india_compliance */ }
  }
  const seen = new Set<string>();
  return [...byName, ...byGstin].filter(c => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });
}

/**
 * The PDF ERPNext renders, proxied as bytes.
 *
 * Fetched server-side on purpose: a partner must never hold an ERPNext
 * credential, and print_format.download_pdf needs one. The caller is
 * responsible for checking that this quotation is theirs to see.
 */
export async function fetchQuotationPdf(erpName: string): Promise<ArrayBuffer> {
  const fmt = await quotePrintFormat();
  const url =
    `${BASE}/api/method/frappe.utils.print_format.download_pdf` +
    `?doctype=${encodeURIComponent('Quotation')}&name=${encodeURIComponent(erpName)}` +
    (fmt ? `&format=${encodeURIComponent(fmt)}` : '') +
    `&no_letterhead=0`;
  const res = await erpFetch(url, {
    headers: { Authorization: `token ${KEY}:${SECRET}`, Accept: 'application/pdf' },
  });
  if (!res.ok) {
    throw new Error(`ERPNext could not render the PDF for ${erpName} (HTTP ${res.status})`);
  }
  return res.arrayBuffer();
}

/**
 * Current state of many quotations in ONE call.
 *
 * The local mirror goes stale in two ways, both seen in practice:
 *
 *  · a quotation deleted in ERPNext leaves our row behind, and
 *  · Frappe REVERTS the naming series when the newest document in a
 *    series is deleted, so the next quotation REUSES that number. Our row
 *    then describes a different document entirely — same name, wrong
 *    customer, wrong total.
 *
 * So the list is reconciled against ERPNext rather than trusted. One
 * batched request, not one per row.
 */
export async function fetchQuotationSummaries(
  names: string[],
): Promise<Map<string, { customer_name: string; grand_total: string; status: string }>> {
  const out = new Map<string, { customer_name: string; grand_total: string; status: string }>();
  if (!names.length) return out;
  // Chunked: a long `in` list makes for an unwieldy query string.
  for (let i = 0; i < names.length; i += 50) {
    const rows = await get('Quotation', {
      filters: [['name', 'in', names.slice(i, i + 50)]],
      fields: ['name', 'customer_name', 'grand_total', 'status'],
      limit_page_length: 100,
    });
    for (const r of rows) {
      out.set(String(r.name), {
        customer_name: r.customer_name,
        grand_total: r.grand_total != null ? String(r.grand_total) : '0',
        status: r.status ?? 'Draft',
      });
    }
  }
  return out;
}

/**
 * Which print format to render.
 *
 * This MATTERS for email: Frappe only attaches the document PDF when
 * `print_format` (or print_html) is truthy. Leaving it blank sends a mail
 * with no attachment and no error — which is exactly what the first
 * version of the mailer did.
 *
 * Resolution order: the pinned env value, then the doctype's own default,
 * then the first enabled format. Cached, because it never changes at
 * runtime and every send would otherwise cost two extra round trips.
 */
let cachedFormat: string | null = null;
export async function quotePrintFormat(): Promise<string | null> {
  const pinned = process.env.ERP_QUOTE_PRINT_FORMAT?.trim();
  if (pinned) return pinned;
  if (cachedFormat !== null) return cachedFormat || null;

  try {
    const dt = await getDoc('DocType', 'Quotation');
    if (dt?.default_print_format) {
      cachedFormat = String(dt.default_print_format);
      return cachedFormat;
    }
  } catch { /* fall through */ }

  try {
    const rows = await get('Print Format', {
      filters: [['doc_type', '=', 'Quotation'], ['disabled', '=', 0]],
      fields: ['name'], limit_page_length: 1, order_by: 'modified desc',
    });
    cachedFormat = rows[0]?.name ? String(rows[0].name) : '';
  } catch {
    cachedFormat = '';
  }
  return cachedFormat || null;
}

export interface CustomerInput {
  name: string;
  gstin?: string | null;
  state?: string | null;
  city?: string | null;
  /**
   * ERPNext's own distinction. A person buying in their own name is an
   * Individual; defaulting everyone to Company put proprietors into the
   * master data as firms that do not exist.
   */
  entityType?: 'Company' | 'Individual' | null;
}

export interface CustomerResult {
  erpName: string;
  matchedOn: 'gstin' | 'name' | 'created';
}

/**
 * Look up an existing customer WITHOUT creating one.
 * Returns null when there is no match — the caller decides what to do.
 */
export async function findQuotationCustomer(input: CustomerInput): Promise<CustomerResult | null> {
  const name = String(input.name ?? '').trim();
  const gstin = String(input.gstin ?? '').trim().toUpperCase();
  if (gstin) {
    for (const field of ['gstin', 'tax_id']) {
      try {
        const hit = await get('Customer', {
          filters: [[field, '=', gstin]], fields: ['name'], limit_page_length: 1,
        });
        if (hit.length) return { erpName: hit[0].name, matchedOn: 'gstin' };
      } catch { /* field may not exist */ }
    }
  }
  if (!name) return null;
  const byName = await get('Customer', {
    filters: [['customer_name', '=', name]], fields: ['name'], limit_page_length: 1,
  });
  return byName.length ? { erpName: byName[0].name, matchedOn: 'name' } : null;
}

/**
 * Find or create the end customer. GSTIN first — it is the only
 * identifier that is actually unique.
 *
 * Creating a Customer is creating financial master data, so this is now
 * only reachable from the explicit "add customer" endpoint. It used to be
 * called from the quote path, which meant a mistyped name silently became
 * a permanent ERPNext Customer with no GSTIN and no address.
 */
export async function ensureQuotationCustomer(input: CustomerInput): Promise<CustomerResult> {
  const name = String(input.name ?? '').trim();
  if (!name) throw new Error('Customer name is required');
  const gstin = String(input.gstin ?? '').trim().toUpperCase();

  if (gstin) {
    for (const field of ['gstin', 'tax_id']) {
      try {
        const hit = await get('Customer', {
          filters: [[field, '=', gstin]], fields: ['name'], limit_page_length: 1,
        });
        if (hit.length) return { erpName: hit[0].name, matchedOn: 'gstin' };
      } catch {
        // The field may not exist without india_compliance — try the next.
      }
    }
  }

  const byName = await get('Customer', {
    filters: [['customer_name', '=', name]], fields: ['name'], limit_page_length: 1,
  });
  if (byName.length) return { erpName: byName[0].name, matchedOn: 'name' };

  const doc: Record<string, unknown> = {
    doctype: 'Customer',
    customer_name: name,
    customer_type: input.entityType === 'Individual' ? 'Individual' : 'Company',
    customer_group: CUSTOMER_GROUP,
    territory: TERRITORY,
  };
  if (gstin) { doc.gstin = gstin; doc.tax_id = gstin; }
  const created = await post('Customer', doc);
  return { erpName: created.name, matchedOn: 'created' };
}

/**
 * The state code to tax against, for a customer ERPNext already knows.
 *
 * The GSTIN typed into our form is the LAST resort, not the first. A user
 * quoting an existing customer will usually leave that field blank — and
 * did, which is how a Tamil Nadu customer with GSTIN 33BVGPK5958P1ZU got
 * a quotation with no tax at all. ERPNext holds the authoritative value.
 *
 * Order: the Customer's own GSTIN, then their address GSTIN, then
 * india_compliance's gst_state_number on the address, then whatever was
 * typed. Returns null only when nothing anywhere knows where they are.
 */
async function customerStateCode(erpCustomer: string, typedGstin?: string | null): Promise<string | null> {
  const fromGstin = (g: unknown) => {
    const s = String(g ?? '').trim().toUpperCase();
    return s.length === 15 ? s.slice(0, 2) : null;
  };

  try {
    const rows = await get('Customer', {
      filters: [['name', '=', erpCustomer]],
      fields: ['name', 'gstin', 'tax_id'], limit_page_length: 1,
    });
    const c = rows[0];
    const direct = fromGstin(c?.gstin) ?? fromGstin(c?.tax_id);
    if (direct) return direct;
  } catch { /* the field may not exist without india_compliance */ }

  // Addresses link to a party through the Dynamic Link child table.
  try {
    const addrs = await get('Address', {
      filters: [['Dynamic Link', 'link_name', '=', erpCustomer]],
      fields: ['name', 'gstin', 'gst_state_number', 'is_primary_address', 'address_type'],
      limit_page_length: 10,
    });
    // Prefer the billing address, then the primary, then anything.
    const ranked = [...addrs].sort((a, b) =>
      (b.address_type === 'Billing' ? 2 : 0) + (b.is_primary_address ? 1 : 0) -
      ((a.address_type === 'Billing' ? 2 : 0) + (a.is_primary_address ? 1 : 0)));
    for (const a of ranked) {
      const viaGstin = fromGstin(a.gstin);
      if (viaGstin) return viaGstin;
      const n = String(a.gst_state_number ?? '').trim();
      if (/^\d{1,2}$/.test(n)) return n.padStart(2, '0');
    }
  } catch { /* no address, or no permission — fall through */ }

  return fromGstin(typedGstin);
}

/** SGT's home state code, derived from the company GSTIN unless pinned. */
let cachedHomeState: string | null = null;
async function homeStateCode(): Promise<string | null> {
  if (HOME_STATE_CODE) return HOME_STATE_CODE;
  if (cachedHomeState !== null) return cachedHomeState;
  try {
    const rows = await get('Company', {
      filters: [['name', '=', COMPANY]], fields: ['gstin', 'tax_id'], limit_page_length: 1,
    });
    const g = String(rows[0]?.gstin ?? rows[0]?.tax_id ?? '').trim();
    cachedHomeState = g.length === 15 ? g.slice(0, 2) : '';
  } catch {
    cachedHomeState = '';
  }
  return cachedHomeState || null;
}

/**
 * Which GST applies: CGST+SGST when the customer is in SGT's own state,
 * IGST otherwise.
 *
 * `mode` lets the caller decide instead of deriving it. That is not a
 * convenience — it is the only way to tax a customer ERPNext cannot place.
 * An individual buyer with no GSTIN and no address has no state code
 * anywhere, and the derived path can only return null, which produces a
 * quotation with no GST on it at all. Someone who knows where the customer
 * is picks it, and `tax_mode` on our mirror records that they did.
 *
 * 'auto' derives, and still returns null when nothing knows the state.
 */
export type TaxMode = 'auto' | 'in_state' | 'out_state';

export async function pickTaxTemplate(
  customerStateCodeValue?: string | null,
  mode: TaxMode = 'auto',
): Promise<string | null> {
  if (mode === 'in_state') return TAX_IN_STATE;
  if (mode === 'out_state') return TAX_OUT_STATE;
  const home = await homeStateCode();
  const cust = String(customerStateCodeValue ?? '').trim();
  if (!home || cust.length !== 2) return null;
  return cust === home ? TAX_IN_STATE : TAX_OUT_STATE;
}

/**
 * One machine on the quotation, with its own price, discount and AMC.
 *
 * A plant room is rarely one set. Quoting three ratings used to mean
 * three quotations, so the customer compared three documents and the
 * commercial terms were agreed three times.
 */
export interface CreateQuotationLine {
  itemCode: string;
  qty: number;
  /** Omit to let ERPNext price it from the selling price list. */
  rate?: string | number | null;
  /**
   * Discount on THIS line only, already checked against the caller's cap.
   * Per line rather than per document, so it never silently discounts a
   * sibling machine or an AMC alongside it.
   */
  discountPct?: number | null;
  /** PER UNIT, in rupees — ERPNext's `discount_amount` is per unit. */
  discountAmountPerUnit?: number | null;
  /** An AMC line for this machine. Priced by ERPNext from its Item Price. */
  amc?: { itemCode: string; qty: number } | null;
  /** Optional specification, printed under the line. */
  spec?: ProductSpec | null;
}

export interface CreateQuotationInput {
  /** An ERPNext Customer that already exists. Never created here. */
  customerErpName: string;
  /** At least one. Order is preserved on the document. */
  lines: CreateQuotationLine[];
  /** Partner code, e.g. EDINGX001-SS01. Omitted for a direct SGT quote. */
  salesPartner?: string | null;
  commissionRate?: number | null;
  validDays?: number;
  /**
   * Override the derived CGST+SGST / IGST decision. See pickTaxTemplate —
   * the only way to tax a customer whose state nothing knows.
   */
  taxMode?: TaxMode;
  /**
   * Who actually raised this, for the custom attribution fields.
   * ERPNext's own `owner` is always the API key's user, so it cannot
   * distinguish a dealer's quote from SGT's.
   */
  raisedBy?: string | null;
  raisedByOrg?: string | null;
  raisedVia?: string | null;
  /** Partner snapshot for the "Quote Generated by" block on the PDF. */
  partner?: {
    name?: string | null;
    address?: string | null;
    contact?: string | null;
    gstin?: string | null;
    /**
     * Where the customer pays. SGT no longer collects directly — the
     * partner does — so the account has to be ON the document the
     * customer is given, not in a follow-up mail.
     */
    bank?: string | null;
  } | null;
  /** Terms template name. Falls back to the configured default. */
  termsTemplate?: string | null;
  /** Overrides the template's text for this quotation only. */
  termsHtml?: string | null;
}

export interface CreateQuotationResult {
  erpName: string;
  customer: CustomerResult;
  netTotal: string | null;
  grandTotal: string | null;
  discountAmount: string | null;
  taxTemplate: string | null;
  /** Whether the tax was derived or chosen. Stored on the mirror. */
  taxMode: TaxMode;
  termsTemplate: string | null;
  termsWarning: string | null;
  totalTax: string | null;
  /** Set when the quotation carries no GST. Show it — do not swallow it. */
  taxWarning: string | null;
  commissionRate: number | null;
  totalCommission: string | null;
}

/**
 * The discount fields for a quotation line. Which combination works is
 * not obvious and is not symmetrical — see the note at the call site.
 */
function discountFields(line: CreateQuotationLine): Record<string, number> {
  const list = Number(line.rate ?? 0);
  const perUnit = Number(line.discountAmountPerUnit ?? 0);

  if (perUnit > 0 && list > 0) {
    const rate = Math.round((list - perUnit) * 100) / 100;
    return {
      discount_amount: Math.round(perUnit * 100) / 100,
      // Required. Without it ERPNext ignores discount_amount entirely.
      rate: rate < 0 ? 0 : rate,
    };
  }
  if (line.discountPct && line.discountPct > 0) {
    return { discount_percentage: line.discountPct };
  }
  return {};
}

/**
 * One machine line, plus its AMC when there is one.
 *
 * The AMC follows its machine rather than being collected at the end of
 * the document: on a three-set quotation the customer has to be able to
 * see which cover belongs to which set.
 */
function itemRows(line: CreateQuotationLine): Record<string, unknown>[] {
  const specHtml = renderSpecHtml(line.spec);
  return [
    {
      item_code: line.itemCode,
      qty: line.qty,
      ...(line.rate != null && line.rate !== '' ? { price_list_rate: Number(line.rate) } : {}),
      // How ERPNext wants a line discount, established by probing a real
      // site rather than reasoning about it:
      //
      //   percentage -> price_list_rate + discount_percentage. ERPNext
      //                 derives rate and discount_amount itself.
      //   amount     -> price_list_rate + discount_amount + rate. The
      //                 rate MUST be sent: a bare discount_amount with no
      //                 pricing rule is silently discarded and the line
      //                 comes out at full price with the discount columns
      //                 reading zero.
      //
      // Sending rate alongside the amount also keeps the exact rupee
      // figure the user typed, instead of drifting through a rounded
      // percentage (₹8,501 becoming ₹8,500.80).
      ...discountFields(line),
      // The specification, printed under the item name. Sent only when
      // something was filled in — an empty description would replace the
      // Item master's own text with nothing.
      ...(specHtml ? { description: specHtml } : {}),
      // india_compliance derives gst_treatment from the tax rows it finds.
      // With none present it settles on "Nil-Rated" and zeroes the GST —
      // which is how the first two quotations came out at 0% tax. GreenX is
      // taxable at 18%, so say so rather than let it be inferred.
      gst_treatment: 'Taxable',
    },
    // No rate: the AMC item carries its own Item Price, so ERPNext prices
    // it and the list rate on the printed line equals the charge. It is
    // deliberately NOT discounted — the discount is on the machine.
    ...(line.amc
      ? [{
          item_code: line.amc.itemCode,
          qty: line.amc.qty,
          gst_treatment: 'Taxable',
        }]
      : []),
  ];
}

export async function createQuotation(input: CreateQuotationInput): Promise<CreateQuotationResult> {
  if (!BASE || !KEY || !SECRET) throw new Error('ERPNext is not configured on this server');

  if (!input.lines?.length) throw new Error('A quotation needs at least one line');

  const customer: CustomerResult = { erpName: input.customerErpName, matchedOn: 'name' };
  // Ask ERPNext where this customer is. The customer record is authoritative;
  // there is no form field to fall back on any more. A caller who chose the
  // tax by hand skips the lookup entirely.
  const taxMode = input.taxMode ?? 'auto';
  const custState = taxMode === 'auto'
    ? await customerStateCode(customer.erpName, null)
    : null;
  const taxTemplate = await pickTaxTemplate(custState, taxMode);

  const today = new Date().toISOString().slice(0, 10);
  const validDays = input.validDays ?? DEFAULT_VALID_DAYS;
  const validTill = new Date(Date.now() + validDays * 86400000).toISOString().slice(0, 10);

  const doc: Record<string, unknown> = {
    doctype: 'Quotation',
    quotation_to: 'Customer',
    party_name: customer.erpName,
    company: COMPANY,
    currency: 'INR',
    selling_price_list: SELLING_PRICE_LIST,
    transaction_date: today,
    valid_till: validTill,
    items: input.lines.flatMap(itemRows),
  };


  if (input.salesPartner) {
    doc.sales_partner = input.salesPartner;
    if (input.commissionRate != null) doc.commission_rate = input.commissionRate;
  }

  // Attribution. Harmless if the custom fields do not exist yet — Frappe
  // ignores unknown keys — so this ships before the fields do.
  if (input.raisedBy) doc.custom_raised_by = input.raisedBy;
  if (input.raisedByOrg) doc.custom_raised_by_org = input.raisedByOrg;
  if (input.raisedVia) doc.custom_raised_via = input.raisedVia;
  if (input.partner?.name) doc.custom_partner_name = input.partner.name;
  if (input.partner?.address) doc.custom_partner_address = input.partner.address;
  if (input.partner?.contact) doc.custom_partner_contact = input.partner.contact;
  if (input.partner?.gstin) doc.custom_partner_gstin = input.partner.gstin;
  if (input.partner?.bank) doc.custom_partner_bank = input.partner.bank;

  // Naming the template is not enough over REST: the client-side fetch that
  // expands it into rows only runs in the UI. The rows must be sent.
  let taxWarning: string | null = null;
  if (taxTemplate) {
    doc.taxes_and_charges = taxTemplate;
    try {
      const rows = await expandTaxTemplate(taxTemplate);
      if (rows.length) doc.taxes = rows;
      else taxWarning = `Tax template "${taxTemplate}" expanded to zero rows — the quotation will carry no GST.`;
    } catch (e: any) {
      taxWarning =
        `Could not expand tax template "${taxTemplate}": ${String(e?.message ?? e).slice(0, 200)}. ` +
        `The quotation will carry no GST.`;
    }
  } else {
    taxWarning =
      `Could not determine ${customer.erpName}'s state — no GSTIN on the customer `
      + `and none on their addresses. Add a GSTIN or a billing address in ERPNext, `
      + `or choose CGST+SGST / IGST by hand on the quote, so GST can be applied.`;
  }

  // ---- Terms ----------------------------------------------------------
  // Named template AND its text, for the same reason the tax rows are sent
  // explicitly. An edited body wins over the template it came from.
  const termsTemplate = input.termsTemplate ?? DEFAULT_TERMS;
  let termsWarning: string | null = null;
  if (input.termsHtml && input.termsHtml.trim()) {
    doc.terms = input.termsHtml;
    if (termsTemplate) doc.tc_name = termsTemplate;
  } else if (termsTemplate) {
    const text = await fetchTerms(termsTemplate);
    if (text) {
      doc.tc_name = termsTemplate;
      doc.terms = text;
    } else {
      termsWarning =
        `Terms template "${termsTemplate}" was not found or is empty, so the ` +
        `quotation carries no terms.`;
    }
  }

  const created = await post('Quotation', doc);

  // Verify against what ERPNext actually stored, not what we sent. A
  // document that looks complete but carries zero tax is worse than an
  // error, so surface it rather than let it reach a customer.
  if (!taxWarning && Number(created.total_taxes_and_charges ?? 0) === 0) {
    taxWarning =
      `${created.name} was created with zero tax despite template "${taxTemplate}". ` +
      `Check the item's GST treatment in ERPNext before sending it.`;
  }

  return {
    erpName: created.name,
    customer,
    netTotal: created.net_total != null ? String(created.net_total) : null,
    grandTotal: created.grand_total != null ? String(created.grand_total) : null,
    discountAmount: created.discount_amount != null ? String(created.discount_amount) : null,
    taxTemplate,
    taxMode,
    termsTemplate: doc.tc_name ? String(doc.tc_name) : null,
    termsWarning,
    totalTax: created.total_taxes_and_charges != null
      ? String(created.total_taxes_and_charges) : null,
    taxWarning,
    commissionRate: created.commission_rate ?? null,
    totalCommission: created.total_commission != null ? String(created.total_commission) : null,
  };
}

/** Read a quotation back from ERPNext — the authoritative figures. */
export async function fetchQuotation(erpName: string) {
  return getDoc('Quotation', erpName);
}

// =====================================================================
// Attachments.
//
// Anything the customer should receive ALONGSIDE the quotation PDF — a
// spec sheet, a layout drawing, a compliance certificate.
//
// They are stored as ERPNext Files attached to the Quotation itself,
// not in our own vault, for two reasons that both matter:
//
//   1. The mail is sent BY ERPNext (frappe...email.make), and its
//      `attachments` argument takes File names. A file living anywhere
//      else would have to be pushed through the webhook path only.
//   2. "What exactly did we send this customer" stays answerable from
//      the document, next to the Communication that recorded the send.
//
// Private on purpose: an ERPNext public file is world-readable to
// anyone with the URL, and these are customer documents.
// =====================================================================

export interface QuotationAttachment {
  /** The File doctype name — what email.make wants. */
  name: string;
  fileName: string;
  fileUrl: string;
  sizeBytes: number | null;
  createdAt: string | null;
}

function attachmentRow(f: any): QuotationAttachment {
  return {
    name: String(f.name),
    fileName: String(f.file_name ?? f.name),
    fileUrl: String(f.file_url ?? ''),
    sizeBytes: f.file_size != null ? Number(f.file_size) : null,
    createdAt: f.creation ?? null,
  };
}

export async function listQuotationAttachments(erpName: string): Promise<QuotationAttachment[]> {
  const rows = await get('File', {
    filters: [
      ['attached_to_doctype', '=', 'Quotation'],
      ['attached_to_name', '=', erpName],
    ],
    fields: ['name', 'file_name', 'file_url', 'file_size', 'creation'],
    limit_page_length: 50,
    order_by: 'creation asc',
  });
  return rows.map(attachmentRow);
}

/**
 * Upload one file and attach it to the quotation.
 *
 * Uses /api/method/upload_file with multipart, which is the only
 * endpoint that both stores the bytes and creates the File row. Posting
 * to /api/resource/File with base64 `content` also works, but silently
 * truncates on some Frappe versions when the payload is large.
 */
export async function uploadQuotationAttachment(
  erpName: string,
  fileName: string,
  contentType: string,
  bytes: Buffer,
): Promise<QuotationAttachment> {
  if (!BASE || !KEY || !SECRET) throw new Error('ERPNext is not configured on this server');

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: contentType || 'application/octet-stream' }), fileName);
  form.append('doctype', 'Quotation');
  form.append('docname', erpName);
  form.append('is_private', '1');

  // No Content-Type header of our own: fetch must set the multipart
  // boundary, and overriding it produces an empty upload with no error.
  const res = await erpFetch(`${BASE}/api/method/upload_file`, {
    method: 'POST',
    headers: { Authorization: `token ${KEY}:${SECRET}`, Accept: 'application/json' },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 400);
    try {
      const j = JSON.parse(text);
      msg = j.exception ?? j._server_messages ?? msg;
    } catch { /* keep the raw text */ }
    throw new Error(`ERPNext rejected the attachment: ${String(msg).slice(0, 300)}`);
  }
  const data = JSON.parse(text).message ?? JSON.parse(text).data;
  if (!data?.name) throw new Error('ERPNext accepted the upload but returned no File record');
  return attachmentRow(data);
}

/**
 * Detach a file. Scoped by the caller: this checks the file really is on
 * THIS quotation before deleting, so a guessed File name cannot remove
 * an attachment from someone else's document.
 */
export async function deleteQuotationAttachment(
  erpName: string, fileDocName: string,
): Promise<boolean> {
  const mine = await get('File', {
    filters: [
      ['name', '=', fileDocName],
      ['attached_to_doctype', '=', 'Quotation'],
      ['attached_to_name', '=', erpName],
    ],
    fields: ['name'], limit_page_length: 1,
  });
  if (!mine.length) return false;

  const res = await erpFetch(
    `${BASE}/api/resource/File/${encodeURIComponent(fileDocName)}`,
    { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`ERPNext could not delete the attachment (HTTP ${res.status})`);
  }
  return true;
}

/**
 * The bytes of an attached file. Only used by the n8n mail path, which
 * has to carry the attachments itself — ERPNext is not doing the sending
 * there, so it cannot attach them.
 */
export async function fetchAttachmentBytes(
  fileUrl: string,
): Promise<ArrayBuffer> {
  const url = fileUrl.startsWith('http') ? fileUrl : `${BASE}${fileUrl}`;
  const res = await erpFetch(url, {
    headers: { Authorization: `token ${KEY}:${SECRET}` },
  });
  if (!res.ok) throw new Error(`Could not read ${fileUrl} (HTTP ${res.status})`);
  return res.arrayBuffer();
}

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
  const fmt = process.env.ERP_QUOTE_PRINT_FORMAT ?? '';
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

export interface CustomerInput {
  name: string;
  gstin?: string | null;
  state?: string | null;
  city?: string | null;
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
    customer_type: 'Company',
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
 * In-state (CGST+SGST) when the customer's state code matches SGT's,
 * inter-state (IGST) otherwise. When neither GSTIN is known we cannot
 * tell, so we return null and let ERPNext apply its own default rather
 * than guess a tax treatment.
 */
export async function pickTaxTemplate(customerStateCodeValue?: string | null): Promise<string | null> {
  const home = await homeStateCode();
  const cust = String(customerStateCodeValue ?? '').trim();
  if (!home || cust.length !== 2) return null;
  return cust === home ? TAX_IN_STATE : TAX_OUT_STATE;
}

export interface CreateQuotationInput {
  /** An ERPNext Customer that already exists. Never created here. */
  customerErpName: string;
  itemCode: string;
  qty: number;
  /** Omit to let ERPNext price it from the selling price list. */
  rate?: string | number | null;
  /** Partner code, e.g. EDINGX001-SS01. Omitted for a direct SGT quote. */
  salesPartner?: string | null;
  commissionRate?: number | null;
  validDays?: number;
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
  taxTemplate: string | null;
  termsTemplate: string | null;
  termsWarning: string | null;
  totalTax: string | null;
  /** Set when the quotation carries no GST. Show it — do not swallow it. */
  taxWarning: string | null;
  commissionRate: number | null;
  totalCommission: string | null;
}

export async function createQuotation(input: CreateQuotationInput): Promise<CreateQuotationResult> {
  if (!BASE || !KEY || !SECRET) throw new Error('ERPNext is not configured on this server');

  const customer: CustomerResult = { erpName: input.customerErpName, matchedOn: 'name' };
  // Ask ERPNext where this customer is. The customer record is authoritative;
  // there is no form field to fall back on any more.
  const custState = await customerStateCode(customer.erpName, null);
  const taxTemplate = await pickTaxTemplate(custState);

  const today = new Date().toISOString().slice(0, 10);
  const validDays = input.validDays ?? 15;
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
    items: [{
      item_code: input.itemCode,
      qty: input.qty,
      ...(input.rate != null && input.rate !== '' ? { rate: Number(input.rate) } : {}),
      // india_compliance derives gst_treatment from the tax rows it finds.
      // With none present it settles on "Nil-Rated" and zeroes the GST —
      // which is how the first two quotations came out at 0% tax. GreenX is
      // taxable at 18%, so say so rather than let it be inferred.
      gst_treatment: 'Taxable',
    }],
  };

  if (input.salesPartner) {
    doc.sales_partner = input.salesPartner;
    if (input.commissionRate != null) doc.commission_rate = input.commissionRate;
  }

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
      `Could not determine ${customer.erpName}'s state — no GSTIN on the customer, `
      + `none on their addresses, and none entered here. Add a GSTIN or a billing `
      + `address in ERPNext, or type one on the quote, so GST can be applied.`;
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
    taxTemplate,
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

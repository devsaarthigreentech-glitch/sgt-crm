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
  if (!res.ok) throw new Error(`ERPNext GET ${doctype}/${name} ${res.status}`);
  return (await res.json()).data;
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
 * Find or create the end customer. GSTIN first — it is the only
 * identifier that is actually unique.
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
export async function pickTaxTemplate(customerGstin?: string | null): Promise<string | null> {
  const home = await homeStateCode();
  const cust = String(customerGstin ?? '').trim();
  if (!home || cust.length !== 15) return null;
  return cust.slice(0, 2) === home ? TAX_IN_STATE : TAX_OUT_STATE;
}

export interface CreateQuotationInput {
  customer: CustomerInput;
  itemCode: string;
  qty: number;
  /** Omit to let ERPNext price it from the selling price list. */
  rate?: string | number | null;
  /** Partner code, e.g. EDINGX001-SS01. Omitted for a direct SGT quote. */
  salesPartner?: string | null;
  commissionRate?: number | null;
  validDays?: number;
}

export interface CreateQuotationResult {
  erpName: string;
  customer: CustomerResult;
  netTotal: string | null;
  grandTotal: string | null;
  taxTemplate: string | null;
  commissionRate: number | null;
  totalCommission: string | null;
}

export async function createQuotation(input: CreateQuotationInput): Promise<CreateQuotationResult> {
  if (!BASE || !KEY || !SECRET) throw new Error('ERPNext is not configured on this server');

  const customer = await ensureQuotationCustomer(input.customer);
  const taxTemplate = await pickTaxTemplate(input.customer.gstin);

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
    }],
  };

  if (input.salesPartner) {
    doc.sales_partner = input.salesPartner;
    if (input.commissionRate != null) doc.commission_rate = input.commissionRate;
  }

  // Copy the template's rows rather than referencing it — see the header.
  if (taxTemplate) {
    doc.taxes_and_charges = taxTemplate;
    try {
      const tmpl = await getDoc('Sales Taxes and Charges Template', taxTemplate);
      if (Array.isArray(tmpl?.taxes) && tmpl.taxes.length) {
        doc.taxes = tmpl.taxes.map((t: any) => ({
          charge_type: t.charge_type,
          account_head: t.account_head,
          description: t.description,
          rate: t.rate,
          cost_center: t.cost_center,
          included_in_print_rate: t.included_in_print_rate,
        }));
      }
    } catch {
      // Fall back to the template reference alone; ERPNext may still apply it.
    }
  }

  const created = await post('Quotation', doc);

  return {
    erpName: created.name,
    customer,
    netTotal: created.net_total != null ? String(created.net_total) : null,
    grandTotal: created.grand_total != null ? String(created.grand_total) : null,
    taxTemplate,
    commissionRate: created.commission_rate ?? null,
    totalCommission: created.total_commission != null ? String(created.total_commission) : null,
  };
}

/** Read a quotation back from ERPNext — the authoritative figures. */
export async function fetchQuotation(erpName: string) {
  return getDoc('Quotation', erpName);
}

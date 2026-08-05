// =====================================================================
// services/erpDealerPo.ts — the ERPNext client for dealer POs.
//
// The counterpart of erpAgreement.ts, and deliberately as thin. ERPNext
// is here for ONE reason: it renders PDFs, and that renderer is already
// proven in this stack. Everything else about a PO — who may see it, what
// state it is in — belongs to Postgres and is none of ERPNext's business.
//
// The doctype, its two child tables and the print format are created by
// src/db/erp_create_dealer_po_doctype.ts. Nothing here creates schema. If
// that script has not been run, every call fails with a 404 from Frappe,
// so assertDoctype() checks once and says so plainly rather than letting
// a 404 surface as "could not create the PO".
// =====================================================================

import { erpFetch } from './erpLimit.js';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '') ?? '';
const KEY = process.env.ERPNEXT_API_KEY ?? '';
const SECRET = process.env.ERPNEXT_API_SECRET ?? '';

export const PO_DOCTYPE = process.env.ERP_PO_DOCTYPE ?? 'SGT Dealer PO';
export const PO_FORMAT = process.env.ERP_PO_PRINT_FORMAT ?? 'SGT Dealer PO';

/** One line on the printed order. Named as ERPNext names a Quotation Item. */
export interface PoItem {
  item_code: string;
  item_name?: string | null;
  /** The specification block. Already HTML — it is copied, not rebuilt. */
  description?: string | null;
  qty: number;
  uom?: string | null;
  price_list_rate?: number | null;
  discount_percentage?: number | null;
  /** PER UNIT, as ERPNext stores it. */
  discount_amount?: number | null;
  rate?: number | null;
  amount?: number | null;
}

/** One tax row, copied off the quotation rather than recomputed. */
export interface PoTax {
  description?: string | null;
  rate?: number | null;
  tax_amount?: number | null;
}

/**
 * Every field the print format reads, named exactly as the doctype names
 * them — so the mapping from our data to the document is one object
 * literal with no translation layer to get wrong.
 */
export interface PoFields {
  po_status?: string;
  transaction_date?: string | null;
  valid_till?: string | null;
  quotation_ref?: string | null;

  /**
   * Feeds the document name via the series, so it MUST be set on create.
   * Left blank, the name resolves to "SGT-PO--0001" with a hole where the
   * year should be — which is exactly what happened to the agreement
   * doctype before this was wired up. Not optional in practice, only in
   * the type.
   */
  custom_short_fiscal_year?: string | null;

  customer_name?: string | null;
  customer_gstin?: string | null;
  customer_address_display?: string | null;
  contact_email?: string | null;

  sales_partner?: string | null;
  custom_partner_name?: string | null;
  custom_partner_address?: string | null;
  custom_partner_contact?: string | null;
  custom_partner_gstin?: string | null;
  custom_partner_bank?: string | null;
  custom_partner_logo?: string | null;

  custom_raised_by?: string | null;
  custom_raised_by_org?: string | null;
  custom_raised_via?: string | null;

  items?: PoItem[];
  taxes?: PoTax[];

  currency?: string | null;
  net_total?: number | null;
  total_taxes_and_charges?: number | null;
  grand_total?: number | null;

  tc_name?: string | null;
  terms?: string | null;
}

function authHeaders() {
  return {
    Authorization: `token ${KEY}:${SECRET}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

/** Frappe buries the useful line in a traceback; dig it out. */
function frappeError(text: string): string {
  try {
    const j = JSON.parse(text);
    const msgs = j._server_messages ? JSON.parse(j._server_messages) : null;
    if (Array.isArray(msgs) && msgs.length) {
      try { return JSON.parse(msgs[0]).message ?? String(msgs[0]); }
      catch { return String(msgs[0]); }
    }
    return String(j.exception ?? j.message ?? text);
  } catch {
    return text;
  }
}

const path = (...parts: string[]) =>
  `${BASE}/api/resource/${parts.map(encodeURIComponent).join('/')}`;

let doctypeChecked = false;
async function assertDoctype(): Promise<void> {
  if (doctypeChecked) return;
  if (!BASE || !KEY || !SECRET) throw new Error('ERPNext is not configured on this server');
  const res = await erpFetch(path('DocType', PO_DOCTYPE), { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(
      `The "${PO_DOCTYPE}" doctype does not exist in ERPNext. ` +
      'Run: CONFIRM_CREATE=1 npx tsx src/db/erp_create_dealer_po_doctype.ts');
  }
  doctypeChecked = true;
}

/** Create the ERPNext document. Returns its name, e.g. SGT-PO-202627-0001. */
export async function createPoDoc(fields: PoFields): Promise<string> {
  await assertDoctype();
  const res = await erpFetch(path(PO_DOCTYPE), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ doctype: PO_DOCTYPE, ...fields }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ERPNext could not create the PO: ${frappeError(text).slice(0, 300)}`);
  }
  const name = JSON.parse(text)?.data?.name;
  if (!name) throw new Error('ERPNext created the PO but returned no name');
  return String(name);
}

/** Patch an existing document. Partial — only what is passed is written. */
export async function updatePoDoc(
  erpName: string, fields: Partial<PoFields>,
): Promise<void> {
  await assertDoctype();
  const res = await erpFetch(path(PO_DOCTYPE, erpName), {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    throw new Error(
      `ERPNext could not update ${erpName}: ${frappeError(await res.text()).slice(0, 300)}`);
  }
}

/**
 * Delete the ERPNext document.
 *
 * Returns true when it is gone, INCLUDING when it was already absent —
 * the caller's goal is "this document does not exist", and a 404 means
 * that goal is already met. Treating it as a failure would strand a local
 * row pointing at nothing, which is the exact mess this is cleaning up.
 */
export async function deletePoDoc(erpName: string): Promise<boolean> {
  await assertDoctype();
  const res = await erpFetch(path(PO_DOCTYPE, erpName), {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (res.ok || res.status === 404) return true;
  const why = frappeError(await res.text());
  throw new Error(
    /link/i.test(why)
      ? `ERPNext will not delete ${erpName} because something links to it. ` +
        `Cancel it instead. (${why.slice(0, 160)})`
      : `ERPNext could not delete ${erpName}: ${why.slice(0, 250)}`);
}

/** The whole document, as ERPNext holds it. */
export async function getPoDoc(erpName: string): Promise<Record<string, any> | null> {
  await assertDoctype();
  const res = await erpFetch(path(PO_DOCTYPE, erpName), { headers: authHeaders() });
  if (!res.ok) return null;
  return JSON.parse(await res.text())?.data ?? null;
}

/**
 * The rendered PDF, as bytes.
 *
 * Fetched server-side on purpose: a partner must never hold an ERPNext
 * credential, and download_pdf needs one. The CALLER is responsible for
 * having checked that this PO is theirs to see — this function does no
 * authorisation and cannot, since it knows nothing about orgs.
 *
 * no_letterhead=1 because the print format draws its own masthead. With a
 * letterhead on top the page carries two.
 */
export async function fetchPoPdf(erpName: string): Promise<ArrayBuffer> {
  await assertDoctype();
  const url =
    `${BASE}/api/method/frappe.utils.print_format.download_pdf` +
    `?doctype=${encodeURIComponent(PO_DOCTYPE)}` +
    `&name=${encodeURIComponent(erpName)}` +
    `&format=${encodeURIComponent(PO_FORMAT)}` +
    `&no_letterhead=1`;
  const res = await erpFetch(url, {
    headers: { Authorization: `token ${KEY}:${SECRET}`, Accept: 'application/pdf' },
  });
  if (!res.ok) {
    const why = frappeError(await res.text());
    throw new Error(
      `ERPNext could not render the PDF for ${erpName} (HTTP ${res.status})` +
      (/print format|not found/i.test(why)
        ? ` — the print format "${PO_FORMAT}" is missing. Re-run erp_create_dealer_po_doctype.ts.`
        : `: ${why.slice(0, 200)}`));
  }
  return res.arrayBuffer();
}

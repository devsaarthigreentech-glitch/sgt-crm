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
export const PO_FORMAT = process.env.ERP_PO_PRINT_FORMAT ?? 'SGT-Dealer PO';

/**
 * The child tables, derived from the parent exactly as
 * db/erp_create_dealer_po_doctype.ts derives them.
 *
 * Exported because every child row is sent carrying its own `doctype`.
 * Frappe will normally infer that from the parent field's options —
 * _init_child() does it — but only when the parent's meta resolves the
 * Table field cleanly, and a row whose doctype cannot be resolved is
 * DROPPED rather than rejected: HTTP 200, document created, table empty.
 * Naming it costs nothing and removes the whole failure mode.
 */
export const PO_ITEM_DOCTYPE = `${PO_DOCTYPE} Item`;
export const PO_TAX_DOCTYPE = `${PO_DOCTYPE} Tax`;

/** One line on the printed order. Named as ERPNext names a Quotation Item. */
export interface PoItem {
  /** Always sent. See PO_ITEM_DOCTYPE above for why it is not left implicit. */
  doctype?: string;
  item_code: string;
  item_name?: string | null;
  /** The quotation prints HSN/SAC as a column, so the PO must carry it. */
  gst_hsn_code?: string | null;
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
  /** Always sent. See PO_TAX_DOCTYPE above for why it is not left implicit. */
  doctype?: string;
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
  /**
   * The partner's signature. Snapshotted from the quotation, not looked
   * up — the PO is signed by whoever signed the offer it accepts. Stored
   * on the document as well as baked into `terms`, so a future print
   * format can draw it somewhere else without a migration.
   */
  custom_partner_sign?: string | null;

  custom_raised_by?: string | null;
  custom_raised_by_org?: string | null;
  custom_raised_via?: string | null;

  items?: PoItem[];
  taxes?: PoTax[];

  currency?: string | null;
  /**
   * Sum of the item amounts. What the quotation's totals block prints as
   * the Sub Total — NOT net_total, which is after a document-level
   * discount has been apportioned. Equal on most documents, and silently
   * different on discounted ones, which is why both are carried.
   */
  total?: number | null;
  net_total?: number | null;
  /** A discount on the whole document, distinct from the per-line ones. */
  discount_amount?: number | null;
  total_taxes_and_charges?: number | null;
  grand_total?: number | null;
  rounded_total?: number | null;
  /** Copied, never recomputed — see the field's description on the doctype. */
  in_words?: string | null;

  /**
   * Supplies the masthead and footer, and therefore the entire family
   * resemblance to the quotation. Inherited from the source quotation.
   * See the note above PRINT_HTML in erp_create_dealer_po_doctype.ts.
   */
  letter_head?: string | null;

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

export interface CreatedPo {
  name: string;
  /** What ERPNext actually stored, not what we sent. */
  doc: Record<string, any>;
  /**
   * Child tables that came back shorter than they went in, after a repair
   * attempt. Empty is the expected case; anything here must reach the user.
   */
  shortTables: string[];
}

/**
 * Create the ERPNext document, then CHECK WHAT IT STORED.
 *
 * The read-back is not defensive padding. A Frappe POST that drops a child
 * table still returns 200 with a document name, so a create that half
 * worked is indistinguishable from one that worked — which is how a PO
 * went out with an empty tax table and no error anywhere. The same lesson
 * is already written down twice in erpQuotation.ts: send the rows
 * explicitly, then verify against what ERPNext actually stored.
 *
 * One repair attempt, by PUTting the child tables on their own. If that
 * also fails the caller is TOLD, rather than the document quietly going
 * out wrong.
 */
export async function createPoDoc(fields: PoFields): Promise<CreatedPo> {
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
  let doc = JSON.parse(text)?.data;
  const name = doc?.name;
  if (!name) throw new Error('ERPNext created the PO but returned no name');

  const expected: Array<['items' | 'taxes', number]> = [
    ['items', fields.items?.length ?? 0],
    ['taxes', fields.taxes?.length ?? 0],
  ];
  const short = expected.filter(([k, n]) => n > 0 && (doc?.[k]?.length ?? 0) < n);

  if (short.length) {
    // Re-send only the tables that came up short. Sent alone rather than
    // as part of the whole body: if Frappe is rejecting a row, the error
    // that comes back is then about that table and nothing else.
    const patch: Record<string, unknown> = {};
    for (const [k] of short) patch[k] = fields[k];
    try {
      const put = await erpFetch(path(PO_DOCTYPE, String(name)), {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(patch),
      });
      const putText = await put.text();
      if (put.ok) doc = JSON.parse(putText)?.data ?? doc;
      else {
        throw new Error(frappeError(putText));
      }
    } catch (e) {
      return {
        name: String(name), doc: doc ?? {},
        shortTables: short.map(([k]) =>
          `${k} (${String((e as Error).message ?? e).replace(/\s+/g, ' ').slice(0, 180)})`),
      };
    }
  }

  const stillShort = expected
    .filter(([k, n]) => n > 0 && (doc?.[k]?.length ?? 0) < n)
    .map(([k, n]) => `${k}: sent ${n}, stored ${doc?.[k]?.length ?? 0}`);

  return { name: String(name), doc: doc ?? {}, shortTables: stillShort };
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

/**
 * Current state of many POs in ONE call.
 *
 * The local mirror goes stale in two ways, both already seen with
 * quotations (see fetchQuotationSummaries in erpQuotation.ts, which this
 * deliberately copies):
 *
 *  · a PO deleted in the ERPNext desk leaves our row behind, and
 *  · Frappe REVERTS the naming series when the newest document in a
 *    series is deleted, so the next PO REUSES that number. Our row then
 *    describes a different document entirely — same name, wrong
 *    customer, wrong total.
 *
 * The second is why this refreshes the snapshot rather than only checking
 * existence. One batched request, not one per row.
 *
 * THROWS when ERPNext cannot be reached. That is deliberate and the
 * caller must treat it as such: a network blip that returned "nothing
 * exists" would delete every mirror row on the next list.
 */
export async function fetchPoSummaries(
  names: string[],
): Promise<Map<string, { customer_name: string; grand_total: string; po_status: string }>> {
  const out = new Map<string, { customer_name: string; grand_total: string; po_status: string }>();
  if (!names.length) return out;
  await assertDoctype();

  // Chunked: a long `in` list makes for an unwieldy query string.
  for (let i = 0; i < names.length; i += 50) {
    const url = new URL(`${BASE}/api/resource/${encodeURIComponent(PO_DOCTYPE)}`);
    url.searchParams.set('filters', JSON.stringify([['name', 'in', names.slice(i, i + 50)]]));
    url.searchParams.set('fields',
      JSON.stringify(['name', 'customer_name', 'grand_total', 'po_status']));
    url.searchParams.set('limit_page_length', '100');

    const res = await erpFetch(url.toString(), { headers: authHeaders() });
    if (!res.ok) {
      throw new Error(
        `ERPNext could not list ${PO_DOCTYPE} (HTTP ${res.status}): ` +
        frappeError(await res.text()).slice(0, 200));
    }
    for (const r of (JSON.parse(await res.text()).data ?? [])) {
      out.set(String(r.name), {
        customer_name: r.customer_name ?? '',
        grand_total: r.grand_total != null ? String(r.grand_total) : '0',
        po_status: r.po_status ?? 'Generated',
      });
    }
  }
  return out;
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
 * no_letterhead=0, unlike the agreement — and that is the whole reason a
 * printed PO looks like a printed quotation. The three-column masthead
 * (SGT's mark, "OFFERED THROUGH" with the partner's logo, the registered
 * office) and the contact / CIN footer are a LETTER HEAD, not part of any
 * print format, and Frappe hands it to wkhtmltopdf as --header-html so it
 * repeats on every page. Suppressing it would print the body alone.
 *
 * The agreement does the opposite because its format draws its own
 * masthead; this one deliberately does not. See the note above PRINT_HTML
 * in db/erp_create_dealer_po_doctype.ts.
 */
export async function fetchPoPdf(erpName: string): Promise<ArrayBuffer> {
  await assertDoctype();
  const url =
    `${BASE}/api/method/frappe.utils.print_format.download_pdf` +
    `?doctype=${encodeURIComponent(PO_DOCTYPE)}` +
    `&name=${encodeURIComponent(erpName)}` +
    `&format=${encodeURIComponent(PO_FORMAT)}` +
    `&no_letterhead=0`;
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

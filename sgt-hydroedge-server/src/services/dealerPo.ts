// =====================================================================
// services/dealerPo.ts — the dealer purchase order, end to end.
//
// One place for the operations, called by BOTH the staff routes and the
// portal routes, so a dealer raising a PO produces exactly the same
// document SGT would. Two code paths would drift.
//
// The shape of the flow:
//
//   resolveFromQuotation()  read the quotation and build the whole
//                           document. Nothing is typed.
//   createFromQuotation()   write it to ERPNext, mirror it locally.
//   listPos() / getPo()     what the CRM and the portal show.
//   deletePo() / cancelPo() the two kinds of undo.
//
// ── Why a PO is a COPY of a quotation, not a reference to one ─────────
// Every figure below is SNAPSHOTTED off the quotation at the moment the
// PO is raised — items, discounts, taxes, totals, the partner block, the
// terms. Reading them back at print time would mean a PO silently
// changing when its quotation was edited, and a quotation CAN be edited
// while it is a draft (see updateQuotation in erpQuotation.ts). A
// purchase order that rewrites itself is not a purchase order.
//
// The consequence is the deliberate one: edit the quotation after raising
// the PO and the two disagree. That is visible — the PO names the
// quotation it came from — and it is recoverable, because a PO that was
// never sent can be deleted and raised again.
//
// ── Authorisation is NOT done here ───────────────────────────────────
// Every function takes org ids the caller has already bounded, because
// this module cannot see a JWT and must never be the thing that decides
// who may act. The routes bound it — staff by role, portal by
// quote_service.visible_org_ids().
// =====================================================================

import { query, pool } from '../db/pool.js';
import { shortFiscalYear } from '../domain/fiscalYear.js';
import { withTermsFooter } from '../domain/quoteTerms.js';
import { fetchQuotation, fetchTerms } from './erpQuotation.js';
import {
  createPoDoc, updatePoDoc, deletePoDoc, fetchPoPdf,
  type PoFields, type PoItem, type PoTax,
} from './erpDealerPo.js';

/**
 * The terms a PO carries. Its own template, seeded with the same clauses
 * as the quotation's — see domain/dealerTerms.ts and
 * db/erp_create_dealer_po_terms.ts.
 */
const PO_TERMS_TEMPLATE = process.env.ERP_DEALER_PO_TERMS ?? 'GreenX Dealer PO Terms';

/**
 * How long the order stands, in days from today.
 *
 * Defaults to the quotation's own validity so the two documents agree.
 * A PO that expires before the quotation it was raised against would be
 * a document the customer could reasonably argue with.
 */
const PO_VALID_DAYS = Number(
  process.env.ERP_PO_VALID_DAYS ?? process.env.ERP_QUOTE_VALID_DAYS ?? '30');

/** Who is acting. Stamped onto the document and the mirror row. */
export interface Actor {
  userId: string;
  name: string;
  /** The partner code when a partner raised it; null when SGT did. */
  orgCode: string | null;
  via: 'crm' | 'portal';
}

// ---------------------------------------------------------------------

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * ERPNext's address_display is HTML with <br> between the lines. The PO
 * doctype stores the address as a Small Text and the print format renders
 * it with white-space:pre-line, so it wants newlines, not markup.
 */
function addressToText(html: unknown): string | null {
  const s = String(html ?? '');
  if (!s.trim()) return null;
  const text = s
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join('\n');
  return text || null;
}

// ---------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------

export interface ResolvedPo {
  quotationErpName: string;
  orgId: number | null;
  fields: PoFields;
  /** For the mirror row, and for the confirmation the screen shows. */
  summary: {
    /**
     * The ERPNext Customer's document id — `party_name` on a Quotation.
     * Kept apart from customerName because on most ERPNext setups the
     * Customer is NAMED by customer_name, but not on all of them, and the
     * mirror's erp_customer column has to be the thing you can look up.
     */
    erpCustomer: string | null;
    customerName: string | null;
    modelCode: string | null;
    lineCount: number;
    netTotal: number | null;
    grandTotal: number | null;
    termsTemplate: string | null;
  };
  /**
   * Things that will print oddly or not at all. Surfaced so the screen
   * can show them BEFORE the document is created — afterwards they are
   * an autopsy.
   */
  warnings: string[];
}

/**
 * Everything a PO for this quotation would say, derived. No side effects.
 *
 * ERPNext is read for the figures rather than our mirror, deliberately:
 * quotation_ref stores a listing snapshot and says so, and a purchase
 * order must carry what the document actually says.
 */
export async function resolveFromQuotation(quotationErpName: string): Promise<ResolvedPo> {
  const doc = await fetchQuotation(quotationErpName).catch(() => null);
  if (!doc) {
    throw new Error(`${quotationErpName} could not be read from ERPNext`);
  }

  const { rows } = await query(
    `select org_id, model_code, line_count from quote_service.quotation_ref
      where erp_name = $1`, [quotationErpName]);
  const mirror = rows[0] ?? null;

  const warnings: string[] = [];
  if (!mirror) {
    warnings.push(
      `${quotationErpName} is not in the CRM's records, so this PO will not be ` +
      'attributed to a partner. Raise it from a quotation the CRM created.');
  }

  const items: PoItem[] = (Array.isArray(doc.items) ? doc.items : []).map((it: any) => ({
    item_code: String(it.item_code),
    item_name: it.item_name ?? null,
    // Already HTML on the quotation — renderSpecHtml built it. Copied,
    // never rebuilt: rebuilding would need the spec inputs, which live in
    // our mirror and are not guaranteed to still match the document.
    description: it.description ?? null,
    qty: Number(it.qty ?? 1),
    uom: it.uom ?? it.stock_uom ?? null,
    price_list_rate: num(it.price_list_rate),
    discount_percentage: num(it.discount_percentage),
    discount_amount: num(it.discount_amount),
    rate: num(it.rate),
    amount: num(it.amount),
  }));
  if (!items.length) {
    warnings.push(`${quotationErpName} has no item lines, so the PO would print an empty table.`);
  }

  const taxes: PoTax[] = (Array.isArray(doc.taxes) ? doc.taxes : []).map((t: any) => ({
    description: t.description ?? null,
    rate: num(t.rate),
    tax_amount: num(t.tax_amount),
  }));
  if (!Number(doc.total_taxes_and_charges ?? 0)) {
    warnings.push(
      `${quotationErpName} carries no GST, so neither will this PO. ` +
      'Check the quotation before sending the order out.');
  }

  // ---- Terms ---------------------------------------------------------
  // The PO's OWN template, so the two documents can diverge later without
  // touching the quotation. Falling back to the quotation's own terms is
  // better than printing none: an order with no terms on it is worse than
  // one carrying the terms the customer has already seen.
  let termsTemplate: string | null = PO_TERMS_TEMPLATE;
  let terms: string | null = null;
  const templateBody = await fetchTerms(PO_TERMS_TEMPLATE);
  if (templateBody) {
    terms = withTermsFooter(templateBody);
  } else if (doc.terms) {
    // Already carries the footer — it was applied when the quotation was
    // created. Re-applying would print the closing rule and the stamps
    // twice.
    terms = String(doc.terms);
    termsTemplate = doc.tc_name ? String(doc.tc_name) : null;
    warnings.push(
      `The terms template "${PO_TERMS_TEMPLATE}" was not found in ERPNext, so this PO ` +
      `carries the quotation's terms instead. Run: CONFIRM_CREATE=1 npx tsx ` +
      'src/db/erp_create_dealer_po_terms.ts');
  } else {
    termsTemplate = null;
    warnings.push('Neither the PO terms template nor the quotation has any terms — the PO will carry none.');
  }

  const today = new Date().toISOString().slice(0, 10);

  const fields: PoFields = {
    po_status: 'Generated',
    transaction_date: today,
    valid_till: new Date(Date.now() + PO_VALID_DAYS * 86400000).toISOString().slice(0, 10),
    quotation_ref: quotationErpName,

    customer_name: doc.customer_name ?? doc.party_name ?? null,
    // india_compliance puts the buyer's GSTIN on billing_address_gstin;
    // stock ERPNext has neither, so tax_id is the last resort.
    customer_gstin: doc.billing_address_gstin ?? doc.gstin ?? doc.tax_id ?? null,
    customer_address_display: addressToText(doc.address_display),
    contact_email: doc.contact_email ?? null,

    // The partner block, copied field for field off the quotation. It was
    // already snapshotted there when the quotation was raised, so this is
    // a copy of a snapshot and not a second lookup — which is the point:
    // the PO shows the partner as the quotation showed them.
    sales_partner: doc.sales_partner ?? null,
    custom_partner_name: doc.custom_partner_name ?? null,
    custom_partner_address: doc.custom_partner_address ?? null,
    custom_partner_contact: doc.custom_partner_contact ?? null,
    custom_partner_gstin: doc.custom_partner_gstin ?? null,
    custom_partner_bank: doc.custom_partner_bank ?? null,
    custom_partner_logo: doc.custom_partner_logo ?? null,

    items,
    taxes,

    currency: doc.currency ?? 'INR',
    net_total: num(doc.net_total),
    total_taxes_and_charges: num(doc.total_taxes_and_charges),
    grand_total: num(doc.grand_total),

    tc_name: termsTemplate,
    terms,
  };

  return {
    quotationErpName,
    orgId: mirror?.org_id ?? null,
    fields,
    summary: {
      erpCustomer: doc.party_name ? String(doc.party_name) : null,
      customerName: fields.customer_name ?? null,
      modelCode: mirror?.model_code ?? items[0]?.item_code ?? null,
      lineCount: items.length,
      netTotal: fields.net_total ?? null,
      grandTotal: fields.grand_total ?? null,
      termsTemplate,
    },
    warnings,
  };
}

// ---------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------

export interface PoRow {
  id: number;
  erp_name: string;
  quotation_erp_name: string;
  org_id: number | null;
  status: string;
  erp_customer: string | null;
  customer_name: string | null;
  model_code: string | null;
  line_count: number;
  net_total: string | null;
  grand_total: string | null;
  po_date: string | null;
  terms_template: string | null;
  raised_by_name: string | null;
  raised_via: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
}

const ROW_COLS = `
  id, erp_name, quotation_erp_name, org_id, status, erp_customer, customer_name,
  model_code, line_count, net_total, grand_total, po_date, terms_template,
  raised_by_name, raised_via, cancelled_at, cancel_reason, created_at`;

/**
 * Raise the PO: ERPNext document first, mirror row second.
 *
 * That order matters. If ERPNext fails there is nothing to clean up. The
 * reverse can leave a local row pointing at a document that was never
 * created, and the list would then show a PO nobody can print.
 */
export async function createFromQuotation(
  quotationErpName: string, actor: Actor,
): Promise<{ row: PoRow; warnings: string[] }> {
  const resolved = await resolveFromQuotation(quotationErpName);

  const fields: PoFields = {
    ...resolved.fields,
    // Set LAST and never from the caller: this feeds the document name
    // through the series. Derived from the PO date rather than today so a
    // back-dated PO lands in the financial year it belongs to — and left
    // empty it produces "SGT-PO--0001", which is exactly how the
    // agreement doctype was numbered before this was wired up.
    custom_short_fiscal_year: shortFiscalYear(
      resolved.fields.transaction_date || new Date()),
    custom_raised_by: actor.name,
    custom_raised_by_org: actor.orgCode,
    custom_raised_via: actor.via === 'portal' ? 'Partner portal' : 'SGT CRM',
  };

  const erpName = await createPoDoc(fields);

  try {
    const { rows } = await pool.query(
      `insert into quote_service.dealer_po_ref
         (erp_name, quotation_erp_name, org_id, status, erp_customer, customer_name,
          model_code, line_count, net_total, grand_total, po_date, terms_template,
          raised_by, raised_by_name, raised_via)
       values ($1,$2,$3,'generated',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       returning ${ROW_COLS}`,
      [erpName, quotationErpName, resolved.orgId,
       resolved.summary.erpCustomer, resolved.summary.customerName,
       resolved.summary.modelCode, resolved.summary.lineCount,
       resolved.summary.netTotal, resolved.summary.grandTotal,
       fields.transaction_date ?? null, resolved.summary.termsTemplate,
       actor.userId, actor.name, actor.via]);
    return { row: rows[0] as PoRow, warnings: resolved.warnings };
  } catch (err) {
    // The ERPNext document exists but is unmirrored. Say so — swallowing
    // it leaves an orphan nobody knows to look for.
    throw new Error(
      `The PO ${erpName} was created in ERPNext but could not be recorded ` +
      `locally: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------

/**
 * List POs. `orgIds` bounds it; pass null for "everything", which ONLY a
 * staff route may do.
 *
 * An SGT-direct PO has org_id NULL and is therefore invisible to every
 * partner, which is correct — no partner raised it.
 */
export async function listPos(orgIds: number[] | null): Promise<PoRow[]> {
  const { rows } = orgIds
    ? await query(
        `select ${ROW_COLS} from quote_service.dealer_po_ref
          where org_id = any($1::int[])
          order by created_at desc limit 500`, [orgIds])
    : await query(
        `select ${ROW_COLS} from quote_service.dealer_po_ref
          order by created_at desc limit 500`);
  return rows as PoRow[];
}

/** Every PO raised against one quotation. Drives the button's state. */
export async function posForQuotation(quotationErpName: string): Promise<PoRow[]> {
  const { rows } = await query(
    `select ${ROW_COLS} from quote_service.dealer_po_ref
      where quotation_erp_name = $1 order by created_at desc`, [quotationErpName]);
  return rows as PoRow[];
}

export async function getPo(id: number): Promise<PoRow | null> {
  const { rows } = await query(
    `select ${ROW_COLS} from quote_service.dealer_po_ref where id = $1`, [id]);
  return (rows[0] as PoRow) ?? null;
}

/** True when this PO is inside the caller's visible set. */
export function isVisible(row: PoRow, orgIds: number[] | null): boolean {
  if (orgIds === null) return true;
  return row.org_id !== null && orgIds.includes(row.org_id);
}

export async function poPdf(row: PoRow): Promise<ArrayBuffer> {
  return fetchPoPdf(row.erp_name);
}

// ---------------------------------------------------------------------
// Undo
//
// Two acts, deliberately not one, on the same reasoning as the agreement
// module:
//
//   DELETE  raised by mistake and never acted on. Nothing references it,
//           so removing it leaves no hole.
//   CANCEL  the customer or the supplier has the PDF. Making our record
//           vanish does not unsend it — it just means nobody here can
//           explain the number when it is quoted back.
//
// A PO has no `sent` state of its own yet, so the cut is at whether it
// has been downloaded... which we cannot know. Both are therefore offered
// and the caller chooses; cancel is the safe one and is what the UI
// should lead with.
// ---------------------------------------------------------------------

export async function deletePo(row: PoRow): Promise<void> {
  await deletePoDoc(row.erp_name);
  await query(`delete from quote_service.dealer_po_ref where id = $1`, [row.id]);
}

export async function cancelPo(row: PoRow, reason: string): Promise<PoRow> {
  if (row.status === 'cancelled') return row;
  const { rows } = await query(
    `update quote_service.dealer_po_ref
        set status = 'cancelled', cancelled_at = now(),
            cancel_reason = $2, updated_at = now()
      where id = $1 returning ${ROW_COLS}`, [row.id, reason || null]);
  // Best effort, and after the local write: ERPNext showing 'Generated'
  // while we show 'cancelled' is cosmetic. The reverse is not.
  await updatePoDoc(row.erp_name, { po_status: 'Cancelled' }).catch(() => {});
  return rows[0] as PoRow;
}

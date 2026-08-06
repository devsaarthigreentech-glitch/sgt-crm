// =====================================================================
// domain/poPricing.ts — the totals on a negotiated PO.
//
// This module exists because of one fact about the setup, and it is worth
// stating plainly: `SGT Dealer PO` is a PLAIN CUSTOM DOCTYPE WITH NO
// CONTROLLER. ERPNext computes nothing for it. It stores what we send.
//
// That was fine while every figure was copied from the quotation — the
// arithmetic had already been done by ERPNext on a real Quotation. The
// moment a price is negotiated at PO time, the sums are ours: line
// amount, net total, every tax row, grand total, rounded total.
//
// Owning tax arithmetic is exactly what erp_create_dealer_po_doctype.ts
// set out to avoid ("two implementations of that is how a document ends
// up disagreeing with the quotation it came from"). So this module is
// deliberately narrow, and REFUSES rather than guesses:
//
//   · it recomputes ONLY when the caller actually changed something.
//     An unedited PO still copies the quotation's figures verbatim.
//   · it handles ONLY `charge_type: "On Net Total"` percentage rows,
//     which is what every GreenX tax template uses. Anything else —
//     an Actual amount, On Previous Row, cess — is refused with a
//     reason, and the caller is told to revise the quotation instead.
//
// A refusal is a worse user experience than a wrong number, and a much
// better outcome: wrong GST on a document a customer acts on is not
// recoverable by apologising.
//
// `in_words` is NOT computed here. The print format already falls back to
// frappe.utils.money_in_words(rounded_total, doc.currency) when the field
// is blank, so Frappe does it and there is no second implementation to
// drift. See the totals block in erp_create_dealer_po_doctype.ts.
// =====================================================================

/** Round to paise. Every figure that reaches a document goes through this. */
export const money = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** One priced line, after the negotiation has been applied. */
export interface PricedLine {
  /** MRP. What the "Price List Rate" column prints, discounted or not. */
  listRate: number;
  /** PER UNIT, off the list rate. Prints in "Discount Amount Per Unit". */
  discountPerUnit: number;
  qty: number;
  /** listRate − discountPerUnit. */
  rate: number;
  /** rate × qty. */
  amount: number;
}

export function priceLine(listRate: number, discountPerUnit: number, qty: number): PricedLine {
  const list = money(listRate);
  const disc = money(discountPerUnit);
  const rate = money(Math.max(0, list - disc));
  return { listRate: list, discountPerUnit: disc, qty, rate, amount: money(rate * qty) };
}

/**
 * A tax row as the quotation defines it — the RULE, not the amount.
 *
 * charge_type and rate come off the source quotation, which is the only
 * place that knows how this customer is taxed. tax_amount is recomputed;
 * everything else is carried so the printed row still reads the same.
 */
export interface TaxRule {
  description: string | null;
  account_head?: string | null;
  charge_type?: string | null;
  rate: number;
}

export const ON_NET_TOTAL = 'On Net Total';

/**
 * Can these tax rules be recomputed against a new net total?
 *
 * Returns the reason it cannot, or null when it can. A row with no
 * charge_type at all is treated as unusable rather than assumed to be a
 * percentage: an absent field is not evidence.
 */
export function taxRecomputeBlocker(rules: TaxRule[]): string | null {
  if (!rules.length) return null;
  const odd = rules.filter(r => String(r.charge_type ?? '') !== ON_NET_TOTAL);
  if (!odd.length) return null;
  const names = odd
    .map(r => `${r.description ?? r.account_head ?? 'a tax row'} (${r.charge_type || 'no charge type'})`)
    .join(', ');
  return (
    `This quotation's tax is not a straight percentage of the net total — ${names}. ` +
    `Prices cannot be renegotiated on the PO without recomputing that tax, and this ` +
    `will not guess at it. Revise the quotation in ERPNext instead, which recalculates ` +
    `properly, then raise the PO from the revised figures.`
  );
}

export interface PoTotals {
  /** Sum of the line amounts. The printed Sub Total. */
  total: number;
  /** Equal to `total` — no document-level discount is applied at PO time. */
  netTotal: number;
  taxes: Array<TaxRule & { tax_amount: number }>;
  totalTaxes: number;
  grandTotal: number;
  roundedTotal: number;
}

/**
 * Totals for a set of priced lines under a set of tax rules.
 *
 * Each tax is computed against the NET TOTAL rather than accumulated row
 * by row, which is what `On Net Total` means and is why only that charge
 * type is accepted. CGST and SGST at 9% each therefore both take 9% of
 * the same base, exactly as ERPNext does it.
 *
 * `rounded_total` rounds to the nearest rupee, matching ERPNext's default
 * for INR. A site that has disabled rounding will see the two agree
 * anyway, because grand and rounded are then equal.
 */
export function computeTotals(lines: PricedLine[], rules: TaxRule[]): PoTotals {
  const total = money(lines.reduce((s, l) => s + l.amount, 0));
  const taxes = rules.map(r => ({ ...r, tax_amount: money(total * (Number(r.rate) || 0) / 100) }));
  const totalTaxes = money(taxes.reduce((s, t) => s + t.tax_amount, 0));
  const grandTotal = money(total + totalTaxes);
  return {
    total,
    netTotal: total,
    taxes,
    totalTaxes,
    grandTotal,
    roundedTotal: Math.round(grandTotal),
  };
}

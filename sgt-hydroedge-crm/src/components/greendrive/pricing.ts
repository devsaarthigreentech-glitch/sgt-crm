// GreenDrive rate card — TENTATIVE, owner's figures of 2026-10-07.
//
// Held in the frontend only while GreenDrive is a preview: nothing here is
// stored and no quotation is raised from it. When GreenDrive goes live these
// move into the price book and ERPNext Item Price, as GreenX's did, and this
// file stops being the source of any number.
//
// GreenDrive is priced the OPPOSITE way to GreenX. A GreenX partner may only
// discount off MRP; a GreenDrive dealer who takes on sales, installation and
// support may MARK UP to MRP + 40%. SGT invoices the customer at the quoted
// price (SGT-direct, same as GreenX) and the dealer earns a base margin on
// MRP plus the whole markup.

export type GdModel = 'One' | 'Neo' | 'Pro'
export type GdCurrency = 'INR' | 'USD'

export const GD_MODELS: { code: GdModel; label: string; inr: number; usd: number }[] = [
  { code: 'One', label: 'GreenDrive One', inr: 104000, usd: 1337 },
  { code: 'Neo', label: 'GreenDrive Neo', inr: 121000, usd: 1558 },
  { code: 'Pro', label: 'GreenDrive Pro', inr: 181000, usd: 2326 },
]

/** The owner's reference rate. The USD list prices are set in their own right, not converted. */
export const USD_INR = 95

/** Maximum markup over MRP. Owner's figure for a dealer; applied to everyone until told otherwise. */
export const MAX_MARKUP_PCT = 40

/**
 * Dealer's base margin as a % of MRP, earned on every sale before markup.
 * NOT YET GIVEN by the owner — null shows "to be confirmed" on screen.
 */
export const BASE_MARGIN_PCT: number | null = null

/** ASSUMED 18%, same as GreenX. HSN not yet given. */
export const GD_GST_PCT = 18

export const money = (v: number, cur: GdCurrency) =>
  cur === 'USD'
    ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 })

export const listPrice = (m: GdModel, cur: GdCurrency) => {
  const row = GD_MODELS.find(x => x.code === m)!
  return cur === 'USD' ? row.usd : row.inr
}

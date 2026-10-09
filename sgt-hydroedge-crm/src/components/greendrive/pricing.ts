// GreenDrive rate card — owner's figures, finalised 2026-10-09.
//
// Held in the frontend only while GreenDrive is a preview: nothing here is
// stored and no quotation is raised from it. When GreenDrive goes live these
// move into the price book and ERPNext Item Price, as GreenX's did, and this
// file stops being the source of any number.
//
// The listed price IS the customer price. It already includes the dealer's
// 30% markup — nothing is added on top (an earlier reading of "MRP + 40%"
// was withdrawn by the owner). SGT invoices the customer at this price
// (SGT-direct, same as GreenX) and settles the dealer's share afterwards:
//
//   SGT's price   = price / 1.30        e.g. ₹1,04,000 / 1.3 = ₹80,000
//   dealer earns  = price − SGT's price e.g. ₹24,000
//
// ASSUMPTION: "including 30%" is read as 30% markup ON SGT's price. If it
// means 30% OF the customer price instead, the dealer share is price × 0.30
// (₹31,200 on One) — change dealerShare() below, nothing else.

export type GdModel = 'One' | 'Neo' | 'Pro'
export type GdCurrency = 'INR' | 'USD'

export const GD_MODELS: { code: GdModel; label: string; inr: number; usd: number }[] = [
  { code: 'One', label: 'GreenDrive One', inr: 104000, usd: 1337 },
  { code: 'Neo', label: 'GreenDrive Neo', inr: 121000, usd: 1558 },
  { code: 'Pro', label: 'GreenDrive Pro', inr: 181000, usd: 2326 },
]

/** The owner's reference rate. The USD list prices are set in their own right, not converted. */
export const USD_INR = 95

/** Dealer markup already included in the listed price. */
export const DEALER_MARKUP_PCT = 30

/** The dealer's share of a price that already includes their markup. */
export const dealerShare = (price: number) => price - price / (1 + DEALER_MARKUP_PCT / 100)

/** ASSUMED 18%, same as GreenX. HSN not yet given. */
export const GD_GST_PCT = 18

export const money = (v: number, cur: GdCurrency) =>
  cur === 'USD'
    ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 })

export const listPrice = (m: GdModel, cur: GdCurrency) => {
  const row = GD_MODELS.find(x => x.code === m)!
  return cur === 'USD' ? row.usd : row.inr
}

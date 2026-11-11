// GreenDrive rate card — owner's figures, finalised 2026-10-09.
//
// DISPLAY ONLY. The quotation is priced on the server, from ERPNext's Item
// Price with sgt-hydroedge-server/src/domain/greenDrive.ts as the fallback.
// These figures drive the on-screen estimate and the portal calculator;
// keep them equal to that file.
//
// The listed price IS the customer price. It already includes the dealer's
// markup on SGT's price — nothing is added on top. SGT invoices the
// customer at this price (SGT-direct, same as GreenX) and settles the
// dealer's share afterwards:
//
//   SGT's price   = price / 1.40        e.g. ₹1,04,000 / 1.4 = ₹74,286
//   dealer earns  = price − SGT's price e.g. ₹29,714
//
// 30% on top until 2026-10-10, when the owner raised it to 40% with the
// prices unchanged.

export type GdModel = 'One' | 'Neo' | 'Pro' | 'One-Packed' | 'Neo-Packed' | 'Pro-Packed'
export type GdCurrency = 'INR' | 'USD'

export const GD_MODELS: { code: GdModel; label: string; inr: number; usd: number; base?: GdModel }[] = [
  { code: 'One', label: 'GreenDrive One', inr: 104000, usd: 1337 },
  { code: 'Neo', label: 'GreenDrive Neo', inr: 121000, usd: 1558 },
  { code: 'Pro', label: 'GreenDrive Pro', inr: 181000, usd: 2326 },
  // Owner, 2026-11-11: each model also with Packing & Forwarding (7.5%)
  // built into the price. Their AMC is the ex-factory model's.
  { code: 'One-Packed', label: 'GreenDrive One incl. Packing & Forwarding', inr: 111800, usd: 1437.28, base: 'One' },
  { code: 'Neo-Packed', label: 'GreenDrive Neo incl. Packing & Forwarding', inr: 130075, usd: 1674.85, base: 'Neo' },
  { code: 'Pro-Packed', label: 'GreenDrive Pro incl. Packing & Forwarding', inr: 194575, usd: 2500.45, base: 'Pro' },
]

/** The ex-factory price a model's AMC is worked out from. */
export const amcBasePrice = (m: GdModel, cur: GdCurrency) => {
  const row = GD_MODELS.find(x => x.code === m)!
  const base = row.base ? GD_MODELS.find(x => x.code === row.base)! : row
  return cur === 'USD' ? base.usd : base.inr
}

/** The owner's reference rate. The USD list prices are set in their own right, not converted. */
export const USD_INR = 95

/** Dealer markup already included in the listed price. */
export const DEALER_MARKUP_PCT = 40

/** The dealer's share of a price that already includes their markup. */
export const dealerShare = (price: number) => price - price / (1 + DEALER_MARKUP_PCT / 100)

/** AMC per year, as a % of the machine price. Same 15% as GreenX (2026-10-12). */
export const GD_AMC_PCT = 15
export const GD_AMC_TERMS = [1, 2, 3] as const

/** One machine's AMC for `years`, rounded per year as the ERPNext items are. */
export const amcPrice = (price: number, years: number) => Math.round(price * GD_AMC_PCT / 100) * years

/** 18%, same as GreenX. HSN 85433000. */
export const GD_GST_PCT = 18

/**
 * Maximum discount on a machine line, % of list (owner, 2026-11-11).
 * Mirrors the server's GD_DISCOUNT_CAPS, which is what actually enforces it.
 */
export const GD_DISCOUNT_CAPS = { distributor: 40, dealer: 35, staff: 40 } as const
export const gdCapFor = (orgType?: string | null) =>
  orgType === 'dealer' || orgType === 'sub_dealer' ? GD_DISCOUNT_CAPS.dealer
    : orgType === 'distributor' ? GD_DISCOUNT_CAPS.distributor
    : GD_DISCOUNT_CAPS.staff

/** Optional fixed installation charge per quotation, India only. Server: GD_INSTALL_INR. */
export const GD_INSTALL_INR = 7450

export const money = (v: number, cur: GdCurrency) =>
  cur === 'USD'
    ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 })

export const listPrice = (m: GdModel, cur: GdCurrency) => {
  const row = GD_MODELS.find(x => x.code === m)!
  return cur === 'USD' ? row.usd : row.inr
}

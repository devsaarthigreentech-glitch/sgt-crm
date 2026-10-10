// =====================================================================
// domain/greenDrive.ts — the GreenDrive catalogue and how a line prices.
//
// GreenDrive is not GreenX with different numbers. Owner's decisions:
//
//   - Fixed models (One / Neo / Pro), chosen by name. No kVA, so none of
//     quotePricing.ts's ceiling match applies.
//   - The listed price IS the customer price and already includes the
//     dealer's markup ON SGT's price. 30% on 2026-10-09, raised to 40% on
//     2026-10-10 with the prices unchanged: ₹1,04,000 = ₹74,286 SGT +
//     ₹29,714 dealer. There is no discount and no markup to enter, and
//     none is accepted.
//   - Raised by SGT staff (SGT-direct, or on behalf of a GreenDrive
//     partner) and by GreenDrive partners on the portal (2026-10-10).
//     A GreenX partner can never raise one, nor the reverse.
//   - Terms are a copy of the GreenX dealer quotation terms, pushed to
//     ERPNext under their own name so they can diverge later.
//   - HSN 85433000, same as GreenX.
//
// ERPNext owns the rate, exactly as for GreenX: Item Price is read at
// quote time and the catalogue figure below is only the fallback, so a
// price change made in ERPNext is what the customer sees.
// =====================================================================

export const GREENDRIVE = 'GreenDrive' as const

export type GdModel = 'One' | 'Neo' | 'Pro'

export interface GdCatalogueRow {
  model: GdModel
  itemCode: string
  label: string
  /** India price, ex-GST. Includes the dealer's markup. */
  inr: number
  /** Export list price. Not yet quotable — no USD setup in ERPNext. */
  usd: number
}

export const GD_CATALOGUE: GdCatalogueRow[] = [
  { model: 'One', itemCode: 'GreenDrive-One', label: 'GreenDrive One', inr: 104000, usd: 1337 },
  { model: 'Neo', itemCode: 'GreenDrive-Neo', label: 'GreenDrive Neo', inr: 121000, usd: 1558 },
  { model: 'Pro', itemCode: 'GreenDrive-Pro', label: 'GreenDrive Pro', inr: 181000, usd: 2326 },
]

export const GD_HSN = process.env.ERP_GREENDRIVE_HSN ?? '85433000'

export const GREENDRIVE_TERMS =
  process.env.ERP_GREENDRIVE_TERMS ?? 'GreenDrive Dealer Quotation Terms'

/** Dealer markup included in the price, on top of SGT's price. Owner, 2026-10-10. */
export const GD_DEALER_MARKUP_PCT = 40

/**
 * The partner's share as a percentage of the price they sell at:
 * 40 / 140 = 28.57%. This — not 40 — is the commission rate a GreenDrive
 * quotation carries, because ERPNext computes commission on the net total.
 */
export const GD_DEALER_SHARE_OF_PRICE_PCT =
  Math.round((GD_DEALER_MARKUP_PCT / (100 + GD_DEALER_MARKUP_PCT)) * 10000) / 100

export function gdRow(model: unknown): GdCatalogueRow | null {
  const m = String(model ?? '').trim().toLowerCase()
  return GD_CATALOGUE.find(r => r.model.toLowerCase() === m) ?? null
}

/** Fetches the ERPNext Item Price for a code. Never throws — returns null. */
type RateLookup = (itemCode: string) => Promise<string | null>

export interface GdResolved {
  row: GdCatalogueRow
  rate: string
  rateSource: 'erpnext' | 'catalogue'
}

/** The rate a line will carry: ERPNext's Item Price, else the catalogue. */
export async function resolveGreenDrive(row: GdCatalogueRow, erpRate?: RateLookup): Promise<GdResolved> {
  if (erpRate) {
    try {
      const r = await erpRate(row.itemCode)
      if (r !== null) return { row, rate: r, rateSource: 'erpnext' }
    } catch { /* fall through to the catalogue */ }
  }
  return { row, rate: String(row.inr), rateSource: 'catalogue' }
}

/** The two partner networks. Absent or unknown means GreenX. */
export type ProductLine = 'GreenX' | 'GreenDrive'

export function asProductLine(v: unknown): ProductLine {
  return v === 'GreenDrive' ? 'GreenDrive' : 'GreenX'
}

/** The product segment of a partner code: EDIN{GX|GD}001. */
export function productCodeFor(line: ProductLine): 'GX' | 'GD' {
  return line === 'GreenDrive' ? 'GD' : 'GX'
}

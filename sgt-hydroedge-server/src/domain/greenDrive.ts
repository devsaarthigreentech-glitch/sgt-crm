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

export type GdModel = 'One' | 'Neo' | 'Pro' | 'One-Packed' | 'Neo-Packed' | 'Pro-Packed'

export interface GdCatalogueRow {
  model: GdModel
  itemCode: string
  label: string
  /** India price, ex-GST. Includes the dealer's markup. */
  inr: number
  /** Export list price, USD. */
  usd: number
  /**
   * Set on a "packed" row: the ex-factory model it is built on. Its AMC is
   * that model's AMC — 15% of the EX-FACTORY price, not of the packed one.
   */
  base?: GdModel
}

export const GD_CATALOGUE: GdCatalogueRow[] = [
  { model: 'One', itemCode: 'GreenDrive-One', label: 'GreenDrive One', inr: 104000, usd: 1337 },
  { model: 'Neo', itemCode: 'GreenDrive-Neo', label: 'GreenDrive Neo', inr: 121000, usd: 1558 },
  { model: 'Pro', itemCode: 'GreenDrive-Pro', label: 'GreenDrive Pro', inr: 181000, usd: 2326 },
  // Owner, 2026-11-11: each model also comes with Packing & Forwarding
  // built into the price (+GD_PF_PCT, 7.5%), as an item of its own. This
  // replaced the optional P&F tick. Machine HSN, and it carries the
  // partner's commission like any machine price.
  ...(['One', 'Neo', 'Pro'] as const).map(m => {
    const b = { One: [104000, 1337], Neo: [121000, 1558], Pro: [181000, 2326] }[m]
    return {
      model: `${m}-Packed` as GdModel,
      itemCode: `GreenDrive-${m}-Packed`,
      label: `GreenDrive ${m} incl. Packing & Forwarding`,
      inr: Math.round(b[0] * (100 + 7.5) / 100),
      usd: Math.round(b[1] * (100 + 7.5)) / 100,
      base: m,
    }
  }),
]

/** The row whose AMC a line uses: the ex-factory model for a packed row. */
export function gdAmcRow(row: GdCatalogueRow): GdCatalogueRow {
  return row.base ? GD_CATALOGUE.find(r => r.model === row.base)! : row
}

export const GD_HSN = process.env.ERP_GREENDRIVE_HSN ?? '85433000'

export const GREENDRIVE_TERMS =
  process.env.ERP_GREENDRIVE_TERMS ?? 'GreenDrive Dealer Quotation Terms'

/**
 * Export (USD) quotations use their OWN template, edited in ERPNext like
 * the domestic one (owner, 2026-10-25). Seeded once from the domestic
 * template by erp_create_export_terms.ts.
 */
export const GREENDRIVE_EXPORT_TERMS =
  process.env.ERP_GREENDRIVE_EXPORT_TERMS ?? 'GreenDrive Export Quotation Terms'

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

/**
 * Packing & Forwarding, 7.5% (owner, 2026-11-11). No longer a separate
 * optional line: it is built into the three "-Packed" catalogue rows above.
 * The separate Packing-Forwarding ERPNext item (SAC 998540, no commission)
 * from the brief "tick to add" version still exists but is no longer quoted;
 * GD_PF_ITEM and gdPackingForwarding() remain only for the item script.
 */
export const GD_PF_ITEM = process.env.ERP_PF_ITEM ?? 'Packing-Forwarding'
export const GD_PF_PCT = 7.5

/** P&F on a machine value: whole rupees, or cents for a USD quote. */
export function gdPackingForwarding(machineValue: number, usd: boolean): number {
  const raw = machineValue * GD_PF_PCT / 100
  return usd ? Math.round(raw * 100) / 100 : Math.round(raw)
}

/**
 * Installation — optional on a GreenDrive sale quotation (owner,
 * 2026-11-11): a FIXED ₹7,450 + GST per quotation (₹7,000 the same day —
 * the owner wanted a figure that reads as calculated), one line, only when ticked.
 * India quotes only (an export ships FOB; nobody from SGT installs it).
 * Its ERPNext item has grant_commission = 0, so no dealer markup on it.
 * Created by src/db/erp_create_pf_item.ts alongside the P&F item.
 */
export const GD_INSTALL_ITEM = process.env.ERP_INSTALL_ITEM ?? 'Installation-Charges'
export const GD_INSTALL_INR = Number(process.env.GD_INSTALL_INR ?? '7450')

/**
 * Discount on a GreenDrive machine line (owner, 2026-11-11): up to 40% for
 * a distributor, 35% for a dealer, as a percentage of the LIST price.
 * SGT staff quoting directly get the distributor's 40 — ASSUMED, the owner
 * named only the two partner caps. Override with GD_MAX_DISCOUNT_*.
 *
 * Who pays: ERPNext computes the partner's commission (28.57%) on the
 * discounted net, so a discount is shared between SGT and the partner in
 * proportion — exactly as for GreenX (domain/quoteDiscount.ts). Note this
 * goes far deeper than the partner's own share: at 40% off, a ₹1,04,000
 * One sells for ₹62,400, the partner earns ₹17,829 and SGT keeps ₹44,571
 * against its normal ₹74,286. Not on the AMC, P&F base aside.
 */
const capNum = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback
}
export const GD_DISCOUNT_CAPS = {
  distributor: capNum(process.env.GD_MAX_DISCOUNT_DISTRIBUTOR, 40),
  dealer: capNum(process.env.GD_MAX_DISCOUNT_DEALER, 35),
  staff: capNum(process.env.GD_MAX_DISCOUNT_STAFF, 40),
} as const

export type GdActor = keyof typeof GD_DISCOUNT_CAPS

export function gdActorFor(orgType?: string | null): GdActor {
  if (orgType === 'dealer' || orgType === 'sub_dealer') return 'dealer'
  if (orgType === 'distributor') return 'distributor'
  return 'staff'
}

/** Validate one line's discount percentage against the caller's cap. */
export function checkGdDiscount(raw: unknown, actor: GdActor):
  { ok: true; pct: number } | { ok: false; message: string } {
  if (raw === null || raw === undefined || raw === '') return { ok: true, pct: 0 }
  const pct = Number(raw)
  if (!Number.isFinite(pct) || pct < 0) return { ok: false, message: 'Discount must be a number of 0 or more' }
  const max = GD_DISCOUNT_CAPS[actor]
  if (pct > max) {
    return { ok: false, message:
      `Maximum GreenDrive discount for ${actor === 'staff' ? 'SGT' : `a ${actor}`} is ${max}%.` }
  }
  return { ok: true, pct: Math.round(pct * 100) / 100 }
}

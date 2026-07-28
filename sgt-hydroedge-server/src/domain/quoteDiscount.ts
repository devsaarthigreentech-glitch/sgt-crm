// =====================================================================
// domain/quoteDiscount.ts — how much may this caller discount, and AMC.
//
// One place for both, because both are commercial policy rather than
// mechanics, and both are enforced server-side. A cap that only exists in
// a dropdown is not a cap.
//
// ── The caps ────────────────────────────────────────────────────────
// The rate card gives partners a 40.48% margin on MRP. Discount authority
// is conventionally set so a partner can close a deal without eroding
// that margin to nothing, and so the deeper the discount the higher the
// approval needed. Working from your own numbers:
//
//   dealer       7%   — the owner's figure. Leaves ~36% margin.
//   distributor 12%   — more authority than the dealer they appoint,
//                       which is the usual shape: the tier that carries
//                       the relationship and the risk gets more room.
//   SGT staff   20%   — beyond that it stops being a discount and
//                       becomes a pricing decision, which belongs to a
//                       director, not a quotation screen.
//
// These are defaults, not laws — override per deployment with
// QUOTE_MAX_DISCOUNT_DEALER / _DISTRIBUTOR / _STAFF.
//
// ── Who actually pays for a discount ────────────────────────────────
// Worth being explicit, because it is easy to get wrong by accident.
// ERPNext computes commission on the NET total, so a 7% discount reduces
// the customer's price by 7% AND the partner's commission by 7%. The cost
// is therefore SHARED between SGT and the partner in proportion to the
// split — SGT does not absorb it alone, and neither does the partner.
//
// If the intent is that the partner bears the whole discount, commission
// would have to be computed on the UNDISCOUNTED total instead. That is a
// commercial decision, not a technical one, and it is flagged rather than
// assumed.
// =====================================================================

export type DiscountActor = 'dealer' | 'distributor' | 'staff';

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback;
};

export const DISCOUNT_CAPS: Record<DiscountActor, number> = {
  dealer: num(process.env.QUOTE_MAX_DISCOUNT_DEALER, 7),
  distributor: num(process.env.QUOTE_MAX_DISCOUNT_DISTRIBUTOR, 12),
  staff: num(process.env.QUOTE_MAX_DISCOUNT_STAFF, 20),
};

/** Which cap applies, from the org type raising the quote. */
export function actorFor(orgType?: string | null): DiscountActor {
  if (orgType === 'dealer' || orgType === 'sub_dealer') return 'dealer';
  if (orgType === 'distributor') return 'distributor';
  return 'staff';
}

export interface DiscountCheck {
  ok: boolean;
  pct: number;
  max: number;
  message?: string;
}

export function checkDiscount(raw: unknown, actor: DiscountActor): DiscountCheck {
  const max = DISCOUNT_CAPS[actor];
  if (raw === null || raw === undefined || raw === '') return { ok: true, pct: 0, max };

  const pct = Number(raw);
  if (!Number.isFinite(pct)) {
    return { ok: false, pct: 0, max, message: 'Discount must be a number' };
  }
  if (pct < 0) {
    return { ok: false, pct, max, message: 'Discount cannot be negative' };
  }
  if (pct > max) {
    return {
      ok: false, pct, max,
      message: `Maximum discount for a ${actor === 'staff' ? 'SGT user' : actor} is ${max}%. ` +
               `Ask SGT to approve anything deeper.`,
    };
  }
  // Two decimals is as fine as any tax authority needs.
  return { ok: true, pct: Math.round(pct * 100) / 100, max };
}

// ── AMC ──────────────────────────────────────────────────────────────
// The price list puts AMC at 10% of sale price per year, starting after
// the standard warranty. Quoted as its own line so the customer sees what
// they are buying, and so it can be dropped without touching the machine.

export const AMC_PCT = num(process.env.QUOTE_AMC_PCT, 10);
export const AMC_ITEM = process.env.ERP_AMC_ITEM ?? 'GreenX-AMC';

/**
 * AMC rate for one year against a unit price. Rounded to whole rupees:
 * a fraction of a paisa on a service line helps nobody.
 */
export function amcRate(unitRate: string | number, years = 1): number {
  const base = Number(unitRate);
  if (!Number.isFinite(base) || base <= 0) return 0;
  return Math.round((base * AMC_PCT / 100) * Math.max(1, years));
}

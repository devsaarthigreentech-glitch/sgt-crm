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
//   dealer      12%   — raised from 7% by the owner, 2026-08-05. Leaves
//                       ~32% margin on the 40.48% rate card.
//   distributor 12%   — was set above the dealer on the reasoning that
//                       the tier carrying the relationship gets more
//                       room. The dealer raise has levelled the two, so
//                       that distinction no longer holds. Left at 12
//                       rather than moved: raising the distributor is a
//                       separate commercial decision, and the caps are
//                       still enforced separately, so lifting it later
//                       is a one-line change here.
//   SGT staff   20%   — beyond that it stops being a discount and
//                       becomes a pricing decision, which belongs to a
//                       director, not a quotation screen.
//
// These are defaults, not laws — override per deployment with
// QUOTE_MAX_DISCOUNT_DEALER / _DISTRIBUTOR / _STAFF.
//
// ── Who actually pays for a discount ────────────────────────────────
// Worth being explicit, because it is easy to get wrong by accident.
// ERPNext computes commission on the NET total, so a 12% discount reduces
// the customer's price by 12% AND the partner's commission by 12%. The cost
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
  dealer: num(process.env.QUOTE_MAX_DISCOUNT_DEALER, 12),
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

// ── Discount as an amount ────────────────────────────────────────────
// The owner may prefer to say "knock off ₹20,000" rather than "give 4%".
// Both are accepted, but the CAP is always expressed as a percentage,
// because that is what protects the margin. So an amount is converted to
// its effective percentage of the machine line and checked the same way —
// otherwise "₹2,00,000 off" would sail past a 12% limit.

export interface AmountCheck extends DiscountCheck {
  /** The rupee figure to put on the line. */
  amount: number;
}

export function checkDiscountAmount(
  raw: unknown, lineTotal: number, actor: DiscountActor,
): AmountCheck {
  const max = DISCOUNT_CAPS[actor];
  if (raw === null || raw === undefined || raw === '') {
    return { ok: true, pct: 0, max, amount: 0 };
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount)) {
    return { ok: false, pct: 0, max, amount: 0, message: 'Discount must be a number' };
  }
  if (amount < 0) {
    return { ok: false, pct: 0, max, amount, message: 'Discount cannot be negative' };
  }
  if (!Number.isFinite(lineTotal) || lineTotal <= 0) {
    return { ok: false, pct: 0, max, amount, message: 'No line value to discount against' };
  }
  if (amount > lineTotal) {
    return {
      ok: false, pct: 100, max, amount,
      message: 'Discount cannot exceed the value of the item',
    };
  }
  const pct = Math.round((amount / lineTotal) * 10000) / 100;
  if (pct > max) {
    return {
      ok: false, pct, max, amount,
      message: `₹${Math.round(amount).toLocaleString('en-IN')} is ${pct}% of this line, ` +
               `over the ${max}% limit. The most you can give is ` +
               `₹${Math.round(lineTotal * max / 100).toLocaleString('en-IN')}.`,
    };
  }
  return { ok: true, pct, max, amount: Math.round(amount * 100) / 100 };
}

// ── AMC ──────────────────────────────────────────────────────────────
// One priced item per model per term, so the printed line shows a list
// rate equal to the charge instead of a phantom discount off zero. The
// code is built in exactly one place; the rate comes from ERPNext.

export const AMC_PCT = num(process.env.QUOTE_AMC_PCT, 10);
export const AMC_TERMS = [1, 2, 3];

/** e.g. GreenX-100 + 2 -> "GreenX-100-AMC-2Y". */
export function amcItemCode(modelCode: string, years: number): string {
  return `${modelCode}-AMC-${years}Y`;
}

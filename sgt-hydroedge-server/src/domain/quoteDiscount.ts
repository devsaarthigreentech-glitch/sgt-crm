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
//   dealer      25%   — the owner's figure. 7% until 2026-08-05, then 12%,
//                       then 25% on 2026-08-06. Leaves ~15 points of the
//                       40.48% the rate card gives them.
//   distributor 12%   — NOT raised with the dealer, because only the
//                       dealer figure was given. Two consequences the
//                       owner should see rather than discover: a dealer
//                       may now discount MORE THAN TWICE what the
//                       distributor above them may, and more than SGT's
//                       own staff. Both are one line below.
//   SGT staff   20%   — now BELOW the dealer cap. It used to be the
//                       ceiling everyone else sat under.
//
// None of this is enforced as a hierarchy — the three caps are
// independent numbers, so an inversion produces no error anywhere. It is
// only visible by reading them together, which is why it is written down.
//
// These are defaults, not laws — override per deployment with
// QUOTE_MAX_DISCOUNT_DEALER / _DISTRIBUTOR / _STAFF.
//
// ── Two stages, two sets of caps ────────────────────────────────────
// A quotation is an OFFER and a PO is an AGREEMENT, and the owner wants
// more room at the second (2026-08-05): the price is negotiated after the
// quotation goes out, and a cap that made sense for an opening offer
// would block the deal it was meant to protect.
//
//   quote  dealer 12 · distributor 12 · staff 20
//   po     dealer 35 · distributor 35 · staff 40
//
// 35% is the owner's figure for a dealer raising a PO. Worth knowing what
// it costs: the rate card sets dealer net at MRP / 1.68, so the partner
// buys at 59.52% of MRP. A 35% discount sells at 65% of MRP and leaves
// about 5.5 points of margin. At 40.48% the partner is selling AT cost,
// and past that they are paying the customer to take the machine — which
// is why the staff cap stops at 40 and why no cap here should ever be set
// above 40.48 without someone deciding that deliberately.
//
// The discount is always measured against the LIST price, never against
// the already-discounted rate the quotation carried. "35% off" has to
// mean 35% off MRP or the cap compounds: 12% at quote plus 35% at PO
// would be 43% off, past cost, while every check still passed.
//
// Override with PO_MAX_DISCOUNT_DEALER / _DISTRIBUTOR / _STAFF.
//
// ── Who actually pays for a discount ────────────────────────────────
// Worth being explicit, because it is easy to get wrong by accident.
// ERPNext computes commission on the NET total, so a 25% discount reduces
// the customer's price by 25% AND the partner's commission by 25%. The cost
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

/**
 * Which document is being priced. Defaults to 'quote' everywhere, so
 * every existing call site keeps the behaviour it had.
 */
export type DiscountStage = 'quote' | 'po';

export const DISCOUNT_CAPS: Record<DiscountActor, number> = {
  dealer: num(process.env.QUOTE_MAX_DISCOUNT_DEALER, 25),
  distributor: num(process.env.QUOTE_MAX_DISCOUNT_DISTRIBUTOR, 12),
  staff: num(process.env.QUOTE_MAX_DISCOUNT_STAFF, 20),
};

/**
 * Caps for a negotiated PO. Dealer 35 is the owner's figure.
 *
 * Distributor is set to the same 35 and staff to 40 — ASSUMED, not
 * instructed. The reasoning: the quote caps already put distributor level
 * with dealer, and leaving staff at 20 would have made SGT's own people
 * the most restricted party on the document, which cannot be intended.
 * Both are one line to change.
 */
export const PO_DISCOUNT_CAPS: Record<DiscountActor, number> = {
  dealer: num(process.env.PO_MAX_DISCOUNT_DEALER, 35),
  distributor: num(process.env.PO_MAX_DISCOUNT_DISTRIBUTOR, 35),
  staff: num(process.env.PO_MAX_DISCOUNT_STAFF, 40),
};

/** The cap that applies to one actor at one stage. */
export function capFor(actor: DiscountActor, stage: DiscountStage = 'quote'): number {
  return (stage === 'po' ? PO_DISCOUNT_CAPS : DISCOUNT_CAPS)[actor];
}

/**
 * The margin the rate card leaves, as a percentage of MRP.
 *
 * dealer net = MRP / 1.68, so the partner buys at 59.52% of MRP and holds
 * 40.48 points. A discount equal to this sells at cost. Exported so the
 * screens can say how close a negotiation is to the floor instead of only
 * saying whether it passed.
 */
export const RATE_CARD_MARGIN_PCT = 40.48;

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

export function checkDiscount(
  raw: unknown, actor: DiscountActor, stage: DiscountStage = 'quote',
): DiscountCheck {
  const max = capFor(actor, stage);
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
      message: `Maximum discount for a ${actor === 'staff' ? 'SGT user' : actor} ` +
               `${stage === 'po' ? 'raising a PO' : 'quoting'} is ${max}%. ` +
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
// otherwise "₹2,00,000 off" would sail past a 25% limit.

export interface AmountCheck extends DiscountCheck {
  /** The rupee figure to put on the line. */
  amount: number;
}

export function checkDiscountAmount(
  raw: unknown, lineTotal: number, actor: DiscountActor, stage: DiscountStage = 'quote',
): AmountCheck {
  const max = capFor(actor, stage);
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

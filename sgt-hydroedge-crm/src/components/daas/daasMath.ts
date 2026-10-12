// DaaS figures for the on-screen preview.
//
// A COPY of sgt-hydroedge-server/src/domain/daas.ts daasFigures(), which
// is the one that prices the quotation — the server recomputes every
// figure from the MRP and ignores anything the screen calculated. Keep
// the two equal; the server wins if they ever disagree.
//
//   discount  up to 40% off MRP; upfront and instalment use the result
//   upfront   30% of the (discounted) price, per machine
//   rent      EMI on the other 70% at 12% a year (reducing balance)
//             + AMC at 15% of the full MRP a year (1.25% a month)

export const DAAS_DOWN_PCT = 30
export const DAAS_RATE_PCT = 12
export const DAAS_AMC_PCT = 15
export const DAAS_TENURES = [1, 2, 3] as const
export const DAAS_LOCK_IN_MONTHS = 3
export const DAAS_MAX_DISCOUNT_PCT = 40

export interface DaasFigures {
  mrp: number; discountPct: number; price: number; months: number
  upfront: number; financed: number; emi: number; amcMonthly: number; rent: number
  buyoutDefault: number; postAmcDefault: number
}

export function daasFigures(mrp: number, years: number, discountPct = 0): DaasFigures {
  const months = years * 12
  // The discount comes off MRP first; upfront and instalment are on what is left.
  const price = Math.round(mrp * (1 - discountPct / 100))
  const upfront = Math.round(price * DAAS_DOWN_PCT / 100)
  const financed = price - upfront
  const r = DAAS_RATE_PCT / 1200
  const emi = Math.round(financed * r / (1 - Math.pow(1 + r, -months)))
  const amcMonthly = Math.round(mrp * DAAS_AMC_PCT / 100 / 12)
  return {
    mrp, discountPct, price, months, upfront, financed, emi, amcMonthly,
    rent: emi + amcMonthly,
    buyoutDefault: upfront,
    postAmcDefault: Math.round(mrp * DAAS_AMC_PCT / 100),
  }
}

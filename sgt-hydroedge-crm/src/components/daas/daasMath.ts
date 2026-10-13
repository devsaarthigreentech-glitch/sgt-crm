// DaaS figures for the on-screen preview.
//
// A COPY of sgt-hydroedge-server/src/domain/daas.ts daasFigures(), which
// is the one that prices the quotation — the server recomputes every
// figure from the MRP and ignores anything the screen calculated. Keep
// the two equal; the server wins if they ever disagree.
//
//   discount  up to 40% off MRP; everything uses the price after it
//   upfront   30% of the price, per machine
//   rent      EMI on the other 70% at 12% a year (reducing balance)
//           + AMC: 15% of the price a year, FIRST YEAR FREE — the other
//             N−1 years spread evenly over all N×12 months, no interest.
//             ONE rent for the whole tenure.
//   continue  rent after the tenure is 35% below the tenure rent

export const DAAS_DOWN_PCT = 30
export const DAAS_RATE_PCT = 12
export const DAAS_AMC_PCT = 15
export const DAAS_CONTINUATION_CUT_PCT = 35
export const DAAS_TENURES = [1, 2, 3] as const
export const DAAS_LOCK_IN_MONTHS = 3
export const DAAS_MAX_DISCOUNT_PCT = 40

export interface DaasFigures {
  mrp: number; discountPct: number; price: number; years: number; months: number
  upfront: number; financed: number; emi: number
  amc: boolean; amcYearly: number; amcFullValue: number; amcCharged: number; amcMonthly: number
  rent: number; totalOverTenure: number
  buyoutDefault: number; postAmcDefault: number; continuationDefault: number
}

export function daasFigures(mrp: number, years: number, discountPct = 0, includeAmc = true): DaasFigures {
  const months = years * 12
  const price = Math.round(mrp * (1 - discountPct / 100))
  const upfront = Math.round(price * DAAS_DOWN_PCT / 100)
  const financed = price - upfront
  const r = DAAS_RATE_PCT / 1200
  const emi = Math.round(financed * r / (1 - Math.pow(1 + r, -months)))
  const amcYearly = Math.round(price * DAAS_AMC_PCT / 100)
  const amcCharged = includeAmc ? amcYearly * (years - 1) : 0
  const amcMonthly = Math.round(amcCharged / months)
  const rent = emi + amcMonthly
  return {
    mrp, discountPct, price, years, months, upfront, financed, emi,
    amc: includeAmc,
    amcYearly,
    amcFullValue: includeAmc ? amcYearly * years : amcYearly,
    amcCharged, amcMonthly, rent,
    totalOverTenure: upfront + rent * months,
    buyoutDefault: upfront,
    postAmcDefault: amcYearly,
    continuationDefault: Math.round(rent * (1 - DAAS_CONTINUATION_CUT_PCT / 100)),
  }
}

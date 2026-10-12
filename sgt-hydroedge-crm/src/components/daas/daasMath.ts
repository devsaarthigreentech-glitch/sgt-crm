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
//   AMC       first year included; from month 13, if opted, 15% of the
//             price a year is added to the rent
//   continue  rent after the tenure is 35% below the final-year rent

export const DAAS_DOWN_PCT = 30
export const DAAS_RATE_PCT = 12
export const DAAS_AMC_PCT = 15
export const DAAS_CONTINUATION_CUT_PCT = 35
export const DAAS_TENURES = [1, 2, 3] as const
export const DAAS_LOCK_IN_MONTHS = 3
export const DAAS_MAX_DISCOUNT_PCT = 40

export interface DaasFigures {
  mrp: number; discountPct: number; price: number; months: number
  upfront: number; financed: number; emi: number
  amc: boolean; amcMonthly: number; rentYear1: number; rentLater: number; totalOverTenure: number
  buyoutDefault: number; postAmcDefault: number; continuationDefault: number
}

export function daasFigures(mrp: number, years: number, discountPct = 0, amcFromYear2 = false): DaasFigures {
  const months = years * 12
  const price = Math.round(mrp * (1 - discountPct / 100))
  const upfront = Math.round(price * DAAS_DOWN_PCT / 100)
  const financed = price - upfront
  const r = DAAS_RATE_PCT / 1200
  const emi = Math.round(financed * r / (1 - Math.pow(1 + r, -months)))
  const amc = amcFromYear2 && months > 12
  const amcMonthly = amc ? Math.round(price * DAAS_AMC_PCT / 100 / 12) : 0
  const rentLater = emi + amcMonthly
  return {
    mrp, discountPct, price, months, upfront, financed, emi, amc, amcMonthly,
    rentYear1: emi,
    rentLater,
    totalOverTenure: upfront + emi * months + amcMonthly * Math.max(0, months - 12),
    buyoutDefault: upfront,
    postAmcDefault: Math.round(price * DAAS_AMC_PCT / 100),
    continuationDefault: Math.round(rentLater * (1 - DAAS_CONTINUATION_CUT_PCT / 100)),
  }
}

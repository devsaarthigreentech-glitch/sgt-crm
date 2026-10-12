// DaaS figures for the on-screen preview.
//
// A COPY of sgt-hydroedge-server/src/domain/daas.ts daasFigures(), which
// is the one that prices the quotation — the server recomputes every
// figure from the MRP and ignores anything the screen calculated. Keep
// the two equal; the server wins if they ever disagree.
//
//   upfront   30% of MRP, per machine
//   rent      EMI on the other 70% at 12% a year (reducing balance)
//             + AMC at 15% of MRP a year (1.25% a month)

export const DAAS_DOWN_PCT = 30
export const DAAS_RATE_PCT = 12
export const DAAS_AMC_PCT = 15
export const DAAS_TENURES = [1, 2, 3] as const
export const DAAS_LOCK_IN_MONTHS = 3

export interface DaasFigures {
  mrp: number; months: number
  upfront: number; financed: number; emi: number; amcMonthly: number; rent: number
  buyoutDefault: number; postAmcDefault: number
}

export function daasFigures(mrp: number, years: number): DaasFigures {
  const months = years * 12
  const upfront = Math.round(mrp * DAAS_DOWN_PCT / 100)
  const financed = mrp - upfront
  const r = DAAS_RATE_PCT / 1200
  const emi = Math.round(financed * r / (1 - Math.pow(1 + r, -months)))
  const amcMonthly = Math.round(mrp * DAAS_AMC_PCT / 100 / 12)
  return {
    mrp, months, upfront, financed, emi, amcMonthly,
    rent: emi + amcMonthly,
    buyoutDefault: upfront,
    postAmcDefault: Math.round(mrp * DAAS_AMC_PCT / 100),
  }
}

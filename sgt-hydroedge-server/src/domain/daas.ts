// =====================================================================
// domain/daas.ts — DaaS (rental) quotations: the maths and the terms.
//
// DaaS is a COMMERCIAL MODE, not a product line: GreenX and GreenDrive
// can each be sold outright or rented. Owner's rules (2026-10-12, AMC
// revised 2026-10-13):
//
//   discount  up to 40% off MRP per machine. Everything below is computed
//             on the PRICE after discount.
//   upfront   30% of the price, before installation. Not refunded on
//             termination — worded neutrally on the document.
//   rent      the other 70% repaid over 1, 2 or 3 years as a reducing-
//             balance EMI at 12% a year (1% a month).
//   AMC       15% of the price per year. The FIRST YEAR IS FREE, so a
//             tenure of N years charges N−1 years of AMC, and that amount
//             is spread EVENLY over all N×12 months — no interest on it —
//             and folded into the rent. ONE rent for the whole tenure; it
//             never steps up. Optional (on by default); without it the
//             rent is the instalment alone and AMC after year 1 is extra.
//   payment   rent due within the first 7 working days of each month.
//   after     buyout (default = the upfront) and post-buyout AMC (default
//             15% of the price a year) are typed per quotation. Continuing
//             to rent instead of buying out is 35% BELOW the tenure rent —
//             the default, overridable.
//   who       SGT staff only — SGT owns the equipment and bills monthly.
//
// The owner's own example: price ₹1,00,000, a year's AMC ₹15,000.
//   1 year   AMC free                       → +₹0 a month
//   2 years  ₹30,000 of AMC, ₹15,000 charged → +₹625 a month (÷24)
//   3 years  ₹45,000 of AMC, ₹30,000 charged → +₹833 a month (÷36)
//
// Worked example, GreenDrive One ₹1,04,000, no discount, 3 years, AMC:
//   upfront ₹31,200 · EMI ₹2,418 on ₹72,800 · AMC ₹31,200 ÷ 36 = ₹867
//   → rent ₹3,285 a month for all 36 months; continuation ₹2,135.
//
// The quotation PRINTS like the owner's proforma SAL-QTN-2026-00021: an
// "Upfront Payment" and a "Rent on DaaS Model" line per machine, and the
// total is the upfront plus the FIRST month's rent — rent is paid in
// advance from installation. That sample's own figures do not follow
// these rules; only its layout and wording are reused.
//
// The screen repeats this arithmetic for its live preview
// (sgt-hydroedge-crm/src/components/daas/daasMath.ts). This file is the
// one that prices the document.
// =====================================================================

import type { Clause } from './dealerTerms.js'

export const DAAS_DOWN_PCT = 30
export const DAAS_RATE_PCT = 12
export const DAAS_AMC_PCT = 15
/** How much below the tenure rent a continued rental is. Owner, 2026-10-12. */
export const DAAS_CONTINUATION_CUT_PCT = 35
export const DAAS_TENURES = [1, 2, 3] as const
export const DAAS_LOCK_IN_MONTHS = 3
/** Most a DaaS line may be discounted off MRP. Override with DAAS_MAX_DISCOUNT. */
export const DAAS_MAX_DISCOUNT_PCT = (() => {
  const n = Number(process.env.DAAS_MAX_DISCOUNT)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 40
})()

/** ERPNext items the two lines are raised on. Created by erp_create_daas_items.ts. */
export const DAAS_UPFRONT_ITEM = process.env.ERP_DAAS_UPFRONT_ITEM ?? 'DaaS-Upfront'
export const DAAS_RENT_ITEM = process.env.ERP_DAAS_RENT_ITEM ?? 'DaaS-Rent'
/** Rental of machinery — the SAC the owner's proforma carries. */
export const DAAS_SAC = process.env.ERP_DAAS_SAC ?? '997319'

export interface DaasFigures {
  mrp: number
  discountPct: number
  /** MRP less the discount — what every other figure is computed on. */
  price: number
  years: number
  months: number
  /** Per machine, whole rupees, ex-GST. */
  upfront: number
  financed: number
  emi: number
  /** True when AMC for the tenure is included. */
  amc: boolean
  /** One year of AMC: 15% of the price. */
  amcYearly: number
  /** What AMC would cost over the tenure, the free first year included. */
  amcFullValue: number
  /** What is actually charged: the tenure less the free first year. */
  amcCharged: number
  /** amcCharged spread over every month of the tenure. */
  amcMonthly: number
  /** emi + amcMonthly — the ONE monthly rent for the whole tenure. */
  rent: number
  /** Everything the customer pays over the tenure, upfront included. */
  totalOverTenure: number
  /** Defaults for the post-tenure clauses, per machine. */
  buyoutDefault: number
  postAmcDefault: number
  continuationDefault: number
}

/** One machine's DaaS figures. Pure; rounds to whole rupees. */
export function daasFigures(
  mrp: number, years: number, discountPct = 0, includeAmc = true,
): DaasFigures {
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

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** One machine line as the terms need it. */
export interface DaasTermsLine {
  label: string
  qty: number
  fig: DaasFigures
  buyout: number
  postAmc: number
  continuation: number
}

/**
 * "₹88,457 + GST per machine" when every line agrees, otherwise one
 * figure per model — a mixed quotation must not print one model's price
 * as if it applied to all.
 */
function perMachine(lines: DaasTermsLine[], pick: (l: DaasTermsLine) => number, unit: string): string {
  const vals = lines.map(pick)
  if (vals.every(v => v === vals[0])) return `${inr(vals[0])} + GST ${unit}`
  return lines.map(l => `${inr(pick(l))} + GST ${unit} for ${esc(l.label)}`).join('; ')
}

/** Points under one heading. clausesToHtml inserts the body as markup. */
const points = (items: string[]) => items.map(p => `<br>&bull;&nbsp;${p}`).join('')

/**
 * The DaaS terms, with this quotation's figures written in — the sections
 * of the owner's proforma, revised 2026-10-12/13. Built per quotation
 * because the figures ARE the terms.
 */
export function daasTerms(opts: {
  productLine: 'GreenX' | 'GreenDrive'
  customerName: string
  agreementDate: string | null
  lockInMonths: number
  lines: DaasTermsLine[]
}): Clause[] {
  const { lines } = opts
  const { months, years, amc } = lines[0].fig
  const sum = (pick: (f: DaasFigures) => number) => lines.reduce((s, l) => s + pick(l.fig) * l.qty, 0)
  const upfront = sum(f => f.upfront)
  const rent = sum(f => f.rent)
  const amcYearly = sum(f => f.amcYearly)
  const amcCharged = sum(f => f.amcCharged)
  const amcMonthly = sum(f => f.amcMonthly)
  const host = opts.productLine === 'GreenX' ? 'generator performance' : 'equipment performance'
  const lockIn = `${opts.lockInMonths} month${opts.lockInMonths === 1 ? '' : 's'}`
  const yrs = (n: number) => `${n} year${n === 1 ? '' : 's'}`

  // Point-wise and neutral, at the owner's request.
  const commercial = [
    `<strong>Upfront payment:</strong> ${inr(upfront)} + GST, payable against the Proforma Invoice ` +
      `before installation. This amount is adjusted towards the equipment and is not refunded on termination.`,
    `<strong>Monthly rental:</strong> ${inr(rent)} + GST per month, fixed for all ${months} months of the tenure.`,
  ]
  if (years === 1) {
    commercial.push(`<strong>Annual maintenance:</strong> AMC for the tenure is included free of charge ` +
      `(value ${inr(amcYearly)}).`)
  } else if (amc) {
    commercial.push(`<strong>Annual maintenance:</strong> AMC for the full ${yrs(years)} is included in the ` +
      `monthly rental. The first year's AMC (${inr(amcYearly)}) is free of charge; the AMC for the remaining ` +
      `${yrs(years - 1)}, ${inr(amcCharged)}, is spread evenly across the ${months} months at ${inr(amcMonthly)} ` +
      `per month, with no interest.`)
  } else {
    commercial.push(`<strong>Annual maintenance:</strong> AMC for the first year is included free of charge ` +
      `(value ${inr(amcYearly)}). AMC from the second year is not included; it can be added at ` +
      `${DAAS_AMC_PCT}% of the equipment price a year.`)
  }
  commercial.push(`<strong>Tenure:</strong> ${months} months from the date of installation.`)

  const serviceCover = years === 1 || amc
    ? `AMC for the tenure covers routine service and maintenance. `
    : `AMC for the first year covers routine service and maintenance; from the second year, service ` +
      `visits are charged at SGT's prevailing rates unless AMC has been added. `

  return [
    ['Governing Agreement',
     `These Terms &amp; Conditions are governed by and shall be read in conjunction with the DaaS Rental ` +
     `Agreement signed between SGT HydroEdge Private Limited and ${esc(opts.customerName)}` +
     (opts.agreementDate ? ` dated ${esc(opts.agreementDate)}.` : '.')],
    ['Commercial Structure', points(commercial)],
    ['Lock-in Period',
     `A minimum lock-in period of ${lockIn} shall be applicable from the date of installation. The customer ` +
     `shall not be permitted to cancel or return the product during this period. Notwithstanding the above, ` +
     `the customer may terminate during the lock-in period with 15 days' written notice if the system ` +
     `demonstrably and directly affects ${host} or core business operations, subject to the joint review ` +
     `and remedy process outlined in the Agreement.`],
    ['Rental Payment Terms',
     `Advance rental payments shall commence from the date of unit installation. The monthly rental shall be ` +
     `paid within the first 7 working days of each month.`],
    ['Return &amp; Cancellation Policy',
     `Upon completion of the lock-in period, either party may terminate by providing 30 days' written notice. ` +
     `Any termination claim on grounds of adverse system impact shall follow a structured process: written ` +
     `notification, joint review within 7 working days, and a 15-day remedy period for SGT HydroEdge. ` +
     `Termination shall be valid only where the adverse effect is substantiated through joint review and is ` +
     `directly attributable to the SGT system. Upon valid termination, equipment shall be removed by SGT ` +
     `HydroEdge within a mutually agreed timeframe; rental shall cease from the date of removal. The upfront ` +
     `payment, having been adjusted towards the equipment, is not refunded. Equipment must be returned in ` +
     `good working condition, subject to normal wear and tear.`],
    [`Buyout Option (Post ${months} Months)`,
     `Upon completion of ${months} months, the customer may opt to purchase the assets by paying ` +
     `${perMachine(lines, l => l.buyout, 'per machine')} towards asset transfer. Upon purchase, an Annual ` +
     `Maintenance Contract (AMC) fee of ${perMachine(lines, l => l.postAmc, 'per machine per annum')} shall ` +
     `be applicable.`],
    ['Rental Continuation Option',
     `Should the customer choose to continue the rental instead of the buyout, the rental from the ` +
     `${months + 1}${ordinal(months + 1)} month onwards shall be ` +
     `${perMachine(lines, l => l.continuation, 'per unit per month')} — ${DAAS_CONTINUATION_CUT_PCT}% below ` +
     `the monthly rental during the tenure.`],
    ['Ownership',
     `The equipment shall remain the property of SGT HydroEdge Pvt. Ltd. throughout the rental period unless ` +
     `purchased under the buyout option.`],
    ['Service &amp; Damage Handling',
     serviceCover +
     `In the event of accidental damage attributable to the customer, SGT HydroEdge Pvt. Ltd. shall undertake ` +
     `the necessary repairs, and the actual cost of repair shall be borne by the customer.`],
  ]
}

function ordinal(n: number): string {
  const t = n % 100
  if (t >= 11 && t <= 13) return 'th'
  return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
}

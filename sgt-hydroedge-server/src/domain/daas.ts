// =====================================================================
// domain/daas.ts — DaaS (rental) quotations: the maths and the terms.
//
// DaaS is a COMMERCIAL MODE, not a product line: GreenX and GreenDrive
// can each be sold outright or rented. Owner's rules, 2026-10-12:
//
//   discount  up to 40% off MRP per machine. Everything below is computed
//             on the PRICE after discount.
//   upfront   30% of the price, before installation. Not refunded on
//             termination — but worded neutrally on the document (owner:
//             "non-refundable upfront" read as too aggressive).
//   rent      the other 70% repaid over 1, 2 or 3 years as a reducing-
//             balance EMI at 12% a year (1% a month).
//   AMC       the FIRST YEAR is included in the price. From month 13, AMC
//             is OPTIONAL; if opted it adds 15% of the price a year to the
//             monthly rent (1.25% of the price a month). Not applicable to a
//             1-year tenure.
//   payment   rent due within the first 7 working days of each month.
//   after     buyout (default = the upfront) and post-buyout AMC (default
//             15% of the price a year) are typed per quotation. Continuing
//             to rent instead of buying out costs 35% LESS than the rent in
//             the last year of the tenure — the default, overridable.
//   who       SGT staff only — SGT owns the equipment and bills monthly.
//
// Worked example, GreenDrive One ₹1,04,000, no discount, 3 years, AMC opted:
//   upfront ₹31,200 · financed ₹72,800 · EMI ₹2,418
//   months 1–12 ₹2,418 · months 13–36 ₹2,418 + ₹1,300 AMC = ₹3,718
//   continuation ₹2,417 (35% below ₹3,718)
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
/** How much below the last tenure rent a continued rental is. Owner, 2026-10-12. */
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
  months: number
  /** Per machine, whole rupees, ex-GST. */
  upfront: number
  financed: number
  emi: number
  /** True when AMC from the second year was opted AND the tenure has one. */
  amc: boolean
  /** Added to the rent from month 13 when `amc`; otherwise 0. */
  amcMonthly: number
  /** Months 1–12. The first month is what the quotation bills. */
  rentYear1: number
  /** Month 13 onwards. Equals rentYear1 without AMC or on a 1-year tenure. */
  rentLater: number
  /** Everything the customer pays over the tenure, upfront included. */
  totalOverTenure: number
  /** Defaults for the post-tenure clauses, per machine. */
  buyoutDefault: number
  postAmcDefault: number
  continuationDefault: number
}

/** One machine's DaaS figures. Pure; rounds to whole rupees. */
export function daasFigures(
  mrp: number, years: number, discountPct = 0, amcFromYear2 = false,
): DaasFigures {
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
 * of the owner's proforma, revised 2026-10-12. Built per quotation because
 * the figures ARE the terms.
 */
export function daasTerms(opts: {
  productLine: 'GreenX' | 'GreenDrive'
  customerName: string
  agreementDate: string | null
  lockInMonths: number
  lines: DaasTermsLine[]
}): Clause[] {
  const { lines } = opts
  const months = lines[0].fig.months
  const sum = (pick: (f: DaasFigures) => number) => lines.reduce((s, l) => s + pick(l.fig) * l.qty, 0)
  const upfront = sum(f => f.upfront)
  const year1 = sum(f => f.rentYear1)
  const later = sum(f => f.rentLater)
  const amcMonthly = sum(f => f.amcMonthly)
  const amc = lines[0].fig.amc
  const host = opts.productLine === 'GreenX' ? 'generator performance' : 'equipment performance'
  const lockIn = `${opts.lockInMonths} month${opts.lockInMonths === 1 ? '' : 's'}`

  // Point-wise and neutral, at the owner's request.
  const commercial = [
    `<strong>Upfront payment:</strong> ${inr(upfront)} + GST, payable against the Proforma Invoice ` +
      `before installation. This amount is adjusted towards the equipment and is not refunded on termination.`,
    months > 12
      ? `<strong>Monthly rental:</strong> ${inr(year1)} + GST per month for months 1 to 12.`
      : `<strong>Monthly rental:</strong> ${inr(year1)} + GST per month for ${months} months.`,
    `<strong>Annual maintenance:</strong> AMC for the first year is included in the price.`,
  ]
  if (months > 12) {
    commercial.push(amc
      ? `<strong>AMC from the second year:</strong> opted. AMC of ${inr(amcMonthly)} per month (15% of the ` +
        `equipment price a year) is added from the 13th month, making the monthly rental ${inr(later)} + GST ` +
        `for months 13 to ${months}.`
      : `<strong>AMC from the second year:</strong> not included. It can be added at any time at 15% of the ` +
        `equipment price a year, charged with the monthly rental.`)
  }
  commercial.push(`<strong>Tenure:</strong> ${months} months from the date of installation.`)

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
     `the rental during the final year of the tenure.`],
    ['Ownership',
     `The equipment shall remain the property of SGT HydroEdge Pvt. Ltd. throughout the rental period unless ` +
     `purchased under the buyout option.`],
    ['Service &amp; Damage Handling',
     `AMC for the first year is included and covers routine service and maintenance` +
     (months > 12
       ? (amc ? `, continuing for the rest of the tenure as opted above. ` : `. From the second year, service ` +
          `is covered where AMC has been added; otherwise visits are charged at SGT's prevailing rates. `)
       : '. ') +
     `In the event of accidental damage attributable to the customer, SGT HydroEdge Pvt. Ltd. shall undertake ` +
     `the necessary repairs, and the actual cost of repair shall be borne by the customer.`],
  ]
}

function ordinal(n: number): string {
  const t = n % 100
  if (t >= 11 && t <= 13) return 'th'
  return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
}

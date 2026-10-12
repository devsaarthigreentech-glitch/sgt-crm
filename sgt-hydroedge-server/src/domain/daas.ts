// =====================================================================
// domain/daas.ts — DaaS (rental) quotations: the maths and the terms.
//
// DaaS is a COMMERCIAL MODE, not a product line: GreenX and GreenDrive
// can each be sold outright or rented. Owner's rules, 2026-10-12:
//
//   upfront   30% of MRP per machine, non-refundable, before installation
//   rent      the other 70% repaid over 1, 2 or 3 years as a reducing-
//             balance EMI at 12% a year (1% a month) ...
//           + AMC on top: 15% of MRP a year, i.e. 1.25% of MRP a month
//   after     buyout, post-buyout AMC and continuation rent are typed per
//             quotation; buyout defaults to 30% of MRP, AMC to 15%/year
//   who       SGT staff only — SGT owns the equipment and bills monthly
//
// Worked example, GreenDrive One ₹1,04,000 over 3 years:
//   upfront ₹31,200 · financed ₹72,800 · EMI ₹2,418 · AMC ₹1,300
//   → rent ₹3,718 a month for 36 months.
//
// The quotation PRINTS like the owner's proforma SAL-QTN-2026-00021: an
// "Upfront Payment" and a "Rent on DaaS Model" line per machine, and the
// total is the upfront plus the FIRST month's rent — rent is paid in
// advance from installation. That sample's own figures do not follow
// these rules (it was priced another way); only its layout and wording
// are reused.
//
// The screen repeats this arithmetic for its live preview
// (sgt-hydroedge-crm/src/components/greendrive/daas.ts). This file is the
// one that prices the document.
// =====================================================================

import type { Clause } from './dealerTerms.js'

export const DAAS_DOWN_PCT = 30
export const DAAS_RATE_PCT = 12
export const DAAS_AMC_PCT = 15
export const DAAS_TENURES = [1, 2, 3] as const
export const DAAS_LOCK_IN_MONTHS = 3

/** ERPNext items the two lines are raised on. Created by erp_create_daas_items.ts. */
export const DAAS_UPFRONT_ITEM = process.env.ERP_DAAS_UPFRONT_ITEM ?? 'DaaS-Upfront'
export const DAAS_RENT_ITEM = process.env.ERP_DAAS_RENT_ITEM ?? 'DaaS-Rent'
/** Rental of machinery — the SAC the owner's proforma carries. */
export const DAAS_SAC = process.env.ERP_DAAS_SAC ?? '997319'

export interface DaasFigures {
  mrp: number
  months: number
  /** Per machine, whole rupees. */
  upfront: number
  financed: number
  emi: number
  amcMonthly: number
  /** emi + amcMonthly — what the customer pays each month, ex-GST. */
  rent: number
  /** Defaults for the post-tenure clauses, per machine. */
  buyoutDefault: number
  postAmcDefault: number
}

/** One machine's DaaS figures. Pure; rounds to whole rupees. */
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

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')

/** One machine line as the terms need it. */
export interface DaasTermsLine {
  label: string
  qty: number
  fig: DaasFigures
  buyout: number
  postAmc: number
  /** Null when the quotation offers no continuation. */
  continuation: number | null
}

/**
 * "₹88,457 + GST per machine" when every line agrees, otherwise one
 * figure per model — a mixed quotation must not print one model's price
 * as if it applied to all.
 */
function perMachine(lines: DaasTermsLine[], pick: (l: DaasTermsLine) => number, unit: string): string {
  const vals = lines.map(pick)
  if (vals.every(v => v === vals[0])) return `${inr(vals[0])} + GST ${unit}`
  return lines.map(l => `${inr(pick(l))} + GST ${unit} for ${l.label}`).join('; ')
}

/**
 * The DaaS terms, with this quotation's figures written in — the eight
 * sections of the owner's proforma, plus the AMC component that rule
 * adds. Built per quotation because the figures ARE the terms.
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
  const upfrontTotal = lines.reduce((s, l) => s + l.fig.upfront * l.qty, 0)
  const rentTotal = lines.reduce((s, l) => s + l.fig.rent * l.qty, 0)
  const amcTotal = lines.reduce((s, l) => s + l.fig.amcMonthly * l.qty, 0)
  const host = opts.productLine === 'GreenX' ? 'generator performance' : 'equipment performance'
  const lockIn = `${opts.lockInMonths} month${opts.lockInMonths === 1 ? '' : 's'}`
  const cont = lines.filter(l => l.continuation !== null)

  const clauses: Clause[] = [
    ['Governing Agreement',
     `These Terms & Conditions are governed by and shall be read in conjunction with the DaaS Rental ` +
     `Agreement signed between SGT HydroEdge Private Limited and ${opts.customerName}` +
     (opts.agreementDate ? ` dated ${opts.agreementDate}.` : '.')],
    ['Commercial Structure',
     `A non-refundable upfront fee of ${inr(upfrontTotal)} + GST shall be payable against the Proforma ` +
     `Invoice prior to installation. A monthly rental of ${inr(rentTotal)} + GST shall be applicable for a ` +
     `tenure of ${months} months. The monthly rental includes annual maintenance of ${inr(amcTotal)} per ` +
     `month, and no additional AMC charges shall be applicable during the rental period.`],
    ['Lock-in Period',
     `A minimum lock-in period of ${lockIn} shall be applicable from the date of installation. The customer ` +
     `shall not be permitted to cancel or return the product during this period. Notwithstanding the above, ` +
     `the customer may terminate during the lock-in period with 15 days' written notice if the system ` +
     `demonstrably and directly affects ${host} or core business operations, subject to the joint review ` +
     `and remedy process outlined in the Agreement.`],
    ['Rental Payment Terms',
     `Advance rental payments shall commence from the date of unit installation. Rental payments shall be ` +
     `payable within 7 days of receipt of invoice.`],
    ['Return & Cancellation Policy',
     `Upon completion of the lock-in period, either party may terminate by providing 30 days' written notice. ` +
     `Any termination claim on grounds of adverse system impact shall follow a structured process: written ` +
     `notification, joint review within 7 working days, and a 15-day remedy period for SGT HydroEdge. ` +
     `Termination shall be valid only where the adverse effect is substantiated through joint review and is ` +
     `directly attributable to the SGT system. Upon valid termination, equipment shall be removed by SGT ` +
     `HydroEdge within a mutually agreed timeframe; rental shall cease from the date of removal. The upfront ` +
     `payment remains non-refundable. Equipment must be returned in good working condition, subject to ` +
     `normal wear and tear.`],
    [`Buyout Option (Post ${months} Months)`,
     `Upon completion of ${months} months, the customer may opt to purchase the assets by paying ` +
     `${perMachine(lines, l => l.buyout, 'per machine')} towards asset transfer. Upon purchase, an Annual ` +
     `Maintenance Contract (AMC) fee of ${perMachine(lines, l => l.postAmc, 'per machine per annum')} shall ` +
     `be applicable.`],
  ]
  if (cont.length) {
    clauses.push(['Rental Continuation Option',
      `In case the customer chooses to continue the rental beyond the initial tenure, the revised rental ` +
      `shall be ${perMachine(cont, l => l.continuation!, 'per unit per month')}, effective from the ` +
      `${months + 1}${ordinal(months + 1)} month onwards.`])
  }
  clauses.push(
    ['Ownership',
     `The equipment shall remain the property of SGT HydroEdge Pvt. Ltd. throughout the rental period unless ` +
     `purchased under the buyout option.`],
    ['Service & Damage Handling',
     `Standard AMC is included in the rental and covers routine service and maintenance. In the event of ` +
     `accidental damage attributable to the customer, SGT HydroEdge Pvt. Ltd. shall undertake the necessary ` +
     `repairs, and the actual cost of repair shall be borne by the customer.`],
  )
  return clauses
}

function ordinal(n: number): string {
  const t = n % 100
  if (t >= 11 && t <= 13) return 'th'
  return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
}

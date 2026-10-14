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
const num = (n: number) => Math.round(n).toLocaleString('en-IN')
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

// ---------------------------------------------------------------------
// The document's wording — the owner's final offer, SAL-QTN-2026-00075
// (Revised), 2026-10-14. Item names, the Equipment Specification block
// and all eight clauses are reproduced from it; only the figures, the
// model names, the customer and the tenure are filled in.
//
// The print format is the GreenX "Techno-Commercial Offer" (Quotation2),
// which prints each line's description, in order, as the Equipment
// Specification block. So the block is built here as the two lines'
// descriptions: the upfront line carries Equipment, Pricing basis and its
// numbered heading; the rent line carries its heading and, after the last
// machine, the Service and maintenance note.
// ---------------------------------------------------------------------

/** The item-column names, e.g. "GreenX-500 – Upfront Payment". */
export const daasItemNames = (label: string) => ({
  upfront: `${label} – Upfront Payment`,
  rent: `${label} – Monthly Rent (DaaS Model)`,
})

const specLine = (label: string, value: string) => `<div><b>${label}</b> ${value}</div>`
const specHead = (n: number, title: string) =>
  `<div style="margin-top:6px;"><b>${n}. ${title}</b></div>`

/**
 * The two descriptions for one machine. `n` is the number of its upfront
 * heading in the block (1 for the first machine, 3 for the second…), so
 * a multi-machine offer keeps one running sequence.
 */
export function daasDescriptions(opts: {
  label: string
  qty: number
  fig: DaasFigures
  n: number
  /** Add the closing Service and maintenance note — the last machine only. */
  last: boolean
}): { upfront: string; rent: string } {
  const { label, qty, fig, n, last } = opts
  const each = qty > 1 ? ' per machine' : ''
  const l = esc(label)
  const basis = fig.discountPct > 0
    ? `The ${l} is offered at a ${fig.discountPct}% discount on the MRP of ${inr(fig.mrp)}.`
    : `The ${l} is offered at its MRP of ${inr(fig.mrp)}.`

  const upfront =
    `<div class="sgt-spec">` +
    specLine('Equipment:', l + (qty > 1 ? ` × ${qty}` : '')) +
    specLine('Pricing basis:', basis) +
    specHead(n, `Upfront Payment – ${l}`) +
    `<div>A one-time payment of ${inr(fig.upfront)} + GST${each}, payable against the Proforma Invoice ` +
    `before installation.</div>` +
    `</div>`

  const service = fig.amc || fig.years === 1
    ? `During the rental period, SGT HydroEdge takes care of all routine service and maintenance at no ` +
      `additional charge.`
    : `SGT HydroEdge takes care of all routine service and maintenance for the first year at no additional ` +
      `charge. From the second year, service and maintenance is charged separately.`

  const rent =
    `<div class="sgt-spec">` +
    specHead(n + 1, `Monthly Rent under DaaS Model – ${l}`) +
    `<div>A fixed rent of ${inr(fig.rent)} + GST${each} per month for ${fig.months} months, payable in ` +
    `advance. The first month's rent is included in this offer.</div>` +
    (last ? `<div style="margin-top:6px;"><b>Service and maintenance:</b> ${service}</div>` : '') +
    `</div>`

  return { upfront, rent }
}

// Layout helpers for the terms. clausesToHtml inserts each body as markup.
const pad = 'margin-left:18px;margin-top:3px;'
const bullet = (label: string, text: string) =>
  `<div style="${pad}">&bull;&nbsp;<b>${label}</b> ${text}</div>`
const lettered = (k: string, label: string, text: string) =>
  `<div style="${pad}">(${k})&nbsp;&nbsp;<b>${label}</b> ${text}</div>`
const roman = (k: string, text: string) =>
  `<div style="margin-left:36px;margin-top:2px;">${k}.&nbsp;&nbsp;${text}</div>`

/** "the GreenX-500" / "the GreenX-500, ₹x; the GreenX-80, ₹y" — one per model. */
function perModel(lines: DaasTermsLine[], pick: (l: DaasTermsLine) => number): string {
  return lines.map(l => `the ${esc(l.label)}, the revised rent is ${inr(pick(l))} + GST per unit per month`)
    .join('; for ')
}

/**
 * The eight clauses of the final offer, with this quotation's figures.
 * Totals in clause 2 cover every machine on the offer; per-model figures
 * (buyout, AMC after buyout, continuation) are stated per model.
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
  const host = opts.productLine === 'GreenX' ? 'generator performance' : 'equipment performance'
  const lockIn = `${opts.lockInMonths} month${opts.lockInMonths === 1 ? '' : 's'}`
  const next = `${months + 1}${ordinal(months + 1)}`

  const serviceTerm = amc || years === 1
    ? `SGT HydroEdge maintains the system throughout the rental period. No separate AMC is payable during this time.`
    : `SGT HydroEdge maintains the system for the first year at no charge. From the second year, AMC is not ` +
      `included and is payable separately.`

  const cell = 'border:1px solid #ddd;padding:5px 8px;'
  const head = `${cell}background:#efefef;font-weight:bold;`
  // Indented by a WRAPPER, never by a margin on the table: a table with a
  // left margin and no width is as wide as its headers want, and in the
  // print it ran past the right edge. Here the table is exactly the
  // wrapper's width, the columns are fixed (34/33/33) and headers wrap.
  // Widths are percentages, not calc(): wkhtmltopdf's WebKit is old.
  const buyoutTable =
    `<div style="padding:6px 0 4px 18px;">` +
    `<table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:9pt;">` +
    `<tr><td style="${head}width:34%;">Model</td>` +
    `<td style="${head}width:33%;text-align:right;">Asset transfer fee (₹, per machine)</td>` +
    `<td style="${head}width:33%;text-align:right;">AMC after buyout (₹, per machine per annum)</td></tr>` +
    lines.map(l =>
      `<tr><td style="${cell}word-wrap:break-word;">${esc(l.label)}</td>` +
      `<td style="${cell}text-align:right;">${num(l.buyout)}</td>` +
      `<td style="${cell}text-align:right;">${num(l.postAmc)}</td></tr>`).join('') +
    `</table></div>`

  return [
    ['Governing Agreement',
     `These Terms &amp; Conditions are to be read together with the DaaS Rental Agreement signed between ` +
     `SGT HydroEdge Private Limited and ${esc(opts.customerName)}` +
     (opts.agreementDate ? ` dated ${esc(opts.agreementDate)}.` : '.')],
    ['Commercial Structure',
     bullet('Upfront payment:', `${inr(sum(f => f.upfront))} + GST, payable against the Proforma Invoice ` +
       `before installation. It is adjusted towards the equipment cost and is non-refundable.`) +
     bullet('Monthly rent:', `${inr(sum(f => f.rent))} + GST per month, fixed for the entire ${months}-month tenure.`) +
     bullet('Service and maintenance:', serviceTerm) +
     bullet('Tenure:', `${months} months from the date of installation.`)],
    ['Lock-in Period',
     `A minimum lock-in period of ${lockIn} applies from the date of installation, during which the customer ` +
     `cannot cancel or return the equipment. The only exception is a termination for adverse system impact, ` +
     `as set out in clause 5(c).`],
    ['Rental Payment Terms',
     `Rent is payable in advance from the date of installation. Each month's rent is to be paid within the ` +
     `first 7 working days of that month.`],
    ['Return &amp; Cancellation Policy',
     lettered('a', 'After the lock-in period:', `Either party may terminate by giving 30 days' written notice.`) +
     lettered('b', 'Equipment condition:', `The equipment must be returned in good working condition, normal ` +
       `wear and tear excepted.`) +
     lettered('c', 'Termination for adverse system impact:', `If the system adversely affects the customer's ` +
       `operations, the customer may terminate with 15 days' written notice, including during the lock-in ` +
       `period, provided the process below is followed:`) +
     roman('i', 'The customer notifies SGT HydroEdge in writing.') +
     roman('ii', 'A joint review is held within 7 working days.') +
     roman('iii', 'SGT HydroEdge is given a 15-day period to remedy the issue.') +
     roman('iv', `Termination is valid only if the joint review confirms that the adverse effect is directly ` +
       `attributable to the SGT HydroEdge system. An adverse effect means the system demonstrably and ` +
       `directly affects ${host} or core business operations.`) +
     lettered('d', 'On valid termination:', `SGT HydroEdge removes the equipment within a mutually agreed ` +
       `timeframe, and rent ceases from the date of removal.`) +
     lettered('e', 'Upfront payment:', `The upfront payment is not refunded, as it is adjusted towards the ` +
       `equipment cost.`)],
    [`Buyout Option (Post ${months} Months)`,
     `On completion of the ${months}-month tenure, the customer may purchase the equipment by paying the asset ` +
     `transfer fee applicable to that model. After purchase, an Annual Maintenance Contract (AMC) applies at the ` +
     `annual rate for that model. Both amounts differ by model and are stated per machine below, plus GST.` +
     buyoutTable +
     `<div style="margin-left:18px;">For any other model, the amounts will be as stated in the offer for that model.</div>`],
    ['Rental Continuation Option',
     `If the customer chooses to continue renting instead of buying out, the revised rent applies from the ` +
     `${next} month onwards. For ${perModel(lines, l => l.continuation)}. For other models, the revised rent ` +
     `will be as stated in the offer for that model.`],
    ['Ownership and Damage Handling',
     `The equipment remains the property of SGT HydroEdge unless purchased under the buyout option. If ` +
     `accidental damage is attributable to the customer, SGT HydroEdge will carry out the necessary repairs and ` +
     `the actual repair cost will be borne by the customer.`],
  ]
}

function ordinal(n: number): string {
  const t = n % 100
  if (t >= 11 && t <= 13) return 'th'
  return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
}

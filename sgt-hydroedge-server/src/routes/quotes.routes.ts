// =============================================================================
// routes/quotes.routes.ts — quotation creation for SGT staff.
// -----------------------------------------------------------------------------
// Mounted at /api/v1/quotes:
//     POST /quotes/resolve    kVA -> model + rate. No side effects.
//     POST /quotes            create the ERPNext Quotation
//     GET  /quotes            list (from our mirror)
//     GET  /quotes/:erpName   the authoritative document, read from ERPNext
//
// director and sales; a distributor reaches the portal equivalents instead
// and never touches ERPNext directly.
//
// Resolution and creation are deliberately SEPARATE calls. Resolving is
// free and idempotent, so the UI can preview as the user types; creating
// writes to ERPNext and must be an explicit act.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { query, pool } from '../db/pool.js'
import { requireRole } from '../auth/guard.js'
import { resolveForKva } from '../domain/quotePricing.js'
import { inspectGstin } from '../domain/gstin.js'
import {
  checkDiscount, checkDiscountAmount, actorFor, DISCOUNT_CAPS,
  amcItemCode, AMC_PCT, AMC_TERMS,
} from '../domain/quoteDiscount.js'
import {
  sendQuotation, mailProvider, isEmail,
  defaultQuoteSubject, defaultQuoteMessage, defaultQuoteMessageText, textToHtml,
} from '../services/quoteMail.js'
import { cleanSpec, SPEC_FIELDS } from '../domain/quoteSpec.js'
import { termsToText, textToTerms } from '../domain/quoteTerms.js'
import {
  createQuotation, updateQuotation, quotationIsDraft,
  itemPrice, fetchQuotation, listTermsTemplates, fetchTerms,
  searchCustomers, ensureQuotationCustomer, updateQuotationCustomer,
  findCustomerAddress, upsertCustomerAddress, hasAddress,
  fetchQuotationPdf, fetchQuotationSummaries,
  type CustomerPatch, type AddressInput,
  listQuotationAttachments, uploadQuotationAttachment, deleteQuotationAttachment,
  uploadPublicImage,
  type CreateQuotationInput, type CreateQuotationLine,
} from '../services/erpQuotation.js'

const staff = requireRole('director', 'sales')

function actor(req: FastifyRequest) {
  return { id: req.user?.sub ?? null, name: req.user?.name ?? null }
}

/**
 * One machine the customer is being quoted for.
 *
 * A quotation may carry several — three DGs of three different ratings is
 * one enquiry and should be one document, not three.
 */
export interface QuoteLineBody {
  kva?: number | string
  qty?: number
  rate?: string | number | null
  /** Either a percentage OR a rupee amount. Percentage wins if both. */
  discountPct?: number | string | null
  discountAmount?: number | string | null
  /** 1, 2 or 3 — adds that model's AMC item. */
  amcYears?: number | null
  /** Optional make/model/dimensions, printed under the line. */
  spec?: Record<string, unknown> | null
}

export interface QuoteBody extends QuoteLineBody {
  /**
   * The lines. When absent, the top-level kva/qty/discount/amc fields are
   * read as a single line instead — every client that predates multi-line
   * quoting keeps working unchanged, and there is one code path below.
   */
  lines?: QuoteLineBody[]
  orgId?: number | null
  /** An existing ERPNext Customer. Required — quoting never creates one. */
  customerErpName?: string
  customer?: { name?: string; gstin?: string; state?: string; city?: string }
  validDays?: number
  termsTemplate?: string | null
  /** Raw markup. Sent by anything predating the plain-text editor. */
  termsHtml?: string | null
  /**
   * The terms as the user edited them: one clause per paragraph.
   * Converted here, so the screen never handles markup. Wins over
   * termsHtml when both arrive.
   */
  termsText?: string | null
  /**
   * 'auto' derives CGST+SGST vs IGST from the customer's GSTIN. The
   * explicit values are for customers ERPNext cannot place — an
   * individual with no GSTIN and no address on file.
   */
  taxMode?: 'auto' | 'in_state' | 'out_state'
}

/**
 * Shared by both the staff and portal routes so the two cannot drift.
 * `forcedOrgId` is set by the portal to the caller's own org — staff may
 * choose one, a partner may not.
 */
/**
 * Flatten an org row into the block the print format renders.
 *
 * Snapshotted deliberately: the PDF must show the partner as they were
 * when the quotation was issued, not as they are whenever someone reprints
 * it. Looking this up in Jinja at print time would silently rewrite
 * documents the customer already has.
 */
function snapshotPartner(o: Record<string, any>): CreateQuotationInput['partner'] {
  const addr = [o.address_line1, o.address_line2, o.city, o.state, o.pincode]
    .map(x => String(x ?? '').trim()).filter(Boolean).join(', ')
  const contact = [o.contact_name, o.contact_mobile, o.contact_email]
    .map(x => String(x ?? '').trim()).filter(Boolean).join(' · ')

  // Where the customer pays. SGT no longer collects centrally — the
  // partner invoices and is paid — so the account has to be ON the
  // document rather than in a follow-up mail.
  //
  // Labelled, not just concatenated: an account number and an IFSC next
  // to each other with no labels is how money goes to the wrong place.
  // Omitted entirely when there is no account number, because a bank
  // block naming a branch and no account is worse than none at all.
  const bank = String(o.bank_account_number ?? '').trim()
    ? [
        o.bank_account_name ? `Account name: ${o.bank_account_name}` : null,
        `Account no: ${String(o.bank_account_number).trim()}`,
        o.bank_ifsc ? `IFSC: ${String(o.bank_ifsc).trim().toUpperCase()}` : null,
        [o.bank_name, o.bank_branch].map(x => String(x ?? '').trim()).filter(Boolean).join(', ') || null,
      ].filter(Boolean).join('\n')
    : null

  return {
    name: `${o.legal_name}${o.code ? ` (${o.code})` : ''}`,
    address: addr || null,
    contact: contact || null,
    gstin: o.gstin ?? null,
    bank,
  }
}

/**
 * Turn the request into lines, whatever shape it arrived in.
 *
 * Blank rows are dropped rather than rejected: the form starts a new line
 * empty, and a user who adds one and changes their mind should not get a
 * validation error for a row they never filled in.
 */
function readLines(body: QuoteBody): QuoteLineBody[] {
  const raw = Array.isArray(body.lines) && body.lines.length
    ? body.lines
    : [{
        kva: body.kva, qty: body.qty, rate: body.rate,
        discountPct: body.discountPct, discountAmount: body.discountAmount,
        amcYears: body.amcYears, spec: body.spec,
      }]
  return raw.filter(l => String(l?.kva ?? '').trim() !== '')
}

export async function performQuotation(
  req: FastifyRequest,
  body: QuoteBody,
  opts: {
    forcedOrgId?: number | null
    via: 'crm' | 'portal'
    /**
     * Set to an existing quotation's name to REWRITE it rather than
     * create one. Everything below is identical either way — that is the
     * point: an edited quotation must be resolved, capped, taxed and
     * termed by exactly the code that produced the original, or the two
     * drift and nobody notices until a customer does.
     */
    updating?: string
  },
) {
  const who = actor(req)

  // A quotation attaches to a customer that ALREADY exists. Creating one is
  // a separate, deliberate act via POST /quotes/customers — otherwise a
  // mistyped name becomes permanent financial master data in ERPNext.
  const customerErpName = String(body.customerErpName ?? '').trim()
  if (!customerErpName) {
    return {
      ok: false as const, code: 400,
      payload: {
        error: {
          code: 'customer_required',
          message: 'Select an existing customer, or add one first. Quoting does not create customers.',
        },
      },
    }
  }

  const lineBodies = readLines(body)
  if (!lineBodies.length) {
    return {
      ok: false as const, code: 400,
      payload: {
        error: { code: 'no_lines', message: 'Add at least one machine, with its kVA rating.' },
      },
    }
  }

  // Resolve every line before creating anything. One unresolvable rating
  // fails the whole request — a partial quotation, silently missing the
  // 750 kVA set the customer asked about, is worse than none.
  const resolutions = await Promise.all(
    lineBodies.map(l => resolveForKva(l.kva, { erpRate: itemPrice })))
  const badIndex = resolutions.findIndex(r => !r.resolved)
  if (badIndex >= 0) {
    const bad = resolutions[badIndex] as Extract<typeof resolutions[number], { resolved: false }>
    return {
      ok: false as const, code: 422,
      payload: lineBodies.length === 1
        ? bad
        : { ...bad, lineIndex: badIndex, message: `Line ${badIndex + 1}: ${bad.message}` },
    }
  }
  const resolved = resolutions as Extract<typeof resolutions[number], { resolved: true }>[]

  // On an edit with no partner supplied, keep the one the quotation was
  // raised under. Silently dropping it would strip the sales partner,
  // and with it the commission, from a document nobody meant to change.
  let orgId = opts.forcedOrgId !== undefined ? opts.forcedOrgId : (body.orgId ?? null)
  if (opts.updating && opts.forcedOrgId === undefined && body.orgId === undefined) {
    const { rows } = await query(
      `select org_id from quote_service.quotation_ref where erp_name = $1`, [opts.updating])
    orgId = rows[0]?.org_id ?? null
  }

  // A partner code goes on the quotation as sales_partner so ERPNext
  // computes their commission. No org means SGT quoted directly.
  let salesPartner: string | null = null
  let commissionRate: number | null = null
  let orgType: string | null = null
  let partnerSnapshot: CreateQuotationInput['partner'] = null
  if (orgId) {
    const { rows } = await query(
      `select id, code, org_type, legal_name, trade_name, gstin,
              address_line1, address_line2, city, state, pincode,
              contact_name, contact_mobile, contact_email,
              bank_account_name, bank_account_number, bank_ifsc,
              bank_name, bank_branch,
              logo_filename, logo_mime, logo_bytes, erp_logo_url
         from quote_service.org where id = $1 and is_active`, [orgId])
    if (!rows.length) {
      return {
        ok: false as const, code: 400,
        payload: { error: { code: 'bad_request', message: 'Unknown or inactive partner' } },
      }
    }
    salesPartner = rows[0].code
    orgType = rows[0].org_type
    partnerSnapshot = snapshotPartner(rows[0])
    commissionRate = Number(process.env.ERP_PARTNER_COMMISSION ?? '40.48')

    // The logo lives in our database; ERPNext needs its own copy to print
    // it. Upload once, remember the URL, reuse it on every later quote.
    //
    // Best effort throughout: a partner without a logo, or an upload that
    // fails, must never stop a quotation being raised. The document just
    // prints with SGT's mark alone, which is what happened before this
    // existed.
    partnerSnapshot!.logo = rows[0].erp_logo_url ?? null
    if (!partnerSnapshot!.logo && rows[0].logo_bytes) {
      try {
        const url = await uploadPublicImage(
          rows[0].logo_filename ?? `${rows[0].code}-logo.png`,
          rows[0].logo_mime ?? 'image/png',
          rows[0].logo_bytes as Buffer,
        )
        await query(
          `update quote_service.org set erp_logo_url = $2, updated_at = now() where id = $1`,
          [rows[0].id, url])
        partnerSnapshot!.logo = url
      } catch (err) {
        req.log.warn({ err, org: rows[0].code }, 'partner logo could not be published to ERPNext')
      }
    }
  }

  // Discount authority follows the ORG raising the quote, not the login's
  // role — a dealer's cap must hold whether they raise it themselves or an
  // SGT user raises it on their behalf.
  //
  // Either form is accepted. The cap is a PERCENTAGE either way: an amount
  // is measured against the machine line so "₹2,00,000 off" cannot walk
  // past a 12% limit just because it was typed in rupees.
  //
  // And it is checked PER LINE, against that line's own machine value.
  // Checking it against the document total would let a deep discount on
  // one set hide behind two full-price ones.
  const actorKind = actorFor(orgType)
  const lines: CreateQuotationLine[] = []
  /** What we mirror locally, so our own screens can show the breakdown. */
  const lineSnapshots: Record<string, unknown>[] = []

  for (let i = 0; i < lineBodies.length; i++) {
    const l = lineBodies[i]
    const r = resolved[i]
    const qty = Math.max(1, Math.floor(Number(l.qty ?? 1)))
    const rate = l.rate ?? r.rate
    const machineLine = (Number(rate) || 0) * qty

    const usingAmount = l.discountPct == null || l.discountPct === ''
    const discount = usingAmount
      ? checkDiscountAmount(l.discountAmount, machineLine, actorKind)
      : checkDiscount(l.discountPct, actorKind)
    if (!discount.ok) {
      const message = lineBodies.length === 1
        ? discount.message
        : `Line ${i + 1} (${r.modelCode}): ${discount.message}`
      return {
        ok: false as const, code: 422,
        payload: {
          error: { code: 'discount_too_high', message },
          lineIndex: i,
          fields: usingAmount ? { discountAmount: message } : { discountPct: message },
        },
      }
    }

    // The user types a discount for the WHOLE line; ERPNext's discount_amount
    // is PER UNIT. Divide before sending, or a qty of 3 would take the figure
    // off three times over.
    const discountAmount = usingAmount ? Number((discount as any).amount ?? 0) : 0
    const discountPerUnit = discountAmount > 0 && qty > 0
      ? Math.round((discountAmount / qty) * 100) / 100
      : 0

    const amcYears = l.amcYears && AMC_TERMS.includes(Number(l.amcYears))
      ? Number(l.amcYears) : null
    const spec = cleanSpec(l.spec)

    lines.push({
      itemCode: r.modelCode,
      qty,
      rate,
      discountPct: usingAmount ? null : (discount.pct || null),
      discountAmountPerUnit: discountPerUnit || null,
      // Its own priced item per model per term, so the printed line shows a
      // list rate rather than a discount off zero.
      amc: amcYears ? { itemCode: amcItemCode(r.modelCode, amcYears), qty } : null,
      spec,
    })

    lineSnapshots.push({
      kva: Number(l.kva),
      modelId: r.modelId,
      modelCode: r.modelCode,
      ratingLabel: r.ratingLabel,
      qty,
      unitRate: rate ?? null,
      discountPct: discount.pct || null,
      discountAmount: discountAmount || null,
      amcYears,
      spec,
    })
  }

  const input: CreateQuotationInput = {
    customerErpName,
    lines,
    salesPartner,
    commissionRate,
    validDays: body.validDays,
    taxMode: body.taxMode ?? 'auto',
    termsTemplate: body.termsTemplate ?? null,
    // Text wins: it is what the person actually read and approved.
    termsHtml: body.termsText?.trim()
      ? textToTerms(body.termsText)
      : (body.termsHtml ?? null),
    raisedBy: who.name ? `${who.name}${who.id ? ` (user ${who.id})` : ''}` : null,
    raisedByOrg: salesPartner,
    raisedVia: opts.via === 'portal' ? 'Partner portal' : 'SGT CRM',
    partner: partnerSnapshot,
  }

  let created: Awaited<ReturnType<typeof createQuotation>>
  try {
    created = opts.updating
      ? await updateQuotation(opts.updating, input)
      : await createQuotation(input)
  } catch (e: any) {
    // A submitted quotation is refused by updateQuotation with an
    // explanation; that is a 409, not a 502 — the caller did nothing
    // wrong, the document simply moved on.
    const message = String(e?.message ?? e)
    if (opts.updating && /submitted/i.test(message)) {
      return {
        ok: false as const, code: 409,
        payload: { error: { code: 'not_editable', message } },
      }
    }
    throw e
  }

  // Mirror it locally. A failure here must NOT lose the quotation — it
  // already exists in ERPNext, which is the system of record.
  let mirrored = true
  // The flat columns describe the FIRST line — that is what the list
  // screens have always shown, and they keep showing it. The full
  // breakdown goes in `lines` alongside.
  const first = lineSnapshots[0]
  try {
    await pool.query(
      `insert into quote_service.quotation_ref
         (erp_name, org_id, input_kva, model_id, model_code, qty, unit_rate,
          net_total, grand_total, commission_rate, erp_customer, customer_name,
          customer_gstin, customer_state, status, raised_by, raised_by_name, raised_via,
          line_count, lines, tax_mode)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'draft',$15,$16,$17,$18,$19,$20)
       on conflict (erp_name) do update set
          org_id = excluded.org_id, input_kva = excluded.input_kva,
          model_id = excluded.model_id, model_code = excluded.model_code,
          qty = excluded.qty, unit_rate = excluded.unit_rate,
          net_total = excluded.net_total, grand_total = excluded.grand_total,
          commission_rate = excluded.commission_rate,
          erp_customer = excluded.erp_customer, customer_name = excluded.customer_name,
          customer_gstin = excluded.customer_gstin, customer_state = excluded.customer_state,
          status = excluded.status, raised_by = excluded.raised_by,
          raised_by_name = excluded.raised_by_name, raised_via = excluded.raised_via,
          line_count = excluded.line_count, lines = excluded.lines,
          tax_mode = excluded.tax_mode,
          updated_at = now()`,
      [created.erpName, orgId, first.kva, first.modelId, first.modelCode,
       first.qty, first.unitRate ?? null, created.netTotal, created.grandTotal, commissionRate,
       created.customer.erpName, created.customer.erpName, body.customer?.gstin ?? null,
       body.customer?.state ?? null, who.id, who.name, opts.via,
       lineSnapshots.length, JSON.stringify(lineSnapshots), created.taxMode],
    )
  } catch (err) {
    mirrored = false
    req.log.error({ err, erpName: created.erpName }, 'quotation created in ERPNext but not mirrored locally')
  }

  return {
    ok: true as const,
    payload: {
      data: {
        erpName: created.erpName,
        // First line at the top level, as it has always been, so the
        // success banner and anything else reading this keeps working.
        model: resolved[0].modelCode,
        ratingLabel: resolved[0].ratingLabel,
        coversUptoKva: resolved[0].coversUptoKva,
        qty: first.qty,
        rate: first.unitRate,
        lineCount: lineSnapshots.length,
        lines: lineSnapshots,
        netTotal: created.netTotal,
        grandTotal: created.grandTotal,
        discountPct: first.discountPct,
        discountAmount: first.discountAmount ?? created.discountAmount,
        amcYears: first.amcYears,
        taxTemplate: created.taxTemplate,
        taxMode: created.taxMode,
        addressWarning: created.addressWarning,
        termsTemplate: created.termsTemplate,
        termsWarning: created.termsWarning,
        totalTax: created.totalTax,
        taxWarning: created.taxWarning,
        commissionRate: created.commissionRate,
        totalCommission: created.totalCommission,
        customer: created.customer,
        salesPartner,
        mirrored,
        updated: !!opts.updating,
      },
    },
  }
}

/**
 * Create a customer, with the minimum needed for a usable quotation.
 *
 * Name alone is not enough: without a GSTIN or a state we cannot tell
 * in-state from inter-state, and the quotation silently comes out with no
 * GST. That is exactly how the first quotations went out at zero tax, so
 * one of the two is required here rather than discovered later.
 */
/** The address fields, off whatever shape the client sent. */
function readAddress(b: Record<string, any>): AddressInput {
  const src = (b.address ?? b) as Record<string, any>
  const s = (k: string) => String(src[k] ?? '').trim() || null
  return {
    line1: s('line1') ?? s('address_line1'),
    line2: s('line2') ?? s('address_line2'),
    city: s('city'),
    state: s('state'),
    pincode: s('pincode') ?? s('pin'),
    country: s('country') ?? 'India',
  }
}

const PIN_SHAPE = /^\d{6}$/

export async function createCustomerChecked(b: Record<string, any>) {
  const name = String(b.name ?? '').trim()
  const gstin = String(b.gstin ?? '').trim().toUpperCase()
  const state = String(b.state ?? '').trim()
  const address = readAddress(b)
  // A person buying in their own name. ERPNext's Customer carries this
  // distinction natively, and defaulting everyone to Company was putting
  // proprietors into the master data as firms that do not exist.
  const entityType = String(b.entityType ?? '').trim() === 'Individual'
    ? 'Individual' as const
    : 'Company' as const

  const fields: Record<string, string> = {}
  if (!name) fields.name = 'Customer name is required'
  if (!gstin && !state) {
    fields.gstin = 'Enter a GSTIN, or pick a state — one is needed to work out GST'
    fields.state = 'Enter a state, or a GSTIN — one is needed to work out GST'
  }
  if (gstin) {
    const g = inspectGstin(gstin)
    if (!g.valid) fields.gstin = g.message ?? 'GSTIN is not valid'
  }
  if (address.pincode && !PIN_SHAPE.test(address.pincode)) {
    fields.pincode = 'PIN code must be 6 digits'
  }
  if (Object.keys(fields).length) {
    return {
      ok: false as const, code: 422,
      payload: { error: { code: 'validation_failed', message: 'Some fields need attention' }, fields },
    }
  }

  const created = await ensureQuotationCustomer({
    name, gstin: gstin || null, state: state || null, city: address.city ?? null,
    entityType, address,
  })

  // Did the address actually land? A customer with none produces a
  // quotation with a blank address block, which is what happened before
  // any of this existed — so it is reported rather than assumed.
  let addressWritten = false
  try {
    addressWritten = !!(await findCustomerAddress(created.erpName))
  } catch { /* the check must not fail the creation */ }

  return {
    ok: true as const,
    payload: {
      data: {
        ...created,
        addressWritten,
        ...(hasAddress(address) && !addressWritten
          ? { note: 'The customer was created but the address could not be saved. Add it with "Fix details".' }
          : {}),
      },
    },
  }
}

/**
 * Correct an existing customer — in practice, a mistyped GSTIN.
 *
 * Shared by the CRM and the portal so a partner can fix their own
 * customer's details without anyone reaching into ERPNext.
 *
 * What this does NOT do is retrospectively fix quotations already
 * raised. A quotation captured the customer's tax position when it was
 * created; correcting the master now changes the NEXT one. The caller
 * is told so rather than left to discover it.
 */
export async function updateCustomerChecked(
  erpName: string, b: Record<string, unknown>,
) {
  const patch: CustomerPatch = {}
  const fields: Record<string, string> = {}

  if ('gstin' in b) {
    const gstin = String(b.gstin ?? '').trim().toUpperCase()
    if (gstin) {
      const g = inspectGstin(gstin)
      if (!g.valid) fields.gstin = g.message ?? 'GSTIN is not valid'
    }
    patch.gstin = gstin || null
  }
  if ('entityType' in b) {
    patch.entityType = String(b.entityType ?? '') === 'Individual' ? 'Individual' : 'Company'
  }

  const address = readAddress(b)
  if (address.pincode && !PIN_SHAPE.test(address.pincode)) {
    fields.pincode = 'PIN code must be 6 digits'
  }

  if (Object.keys(fields).length) {
    return {
      ok: false as const, code: 422,
      payload: { error: { code: 'validation_failed', message: 'Some fields need attention' }, fields },
    }
  }
  if (!Object.keys(patch).length && !hasAddress(address)) {
    return {
      ok: false as const, code: 400,
      payload: { error: { code: 'bad_request', message: 'Nothing to change' } },
    }
  }

  const changed: string[] = []
  if (Object.keys(patch).length) {
    const r = await updateQuotationCustomer(erpName, patch)
    changed.push(...r.changed)
  }

  // This is the repair path for every customer created before addresses
  // were written at all — which is why it CREATES one when missing
  // rather than only updating an existing row.
  if (hasAddress(address)) {
    const name = String(b.name ?? '').trim() || erpName
    await upsertCustomerAddress(erpName, name, address)
    changed.push('address')
  }

  return {
    ok: true as const,
    payload: {
      data: {
        erpName, changed,
        note: 'Quotations already raised keep the details they were created with. ' +
              'Raise a new one for the corrected address and figures.',
      },
    },
  }
}

/**
 * Reload a quotation into the shape the create form uses.
 *
 * Read from OUR mirror, not from ERPNext. ERPNext stores the outcome —
 * item codes, rates, amounts — but not the question: which kVA was
 * typed, whether the discount was entered as a percentage or in rupees,
 * what the specification said. Rebuilding the form from item codes would
 * lose all of it, so `lines` was written for exactly this.
 */
export async function loadForEdit(erpName: string) {
  const { rows } = await query(
    `select q.erp_name, q.org_id, q.lines, q.line_count, q.tax_mode,
            q.erp_customer, q.customer_name, q.status,
            o.code as org_code
       from quote_service.quotation_ref q
       left join quote_service.org o on o.id = q.org_id
      where q.erp_name = $1`, [erpName])
  const row = rows[0]
  if (!row) {
    return {
      ok: false as const, code: 404,
      payload: { error: { code: 'not_found', message: `${erpName} is not in the CRM's records` } },
    }
  }

  const draft = await quotationIsDraft(erpName)
  if (draft === null) {
    return {
      ok: false as const, code: 404,
      payload: { error: { code: 'not_found', message: `${erpName} no longer exists in ERPNext` } },
    }
  }

  const doc = await fetchQuotation(erpName).catch(() => null)

  return {
    ok: true as const,
    payload: {
      data: {
        erpName,
        editable: draft,
        // Said plainly, because "why is Save greyed out" is the next question.
        reason: draft ? null
          : `${erpName} has been submitted in ERPNext, so it can no longer be ` +
            `changed. Cancel and amend it there, or raise a new quotation.`,
        orgId: row.org_id ?? null,
        orgCode: row.org_code ?? null,
        taxMode: row.tax_mode ?? 'auto',
        customerErpName: row.erp_customer,
        customerName: row.customer_name,
        lines: Array.isArray(row.lines) ? row.lines : [],
        lineCount: row.line_count ?? 1,
        termsTemplate: doc?.tc_name ?? null,
      },
    },
  }
}

/** Everything the "fix details" panel needs to prefill itself. */
export async function customerDetail(erpName: string) {
  const [rows, address] = await Promise.all([
    searchCustomers(erpName).catch(() => [] as any[]),
    findCustomerAddress(erpName).catch(() => null),
  ])
  const hit = rows.find((c: any) => String(c.name) === erpName) ?? rows[0] ?? null
  return {
    erpName,
    customerName: hit?.customer_name ?? erpName,
    gstin: hit?.gstin ?? null,
    address,
  }
}

/**
 * Bring a page of mirror rows in line with ERPNext, which is the system of
 * record. Rows whose document no longer exists are removed; rows whose
 * document changed under them are refreshed.
 *
 * If ERPNext is unreachable the mirror is returned untouched — a network
 * blip must not look like every quotation was deleted.
 */
export async function reconcileQuotations(rows: any[]): Promise<any[]> {
  if (!rows.length) return rows
  const names = rows.map(r => String(r.erp_name))
  let live: Map<string, { customer_name: string; grand_total: string; status: string }>
  try {
    live = await fetchQuotationSummaries(names)
  } catch {
    return rows
  }

  const gone = names.filter(n => !live.has(n))
  if (gone.length) {
    await pool.query(
      `delete from quote_service.quotation_ref where erp_name = any($1)`, [gone])
  }

  const fresh = rows.filter(r => live.has(String(r.erp_name)))
  // Write the corrected snapshot back so the next read is right even if
  // ERPNext is briefly unreachable.
  for (const r of fresh) {
    const l = live.get(String(r.erp_name))!
    if (String(r.grand_total ?? '') !== l.grand_total ||
        String(r.customer_name ?? '') !== String(l.customer_name ?? '') ||
        String(r.status ?? '') !== l.status) {
      await pool.query(
        `update quote_service.quotation_ref
            set customer_name = $2, grand_total = $3, status = $4, updated_at = now()
          where erp_name = $1`,
        [r.erp_name, l.customer_name, l.grand_total, l.status])
      r.customer_name = l.customer_name
      r.grand_total = l.grand_total
      r.status = l.status
    }
  }
  return fresh
}

/**
 * Who a quotation goes to, and who is copied.
 *
 * The customer address defaults to whatever ERPNext already holds on the
 * quotation, so the common case needs no typing. SGT is always copied.
 * The partner is copied from their own org record, which means a
 * distributor is automatically on anything their dealer sends without
 * either of them having to remember.
 */
export async function buildRecipients(erpName: string, overrideTo?: string) {
  const doc = await fetchQuotation(erpName)
  const to: string[] = []
  const typed = String(overrideTo ?? '').trim()
  if (typed) {
    for (const part of typed.split(/[,;]/).map(x => x.trim()).filter(Boolean)) to.push(part)
  } else if (doc?.contact_email) {
    to.push(String(doc.contact_email).trim())
  }

  const cc = new Set<string>()
  const sgt = String(process.env.QUOTE_CC_SGT ?? '').trim()
  for (const a of sgt.split(/[,;]/).map(x => x.trim()).filter(Boolean)) cc.add(a)

  // The partner who raised it, and their parent if there is one.
  const { rows } = await query(
    `select o.contact_email as own, o.legal_name as partner_name,
            p.contact_email as parent
       from quote_service.quotation_ref q
       join quote_service.org o on o.id = q.org_id
       left join quote_service.org p on p.id = o.parent_id
      where q.erp_name = $1`, [erpName])
  for (const r of rows) {
    if (r.own) cc.add(String(r.own).trim())
    if (r.parent) cc.add(String(r.parent).trim())
  }
  const partnerName: string | null = rows[0]?.partner_name ?? null

  // Never copy someone we are already writing to.
  for (const t of to) cc.delete(t)

  // Everything already attached to the document. The dialog ticks them
  // on by default — a file someone deliberately attached to a quotation
  // is one they meant the customer to have.
  let attachments: Awaited<ReturnType<typeof listQuotationAttachments>> = []
  try {
    attachments = await listQuotationAttachments(erpName)
  } catch {
    // Never block a send on the attachment list.
  }

  const customerName = doc?.customer_name ?? ''
  const ctx = {
    erpName, customerName, partnerName,
    attachmentNames: attachments.map(a => a.fileName),
  }

  return {
    to: to.filter(isEmail),
    cc: [...cc].filter(isEmail),
    rejected: [...to, ...cc].filter(a => a && !isEmail(a)),
    customerName,
    grandTotal: doc?.grand_total ?? null,
    attachments,
    // Offered to the sender for editing, rather than applied behind
    // their back. Both surfaces get the identical wording.
    //
    // Two forms of the same letter: the send dialog edits the PLAIN TEXT
    // one, because nobody should have to proofread <p> tags before a
    // quotation goes out. The HTML is what the customer receives, and it
    // is derived from the text — see textToHtml.
    suggestedSubject: defaultQuoteSubject(ctx),
    suggestedMessageText: defaultQuoteMessageText(ctx),
    suggestedMessage: defaultQuoteMessage(ctx),
  }
}

export async function performSend(erpName: string, body: Record<string, any>) {
  const built = await buildRecipients(erpName, body.to)
  if (!built.to.length) {
    return {
      ok: false as const, code: 422,
      payload: {
        error: {
          code: 'no_recipient',
          message: 'No valid customer email. Enter one, or add it to the customer in ERPNext.',
        },
        rejected: built.rejected,
      },
    }
  }

  // `attachments` is a list of File names the sender ticked. Absent means
  // "all of them" — the common case, and what the dialog sends back
  // untouched. An explicit empty array means "none", which is why this
  // checks for the key rather than for truthiness.
  const chosen: string[] | null = Array.isArray(body.attachments)
    ? body.attachments.map((x: unknown) => String(x))
    : null
  const attachments = chosen === null
    ? built.attachments
    : built.attachments.filter(a => chosen.includes(a.name))

  const subject = String(body.subject ?? '').trim() || built.suggestedSubject

  // The dialog sends what the user actually typed — plain text — and says
  // so. It is converted here, at the last moment before sending, so the
  // stored Communication and the mail itself carry identical HTML.
  //
  // Default is 'html' so any caller predating the editor change keeps
  // working: it was passing HTML, and it still may.
  const typed = String(body.message ?? '').trim()
  const message = !typed
    ? built.suggestedMessage
    : body.messageFormat === 'text'
      ? textToHtml(typed)
      : typed

  const result = await sendQuotation({
    erpName, to: built.to, cc: built.cc, subject, message, attachments,
  })
  return {
    ok: true as const,
    payload: {
      data: {
        ...result,
        rejected: built.rejected,
        attached: attachments.map(a => a.fileName),
      },
    },
  }
}

/**
 * Take one uploaded file and put it on the quotation.
 *
 * Shared by the CRM and the portal so the size cap, the type list and the
 * error wording cannot drift between them.
 *
 * Sent as base64 JSON rather than multipart: it needs no new dependency,
 * and the route raises its own body limit to suit. The 15 MB ceiling is
 * on the DECODED bytes — what actually leaves as an email attachment.
 */
export const ATTACH_MAX_BYTES = Number(process.env.QUOTE_ATTACH_MAX_MB ?? '15') * 1024 * 1024

export async function performAttach(erpName: string, body: Record<string, any>) {
  const fileName = String(body.filename ?? body.fileName ?? '').trim()
  const base64 = String(body.base64 ?? body.content ?? '')
  const contentType = String(body.contentType ?? body.mimeType ?? 'application/octet-stream')

  if (!fileName) {
    return {
      ok: false as const, code: 400,
      payload: { error: { code: 'bad_request', message: 'A filename is required' } },
    }
  }
  if (!base64) {
    return {
      ok: false as const, code: 400,
      payload: { error: { code: 'bad_request', message: 'The file is empty' } },
    }
  }

  // Browsers hand back a data: URL from FileReader; accept either form.
  const raw = base64.includes(',') && base64.slice(0, 60).includes('base64,')
    ? base64.slice(base64.indexOf(',') + 1)
    : base64
  const bytes = Buffer.from(raw, 'base64')
  if (!bytes.length) {
    return {
      ok: false as const, code: 400,
      payload: { error: { code: 'bad_request', message: 'The file could not be decoded' } },
    }
  }
  if (bytes.length > ATTACH_MAX_BYTES) {
    return {
      ok: false as const, code: 413,
      payload: {
        error: {
          code: 'too_large',
          message: `${fileName} is ${(bytes.length / 1048576).toFixed(1)} MB — the limit is ` +
                   `${Math.round(ATTACH_MAX_BYTES / 1048576)} MB. Most mail servers reject more.`,
        },
      },
    }
  }

  const saved = await uploadQuotationAttachment(erpName, fileName, contentType, bytes)
  return { ok: true as const, payload: { data: saved } }
}

export default async function quotesRoutes(app: FastifyInstance) {
  // ---- Resolve — free, no side effects ---------------------------------
  app.post('/resolve', { preHandler: staff }, async (req, reply) => {
    const { kva, product } = (req.body ?? {}) as { kva?: unknown; product?: string }
    const r = await resolveForKva(kva, {
      productCode: product ?? 'GreenX',
      erpRate: itemPrice,
    })
    if (r.resolved) {
      // Real AMC prices from ERPNext, so the screen never guesses at a
      // figure the document will not carry.
      const options = await Promise.all(AMC_TERMS.map(async y => {
        const code = amcItemCode(r.modelCode, y)
        let rate: string | null = null
        try { rate = await itemPrice(code) } catch { /* not created yet */ }
        return { years: y, itemCode: code, rate }
      }))
      return reply.send({ data: { ...r, amcOptions: options } })
    }
    // `resolved: false` above the catalogue is a business outcome, not an
    // error — 200 with a structured reason, per the spec.
    return reply.send({ data: r })
  })

  // ---- Terms templates, for the picker ---------------------------------
  app.get('/terms', { preHandler: staff }, async (_req, reply) => {
    const list = await listTermsTemplates()
    const preferred = process.env.ERP_DEALER_TERMS ?? 'GreenX Dealer Quotation Terms'
    return reply.send({ data: { templates: list.map(t => t.name), default: preferred } })
  })

  app.get('/terms/:name', { preHandler: staff }, async (req, reply) => {
    const { name } = req.params as { name: string }
    const html = await fetchTerms(name)
    if (html === null) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'No such terms template' } })
    }
    // Both forms: `text` is what the editor shows, `terms` is what the
    // document carries. The screen edits the first and never sees the second.
    return reply.send({ data: { name, terms: html, text: termsToText(html) } })
  })

  // ---- Commercial limits the UI needs to label its controls -------------
  app.get('/limits', { preHandler: staff }, async (_req, reply) => {
    return reply.send({
      data: {
        discountCaps: DISCOUNT_CAPS, amcPct: AMC_PCT, amcTerms: AMC_TERMS,
        attachMaxMb: Math.round(ATTACH_MAX_BYTES / 1048576),
      },
    })
  })

  // ---- The specification form, generated from one definition ------------
  // Served rather than duplicated in the frontend: these fields will be
  // revised, and a form built from this list changes with it.
  app.get('/spec-fields', { preHandler: staff }, async (_req, reply) => {
    return reply.send({ data: SPEC_FIELDS })
  })

  // ---- Customers: search, and explicit creation ------------------------
  app.get('/customers', { preHandler: staff }, async (req, reply) => {
    const { q } = (req.query ?? {}) as { q?: string }
    return reply.send({ data: await searchCustomers(String(q ?? '')) })
  })

  app.post('/customers', { preHandler: staff }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, string>
    const result = await createCustomerChecked(b)
    if (!result.ok) return reply.code(result.code).send(result.payload)
    return reply.code(201).send(result.payload)
  })

  app.get('/customers/:erpName', { preHandler: staff }, async (req, reply) => {
    const { erpName } = req.params as { erpName: string }
    return reply.send({ data: await customerDetail(erpName) })
  })

  // Fix a customer's details — a mistyped GSTIN or a missing address.
  app.patch('/customers/:erpName', { preHandler: staff }, async (req, reply) => {
    const { erpName } = req.params as { erpName: string }
    try {
      const r = await updateCustomerChecked(erpName, (req.body ?? {}) as Record<string, unknown>)
      if (!r.ok) return reply.code(r.code).send(r.payload)
      return reply.send(r.payload)
    } catch (e: any) {
      req.log.error({ err: e, erpName }, 'customer update failed')
      return reply.code(502).send({
        error: { code: 'update_failed', message: String(e?.message ?? e).slice(0, 300) },
      })
    }
  })

  // ---- The rendered PDF, proxied ---------------------------------------
  app.get('/:erpName/pdf', { preHandler: staff }, async (req, reply) => {
    const { erpName } = req.params as { erpName: string }
    try {
      const buf = await fetchQuotationPdf(erpName)
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="${erpName}.pdf"`)
        .send(Buffer.from(buf))
    } catch (e: any) {
      // Log the whole thing: the browser only ever sees the status code, and
      // a bare 502 tells nobody why ERPNext could not render.
      req.log.error({ err: e, erpName }, 'quotation PDF render failed')
      return reply.code(502).send({
        error: { code: 'pdf_failed', message: String(e?.message ?? e).slice(0, 300) },
      })
    }
  })

  // ---- Attachments -----------------------------------------------------
  // Extra documents that go out WITH the quotation PDF. Held on the
  // ERPNext Quotation itself, so what was sent stays visible next to the
  // document six months later.
  app.get('/:erpName/attachments', { preHandler: staff }, async (req, reply) => {
    const { erpName } = req.params as { erpName: string }
    return reply.send({ data: await listQuotationAttachments(erpName) })
  })

  app.post('/:erpName/attachments', {
    preHandler: staff,
    // Base64 inflates by a third, and Fastify's default cap is 1 MB.
    bodyLimit: ATTACH_MAX_BYTES * 2,
  }, async (req, reply) => {
    const { erpName } = req.params as { erpName: string }
    try {
      const r = await performAttach(erpName, (req.body ?? {}) as Record<string, any>)
      if (!r.ok) return reply.code(r.code).send(r.payload)
      return reply.code(201).send(r.payload)
    } catch (e: any) {
      req.log.error({ err: e, erpName }, 'quotation attachment upload failed')
      return reply.code(502).send({
        error: { code: 'attach_failed', message: String(e?.message ?? e).slice(0, 300) },
      })
    }
  })

  app.delete('/:erpName/attachments/:fileName', { preHandler: staff }, async (req, reply) => {
    const { erpName, fileName } = req.params as { erpName: string; fileName: string }
    const gone = await deleteQuotationAttachment(erpName, fileName)
    if (!gone) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'No such attachment on this quotation' },
      })
    }
    return reply.send({ data: { removed: fileName } })
  })

  // ---- Who would this go to, before sending it -------------------------
  app.get('/:erpName/recipients', { preHandler: staff }, async (req, reply) => {
    const { erpName } = req.params as { erpName: string }
    try {
      const r = await buildRecipients(erpName)
      return reply.send({ data: { ...r, provider: mailProvider() } })
    } catch (e: any) {
      return reply.code(404).send({
        error: { code: 'not_found', message: String(e?.message ?? e).slice(0, 250) },
      })
    }
  })

  app.post('/:erpName/send', { preHandler: staff }, async (req, reply) => {
    const { erpName } = req.params as { erpName: string }
    try {
      const r = await performSend(erpName, (req.body ?? {}) as Record<string, any>)
      if (!r.ok) return reply.code(r.code).send(r.payload)
      return reply.send(r.payload)
    } catch (e: any) {
      req.log.error({ err: e, erpName }, 'quotation send failed')
      return reply.code(502).send({
        error: { code: 'send_failed', message: String(e?.message ?? e).slice(0, 400) },
      })
    }
  })

  // ---- Create -----------------------------------------------------------
  app.post('/', { preHandler: staff }, async (req, reply) => {
    const result = await performQuotation(req, (req.body ?? {}) as QuoteBody, { via: 'crm' })
    if (!result.ok) return reply.code(result.code).send(result.payload)
    return reply.code(201).send(result.payload)
  })

  // ---- Edit a draft ------------------------------------------------------
  // Our mirror holds what was asked for — the kVA, the discounts, the
  // specification — which ERPNext never stores. That is what the edit
  // screen reloads, so the form comes back as it was filled in rather
  // than reverse-engineered from item codes.
  app.get('/:erpName/edit', { preHandler: staff }, async (req, reply) => {
    const { erpName } = req.params as { erpName: string }
    const r = await loadForEdit(erpName)
    if (!r.ok) return reply.code(r.code).send(r.payload)
    return reply.send(r.payload)
  })

  app.put('/:erpName', { preHandler: staff }, async (req, reply) => {
    const { erpName } = req.params as { erpName: string }
    const result = await performQuotation(
      req, (req.body ?? {}) as QuoteBody, { via: 'crm', updating: erpName })
    if (!result.ok) return reply.code(result.code).send(result.payload)
    return reply.send(result.payload)
  })

  // ---- List from the mirror --------------------------------------------
  app.get('/', { preHandler: staff }, async (req, reply) => {
    const { orgId } = (req.query ?? {}) as { orgId?: string }
    const { rows } = orgId
      ? await query(
          `select q.*, o.code as org_code, o.legal_name as org_name
             from quote_service.quotation_ref q
             left join quote_service.org o on o.id = q.org_id
            where q.org_id = $1 order by q.created_at desc limit 200`, [orgId])
      : await query(
          `select q.*, o.code as org_code, o.legal_name as org_name
             from quote_service.quotation_ref q
             left join quote_service.org o on o.id = q.org_id
            order by q.created_at desc limit 200`)
    return reply.send({ data: await reconcileQuotations(rows) })
  })

  // ---- The authoritative document --------------------------------------
  app.get('/:erpName', { preHandler: staff }, async (req, reply) => {
    const { erpName } = req.params as { erpName: string }
    try {
      const doc = await fetchQuotation(erpName)
      return reply.send({ data: doc })
    } catch (e: any) {
      return reply.code(404).send({
        error: { code: 'not_found', message: String(e?.message ?? e).slice(0, 300) },
      })
    }
  })
}

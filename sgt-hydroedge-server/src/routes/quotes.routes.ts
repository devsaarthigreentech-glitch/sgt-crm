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
import { sendQuotation, mailProvider, isEmail } from '../services/quoteMail.js'
import {
  createQuotation, itemPrice, fetchQuotation, listTermsTemplates, fetchTerms,
  searchCustomers, ensureQuotationCustomer, fetchQuotationPdf, fetchQuotationSummaries,
  type CreateQuotationInput,
} from '../services/erpQuotation.js'

const staff = requireRole('director', 'sales')

function actor(req: FastifyRequest) {
  return { id: req.user?.sub ?? null, name: req.user?.name ?? null }
}

export interface QuoteBody {
  kva?: number | string
  qty?: number
  rate?: string | number | null
  orgId?: number | null
  /** An existing ERPNext Customer. Required — quoting never creates one. */
  customerErpName?: string
  customer?: { name?: string; gstin?: string; state?: string; city?: string }
  validDays?: number
  termsTemplate?: string | null
  termsHtml?: string | null
  /** Either a percentage OR a rupee amount. Percentage wins if both. */
  discountPct?: number | string | null
  discountAmount?: number | string | null
  /** 1, 2 or 3 — adds that model's AMC item. */
  amcYears?: number | null
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
  return {
    name: `${o.legal_name}${o.code ? ` (${o.code})` : ''}`,
    address: addr || null,
    contact: contact || null,
    gstin: o.gstin ?? null,
  }
}

export async function performQuotation(
  req: FastifyRequest,
  body: QuoteBody,
  opts: { forcedOrgId?: number | null; via: 'crm' | 'portal' },
) {
  const who = actor(req)
  const qty = Math.max(1, Math.floor(Number(body.qty ?? 1)))

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

  const resolution = await resolveForKva(body.kva, { erpRate: itemPrice })
  if (!resolution.resolved) return { ok: false as const, code: 422, payload: resolution }

  const orgId = opts.forcedOrgId !== undefined ? opts.forcedOrgId : (body.orgId ?? null)

  // A partner code goes on the quotation as sales_partner so ERPNext
  // computes their commission. No org means SGT quoted directly.
  let salesPartner: string | null = null
  let commissionRate: number | null = null
  let orgType: string | null = null
  let partnerSnapshot: CreateQuotationInput['partner'] = null
  if (orgId) {
    const { rows } = await query(
      `select code, org_type, legal_name, trade_name, gstin,
              address_line1, address_line2, city, state, pincode,
              contact_name, contact_mobile, contact_email
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
  }

  // Discount authority follows the ORG raising the quote, not the login's
  // role — a dealer's cap must hold whether they raise it themselves or an
  // SGT user raises it on their behalf.
  //
  // Either form is accepted. The cap is a PERCENTAGE either way: an amount
  // is measured against the machine line so "₹2,00,000 off" cannot walk
  // past a 7% limit just because it was typed in rupees.
  const actorKind = actorFor(orgType)
  const machineLine = (Number(body.rate ?? resolution.rate) || 0) * qty
  const usingAmount = body.discountPct == null || body.discountPct === ''
  const discount = usingAmount
    ? checkDiscountAmount(body.discountAmount, machineLine, actorKind)
    : checkDiscount(body.discountPct, actorKind)
  if (!discount.ok) {
    return {
      ok: false as const, code: 422,
      payload: {
        error: { code: 'discount_too_high', message: discount.message },
        fields: usingAmount
          ? { discountAmount: discount.message }
          : { discountPct: discount.message },
      },
    }
  }
  const discountAmount = usingAmount ? (discount as any).amount ?? 0 : 0

  const input: CreateQuotationInput = {
    customerErpName,
    itemCode: resolution.modelCode,
    qty,
    rate: body.rate ?? resolution.rate,
    salesPartner,
    commissionRate,
    validDays: body.validDays,
    termsTemplate: body.termsTemplate ?? null,
    termsHtml: body.termsHtml ?? null,
    raisedBy: who.name ? `${who.name}${who.id ? ` (user ${who.id})` : ''}` : null,
    raisedByOrg: salesPartner,
    raisedVia: opts.via === 'portal' ? 'Partner portal' : 'SGT CRM',
    partner: partnerSnapshot,
    discountPct: usingAmount ? null : (discount.pct || null),
    discountAmount: discountAmount || null,
    // Its own priced item per model per term, so the printed line shows a
    // list rate rather than a discount off zero.
    amc: body.amcYears && AMC_TERMS.includes(Number(body.amcYears))
      ? { itemCode: amcItemCode(resolution.modelCode, Number(body.amcYears)), qty }
      : null,
  }

  const created = await createQuotation(input)

  // Mirror it locally. A failure here must NOT lose the quotation — it
  // already exists in ERPNext, which is the system of record.
  let mirrored = true
  try {
    await pool.query(
      `insert into quote_service.quotation_ref
         (erp_name, org_id, input_kva, model_id, model_code, qty, unit_rate,
          net_total, grand_total, commission_rate, erp_customer, customer_name,
          customer_gstin, customer_state, status, raised_by, raised_by_name, raised_via)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'draft',$15,$16,$17)
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
          updated_at = now()`,
      [created.erpName, orgId, Number(body.kva), resolution.modelId, resolution.modelCode,
       qty, input.rate ?? null, created.netTotal, created.grandTotal, commissionRate,
       created.customer.erpName, created.customer.erpName, body.customer?.gstin ?? null,
       body.customer?.state ?? null, who.id, who.name, opts.via],
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
        model: resolution.modelCode,
        ratingLabel: resolution.ratingLabel,
        coversUptoKva: resolution.coversUptoKva,
        qty,
        rate: input.rate,
        netTotal: created.netTotal,
        grandTotal: created.grandTotal,
        discountPct: discount.pct || null,
        discountAmount: discountAmount || created.discountAmount,
        amcYears: body.amcYears ?? null,
        taxTemplate: created.taxTemplate,
        termsTemplate: created.termsTemplate,
        termsWarning: created.termsWarning,
        totalTax: created.totalTax,
        taxWarning: created.taxWarning,
        commissionRate: created.commissionRate,
        totalCommission: created.totalCommission,
        customer: created.customer,
        salesPartner,
        mirrored,
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
export async function createCustomerChecked(b: Record<string, string>) {
  const name = String(b.name ?? '').trim()
  const gstin = String(b.gstin ?? '').trim().toUpperCase()
  const state = String(b.state ?? '').trim()

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
  if (Object.keys(fields).length) {
    return {
      ok: false as const, code: 422,
      payload: { error: { code: 'validation_failed', message: 'Some fields need attention' }, fields },
    }
  }

  const created = await ensureQuotationCustomer({
    name, gstin: gstin || null, state: state || null, city: b.city ?? null,
  })
  return { ok: true as const, payload: { data: created } }
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
    `select o.contact_email as own, p.contact_email as parent
       from quote_service.quotation_ref q
       join quote_service.org o on o.id = q.org_id
       left join quote_service.org p on p.id = o.parent_id
      where q.erp_name = $1`, [erpName])
  for (const r of rows) {
    if (r.own) cc.add(String(r.own).trim())
    if (r.parent) cc.add(String(r.parent).trim())
  }

  // Never copy someone we are already writing to.
  for (const t of to) cc.delete(t)

  return {
    to: to.filter(isEmail),
    cc: [...cc].filter(isEmail),
    rejected: [...to, ...cc].filter(a => a && !isEmail(a)),
    customerName: doc?.customer_name ?? '',
    grandTotal: doc?.grand_total ?? null,
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

  const subject = String(body.subject ?? '').trim() ||
    `Quotation ${erpName} from SGT HydroEdge`
  const message = String(body.message ?? '').trim() ||
    `<p>Dear ${built.customerName || 'Sir/Madam'},</p>` +
    `<p>Please find attached our quotation ${erpName} for your consideration.</p>` +
    `<p>We would be glad to answer any questions.</p>` +
    `<p>Regards,<br>SGT HydroEdge</p>`

  const result = await sendQuotation({
    erpName, to: built.to, cc: built.cc, subject, message,
  })
  return { ok: true as const, payload: { data: { ...result, rejected: built.rejected } } }
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
    return reply.send({ data: { name, terms: html } })
  })

  // ---- Commercial limits the UI needs to label its controls -------------
  app.get('/limits', { preHandler: staff }, async (_req, reply) => {
    return reply.send({
      data: { discountCaps: DISCOUNT_CAPS, amcPct: AMC_PCT, amcTerms: AMC_TERMS },
    })
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

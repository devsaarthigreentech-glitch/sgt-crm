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
  checkDiscount, actorFor, DISCOUNT_CAPS, amcRate, AMC_ITEM, AMC_PCT,
} from '../domain/quoteDiscount.js'
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
  discountPct?: number | string | null
  /** Add an AMC line at 10% of the unit rate. */
  amcYears?: number | null
}

/**
 * Shared by both the staff and portal routes so the two cannot drift.
 * `forcedOrgId` is set by the portal to the caller's own org — staff may
 * choose one, a partner may not.
 */
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
  if (orgId) {
    const { rows } = await query(
      `select code, org_type from quote_service.org where id = $1 and is_active`, [orgId])
    if (!rows.length) {
      return {
        ok: false as const, code: 400,
        payload: { error: { code: 'bad_request', message: 'Unknown or inactive partner' } },
      }
    }
    salesPartner = rows[0].code
    orgType = rows[0].org_type
    commissionRate = Number(process.env.ERP_PARTNER_COMMISSION ?? '40.48')
  }

  // Discount authority follows the ORG raising the quote, not the login's
  // role — a dealer's cap must hold whether they raise it themselves or an
  // SGT user raises it on their behalf.
  const discount = checkDiscount(body.discountPct, actorFor(orgType))
  if (!discount.ok) {
    return {
      ok: false as const, code: 422,
      payload: {
        error: { code: 'discount_too_high', message: discount.message },
        fields: { discountPct: discount.message },
      },
    }
  }

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
    discountPct: discount.pct || null,
    amc: body.amcYears && Number(body.amcYears) > 0
      ? {
          itemCode: AMC_ITEM,
          rate: amcRate(resolution.rate ?? 0, Number(body.amcYears)),
          qty,
        }
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
        discountAmount: created.discountAmount,
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

export default async function quotesRoutes(app: FastifyInstance) {
  // ---- Resolve — free, no side effects ---------------------------------
  app.post('/resolve', { preHandler: staff }, async (req, reply) => {
    const { kva, product } = (req.body ?? {}) as { kva?: unknown; product?: string }
    const r = await resolveForKva(kva, {
      productCode: product ?? 'GreenX',
      erpRate: itemPrice,
    })
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
      data: { discountCaps: DISCOUNT_CAPS, amcPct: AMC_PCT, amcItem: AMC_ITEM },
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

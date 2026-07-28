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
import {
  createQuotation, itemPrice, fetchQuotation,
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
  customer?: { name?: string; gstin?: string; state?: string; city?: string }
  validDays?: number
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

  // Cheapest check first: this needs neither the database nor ERPNext, so a
  // request missing the customer fails immediately instead of after a
  // catalogue lookup and a price call.
  const customerName = String(body.customer?.name ?? '').trim()
  if (!customerName) {
    return {
      ok: false as const, code: 400,
      payload: { error: { code: 'bad_request', message: 'Customer name is required' } },
    }
  }

  const resolution = await resolveForKva(body.kva, { erpRate: itemPrice })
  if (!resolution.resolved) return { ok: false as const, code: 422, payload: resolution }

  const orgId = opts.forcedOrgId !== undefined ? opts.forcedOrgId : (body.orgId ?? null)

  // A partner code goes on the quotation as sales_partner so ERPNext
  // computes their commission. No org means SGT quoted directly.
  let salesPartner: string | null = null
  let commissionRate: number | null = null
  if (orgId) {
    const { rows } = await query(
      `select code from quote_service.org where id = $1 and is_active`, [orgId])
    if (!rows.length) {
      return {
        ok: false as const, code: 400,
        payload: { error: { code: 'bad_request', message: 'Unknown or inactive partner' } },
      }
    }
    salesPartner = rows[0].code
    commissionRate = Number(process.env.ERP_PARTNER_COMMISSION ?? '40.48')
  }

  const input: CreateQuotationInput = {
    customer: {
      name: customerName,
      gstin: body.customer?.gstin ?? null,
      state: body.customer?.state ?? null,
      city: body.customer?.city ?? null,
    },
    itemCode: resolution.modelCode,
    qty,
    rate: body.rate ?? resolution.rate,
    salesPartner,
    commissionRate,
    validDays: body.validDays,
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
       on conflict (erp_name) do nothing`,
      [created.erpName, orgId, Number(body.kva), resolution.modelId, resolution.modelCode,
       qty, input.rate ?? null, created.netTotal, created.grandTotal, commissionRate,
       created.customer.erpName, customerName, body.customer?.gstin ?? null,
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
        taxTemplate: created.taxTemplate,
        commissionRate: created.commissionRate,
        totalCommission: created.totalCommission,
        customer: created.customer,
        salesPartner,
        mirrored,
      },
    },
  }
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
    return reply.send({ data: rows })
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

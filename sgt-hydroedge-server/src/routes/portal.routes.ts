// =============================================================================
// routes/portal.routes.ts — the distributor's own view.
// -----------------------------------------------------------------------------
// Mounted at /api/v1/portal. This is the ONLY prefix an external role can
// reach; see src/auth/policy.ts, which denies everything else by default.
//
//     GET /portal/me        the caller's own org
//     GET /portal/dealers   the dealers beneath them
//
// Scoping rules this file obeys without exception:
//
//  1. The caller's org is resolved from the DATABASE on every request,
//     keyed on the JWT's subject — never read from the token itself.
//     A token is a claim about identity, not about scope. If someone is
//     moved to a different org or deactivated, that must take effect on
//     the next request, not whenever their token happens to expire.
//
//  2. Every query is bounded by quote_service.visible_org_ids(theirOrg),
//     which walks strictly downwards. A distributor therefore cannot see
//     SGT, cannot see a sibling distributor, and cannot see that
//     distributor's dealers.
//
//  3. No route here accepts an org id from the client. Not as a param,
//     not as a query string, not in a body. The only org that can be
//     asked about is the one the caller is attached to, so there is
//     nothing to tamper with.
//
//  4. Nothing here exposes price books. A distributor seeing dealer_net
//     would be a Clause 17 breach, so pricing simply is not reachable
//     from this file.
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query, pool } from '../db/pool.js'
import { requireAuth } from '../auth/guard.js'
import { validateForSubmit, type RegistrationInput } from '../domain/partnerValidation.js'
import { inspectGstin } from '../domain/gstin.js'
import { resolveForKva } from '../domain/quotePricing.js'
import { actorFor, DISCOUNT_CAPS, AMC_PCT, AMC_ITEM } from '../domain/quoteDiscount.js'
import {
  itemPrice, listTermsTemplates, fetchTerms, searchCustomers, fetchQuotationPdf,
} from '../services/erpQuotation.js'
import {
  performQuotation, createCustomerChecked, reconcileQuotations,
  buildRecipients, performSend, type QuoteBody,
} from './quotes.routes.js'
import { mailProvider } from '../services/quoteMail.js'

interface Caller {
  userId: string
  orgId: number
  orgCode: string
  orgType: string
  legalName: string
}

/**
 * Resolve the caller's org from the database. Returns null and sends the
 * response when the account is not usable, so handlers can simply bail.
 */
async function resolveCaller(
  req: FastifyRequest, reply: FastifyReply,
): Promise<Caller | null> {
  const sub = (req.user as { sub?: string } | undefined)?.sub
  if (!sub) {
    reply.code(401).send({ error: { code: 'unauthorized', message: 'Login required' } })
    return null
  }
  const { rows } = await query(
    `select u.id, u.org_id, u.active,
            o.code, o.org_type, o.legal_name, o.is_active as org_active
       from lead_service.app_user u
       left join quote_service.org o on o.id = u.org_id
      where u.id = $1`, [sub])

  const row = rows[0]
  if (!row || !row.active) {
    reply.code(403).send({ error: { code: 'forbidden', message: 'Account is not active' } })
    return null
  }
  if (!row.org_id || !row.org_active) {
    reply.code(403).send({
      error: { code: 'no_org', message: 'This account is not linked to an active partner' },
    })
    return null
  }
  return {
    userId: String(row.id),
    orgId: row.org_id,
    orgCode: row.code,
    orgType: row.org_type,
    legalName: row.legal_name,
  }
}

export default async function portalRoutes(app: FastifyInstance) {
  // ---- Who am I ---------------------------------------------------------
  app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return

    const { rows } = await query(
      `select code, legal_name, trade_name, org_type, dealer_type,
              territory, gstin, created_at
         from quote_service.org
        where id = $1`, [me.orgId])

    const { rows: [counts] } = await query(
      `select count(*) filter (where org_type = 'dealer')     as dealers,
              count(*) filter (where org_type = 'sub_dealer') as sub_dealers
         from quote_service.org
        where id in (select org_id from quote_service.visible_org_ids($1))
          and id <> $1`, [me.orgId])

    return reply.send({
      data: {
        user: { id: me.userId, name: (req.user as any)?.name, email: (req.user as any)?.email },
        org: rows[0],
        counts,
      },
    })
  })

  // ---- The dealers I manage ---------------------------------------------
  // Bounded by visible_org_ids and excludes the caller's own row, so this
  // returns descendants only. No client-supplied org id anywhere.
  app.get('/dealers', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return

    const { rows } = await query(
      `select o.id, o.code, o.legal_name, o.trade_name, o.org_type,
              o.dealer_type, o.territory, o.gstin, o.is_active, o.created_at,
              p.code as parent_code
         from quote_service.org o
         left join quote_service.org p on p.id = o.parent_id
        where o.id in (select org_id from quote_service.visible_org_ids($1))
          and o.id <> $1
        order by case when o.org_type = 'dealer' then 0 else 1 end, o.code`,
      [me.orgId])

    return reply.send({ data: rows })
  })

  // =========================================================================
  // Quotations.
  //
  // ERPNext owns the document; the distributor never touches ERPNext. Every
  // call here goes through the same performQuotation() the CRM uses, with
  // one difference that matters: the partner's org is FORCED to their own,
  // so a quotation can never be raised in another partner's name and the
  // commission always lands with whoever actually raised it.
  //
  // Listing reads our local mirror, bounded by visible_org_ids — which is
  // the only reason the mirror exists.
  // =========================================================================

  app.post('/quotes/resolve', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    const { kva } = (req.body ?? {}) as { kva?: unknown }
    const r = await resolveForKva(kva, { erpRate: itemPrice })
    return reply.send({ data: r })
  })

  // Partners get the same terms templates and the same ability to edit the
  // wording on their own quote — they are the ones signing it with the customer.
  app.get('/quotes/terms', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    const list = await listTermsTemplates()
    const preferred = process.env.ERP_DEALER_TERMS ?? 'GreenX Dealer Quotation Terms'
    return reply.send({ data: { templates: list.map(t => t.name), default: preferred } })
  })

  app.get('/quotes/terms/:name', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    const { name } = req.params as { name: string }
    const html = await fetchTerms(name)
    if (html === null) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'No such terms template' } })
    }
    return reply.send({ data: { name, terms: html } })
  })

  app.get('/quotes/limits', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    // Only the cap that applies to THEM — a dealer has no business seeing
    // what a distributor may discount.
    const actor = actorFor(me.orgType)
    return reply.send({
      data: {
        discountCaps: { [actor]: DISCOUNT_CAPS[actor] },
        maxDiscount: DISCOUNT_CAPS[actor],
        amcPct: AMC_PCT,
        amcItem: AMC_ITEM,
      },
    })
  })

  app.get('/quotes/customers', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    const { q } = (req.query ?? {}) as { q?: string }
    return reply.send({ data: await searchCustomers(String(q ?? '')) })
  })

  app.post('/quotes/customers', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    const result = await createCustomerChecked((req.body ?? {}) as Record<string, string>)
    if (!result.ok) return reply.code(result.code).send(result.payload)
    return reply.code(201).send(result.payload)
  })

  // Sending is scoped exactly like the PDF: a partner may only send a
  // quotation from their own org tree.
  async function ownsQuotation(erpName: string, orgId: number) {
    const { rows } = await query(
      `select 1 from quote_service.quotation_ref
        where erp_name = $1
          and org_id in (select org_id from quote_service.visible_org_ids($2))`,
      [erpName, orgId])
    return rows.length > 0
  }

  app.get('/quotes/:erpName/recipients', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    const { erpName } = req.params as { erpName: string }
    if (!await ownsQuotation(erpName, me.orgId)) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } })
    }
    const r = await buildRecipients(erpName)
    return reply.send({ data: { ...r, provider: mailProvider() } })
  })

  app.post('/quotes/:erpName/send', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    const { erpName } = req.params as { erpName: string }
    if (!await ownsQuotation(erpName, me.orgId)) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } })
    }
    try {
      const r = await performSend(erpName, (req.body ?? {}) as Record<string, any>)
      if (!r.ok) return reply.code(r.code).send(r.payload)
      return reply.send(r.payload)
    } catch (e: any) {
      req.log.error({ err: e, erpName }, 'portal quotation send failed')
      return reply.code(502).send({
        error: { code: 'send_failed', message: String(e?.message ?? e).slice(0, 400) },
      })
    }
  })

  // The PDF, proxied. Scoped first: a partner may only download a quotation
  // that belongs to their own org tree.
  app.get('/quotes/:erpName/pdf', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    const { erpName } = req.params as { erpName: string }
    const { rows } = await query(
      `select 1 from quote_service.quotation_ref
        where erp_name = $1
          and org_id in (select org_id from quote_service.visible_org_ids($2))`,
      [erpName, me.orgId])
    if (!rows.length) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } })
    }
    try {
      const buf = await fetchQuotationPdf(erpName)
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="${erpName}.pdf"`)
        .send(Buffer.from(buf))
    } catch (e: any) {
      req.log.error({ err: e, erpName }, 'portal quotation PDF render failed')
      return reply.code(502).send({
        error: { code: 'pdf_failed', message: String(e?.message ?? e).slice(0, 300) },
      })
    }
  })

  app.post('/quotes', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    const body = (req.body ?? {}) as QuoteBody
    // forcedOrgId — the partner cannot choose whose quotation this is.
    const result = await performQuotation(req, body, { forcedOrgId: me.orgId, via: 'portal' })
    if (!result.ok) return reply.code(result.code).send(result.payload)
    return reply.code(201).send(result.payload)
  })

  app.get('/quotes', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    const { rows } = await query(
      `select q.id, q.erp_name, q.input_kva, q.model_code, q.qty, q.unit_rate,
              q.net_total, q.grand_total, q.commission_rate,
              q.customer_name, q.customer_state, q.status, q.created_at,
              o.code as org_code
         from quote_service.quotation_ref q
         left join quote_service.org o on o.id = q.org_id
        where q.org_id in (select org_id from quote_service.visible_org_ids($1))
        order by q.created_at desc
        limit 200`, [me.orgId])
    // Same reconciliation as the CRM list: ERPNext is the system of record,
    // and a quotation deleted there must not linger here.
    return reply.send({ data: await reconcileQuotations(rows) })
  })

  // ---- Edit a dealer they manage -----------------------------------------
  // Same master-data fields the director gets, with two deliberate omissions:
  //
  //   status      — suspending or terminating a partner is SGT's call.
  //   dealer_type — changing it mints a new code, and codes are SGT's to
  //                 allot. The distributor asks; SGT does it.
  //
  // Scope is enforced twice: the org must be inside visible_org_ids (their
  // subtree) AND must not be the caller's own org, so a distributor cannot
  // edit themselves through this route.
  const DEALER_WRITABLE = [
    'legal_name', 'trade_name', 'territory', 'gstin', 'pan',
    'address_line1', 'address_line2', 'city', 'state', 'state_code', 'pincode',
    'contact_name', 'contact_designation', 'contact_mobile', 'contact_email',
    'bank_account_name', 'bank_account_number', 'bank_ifsc', 'bank_name', 'bank_branch',
  ] as const

  const D_IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/
  const D_PAN = /^[A-Z]{5}\d{4}[A-Z]$/
  const D_PIN = /^\d{6}$/
  const D_MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  function validateDealerPatch(p: Record<string, unknown>): Record<string, string> {
    const e: Record<string, string> = {}
    const s = (k: string) => (p[k] == null ? '' : String(p[k]).trim())
    if ('legal_name' in p && !s('legal_name')) e.legal_name = 'Name cannot be blank'
    if (s('gstin')) {
      const g = inspectGstin(s('gstin'))
      if (!g.valid) e.gstin = g.message ?? 'GSTIN is not valid'
    }
    if (s('pan') && !D_PAN.test(s('pan').toUpperCase())) e.pan = 'PAN should look like AAAAA9999A'
    if (s('bank_ifsc') && !D_IFSC.test(s('bank_ifsc').toUpperCase())) e.bank_ifsc = 'IFSC should look like HDFC0001234'
    if (s('pincode') && !D_PIN.test(s('pincode'))) e.pincode = 'PIN code must be 6 digits'
    if (s('contact_email') && !D_MAIL.test(s('contact_email'))) e.contact_email = 'Enter a valid email address'
    return e
  }

  app.get('/dealers/:id', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    const { id } = req.params as { id: string }
    const { rows } = await query(
      `select o.*, p.code as parent_code
         from quote_service.org o
         left join quote_service.org p on p.id = o.parent_id
        where o.id = $1
          and o.id in (select org_id from quote_service.visible_org_ids($2))
          and o.id <> $2`, [id, me.orgId])
    if (!rows.length) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } })
    }
    return reply.send({ data: rows[0] })
  })

  app.patch('/dealers/:id', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    const { id } = req.params as { id: string }
    const body = (req.body ?? {}) as Record<string, unknown>

    const errors = validateDealerPatch(body)
    if (Object.keys(errors).length) {
      return reply.code(422).send({
        error: { code: 'validation_failed', message: 'Some fields need attention' },
        fields: errors,
      })
    }

    const client = await pool.connect()
    try {
      await client.query('begin')
      const { rows: before } = await client.query(
        `select * from quote_service.org
          where id = $1
            and id in (select org_id from quote_service.visible_org_ids($2))
            and id <> $2
          for update`, [id, me.orgId])
      if (!before.length) {
        await client.query('rollback')
        return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } })
      }

      const gstin = body.gstin == null ? '' : String(body.gstin).trim()
      if (gstin) {
        const { rows: dupe } = await client.query(
          `select code from quote_service.org
            where upper(gstin) = upper($1) and id <> $2 limit 1`, [gstin, id])
        if (dupe.length) {
          await client.query('rollback')
          return reply.code(409).send({
            error: { code: 'gstin_exists', message: 'Another partner already holds this GSTIN.' },
          })
        }
      }

      const sets: string[] = []
      const values: unknown[] = []
      const changes: Record<string, { from: unknown; to: unknown }> = {}
      for (const col of DEALER_WRITABLE) {
        if (!(col in body)) continue
        if (before[0][col] === body[col]) continue
        changes[col] = { from: before[0][col], to: body[col] }
        values.push(body[col])
        sets.push(`${col} = $${values.length}`)
      }
      if (!sets.length) {
        await client.query('rollback')
        return reply.send({ data: before[0], unchanged: true })
      }
      values.push(id)
      const { rows } = await client.query(
        `update quote_service.org set ${sets.join(', ')}, updated_at = now()
          where id = $${values.length} returning *`, values)

      // Attributed to the distributor, so SGT can see who changed what.
      await client.query(
        `insert into quote_service.org_event (org_id, event_type, actor, actor_name, changes, note)
         values ($1, 'updated', $2, $3, $4, $5)`,
        [id, me.userId, (req.user as any)?.name ?? null, JSON.stringify(changes),
         `via distributor portal (${me.orgCode})`])

      await client.query('commit')
      return reply.send({ data: rows[0], changed: Object.keys(changes) })
    } catch (err) {
      await client.query('rollback')
      throw err
    } finally {
      client.release()
    }
  })

  // =========================================================================
  // Dealer registrations the distributor raises for their OWN network.
  //
  // They fill it in and submit; SGT approves and mints the code. An external
  // party never allots a transacting code — that stays with the director,
  // per the partner spec's approval rule.
  //
  // parent_org_id is ALWAYS the caller's own org, taken from the database and
  // never from the request. There is deliberately no way to express "register
  // a dealer under someone else", so there is nothing to forge.
  // =========================================================================

  const PORTAL_WRITABLE = [
    'dealer_type',
    'legal_name', 'trade_name', 'constitution', 'years_in_business',
    'gstin', 'pan', 'state_code',
    'address_line1', 'address_line2', 'city', 'state', 'pincode',
    'contact_name', 'contact_designation', 'contact_mobile', 'contact_email',
    'bank_account_name', 'bank_account_number', 'bank_ifsc', 'bank_name', 'bank_branch',
    'proposed_territory', 'customer_segments', 'product_lines',
    'expected_annual_units', 'existing_brands',
    'profile',
  ] as const
  // Note what is absent: partner_type, parent_org_id, status, allotted_code,
  // created_org_id, approved_by. A distributor cannot set any of them.

  /** Fetch a registration only if it belongs to the caller's org. */
  async function ownedRegistration(regId: string, orgId: number) {
    const { rows } = await query(
      `select * from partner_service.registration
        where id = $1 and parent_org_id = $2 and partner_type = 'dealer'`,
      [regId, orgId])
    return rows[0] ?? null
  }

  app.get('/reference', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    const { rows: states } = await query(
      `select code, name from partner_service.state_code where is_active order by name`)
    return reply.send({
      data: {
        states,
        constitutions: ['Proprietorship', 'Partnership', 'LLP', 'Private Limited',
                        'Public Limited', 'HUF', 'Trust', 'Society', 'Other'],
        productLines: ['GreenX', 'GreenDrive', 'HHOx', 'GreenMarine', 'GreenEdge'],
        industries: ['Industrial', 'Commercial', 'Infrastructure', 'Mining',
                     'Marine', 'Hospitality', 'Healthcare', 'Data centre'],
        dealerTypes: [
          { value: 'SM', label: 'Sales & Marketing' },
          { value: 'SS', label: 'Sales & Service' },
        ],
        // Echoed back so the form can show who the dealer will sit under,
        // rather than offering a choice.
        parent: { code: me.orgCode, legal_name: me.legalName },
      },
    })
  })

  app.get('/registrations', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    const { rows } = await query(
      `select id, legal_name, trade_name, dealer_type, status, gstin, city, state,
              allotted_code, created_at, updated_at, submitted_at, rejection_reason
         from partner_service.registration
        where parent_org_id = $1 and partner_type = 'dealer'
        order by updated_at desc`, [me.orgId])
    return reply.send({ data: rows })
  })

  app.get('/registrations/:id', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    const { id } = req.params as { id: string }
    const reg = await ownedRegistration(id, me.orgId)
    if (!reg) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } })
    }
    return reply.send({ data: reg })
  })

  app.post('/registrations', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    if (me.orgType !== 'distributor') {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Only a distributor can register dealers' },
      })
    }
    const b = (req.body ?? {}) as Record<string, unknown>
    const legalName = String(b.legal_name ?? '').trim()
    if (!legalName) {
      return reply.code(400).send({
        error: { code: 'bad_request', message: 'Legal name is required to start' },
      })
    }

    const client = await pool.connect()
    try {
      await client.query('begin')
      const { rows: [reg] } = await client.query(
        `insert into partner_service.registration
           (partner_type, parent_org_id, legal_name, status, created_by, created_by_name)
         values ('dealer', $1, $2, 'draft', $3, $4)
         returning *`,
        [me.orgId, legalName, me.userId, (req.user as any)?.name ?? null])
      await client.query(
        `insert into partner_service.registration_event
           (registration_id, event_type, from_status, to_status, actor, actor_name, payload)
         values ($1, 'created', null, 'draft', $2, $3, $4)`,
        [reg.id, me.userId, (req.user as any)?.name ?? null,
         JSON.stringify({ via: 'distributor_portal', org: me.orgCode })])
      await client.query('commit')
      return reply.code(201).send({ data: reg })
    } catch (err) {
      await client.query('rollback')
      throw err
    } finally {
      client.release()
    }
  })

  app.patch('/registrations/:id', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    const { id } = req.params as { id: string }
    const reg = await ownedRegistration(id, me.orgId)
    if (!reg) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } })
    }
    if (reg.status !== 'draft') {
      return reply.code(409).send({
        error: { code: 'not_editable', message: `Already ${reg.status} — no longer editable` },
      })
    }
    const body = (req.body ?? {}) as Record<string, unknown>
    const sets: string[] = []
    const values: unknown[] = []
    for (const col of PORTAL_WRITABLE) {
      if (!(col in body)) continue
      values.push(body[col])
      sets.push(`${col} = $${values.length}`)
    }
    if (!sets.length) {
      return reply.code(400).send({
        error: { code: 'bad_request', message: 'No writable fields supplied' },
      })
    }
    values.push(id, me.orgId)
    const { rows } = await query(
      `update partner_service.registration
          set ${sets.join(', ')}, updated_at = now()
        where id = $${values.length - 1} and parent_org_id = $${values.length}
        returning *`, values)
    return reply.send({ data: rows[0] })
  })

  app.post('/registrations/:id/submit', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    const { id } = req.params as { id: string }

    const client = await pool.connect()
    try {
      await client.query('begin')
      const { rows } = await client.query(
        `select * from partner_service.registration
          where id = $1 and parent_org_id = $2 and partner_type = 'dealer'
          for update`, [id, me.orgId])
      if (!rows.length) {
        await client.query('rollback')
        return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } })
      }
      const reg = rows[0]
      if (reg.status !== 'draft') {
        await client.query('rollback')
        return reply.code(409).send({
          error: { code: 'not_submittable', message: `Already ${reg.status}` },
        })
      }
      // Same validator the director's form uses — one required-field matrix
      // for the whole system, not a looser one for partners.
      const errors = validateForSubmit(reg as RegistrationInput)
      if (Object.keys(errors).length) {
        await client.query('rollback')
        return reply.code(422).send({
          error: { code: 'validation_failed', message: 'Some fields need attention' },
          fields: errors,
        })
      }
      const { rows: [updated] } = await client.query(
        `update partner_service.registration
            set status = 'submitted', submitted_at = now(), updated_at = now()
          where id = $1 returning *`, [id])
      await client.query(
        `insert into partner_service.registration_event
           (registration_id, event_type, from_status, to_status, actor, actor_name, payload)
         values ($1, 'submitted', 'draft', 'submitted', $2, $3, $4)`,
        [id, me.userId, (req.user as any)?.name ?? null,
         JSON.stringify({ via: 'distributor_portal', org: me.orgCode })])
      await client.query('commit')
      return reply.send({ data: updated })
    } catch (err) {
      await client.query('rollback')
      throw err
    } finally {
      client.release()
    }
  })

  // Offline GSTIN check, same domain module as the director's form.
  app.post('/gstin/inspect', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return
    const { gstin } = (req.body ?? {}) as { gstin?: string }
    const result = inspectGstin(String(gstin ?? ''))
    let stateName: string | null = null
    if (result.stateCode) {
      try {
        const { rows } = await query(
          `select name from partner_service.state_code where code = $1`, [result.stateCode])
        stateName = rows[0]?.name ?? null
      } catch (err) {
        req.log.warn({ err }, 'portal gstin/inspect: state lookup failed')
      }
    }
    return reply.send({ data: { ...result, stateName } })
  })
}

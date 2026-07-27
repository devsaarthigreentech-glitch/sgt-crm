// =============================================================================
// routes/partnerRegistration.routes.ts — partner onboarding (P4).
// -----------------------------------------------------------------------------
// Mounted at /api/v1/partners:
//     GET   /partners/reference                     dropdown data
//     POST  /partners/registrations                 create draft
//     GET   /partners/registrations                 list
//     GET   /partners/registrations/:id             detail
//     PATCH /partners/registrations/:id             save draft — NO validation
//     POST  /partners/registrations/:id/submit      validate, then submit
//
// AUTH: director only, for now. The `partner_ops` role and its route
// whitelist are P3 — deliberately not invented here, because a half-built
// role is worse than no role. Approve/reject and code allotment are P6.
//
// The prefix /api/v1/partners was freed when the legacy Partner Portal was
// removed on 2026-07-27. Unrelated module, same word.
//
// Validation lives canonically in domain/partnerValidation.ts and is called
// from exactly one place below — the submit handler. PATCH never calls it,
// because a half-filled draft must always save.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { query, pool } from '../db/pool.js'
import { requireRole } from '../auth/guard.js'
import { validateForSubmit, type RegistrationInput } from '../domain/partnerValidation.js'
import { inspectGstin } from '../domain/gstin.js'

const director = requireRole('director')

// Columns a caller may write. Anything outside this list is ignored rather
// than rejected, so an over-eager client cannot touch workflow columns
// (status, allotted_code, approved_by, created_org_id…) by adding a key.
const WRITABLE = [
  'partner_type', 'dealer_type', 'parent_org_id',
  'legal_name', 'trade_name', 'constitution', 'incorporation_date', 'years_in_business',
  'gstin', 'pan', 'gst_category', 'state_code', 'udyam_number', 'tan',
  'address_line1', 'address_line2', 'city', 'state', 'pincode', 'country',
  'contact_name', 'contact_designation', 'contact_mobile', 'contact_email',
  'alt_contact_name', 'alt_contact_mobile', 'alt_contact_email',
  'bank_account_name', 'bank_account_number', 'bank_ifsc', 'bank_name', 'bank_branch',
  'proposed_territory', 'product_lines', 'customer_segments',
  'expected_annual_units', 'existing_brands', 'annual_turnover_band',
  'profile',
] as const

const CONSTITUTIONS = [
  'Proprietorship', 'Partnership', 'LLP', 'Private Limited',
  'Public Limited', 'HUF', 'Trust', 'Society', 'Other',
]

const PRODUCT_LINES = ['GreenX', 'GreenDrive', 'HHOx', 'GreenMarine', 'GreenEdge']

const DEALER_TYPES = [
  { value: 'SM', label: 'Sales & Marketing', canSell: true, canService: false },
  { value: 'SS', label: 'Sales & Service', canSell: true, canService: true },
]

const DOC_TYPES = [
  { value: 'gst_certificate', label: 'GST certificate' },
  { value: 'pan_card', label: 'PAN card' },
  { value: 'incorporation_certificate', label: 'Certificate of incorporation' },
  { value: 'partnership_deed', label: 'Partnership deed' },
  { value: 'cancelled_cheque', label: 'Cancelled cheque' },
  { value: 'address_proof', label: 'Address proof' },
  { value: 'udyam_certificate', label: 'Udyam certificate' },
  { value: 'service_capability_proof', label: 'Workshop / tooling photos' },
  { value: 'signed_agreement', label: 'Signed agreement' },
]

function actor(req: FastifyRequest) {
  return { id: req.user?.sub ?? null, name: req.user?.name ?? null }
}

export default async function partnerRegistrationRoutes(app: FastifyInstance) {
  // ---- Reference data for the form's dropdowns --------------------------
  app.get('/reference', { preHandler: director }, async (_req, reply) => {
    const [states, distributors] = await Promise.all([
      query(`select code, name from partner_service.state_code
              where is_active order by name`),
      query(`select id, code, legal_name from quote_service.org
              where org_type = 'distributor' and is_active order by legal_name`),
    ])
    return reply.send({
      data: {
        constitutions: CONSTITUTIONS,
        productLines: PRODUCT_LINES,
        dealerTypes: DEALER_TYPES,
        docTypes: DOC_TYPES,
        states: states.rows,
        distributors: distributors.rows,
      },
    })
  })

  // ---- The live partner network -----------------------------------------
  // quote_service.org, NOT partner_service.registration. These are two
  // different things and conflating them is how a duplicate gets created:
  // registrations are applications, orgs are partners who actually exist.
  // EDINGX001 was seeded by migrate_quote_01 and never had an application,
  // so it appears here and nowhere in the registration list.
  app.get('/orgs', { preHandler: director }, async (_req, reply) => {
    const { rows } = await query(/* sql */ `
      select o.id, o.code, o.legal_name, o.trade_name, o.org_type, o.dealer_type,
             o.territory, o.gstin, o.is_active, o.created_at,
             p.code as parent_code, p.legal_name as parent_name
        from quote_service.org o
        left join quote_service.org p on p.id = o.parent_id
       where o.org_type <> 'sgt'
       order by coalesce(p.code, o.code),
                case when o.org_type = 'distributor' then 0 else 1 end,
                o.code
    `)
    return reply.send({ data: rows })
  })

  // ---- GSTIN Phase A: structure + checksum + derivation -----------------
  // Entirely offline — no external call, nothing metered. Resolves the
  // state name from the derived code so the form can prefill it.
  app.post('/gstin/inspect', { preHandler: director }, async (req, reply) => {
    const { gstin } = (req.body ?? {}) as { gstin?: string }
    const result = inspectGstin(String(gstin ?? ''))

    // The state name is a nicety; the checksum and derivation are the point
    // and need no database. A DB problem must not take the whole inspection
    // down, or Phase A stops being the dependency-free check it exists to be.
    let stateName: string | null = null
    if (result.stateCode) {
      try {
        const { rows } = await query(
          `select name from partner_service.state_code where code = $1`, [result.stateCode])
        stateName = rows[0]?.name ?? null
      } catch (err) {
        req.log.warn({ err }, 'gstin/inspect: state_code lookup failed; returning derivation only')
      }
    }
    return reply.send({ data: { ...result, stateName } })
  })

  // ---- Create a draft ---------------------------------------------------
  // legal_name is NOT NULL in schema, so it is the one field required even
  // to open a draft. Everything else can be filled in later.
  app.post('/registrations', { preHandler: director }, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const legalName = String(body.legal_name ?? '').trim()
    if (!legalName) {
      return reply.code(400).send({
        error: { code: 'bad_request', message: 'legal_name is required to start a draft' },
      })
    }
    const partnerType = body.partner_type === 'dealer' ? 'dealer' : 'distributor'
    const who = actor(req)

    const client = await pool.connect()
    try {
      await client.query('begin')
      const { rows: [reg] } = await client.query(
        `insert into partner_service.registration
           (partner_type, legal_name, status, created_by, created_by_name)
         values ($1, $2, 'draft', $3, $4)
         returning *`,
        [partnerType, legalName, who.id, who.name],
      )
      await client.query(
        `insert into partner_service.registration_event
           (registration_id, event_type, from_status, to_status, actor, actor_name)
         values ($1, 'created', null, 'draft', $2, $3)`,
        [reg.id, who.id, who.name],
      )
      await client.query('commit')
      return reply.code(201).send({ data: reg })
    } catch (err) {
      await client.query('rollback')
      throw err
    } finally {
      client.release()
    }
  })

  // ---- List -------------------------------------------------------------
  app.get('/registrations', { preHandler: director }, async (req, reply) => {
    const { status } = (req.query ?? {}) as { status?: string }
    const rows = status
      ? await query(
          `select id, partner_type, dealer_type, legal_name, trade_name, status,
                  gstin, city, state, allotted_code, created_at, updated_at
             from partner_service.registration
            where status = $1
            order by updated_at desc`, [status])
      : await query(
          `select id, partner_type, dealer_type, legal_name, trade_name, status,
                  gstin, city, state, allotted_code, created_at, updated_at
             from partner_service.registration
            order by updated_at desc`)
    return reply.send({ data: rows.rows })
  })

  // ---- Detail -----------------------------------------------------------
  app.get('/registrations/:id', { preHandler: director }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { rows } = await query(
      `select * from partner_service.registration where id = $1`, [id])
    if (!rows.length) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Registration not found' },
      })
    }
    const docs = await query(
      `select id, doc_type, original_filename, mime_type, size_bytes,
              uploaded_at, verified
         from partner_service.registration_document
        where registration_id = $1 and deleted_at is null
        order by uploaded_at`, [id])
    return reply.send({ data: { ...rows[0], documents: docs.rows } })
  })

  // ---- Save draft — NO validation ---------------------------------------
  app.patch('/registrations/:id', { preHandler: director }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = (req.body ?? {}) as Record<string, unknown>

    const { rows: existing } = await query(
      `select status from partner_service.registration where id = $1`, [id])
    if (!existing.length) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Registration not found' },
      })
    }
    if (existing[0].status !== 'draft') {
      return reply.code(409).send({
        error: {
          code: 'not_editable',
          message: `Cannot edit a registration in status '${existing[0].status}'`,
        },
      })
    }

    const sets: string[] = []
    const values: unknown[] = []
    for (const col of WRITABLE) {
      if (!(col in body)) continue
      values.push(body[col])
      sets.push(`${col} = $${values.length}`)
    }
    if (!sets.length) {
      return reply.code(400).send({
        error: { code: 'bad_request', message: 'No writable fields supplied' },
      })
    }
    values.push(id)
    const { rows } = await query(
      `update partner_service.registration
          set ${sets.join(', ')}, updated_at = now()
        where id = $${values.length}
        returning *`, values)
    return reply.send({ data: rows[0] })
  })

  // ---- Submit — the only place validation runs --------------------------
  app.post('/registrations/:id/submit', { preHandler: director }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const who = actor(req)

    const client = await pool.connect()
    try {
      await client.query('begin')

      // Lock the row so two submits cannot race past the status guard.
      const { rows } = await client.query(
        `select * from partner_service.registration where id = $1 for update`, [id])
      if (!rows.length) {
        await client.query('rollback')
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Registration not found' },
        })
      }
      const reg = rows[0]
      if (reg.status !== 'draft') {
        await client.query('rollback')
        return reply.code(409).send({
          error: {
            code: 'not_submittable',
            message: `Registration is already '${reg.status}'`,
          },
        })
      }

      const errors = validateForSubmit(reg as RegistrationInput)
      if (Object.keys(errors).length) {
        await client.query('rollback')
        // 422, not 400: the request was well-formed, the record is not ready.
        return reply.code(422).send({
          error: { code: 'validation_failed', message: 'Some fields need attention' },
          fields: errors,
        })
      }

      const { rows: [updated] } = await client.query(
        `update partner_service.registration
            set status = 'submitted', submitted_at = now(), updated_at = now()
          where id = $1
          returning *`, [id])
      await client.query(
        `insert into partner_service.registration_event
           (registration_id, event_type, from_status, to_status, actor, actor_name)
         values ($1, 'submitted', 'draft', 'submitted', $2, $3)`,
        [id, who.id, who.name],
      )
      await client.query('commit')
      return reply.send({ data: updated })
    } catch (err) {
      await client.query('rollback')
      throw err
    } finally {
      client.release()
    }
  })
}

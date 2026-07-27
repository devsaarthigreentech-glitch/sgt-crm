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
import { allotCode } from '../domain/partnerCode.js'

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

  // =========================================================================
  // Editing a LIVE partner (the org), as opposed to their application.
  //
  // The registration is frozen at submit and stays that way — it records
  // what was applied for. Everything that changes over a partner's life is
  // edited here instead.
  // =========================================================================

  const ORG_WRITABLE = [
    'legal_name', 'trade_name', 'territory', 'gstin', 'pan',
    'address_line1', 'address_line2', 'city', 'state', 'state_code', 'pincode', 'country',
    'contact_name', 'contact_designation', 'contact_mobile', 'contact_email',
    'bank_account_name', 'bank_account_number', 'bank_ifsc', 'bank_name', 'bank_branch',
    'notes',
  ] as const
  // Absent on purpose: code and dealer_type (changing either re-mints a code —
  // see /dealer-type below), org_type, parent_id, is_active and status
  // (see /status), created_at.

  const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/
  const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/
  const PIN = /^\d{6}$/
  const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  /** Same standard as the registration form: optional, but valid if given. */
  function validateOrgPatch(p: Record<string, unknown>): Record<string, string> {
    const e: Record<string, string> = {}
    const s = (k: string) => (p[k] == null ? '' : String(p[k]).trim())
    if ('legal_name' in p && !s('legal_name')) e.legal_name = 'Legal name cannot be blank'
    if (s('gstin')) {
      const g = inspectGstin(s('gstin'))
      if (!g.valid) e.gstin = g.message ?? 'GSTIN is not valid'
    }
    if (s('pan') && !PAN_RE.test(s('pan').toUpperCase())) e.pan = 'PAN should look like AAAAA9999A'
    if (s('bank_ifsc') && !IFSC.test(s('bank_ifsc').toUpperCase())) e.bank_ifsc = 'IFSC should look like HDFC0001234'
    if (s('pincode') && !PIN.test(s('pincode'))) e.pincode = 'PIN code must be 6 digits'
    if (s('contact_email') && !MAIL.test(s('contact_email'))) e.contact_email = 'Enter a valid email address'
    return e
  }

  app.get('/orgs/:id', { preHandler: director }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { rows } = await query(
      `select o.*, p.code as parent_code, p.legal_name as parent_name
         from quote_service.org o
         left join quote_service.org p on p.id = o.parent_id
        where o.id = $1`, [id])
    if (!rows.length) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Organisation not found' } })
    }
    const events = await query(
      `select event_type, actor_name, changes, note, created_at
         from quote_service.org_event where org_id = $1
        order by created_at desc limit 50`, [id])
    const codes = await query(
      `select code, allotted_at, retired_at, retired_reason
         from partner_service.allotted_code where org_id = $1 order by allotted_at`, [id])
    return reply.send({ data: { ...rows[0], events: events.rows, codes: codes.rows } })
  })

  app.patch('/orgs/:id', { preHandler: director }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = (req.body ?? {}) as Record<string, unknown>
    const who = actor(req)

    const errors = validateOrgPatch(body)
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
        `select * from quote_service.org where id = $1 for update`, [id])
      if (!before.length) {
        await client.query('rollback')
        return reply.code(404).send({ error: { code: 'not_found', message: 'Organisation not found' } })
      }

      // Another partner must not already hold this GSTIN.
      const gstin = body.gstin == null ? '' : String(body.gstin).trim()
      if (gstin) {
        const { rows: dupe } = await client.query(
          `select code, legal_name from quote_service.org
            where upper(gstin) = upper($1) and id <> $2 limit 1`, [gstin, id])
        if (dupe.length) {
          await client.query('rollback')
          return reply.code(409).send({
            error: {
              code: 'gstin_exists',
              message: `${dupe[0].legal_name} (${dupe[0].code}) already holds this GSTIN.`,
            },
          })
        }
      }

      const sets: string[] = []
      const values: unknown[] = []
      const changes: Record<string, { from: unknown; to: unknown }> = {}
      for (const col of ORG_WRITABLE) {
        if (!(col in body)) continue
        const next = body[col]
        if (before[0][col] === next) continue          // record real changes only
        changes[col] = { from: before[0][col], to: next }
        values.push(next)
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

      await client.query(
        `insert into quote_service.org_event (org_id, event_type, actor, actor_name, changes)
         values ($1, 'updated', $2, $3, $4)`,
        [id, who.id, who.name, JSON.stringify(changes)])

      await client.query('commit')
      return reply.send({ data: rows[0], changed: Object.keys(changes) })
    } catch (err) {
      await client.query('rollback')
      throw err
    } finally {
      client.release()
    }
  })

  // ---- Suspend / terminate / reactivate ----------------------------------
  // status and is_active move together; the schema constraint rejects any
  // write that sets one without the other.
  app.post('/orgs/:id/status', { preHandler: director }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { status, reason } = (req.body ?? {}) as { status?: string; reason?: string }
    const who = actor(req)

    if (!['active', 'suspended', 'terminated'].includes(String(status))) {
      return reply.code(400).send({
        error: { code: 'bad_request', message: 'status must be active, suspended or terminated' },
      })
    }
    if (status !== 'active' && !String(reason ?? '').trim()) {
      return reply.code(400).send({
        error: { code: 'bad_request', message: 'A reason is required to suspend or terminate' },
      })
    }

    const client = await pool.connect()
    try {
      await client.query('begin')
      const { rows: before } = await client.query(
        `select status from quote_service.org where id = $1 for update`, [id])
      if (!before.length) {
        await client.query('rollback')
        return reply.code(404).send({ error: { code: 'not_found', message: 'Organisation not found' } })
      }
      const { rows } = await client.query(
        `update quote_service.org set status = $2, is_active = $3, updated_at = now()
          where id = $1 returning *`, [id, status, status === 'active'])
      await client.query(
        `insert into quote_service.org_event (org_id, event_type, actor, actor_name, changes, note)
         values ($1, 'status_changed', $2, $3, $4, $5)`,
        [id, who.id, who.name,
         JSON.stringify({ status: { from: before[0].status, to: status } }),
         String(reason ?? '').trim() || null])
      await client.query('commit')
      return reply.send({ data: rows[0] })
    } catch (err) {
      await client.query('rollback')
      throw err
    } finally {
      client.release()
    }
  })

  // ---- Dealer type change — NOT an edit ----------------------------------
  // The owner's rule: a type change mints a NEW code and retires the old,
  // which is never reused. The org keeps its id, so every price book,
  // quotation and user attached to it follows automatically — this is
  // exactly why nothing foreign-keys to org.code.
  app.post('/orgs/:id/dealer-type', { preHandler: director }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { dealer_type, reason } = (req.body ?? {}) as { dealer_type?: string; reason?: string }
    const who = actor(req)

    if (dealer_type !== 'SS' && dealer_type !== 'SM') {
      return reply.code(400).send({
        error: { code: 'bad_request', message: 'dealer_type must be SS or SM' },
      })
    }

    const client = await pool.connect()
    try {
      await client.query('begin')
      const { rows: orgs } = await client.query(
        `select o.*, p.code as parent_code
           from quote_service.org o
           left join quote_service.org p on p.id = o.parent_id
          where o.id = $1 for update of o`, [id])
      if (!orgs.length) {
        await client.query('rollback')
        return reply.code(404).send({ error: { code: 'not_found', message: 'Organisation not found' } })
      }
      const org = orgs[0]
      if (org.org_type !== 'dealer') {
        await client.query('rollback')
        return reply.code(400).send({
          error: { code: 'bad_request', message: 'Only a dealer has a dealer type' },
        })
      }
      if (org.dealer_type === dealer_type) {
        await client.query('rollback')
        return reply.code(409).send({
          error: { code: 'no_change', message: `Already ${dealer_type}` },
        })
      }

      const oldCode = org.code
      const { code: newCode, seriesKey } = await allotCode(client, {
        partnerType: 'dealer',
        dealerType: dealer_type,
        parentCode: org.parent_code,
      })

      await client.query(
        `update quote_service.org set code = $2, dealer_type = $3, updated_at = now()
          where id = $1`, [id, newCode, dealer_type])

      // Retire the old code in the ledger. It stays there forever, which is
      // what makes reissuing it impossible.
      await client.query(
        `update partner_service.allotted_code
            set retired_at = now(), retired_reason = $2
          where code = $1 and retired_at is null`,
        [oldCode, `type changed ${org.dealer_type} -> ${dealer_type}${reason ? `: ${reason}` : ''}`])

      await client.query(
        `insert into partner_service.allotted_code (code, org_id, series_key)
         values ($1, $2, $3)`, [newCode, id, seriesKey])

      await client.query(
        `insert into quote_service.org_event (org_id, event_type, actor, actor_name, changes, note)
         values ($1, 'dealer_type_changed', $2, $3, $4, $5)`,
        [id, who.id, who.name,
         JSON.stringify({
           dealer_type: { from: org.dealer_type, to: dealer_type },
           code: { from: oldCode, to: newCode },
         }),
         String(reason ?? '').trim() || null])

      await client.query('commit')
      return reply.send({ data: { id, old_code: oldCode, code: newCode, dealer_type } })
    } catch (err) {
      await client.query('rollback')
      throw err
    } finally {
      client.release()
    }
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
    const [docs, contacts] = await Promise.all([
      query(
        `select id, doc_type, original_filename, mime_type, size_bytes,
                uploaded_at, verified
           from partner_service.registration_document
          where registration_id = $1 and deleted_at is null
          order by uploaded_at`, [id]),
      query(
        `select id, name, designation, mobile, email, notes
           from partner_service.registration_contact
          where registration_id = $1
          order by id`, [id]),
    ])
    return reply.send({
      data: { ...rows[0], documents: docs.rows, contacts: contacts.rows },
    })
  })

  // =========================================================================
  // Approval (P6). Everything below happens in ONE transaction or none of it.
  //
  //   1. lock the code_series row
  //   2. mint the code, bump the counter
  //   3. stamp the registration approved
  //   4. insert the quote_service.org row
  //   5. back-fill created_org_id
  //   6. write the allotted_code ledger entry
  //   7. append a registration_event
  //
  // Status is checked INSIDE the transaction and the row is locked, so a
  // double-click cannot approve twice and mint two codes.
  //
  // No ERPNext record is created here. Approval is a CRM event; the finance
  // record appears when the partner first transacts, via ensureErpCustomer().
  // =========================================================================
  app.post('/registrations/:id/approve', { preHandler: director }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = (req.body ?? {}) as { attach_org_id?: number }
    const who = actor(req)

    const client = await pool.connect()
    try {
      await client.query('begin')

      const { rows } = await client.query(
        `select * from partner_service.registration where id = $1 for update`, [id])
      if (!rows.length) {
        await client.query('rollback')
        return reply.code(404).send({ error: { code: 'not_found', message: 'Registration not found' } })
      }
      const reg = rows[0]

      // Guard inside the transaction, not before it.
      if (reg.status === 'approved') {
        await client.query('rollback')
        return reply.code(409).send({
          error: {
            code: 'already_approved',
            message: `Already approved as ${reg.allotted_code ?? 'an existing partner'}`,
          },
        })
      }
      if (reg.status !== 'submitted' && reg.status !== 'under_review') {
        await client.query('rollback')
        return reply.code(409).send({
          error: { code: 'not_approvable', message: `Cannot approve a '${reg.status}' registration` },
        })
      }

      // ---- Path A: attach to an org that already exists ------------------
      // For grandfathered partners like EDINGX001, who hold a code but never
      // had an application. Mints nothing — reusing the existing identity is
      // the whole point.
      if (body.attach_org_id) {
        const { rows: orgs } = await client.query(
          `select id, code, legal_name from quote_service.org where id = $1 for update`,
          [body.attach_org_id])
        if (!orgs.length) {
          await client.query('rollback')
          return reply.code(400).send({
            error: { code: 'bad_request', message: 'No such organisation to attach to' },
          })
        }
        const org = orgs[0]
        const { rows: [updated] } = await client.query(
          `update partner_service.registration
              set status = 'approved', approved_at = now(), approved_by = $2,
                  reviewed_at = now(), reviewed_by = $2,
                  created_org_id = $3, allotted_code = $4, updated_at = now()
            where id = $1 returning *`,
          [id, who.name ?? who.id, org.id, org.code])
        await client.query(
          `insert into partner_service.registration_event
             (registration_id, event_type, from_status, to_status, actor, actor_name, payload)
           values ($1, 'approved_attached', $2, 'approved', $3, $4, $5)`,
          [id, reg.status, who.id, who.name,
           JSON.stringify({ attached_org: org.code, note: 'no new code minted' })])
        await client.query('commit')
        return reply.send({
          data: updated,
          attached: { org_id: org.id, code: org.code, legal_name: org.legal_name },
        })
      }

      // ---- Path B: mint a new code and create the org --------------------

      // Refuse to create a second partner for a GSTIN that already exists.
      // Mirrors the GSTIN-first dedup ensureErpCustomer() already uses.
      if (reg.gstin && String(reg.gstin).trim()) {
        const { rows: dupe } = await client.query(
          `select id, code, legal_name from quote_service.org
            where upper(gstin) = upper($1) limit 1`, [String(reg.gstin).trim()])
        if (dupe.length) {
          await client.query('rollback')
          return reply.code(409).send({
            error: {
              code: 'gstin_exists',
              message: `${dupe[0].legal_name} (${dupe[0].code}) already holds this GSTIN. Attach to them instead of creating a second partner.`,
            },
            existing: dupe[0],
          })
        }
      }

      let parentId: number | null = null
      let parentCode: string | null = null
      if (reg.partner_type === 'dealer') {
        if (!reg.parent_org_id) {
          await client.query('rollback')
          return reply.code(400).send({
            error: { code: 'bad_request', message: 'Dealer has no distributor set' },
          })
        }
        const { rows: p } = await client.query(
          `select id, code from quote_service.org where id = $1`, [reg.parent_org_id])
        if (!p.length) {
          await client.query('rollback')
          return reply.code(400).send({
            error: { code: 'bad_request', message: 'The distributor on this registration no longer exists' },
          })
        }
        parentId = p[0].id
        parentCode = p[0].code
      } else {
        // A distributor hangs off SGT.
        const { rows: sgt } = await client.query(
          `select id from quote_service.org where code = 'SGT'`)
        parentId = sgt[0]?.id ?? null
      }

      const { code, seriesKey, serial } = await allotCode(client, {
        partnerType: reg.partner_type,
        dealerType: reg.dealer_type,
        parentCode,
      })

      const { rows: [org] } = await client.query(
        `insert into quote_service.org
           (code, legal_name, trade_name, org_type, dealer_type, parent_id, territory, gstin, is_active)
         values ($1, $2, $3, $4, $5, $6, $7, $8, true)
         returning id, code, legal_name`,
        [code, reg.legal_name, reg.trade_name, reg.partner_type, reg.dealer_type,
         parentId, reg.proposed_territory, reg.gstin])

      const { rows: [updated] } = await client.query(
        `update partner_service.registration
            set status = 'approved', approved_at = now(), approved_by = $2,
                reviewed_at = now(), reviewed_by = $2,
                allotted_code = $3, created_org_id = $4, updated_at = now()
          where id = $1 returning *`,
        [id, who.name ?? who.id, code, org.id])

      // The ledger is what makes reuse impossible — a retired code leaves no
      // org row behind, so this is the only durable record that it existed.
      await client.query(
        `insert into partner_service.allotted_code
           (code, org_id, registration_id, series_key)
         values ($1, $2, $3, $4)`,
        [code, org.id, id, seriesKey])

      await client.query(
        `insert into partner_service.registration_event
           (registration_id, event_type, from_status, to_status, actor, actor_name, payload)
         values ($1, 'approved', $2, 'approved', $3, $4, $5)`,
        [id, reg.status, who.id, who.name,
         JSON.stringify({ code, series: seriesKey, serial, org_id: org.id })])

      await client.query('commit')
      return reply.send({ data: updated, org, code })
    } catch (err) {
      await client.query('rollback')
      throw err
    } finally {
      client.release()
    }
  })

  // ---- Reject — requires a reason ----------------------------------------
  app.post('/registrations/:id/reject', { preHandler: director }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { reason } = (req.body ?? {}) as { reason?: string }
    const who = actor(req)
    if (!reason || !String(reason).trim()) {
      return reply.code(400).send({
        error: { code: 'bad_request', message: 'A reason is required to reject' },
      })
    }

    const client = await pool.connect()
    try {
      await client.query('begin')
      const { rows } = await client.query(
        `select status from partner_service.registration where id = $1 for update`, [id])
      if (!rows.length) {
        await client.query('rollback')
        return reply.code(404).send({ error: { code: 'not_found', message: 'Registration not found' } })
      }
      if (rows[0].status === 'approved') {
        await client.query('rollback')
        return reply.code(409).send({
          error: { code: 'already_approved', message: 'Cannot reject an approved registration' },
        })
      }
      const { rows: [updated] } = await client.query(
        `update partner_service.registration
            set status = 'rejected', rejection_reason = $2,
                reviewed_at = now(), reviewed_by = $3, updated_at = now()
          where id = $1 returning *`,
        [id, String(reason).trim(), who.name ?? who.id])
      await client.query(
        `insert into partner_service.registration_event
           (registration_id, event_type, from_status, to_status, actor, actor_name, payload)
         values ($1, 'rejected', $2, 'rejected', $3, $4, $5)`,
        [id, rows[0].status, who.id, who.name, JSON.stringify({ reason: String(reason).trim() })])
      await client.query('commit')
      return reply.send({ data: updated })
    } catch (err) {
      await client.query('rollback')
      throw err
    } finally {
      client.release()
    }
  })

  // ---- Additional contacts ----------------------------------------------
  // Name only is enough. A forwarded card often gives a name and a number
  // long before a designation or an email, and a partly-known contact is
  // still worth recording. The PRIMARY contact stays strictly validated.
  app.post('/registrations/:id/contacts', { preHandler: director }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const b = (req.body ?? {}) as Record<string, string>
    const name = String(b.name ?? '').trim()
    if (!name) {
      return reply.code(400).send({
        error: { code: 'bad_request', message: 'Contact name is required' },
      })
    }
    const { rows: reg } = await query(
      `select status from partner_service.registration where id = $1`, [id])
    if (!reg.length) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Registration not found' },
      })
    }
    if (reg[0].status !== 'draft') {
      return reply.code(409).send({
        error: { code: 'not_editable', message: 'Registration is no longer editable' },
      })
    }
    const { rows } = await query(
      `insert into partner_service.registration_contact
         (registration_id, name, designation, mobile, email, notes)
       values ($1, $2, $3, $4, $5, $6)
       returning id, name, designation, mobile, email, notes`,
      [id, name, b.designation ?? null, b.mobile ?? null, b.email ?? null, b.notes ?? null])
    return reply.code(201).send({ data: rows[0] })
  })

  app.delete('/registrations/:id/contacts/:contactId', { preHandler: director },
    async (req, reply) => {
      const { id, contactId } = req.params as { id: string; contactId: string }
      // Scoped by registration_id too, so a contact cannot be deleted by
      // guessing its id from under a different registration.
      const { rowCount } = await query(
        `delete from partner_service.registration_contact
          where id = $1 and registration_id = $2`, [contactId, id])
      if (!rowCount) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Contact not found' },
        })
      }
      return reply.send({ data: { deleted: true } })
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

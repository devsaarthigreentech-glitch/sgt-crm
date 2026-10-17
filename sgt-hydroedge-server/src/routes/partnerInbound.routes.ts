// =============================================================================
// routes/partnerInbound.routes.ts — partner applications from outside the CRM.
// -----------------------------------------------------------------------------
// Mounted at /api/v1/inbound:
//     POST  /inbound/partner-applications    WhatsApp bot (n8n) → registration
//
// NOT behind requireAuth: n8n has no user JWT. Guarded instead by a shared
// secret header, the same pattern as /outreach/email-event. The secret lives
// in PARTNER_INBOUND_SECRET; if it is unset the endpoint refuses every call
// (fail closed, never open). The route policy in auth/policy.ts lets a
// token-less request through to here, and the secret check is the boundary.
//
// What it does, and deliberately does not do:
//   - Distributors only. A dealer needs a parent distributor, which a
//     WhatsApp conversation cannot choose safely; dealers keep going
//     through the portal.
//   - Creates a DRAFT exactly like POST /partners/registrations, then runs
//     the same submit as POST /partners/registrations/:id/submit. Submit-time
//     validation is the canonical validateForSubmit — nothing is relaxed.
//   - If validation fails the draft is kept and the field errors come back
//     with 422, so the bot can ask for what is missing and resend.
//   - One open application per mobile number. A repeat call for a mobile
//     that already has a draft fills the blanks in that draft; one that is
//     already submitted or under review is returned as-is, never duplicated.
//   - Approval stays where it is: a director, in the CRM.
// =============================================================================

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { pool } from '../db/pool.js'
import { validateForSubmit, type RegistrationInput } from '../domain/partnerValidation.js'
import { asProductLine } from '../domain/greenDrive.js'

const ACTOR_ID = 'whatsapp-bot'
const ACTOR_NAME = 'WhatsApp bot'

const CONSTITUTIONS = [
  'Proprietorship', 'Partnership', 'LLP', 'Private Limited',
  'Public Limited', 'HUF', 'Trust', 'Society', 'Other',
] as const

const INDUSTRIES = [
  'Industrial', 'Commercial', 'Infrastructure', 'Mining',
  'Marine', 'Hospitality', 'Healthcare', 'Data centre',
] as const

const optText = z.string().trim().max(500).optional().nullable()

const ApplicationSchema = z.object({
  product_line: z.enum(['GreenX', 'GreenDrive']).optional(),
  entity_type: z.enum(['company', 'individual']).optional(),
  legal_name: z.string().trim().min(2).max(200),
  trade_name: optText,
  constitution: z.enum(CONSTITUTIONS).optional().nullable(),
  years_in_business: z.coerce.number().int().min(0).max(200).optional().nullable(),
  gstin: optText,
  city: optText,
  state: optText,
  contact_name: z.string().trim().min(2).max(200),
  contact_designation: optText,
  contact_mobile: z.string().trim().min(10).max(20),
  contact_email: optText,
  proposed_territory: optText,
  customer_segments: z.array(z.enum(INDUSTRIES)).optional(),
  existing_brands: optText,
  annual_turnover_band: optText,
  expected_annual_units: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
  // Free text from the conversation; stored in profile, never validated.
  conversation_summary: z.string().trim().max(4000).optional().nullable(),
  // false = save the draft only. Defaults to submitting.
  submit: z.boolean().optional(),
})

type Application = z.infer<typeof ApplicationSchema>

/** Last ten digits — how validateForSubmit reads a mobile, so match on the same. */
const mobileKey = (m: string) => m.replace(/\D/g, '').slice(-10)

const blank = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0)

/** The registration columns this endpoint writes, from a validated body. */
function columnsFrom(a: Application): Record<string, unknown> {
  const cols: Record<string, unknown> = {
    entity_type: a.entity_type ?? 'company',
    legal_name: a.legal_name,
    trade_name: a.trade_name ?? null,
    constitution: a.constitution ?? null,
    years_in_business: a.years_in_business ?? null,
    gstin: a.gstin ? a.gstin.toUpperCase().replace(/\s/g, '') : null,
    city: a.city ?? null,
    state: a.state ?? null,
    contact_name: a.contact_name,
    contact_designation: a.contact_designation ?? null,
    contact_mobile: mobileKey(a.contact_mobile),
    contact_email: a.contact_email ? a.contact_email.toLowerCase() : null,
    proposed_territory: a.proposed_territory ?? null,
    customer_segments: a.customer_segments ?? [],
    existing_brands: a.existing_brands ?? null,
    annual_turnover_band: a.annual_turnover_band ?? null,
    expected_annual_units: a.expected_annual_units ?? null,
  }
  return cols
}

export default async function partnerInboundRoutes(app: FastifyInstance) {
  const secret = process.env.PARTNER_INBOUND_SECRET || ''

  app.post('/partner-applications', async (req, reply) => {
    const provided = (req.headers['x-webhook-secret'] as string) || ''
    if (!secret || provided !== secret) {
      return reply.code(401).send({ error: { code: 'unauthorised', message: 'unauthorised' } })
    }

    const parsed = ApplicationSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      const fields: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.') || '_'] = issue.message
      }
      return reply.code(400).send({
        error: { code: 'bad_request', message: 'Some fields are missing or malformed' },
        fields,
      })
    }
    const a = parsed.data
    const submit = a.submit !== false
    const productLine = asProductLine(a.product_line)
    const mobile = mobileKey(a.contact_mobile)
    const cols = columnsFrom(a)
    const profile = {
      source: 'whatsapp',
      whatsapp_number: a.contact_mobile,
      conversation_summary: a.conversation_summary ?? null,
    }

    const client = await pool.connect()
    try {
      await client.query('begin')

      // One open application per mobile. Lock it so two bot calls racing
      // for the same person cannot both create a draft.
      const { rows: open } = await client.query(
        `select * from partner_service.registration
          where partner_type = 'distributor'
            and right(regexp_replace(coalesce(contact_mobile, ''), '\\D', '', 'g'), 10) = $1
            and status in ('draft', 'submitted', 'under_review')
          order by created_at desc
          limit 1
          for update`,
        [mobile],
      )

      let reg = open[0]
      if (reg && reg.status !== 'draft') {
        await client.query('rollback')
        return reply.code(200).send({
          data: { id: reg.id, status: reg.status, legal_name: reg.legal_name },
          duplicate: true,
        })
      }

      if (reg) {
        // Fill only what is still blank — never overwrite what SGT staff
        // may already have corrected on the draft.
        const sets: string[] = []
        const values: unknown[] = []
        for (const [col, val] of Object.entries(cols)) {
          if (blank(val) || !blank(reg[col])) continue
          values.push(val)
          sets.push(`${col} = $${values.length}`)
        }
        values.push(JSON.stringify(profile))
        sets.push(`profile = profile || $${values.length}::jsonb`)
        values.push(reg.id)
        const { rows } = await client.query(
          `update partner_service.registration
              set ${sets.join(', ')}, updated_at = now()
            where id = $${values.length}
            returning *`,
          values,
        )
        reg = rows[0]
      } else {
        const names = Object.keys(cols)
        const values = Object.values(cols)
        const placeholders = names.map((_, i) => `$${i + 1}`)
        const { rows } = await client.query(
          `insert into partner_service.registration
             (partner_type, status, product_line, created_by, created_by_name, profile, ${names.join(', ')})
           values ('distributor', 'draft', $${values.length + 1}, $${values.length + 2},
                   $${values.length + 3}, $${values.length + 4}::jsonb, ${placeholders.join(', ')})
           returning *`,
          [...values, productLine, ACTOR_ID, ACTOR_NAME, JSON.stringify(profile)],
        )
        reg = rows[0]
        await client.query(
          `insert into partner_service.registration_event
             (registration_id, event_type, from_status, to_status, actor, actor_name, payload)
           values ($1, 'created', null, 'draft', $2, $3, $4::jsonb)`,
          [reg.id, ACTOR_ID, ACTOR_NAME, JSON.stringify({ source: 'whatsapp' })],
        )
      }

      if (!submit) {
        await client.query('commit')
        return reply.code(201).send({
          data: { id: reg.id, status: reg.status, legal_name: reg.legal_name },
        })
      }

      const errors = validateForSubmit(reg as RegistrationInput)
      if (Object.keys(errors).length) {
        // Keep the draft — the bot asks for what is missing and calls again.
        await client.query('commit')
        return reply.code(422).send({
          error: { code: 'validation_failed', message: 'Some fields need attention' },
          data: { id: reg.id, status: reg.status, legal_name: reg.legal_name },
          fields: errors,
        })
      }

      const { rows: [updated] } = await client.query(
        `update partner_service.registration
            set status = 'submitted', submitted_at = now(), updated_at = now()
          where id = $1
          returning *`,
        [reg.id],
      )
      await client.query(
        `insert into partner_service.registration_event
           (registration_id, event_type, from_status, to_status, actor, actor_name, payload)
         values ($1, 'submitted', 'draft', 'submitted', $2, $3, $4::jsonb)`,
        [reg.id, ACTOR_ID, ACTOR_NAME, JSON.stringify({ source: 'whatsapp' })],
      )
      await client.query('commit')
      return reply.code(201).send({
        data: { id: updated.id, status: updated.status, legal_name: updated.legal_name },
      })
    } catch (err) {
      await client.query('rollback')
      throw err
    } finally {
      client.release()
    }
  })
}

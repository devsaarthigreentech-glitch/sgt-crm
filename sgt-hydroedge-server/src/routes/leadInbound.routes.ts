// =============================================================================
// routes/leadInbound.routes.ts — leads from visiting cards sent on WhatsApp.
// -----------------------------------------------------------------------------
// Mounted at /api/v1/inbound:
//     POST  /inbound/leads    WhatsApp staff bot (n8n) → lead in triage
//
// Same boundary as partnerInbound.routes.ts: no user JWT, guarded by the
// shared secret in PARTNER_INBOUND_SECRET, fail closed when it is unset.
// The bot only offers this to staff numbers; that gate lives in n8n.
//
// Creates the lead through createLeadInTx, like Quick capture: unassigned
// and unclassified, so it lands in the triage queue.
//
// A contact with the same phone or email on an existing lead is reported
// back instead of saved again. Two people can share a switchboard number,
// so the caller may repeat with allow_duplicate once a person confirms.
// =============================================================================

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { pool } from '../db/pool.js'
import { createLeadInTx } from '../services/leadCreate.js'

const blankToUndefined = (v: unknown) =>
  v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v

const optText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional())

const InboundLeadSchema = z.object({
  company_name: z.string().trim().min(2).max(200),
  contact_name: z.string().trim().min(2).max(200),
  role: optText(200),
  phone: optText(60),
  email: z.preprocess(blankToUndefined, z.string().trim().toLowerCase().email().optional()),
  location: optText(300),
  website: optText(300),
  notes: optText(2000),
  /** CRM name of the staff member, or their WhatsApp profile name. */
  captured_by: optText(200),
  captured_by_number: optText(30),
  allow_duplicate: z.boolean().optional(),
})

/** Last ten digits; a shorter number is too weak to match people on. */
const phoneKey = (p?: string) => {
  const digits = (p ?? '').replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : null
}

export default async function leadInboundRoutes(app: FastifyInstance) {
  const secret = process.env.PARTNER_INBOUND_SECRET || ''

  app.post('/leads', async (req, reply) => {
    const provided = (req.headers['x-webhook-secret'] as string) || ''
    if (!secret || provided !== secret) {
      return reply.code(401).send({ error: { code: 'unauthorised', message: 'unauthorised' } })
    }

    const parsed = InboundLeadSchema.safeParse(req.body ?? {})
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
    const b = parsed.data
    const phone = phoneKey(b.phone)
    const email = b.email ?? null

    const client = await pool.connect()
    try {
      await client.query('begin')

      // Serialise these inserts so a double-sent card cannot race past the
      // duplicate check below.
      await client.query(`select pg_advisory_xact_lock(hashtext('inbound-whatsapp-lead'))`)

      if (!b.allow_duplicate && (phone || email)) {
        const { rows } = await client.query(
          `select l.id, l.display_id, l.stage, l.owner_name,
                  a.name as account_name, c.name as contact_name
             from lead_service.leads l
             join lead_service.accounts a on a.id = l.account_id
             join lead_service.contacts c on c.id = l.primary_contact_id
            where l.deleted_at is null
              and (   ($1::text is not null
                       and length(regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g')) >= 10
                       and right(regexp_replace(c.phone, '\\D', '', 'g'), 10) = $1::text)
                   or ($2::text is not null and lower(trim(c.email)) = $2::text))
            order by l.created_at desc
            limit 1`,
          [phone, email],
        )
        if (rows[0]) {
          await client.query('rollback')
          return reply.code(200).send({
            duplicate: true,
            data: {
              id: rows[0].id,
              displayId: rows[0].display_id,
              stage: rows[0].stage,
              owner: rows[0].owner_name ?? null,
              company: rows[0].account_name,
              contact: rows[0].contact_name,
            },
          })
        }
      }

      const notes = [
        b.notes,
        b.website ? `Website: ${b.website}` : null,
        'Captured from a visiting card on WhatsApp.',
      ].filter(Boolean).join('\n')

      const lead = await createLeadInTx(client, {
        account: { name: b.company_name, location: b.location },
        primaryContact: { name: b.contact_name, role: b.role, email: b.email, phone: b.phone },
        leadType: 'Prospect',
        captureSource: 'INTERNAL',
        initialNotes: notes,
        metadata: {
          source: 'whatsapp-card',
          capturedByNumber: b.captured_by_number ?? null,
        },
      }, b.captured_by ?? 'WhatsApp bot')

      await client.query('commit')
      return reply.code(201).send({ data: lead })
    } catch (err) {
      await client.query('rollback')
      throw err
    } finally {
      client.release()
    }
  })
}

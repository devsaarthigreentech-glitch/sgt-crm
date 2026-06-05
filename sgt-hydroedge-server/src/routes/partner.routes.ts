// Partner Portal endpoints. Mount with: app.register(partnerRoutes, { prefix: '/partners/me' })
//
// AUTH: production is email + OTP (per spec); the principal's session resolves a
// partner_id. For dev we read `X-Partner-Id`. The critical rule holds either way:
// scoping is enforced SERVER-SIDE here — every query filters by req.partnerId.
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { query, pool } from '../db/pool'
import { publish } from '../domain/events'
import { conflictCheck, openProtection } from '../domain/protection'
import { normalizeAccountName } from '../domain/stage.domain'
import { generateDisplayId, defaultDivision, normaliseAccountName } from '../domain/leads'

declare module 'fastify' {
  interface FastifyRequest { partnerId?: string; partner?: any }
}

async function partnerAuth(req: FastifyRequest, reply: FastifyReply) {
  // TODO: replace with OTP session lookup. Dev: trust X-Partner-Id header.
  const pid = (req.headers['x-partner-id'] as string) || ''
  if (!pid) return reply.code(401).send({ error: { code: 'unauthorized', message: 'No partner session' } })
  const r = await query(`SELECT * FROM lead_service.partners WHERE id = $1 AND status = 'active'`, [pid])
  if (!r.rowCount) return reply.code(401).send({ error: { code: 'unauthorized', message: 'Unknown partner' } })
  req.partnerId = pid
  req.partner = r.rows[0]
}

export default async function partnerRoutes(app: FastifyInstance) {
  app.addHook('preHandler', partnerAuth)

  // GET / — partner identity + archetype scope
  app.get('/', async (req, reply) => {
    const p = req.partner
    return reply.send({ data: {
      id: p.id, name: p.name, archetype: p.archetype, portal: p.portal,
      tierRank: p.tier_rank, division: p.division,
    } })
  })

  // GET /leads — my registered leads + protection state (normalized schema)
  app.get('/leads', async (req, reply) => {
    const r = await query(
      `SELECT l.id, l.display_id, a.name AS company, l.stage, l.vertical,
              l.estimated_value, l.created_at,
              p.expires_at, p.status AS protection_status
         FROM lead_service.leads l
         JOIN lead_service.accounts a ON a.id = l.account_id
         LEFT JOIN lead_service.lead_protections p
           ON p.lead_id = l.id AND p.status IN ('active','extended')
        WHERE l.partner_id = $1 AND l.deleted_at IS NULL
        ORDER BY l.created_at DESC`,
      [req.partnerId]
    )
    const data = r.rows.map((row: any) => ({
      id: row.id,
      displayId: row.display_id,
      company: row.company,
      stage: row.stage,
      vertical: row.vertical,
      value: row.estimated_value ? Number(row.estimated_value) / 100 : 0,
      protectionExpiresAt: row.expires_at,
      protectionDaysLeft: row.expires_at
        ? Math.max(0, Math.ceil((new Date(row.expires_at).getTime() - Date.now()) / 86400_000))
        : null,
      protectionStatus: row.protection_status,
    }))
    return reply.send({ data })
  })

  // GET /conflict-check?account=Acme — three-state, scoped to this partner
  app.get('/conflict-check', async (req, reply) => {
    const account = ((req.query as any)?.account as string) || ''
    if (account.trim().length < 2) return reply.send({ data: { state: 'clear' } })
    const norm = normalizeAccountName(account)
    const result = await conflictCheck(norm, req.partnerId!)
    return reply.send({ data: result })
  })

  // POST /leads — register a protected lead
  const registerBody = z.object({
    company: z.string().min(2),
    vertical: z.string().optional(),
    model: z.string().optional(),
    value: z.number().optional(),
    estClose: z.string().optional(),
    contactName: z.string().optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().optional(),
    location: z.string().optional(),
  })
  app.post('/leads', async (req, reply) => {
    const parsed = registerBody.safeParse(req.body)
    if (!parsed.success)
      return reply.code(400).send({ error: { code: 'bad_request', message: 'Invalid lead', details: parsed.error.flatten() } })
    const b = parsed.data
    const norm = normalizeAccountName(b.company)

    const conflict = await conflictCheck(norm, req.partnerId!)
    if (conflict.state === 'reserved')
      return reply.code(409).send({ error: { code: 'reserved_account',
        message: `${conflict.reservedLabel} is a reserved SGT account and cannot be registered` } })
    if (conflict.state === 'conflict' && !conflict.ownedByMe)
      return reply.code(409).send({ error: { code: 'lead_conflict',
        message: 'Another partner holds an active protection window on this account' } })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // 1. find or create the account
      const nameNorm = normaliseAccountName(b.company)
      let accountId: string
      const existing = await client.query(
        `SELECT id FROM lead_service.accounts
          WHERE name_normalized = $1 AND deleted_at IS NULL LIMIT 1`,
        [nameNorm]
      )
      if (existing.rows.length > 0) {
        accountId = existing.rows[0].id
      } else {
        const acc = await client.query(
          `INSERT INTO lead_service.accounts (name, name_normalized, location)
           VALUES ($1, $2, $3) RETURNING id`,
          [b.company, nameNorm, b.location ?? null]
        )
        accountId = acc.rows[0].id
      }

      // 2. create the primary contact if supplied
      let contactId: string | null = null
      if (b.contactName) {
        const c = await client.query(
          `INSERT INTO lead_service.contacts
             (account_id, name, role, email, phone, is_primary)
           VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
          [accountId, b.contactName, null, b.contactEmail ?? null, b.contactPhone ?? null]
        )
        contactId = c.rows[0].id
      }

      // 3. display id, division, value-in-paise
      const seq = await client.query(`SELECT nextval('lead_service.lead_id_seq') AS seq`)
      const displayId = generateDisplayId(Number(seq.rows[0].seq))
      const division = b.vertical ? defaultDivision(b.vertical as any) : 'GREENEDGE'
      const valueInPaise = b.value ? Math.round(b.value * 100) : null

      // 4. create the lead (stage uses the table default, like internal creation)
      const lead = await client.query(
        `INSERT INTO lead_service.leads (
           display_id, account_id, primary_contact_id,
           vertical, commercial_model, estimated_value, estimated_close_date,
           division, owner_name, capture_source, lead_type,
           metadata, source, account_norm, partner_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12, $13, $14, $15
         ) RETURNING id`,
        [
          displayId, accountId, contactId,
          b.vertical ?? null, b.model ?? null, valueInPaise, b.estClose ?? null,
          division, req.partner.name, 'Partner Portal', 'Prospect',
          JSON.stringify({}), 'partner_portal', norm, req.partnerId,
        ]
      )
      const leadId = lead.rows[0].id

      await client.query('COMMIT')

      // 5. open the 90-day protection window + emit
      const protectionId = await openProtection({
        leadId, accountNorm: norm, partnerId: req.partnerId!, division: req.partner.division,
      })
      await publish('partner.lead_registered', {
        aggregateId: leadId, division: req.partner.division,
        actor: { type: 'user', id: req.partnerId }, data: { protectionId },
      })
      return reply.code(201).send({ data: { id: leadId, displayId, protectionId } })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })

  // GET /customers — Partner Customer Health (full portal only)
  app.get('/customers', async (req, reply) => {
    if (req.partner.portal !== 'full')
      return reply.code(403).send({ error: { code: 'not_permitted', message: 'Customer health is a full-portal feature' } })
    const r = await query(
      `SELECT account, health_score, churn_risk, expansion, updated_at
         FROM lead_service.partner_customer_health WHERE partner_id = $1 ORDER BY health_score ASC`,
      [req.partnerId]
    )
    return reply.send({ data: r.rows })
  })

  // GET /scorecard — tier metrics vs targets (full portal only)
  app.get('/scorecard', async (req, reply) => {
    if (req.partner.portal !== 'full')
      return reply.code(403).send({ error: { code: 'not_permitted', message: 'Scorecard is a full-portal feature' } })
    const r = await query(
      `SELECT period, metrics, elevation_eligible, generated_at
         FROM lead_service.partner_scorecards WHERE partner_id = $1`, [req.partnerId]
    )
    return reply.send({ data: r.rows[0] ?? null })
  })

  // GET /statements
  app.get('/statements', async (req, reply) => {
    const r = await query(
      `SELECT id, type, period, amount, currency, status, url, generated_at
         FROM lead_service.partner_statements WHERE partner_id = $1 ORDER BY generated_at DESC`,
      [req.partnerId]
    )
    return reply.send({ data: r.rows })
  })

  // GET /documents — tier/portal-permissioned hub
  app.get('/documents', async (req, reply) => {
    const liteScopes = ['brand', 'training', 'shared']
    const r = await query(
      `SELECT id, scope, title, doc_class, version, url, status
         FROM lead_service.partner_documents
        WHERE status = 'approved'
          AND (partner_id = $1 OR partner_id IS NULL)
          AND ( $2 = 'full' OR scope = ANY($3) )
        ORDER BY doc_class, title`,
      [req.partnerId, req.partner.portal, liteScopes]
    )
    return reply.send({ data: r.rows })
  })

  // GET /training
  app.get('/training', async (req, reply) => {
    const r = await query(
      `SELECT id, module, status, completed_at FROM lead_service.training_assignments
        WHERE partner_id = $1 ORDER BY status DESC, module`, [req.partnerId]
    )
    return reply.send({ data: r.rows })
  })

  // Service tickets — lite portal (channel partners)
  app.get('/tickets', async (req, reply) => {
    const r = await query(
      `SELECT id, subject, priority, status, created_at FROM lead_service.service_tickets
        WHERE partner_id = $1 ORDER BY created_at DESC`, [req.partnerId]
    )
    return reply.send({ data: r.rows })
  })
  const ticketBody = z.object({ subject: z.string().min(3), priority: z.enum(['P1', 'P2', 'P3']).default('P3') })
  app.post('/tickets', async (req, reply) => {
    const parsed = ticketBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: { code: 'bad_request', message: 'subject required' } })
    const id = 'TKT-' + nanoid(8)
    await query(
      `INSERT INTO lead_service.service_tickets (id, partner_id, subject, priority) VALUES ($1,$2,$3,$4)`,
      [id, req.partnerId, parsed.data.subject, parsed.data.priority]
    )
    return reply.code(201).send({ data: { id, status: 'open' } })
  })
}
// import { FastifyInstance } from 'fastify'
// import { z } from 'zod'
// import { query } from '../db/pool'
// import {
//   normaliseAccountName,
//   generateDisplayId,
//   computeSlaState,
//   daysInStage,
//   canTransition,
//   defaultDivision,
// } from '../domain/leads'

// // ─── Validation schemas ───────────────────────────────────────────────────────

// // whitelist: API field -> DB column. Adjust column names to your schema.
// const EDITABLE: Record<string, string> = {
//   leadType: 'lead_type',
//   owner: 'owner',
//   value: 'value',
//   estClose: 'est_close',
//   contactName: 'contact_name',
//   email: 'email',
//   phone: 'phone',
// };

// const CreateLeadSchema = z.object({
//   account: z.object({
//     name: z.string().min(2),
//     location: z.string().optional(),
//     pan: z.string().optional(),
//   }),
//   primaryContact: z.object({
//     name: z.string().min(2),
//     role: z.string().optional(),
//     email: z.string().email().optional(),
//     phone: z.string().optional(),
//   }).optional(),
//   leadType: z.enum(['Prospect', 'KOL', 'Partner Prospect', 'Distributor Prospect', 'Strategic Contact']).default('Prospect'),
//   vertical: z.enum(['Industry', 'Marine', 'Vehicles', 'Small DG', 'Cross-vertical']).optional(),
//   commercialModel: z.enum(['DaaS', 'OEM', 'CapEx', 'Consulting']).optional(),
//   origin: z.enum(['Inbound', 'Outbound', 'Partner-originated']).optional(),
//   estimatedValue: z.number().positive().optional(),
//   estimatedCloseDate: z.string().optional(),
//   captureSource: z.string().optional(),
//   initialNotes: z.string().optional(),
//   ownerName: z.string().optional(),
//   ownerId: z.string().optional(),
//   referredBy: z.string().optional(),
//   metadata: z.record(z.string(), z.any()).optional(),
// })

// const LogActivitySchema = z.object({
//   type: z.enum(['meeting', 'call', 'email', 'whatsapp', 'document', 'system']),
//   channel: z.string().optional(),
//   summary: z.string().min(3),
//   outcome: z.enum(['positive', 'neutral', 'concern']).optional(),
//   direction: z.string().optional(),
//   durationMin: z.number().optional(),
//   nextStepDescription: z.string().optional(),
//   nextStepDueDate: z.string().optional(),
//   occurredAt: z.string().optional(),
//   actorName: z.string().optional(),
//   actorId: z.string().optional(),
// })

// const AdvanceStageSchema = z.object({
//   toStage: z.string(),
//   reason: z.string().optional(),
// })

// const CloseSchema = z.object({
//   outcome: z.enum(['WON', 'LOST']),
//   finalValue: z.number().optional(),
//   closeDate: z.string().optional(),
//   reason: z.string().optional(),
//   competitorName: z.string().optional(),
// })

// // ─── Helpers ──────────────────────────────────────────────────────────────────

// function formatLead(row: any) {
//   return {
//     id: row.id,
//     displayId: row.display_id,
//     company: row.account_name,
//     accountId: row.account_id,
//     location: row.location,
//     vertical: row.vertical,
//     model: row.commercial_model,
//     origin: row.origin,
//     division: row.division,
//     owner: row.owner_name,
//     ownerId: row.owner_id,
//     stage: row.stage,
//     slaState: row.sla_state,
//     daysInStage: row.days_in_stage,
//     value: row.estimated_value ? Number(row.estimated_value) / 100 : 0,
//     estClose: row.estimated_close_date,
//     captureSource: row.capture_source,
//     initialNotes: row.initial_notes,
//     leadType: row.lead_type ?? 'Prospect',
//     referredBy: row.referred_by,
//     reservedAccount: row.anchor_account ?? false,
//     erpnextLeadId: row.erpnext_lead_id,
//     version: row.version,
//     createdAt: row.created_at,
//     updatedAt: row.updated_at,
//     contact: row.contact_name ? {
//       name: row.contact_name,
//       role: row.contact_role,
//       email: row.contact_email,
//       phone: row.primary_contact_phone ?? null,
//     } : null,
//     protection: row.protection_status ? {
//       status: row.protection_status,
//       startedAt: row.protection_started_at,
//       expiresAt: row.protection_expires_at,
//       daysLeft: Math.floor(
//         (new Date(row.protection_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
//       ),
//     } : null,
//   }
// }

// // ─── Routes ───────────────────────────────────────────────────────────────────

// export async function leadsRoutes(fastify: FastifyInstance) {

//   // GET /leads
//   fastify.get('/leads', async (request, reply) => {
//     const q = request.query as Record<string, string>

//     const conditions: string[] = ['l.deleted_at IS NULL']
//     const params: any[] = []
//     let i = 1

//     if (q.vertical) { conditions.push(`l.vertical = $${i++}`); params.push(q.vertical) }
//     if (q.stage) { conditions.push(`l.stage = $${i++}`); params.push(q.stage) }
//     if (q.ownerId) { conditions.push(`l.owner_id = $${i++}`); params.push(q.ownerId) }
//     if (q.slaState) { conditions.push(`l.sla_state = $${i++}`); params.push(q.slaState) }

//     const page = parseInt(q.page ?? '1')
//     const pageSize = parseInt(q.pageSize ?? '50')
//     const offset = (page - 1) * pageSize

//     const sql = `
//       SELECT
//         l.*,
//         a.name        AS account_name,
//         a.location    AS location,
//         a.anchor_account,
//         c.name        AS contact_name,
//         c.role        AS contact_role,
//         c.email       AS contact_email,
//         c.phone       AS primary_contact_phone,
//         p.status      AS protection_status,
//         p.opened_at  AS protection_started_at,
//         p.expires_at  AS protection_expires_at
//       FROM lead_service.leads l
//       JOIN lead_service.accounts a ON a.id = l.account_id
//       LEFT JOIN lead_service.contacts c
//         ON c.id = l.primary_contact_id
//       LEFT JOIN lead_service.lead_protections p
//         ON p.lead_id = l.id AND p.status = 'ACTIVE'
//       WHERE ${conditions.join(' AND ')}
//       ORDER BY l.created_at DESC
//       LIMIT ${pageSize} OFFSET ${offset}
//     `

//     const countSql = `
//       SELECT COUNT(*) FROM lead_service.leads l
//       WHERE ${conditions.join(' AND ')}
//     `

//     const [rows, countResult] = await Promise.all([
//       query(sql, params),
//       query(countSql, params),
//     ])

//     return reply.send({
//       data: rows.rows.map(formatLead),
//       meta: {
//         total: parseInt(countResult.rows[0].count),
//         page,
//         pageSize,
//       },
//     })
//   })

//   // GET /leads/:id
//   fastify.get<{ Params: { id: string } }>('/leads/:id', async (request, reply) => {
//     const { id } = request.params

//     const sql = `
//       SELECT
//         l.*,
//         a.name        AS account_name,
//         a.location    AS location,
//         a.anchor_account,
//         c.name        AS contact_name,
//         c.role        AS contact_role,
//         c.email       AS contact_email,
//         c.phone       AS primary_contact_phone,
//         p.status      AS protection_status,
//         p.opened_at  AS protection_started_at,
//         p.expires_at  AS protection_expires_at
//       FROM lead_service.leads l
//       JOIN lead_service.accounts a ON a.id = l.account_id
//       LEFT JOIN lead_service.contacts c
//         ON c.id = l.primary_contact_id
//       LEFT JOIN lead_service.lead_protections p
//         ON p.lead_id = l.id AND p.status = 'ACTIVE'
//       WHERE l.id = $1 AND l.deleted_at IS NULL
//     `

//     const result = await query(sql, [id])
//     if (result.rows.length === 0) {
//       return reply.status(404).send({ error: 'Lead not found' })
//     }

//     return reply.send({ data: formatLead(result.rows[0]) })
//   })

//   // POST /leads
//   fastify.post('/leads', async (request, reply) => {
//     const body = CreateLeadSchema.parse(request.body)
//     const client = await (await import('../db/pool')).pool.connect()

//     try {
//       await client.query('BEGIN')

//       // 1. Find or create account
//       const nameNorm = normaliseAccountName(body.account.name)

//       let accountId: string
//       const existing = await client.query(
//         `SELECT id FROM lead_service.accounts
//          WHERE name_normalized = $1 AND deleted_at IS NULL LIMIT 1`,
//         [nameNorm]
//       )

//       if (existing.rows.length > 0) {
//         accountId = existing.rows[0].id
//       } else {
//         const acc = await client.query(
//           `INSERT INTO lead_service.accounts
//              (name, name_normalized, location, pan)
//            VALUES ($1, $2, $3, $4)
//            RETURNING id`,
//           [body.account.name, nameNorm, body.account.location ?? null, body.account.pan ?? null]
//         )
//         accountId = acc.rows[0].id
//       }

//       // 2. Create contact if provided
//       let contactId: string | null = null
//       if (body.primaryContact) {
//         const c = await client.query(
//           `INSERT INTO lead_service.contacts
//              (account_id, name, role, email, phone, is_primary)
//            VALUES ($1, $2, $3, $4, $5, true)
//            RETURNING id`,
//           [
//             accountId,
//             body.primaryContact.name,
//             body.primaryContact.role ?? null,
//             body.primaryContact.email ?? null,
//             body.primaryContact.phone ?? null,
//           ]
//         )
//         contactId = c.rows[0].id
//       }

//       // 3. Generate display ID
//       const seqResult = await client.query(
//         `SELECT nextval('lead_service.lead_id_seq') AS seq`
//       )
//       const displayId = generateDisplayId(Number(seqResult.rows[0].seq))

//       // 4. Create lead
//       const division = body.vertical ? defaultDivision(body.vertical) : 'GREENEDGE'
//       const valueInPaise = body.estimatedValue ? body.estimatedValue * 100 : null

//       const lead = await client.query(
//         `INSERT INTO lead_service.leads (
//           display_id, account_id, primary_contact_id,
//           vertical, commercial_model, origin, division,
//           owner_name, owner_id,
//           estimated_value, estimated_close_date,
//           capture_source, initial_notes,
//           lead_type, referred_by, metadata
//         ) VALUES (
//           $1, $2, $3, $4, $5, $6, $7,
//           $8, $9, $10, $11, $12, $13,
//           $14, $15, $16
//         ) RETURNING *`,
//         [
//           displayId, accountId, contactId,
//           body.vertical ?? null,
//           body.commercialModel ?? null,
//           body.origin ?? null,
//           body.vertical ? defaultDivision(body.vertical) : 'GREENEDGE',
//           body.ownerName ?? null,
//           body.ownerId ?? null,
//           body.estimatedValue ? body.estimatedValue * 100 : null,
//           body.estimatedCloseDate ?? null,
//           body.captureSource ?? 'INTERNAL',
//           body.initialNotes ?? null,
//           body.leadType ?? 'Prospect',
//           body.referredBy ?? null,
//           JSON.stringify(body.metadata ?? {}),
//         ]
//       )

//       // 5. Audit log
//       await client.query(
//         `INSERT INTO lead_service.lead_audit_log
//            (lead_id, actor_name, action, to_state)
//          VALUES ($1, $2, $3, $4)`,
//         [
//           lead.rows[0].id,
//           body.ownerName ?? 'System',
//           'lead_created',
//           JSON.stringify({ stage: 'New', vertical: body.vertical }),
//         ]
//       )

//       await client.query('COMMIT')

//       return reply.status(201).send({ data: { id: lead.rows[0].id, displayId } })

//     } catch (err) {
//       await client.query('ROLLBACK')
//       throw err
//     } finally {
//       client.release()
//     }
//   })

//   // GET /leads/:id/activities
//   fastify.get<{ Params: { id: string } }>('/leads/:id/activities', async (request, reply) => {
//     const result = await query(
//       `SELECT * FROM lead_service.lead_activities
//        WHERE lead_id = $1
//        ORDER BY occurred_at DESC`,
//       [request.params.id]
//     )

//     return reply.send({
//       data: result.rows.map(r => ({
//         id: r.id,
//         type: r.type,
//         who: r.actor_name,
//         when: r.occurred_at,
//         summary: r.summary,
//         channel: r.channel,
//         outcome: r.outcome,
//         direction: r.direction,
//         durationMin: r.duration_min,
//         nextStep: r.next_step_description ? {
//           description: r.next_step_description,
//           due: r.next_step_due_date,
//         } : null,
//         createdAt: r.created_at,
//       })),
//     })
//   })

//   // POST /leads/:id/activities
//   fastify.post<{ Params: { id: string } }>('/leads/:id/activities', async (request, reply) => {
//     const body = LogActivitySchema.parse(request.body)
//     const { id } = request.params

//     // Verify lead exists
//     const lead = await query(
//       `SELECT id FROM lead_service.leads WHERE id = $1 AND deleted_at IS NULL`,
//       [id]
//     )
//     if (lead.rows.length === 0) {
//       return reply.status(404).send({ error: 'Lead not found' })
//     }

//     const result = await query(
//       `INSERT INTO lead_service.lead_activities (
//         lead_id, actor_name, actor_id, actor_type,
//         type, channel, summary, outcome,
//         direction, duration_min,
//         next_step_description, next_step_due_date,
//         occurred_at
//       ) VALUES (
//         $1, $2, $3, $4, $5, $6, $7, $8,
//         $9, $10, $11, $12, $13
//       ) RETURNING *`,
//       [
//         id,
//         body.actorName ?? 'Unknown',
//         body.actorId ?? null,
//         'USER',
//         body.type,
//         body.channel ?? null,
//         body.summary,
//         body.outcome ?? null,
//         body.direction ?? null,
//         body.durationMin ?? null,
//         body.nextStepDescription ?? null,
//         body.nextStepDueDate ?? null,
//         body.occurredAt ? new Date(body.occurredAt) : new Date(),
//       ]
//     )

//     return reply.status(201).send({ data: result.rows[0] })
//   })

//   // POST /leads/:id/advance
//   fastify.post<{ Params: { id: string } }>('/leads/:id/advance', async (request, reply) => {
//     const body = AdvanceStageSchema.parse(request.body)
//     const { id } = request.params

//     const lead = await query(
//       `SELECT id, stage, version FROM lead_service.leads
//        WHERE id = $1 AND deleted_at IS NULL`,
//       [id]
//     )

//     if (lead.rows.length === 0) {
//       return reply.status(404).send({ error: 'Lead not found' })
//     }

//     const current = lead.rows[0]

//     if (!canTransition(current.stage, body.toStage)) {
//       return reply.status(422).send({
//         error: `Cannot transition from ${current.stage} to ${body.toStage}`,
//       })
//     }

//     await query(
//       `UPDATE lead_service.leads
//        SET stage = $1, stage_changed_at = NOW(),
//            sla_state = 'ok', days_in_stage = 0,
//            version = version + 1, updated_at = NOW()
//        WHERE id = $2`,
//       [body.toStage, id]
//     )

//     await query(
//       `INSERT INTO lead_service.lead_audit_log
//          (lead_id, action, from_state, to_state, reason)
//        VALUES ($1, $2, $3, $4, $5)`,
//       [
//         id, 'stage_changed',
//         JSON.stringify({ stage: current.stage }),
//         JSON.stringify({ stage: body.toStage }),
//         body.reason ?? null,
//       ]
//     )

//     return reply.send({ data: { id, stage: body.toStage } })
//   })

//   // POST /leads/:id/close
//   fastify.post<{ Params: { id: string } }>('/leads/:id/close', async (request, reply) => {
//     const body = CloseSchema.parse(request.body)
//     const { id } = request.params

//     const lead = await query(
//       `SELECT id, stage FROM lead_service.leads
//        WHERE id = $1 AND deleted_at IS NULL`,
//       [id]
//     )

//     if (lead.rows.length === 0) {
//       return reply.status(404).send({ error: 'Lead not found' })
//     }

//     if (lead.rows[0].stage !== 'Negotiation') {
//       return reply.status(422).send({
//         error: 'Only leads in Negotiation can be closed',
//       })
//     }

//     const newStage = body.outcome === 'WON' ? 'Closed Won' : 'Closed Lost'

//     await query(
//       `UPDATE lead_service.leads
//        SET stage = $1, stage_changed_at = NOW(),
//            close_outcome = $2, close_reason = $3,
//            competitor_name = $4,
//            actual_close_date = $5,
//            estimated_value = COALESCE($6, estimated_value),
//            version = version + 1, updated_at = NOW()
//        WHERE id = $7`,
//       [
//         newStage, body.outcome,
//         body.reason ?? null,
//         body.competitorName ?? null,
//         body.closeDate ? new Date(body.closeDate) : new Date(),
//         body.finalValue ? body.finalValue * 100 : null,
//         id,
//       ]
//     )

//     await query(
//       `INSERT INTO lead_service.lead_audit_log
//          (lead_id, action, from_state, to_state)
//        VALUES ($1, $2, $3, $4)`,
//       [
//         id,
//         body.outcome === 'WON' ? 'lead_closed_won' : 'lead_closed_lost',
//         JSON.stringify({ stage: 'Negotiation' }),
//         JSON.stringify({ stage: newStage }),
//       ]
//     )

//     return reply.send({ data: { id, stage: newStage, outcome: body.outcome } })
//   })

//   fastify.patch('/leads/:id', async (req, reply) => {
//     const { id } = req.params as { id: string };
//     const body = (req.body ?? {}) as Record<string, unknown>;
//     const sets: string[] = [];
//     const vals: unknown[] = [];
//     let i = 1;
//     for (const [field, col] of Object.entries(EDITABLE)) {
//       if (field in body) { sets.push(`${col} = $${i++}`); vals.push(body[field] === '' ? null : body[field]); }
//     }
//     if (!sets.length) { reply.code(400); return { error: 'no editable fields supplied' }; }
//     vals.push(id);
//     const sql =
//       `UPDATE lead_service.leads SET ${sets.join(', ')}, updated_at = now() WHERE id = $${i} RETURNING *`;
//     const { rows } = await query(sql, vals);
//     if (!rows.length) { reply.code(404); return { error: 'lead not found' }; }
//     return rows[0];
//   });

//   // DELETE /leads/:id  (soft delete)
//   fastify.delete<{ Params: { id: string } }>('/leads/:id', async (request, reply) => {
//     const { id } = request.params
//     const body = (request.body ?? {}) as { reason?: string; actorName?: string }

//     const lead = await query(
//       `SELECT id, stage FROM lead_service.leads WHERE id = $1 AND deleted_at IS NULL`,
//       [id]
//     )
//     if (lead.rows.length === 0) {
//       return reply.status(404).send({ error: 'Lead not found' })
//     }

//     await query(
//       `UPDATE lead_service.leads
//      SET deleted_at = NOW(), updated_at = NOW(), version = version + 1
//      WHERE id = $1`,
//       [id]
//     )

//     await query(
//       `INSERT INTO lead_service.lead_audit_log
//        (lead_id, actor_name, action, from_state, reason)
//      VALUES ($1, $2, $3, $4, $5)`,
//       [
//         id,
//         body.actorName ?? 'System',
//         'lead_deleted',
//         JSON.stringify({ stage: lead.rows[0].stage }),
//         body.reason ?? null,
//       ]
//     )

//     return reply.send({ data: { id, deleted: true } })
//   })

//   // GET /pipeline
//   fastify.get('/pipeline', async (request, reply) => {
//     const result = await query(`
//       SELECT
//         stage,
//         vertical,
//         COUNT(*)              AS count,
//         SUM(estimated_value)  AS total_value
//       FROM lead_service.leads
//       WHERE deleted_at IS NULL
//         AND stage NOT IN ('Closed Won', 'Closed Lost')
//       GROUP BY stage, vertical
//       ORDER BY stage, vertical
//     `)

//     return reply.send({ data: result.rows })
//   })

//   // POST /leads/:id/triage
//   fastify.post<{ Params: { id: string } }>('/leads/:id/triage', async (request, reply) => {
//     const body = z.object({
//       leadType: z.string(),
//       vertical: z.string().optional(),
//       ownerName: z.string(),
//     }).parse(request.body)

//     const { id } = request.params

//     const lead = await query(
//       `SELECT id FROM lead_service.leads WHERE id = $1 AND deleted_at IS NULL`,
//       [id]
//     )

//     if (lead.rows.length === 0) {
//       return reply.status(404).send({ error: 'Lead not found' })
//     }

//     await query(
//       `UPDATE lead_service.leads
//      SET lead_type = $1,
//          vertical  = COALESCE($2, vertical),
//          owner_name = $3,
//          stage = 'Allocated',
//          stage_changed_at = NOW(),
//          updated_at = NOW()
//      WHERE id = $4`,
//       [body.leadType, body.vertical ?? null, body.ownerName, id]
//     )

//     await query(
//       `INSERT INTO lead_service.lead_audit_log
//        (lead_id, actor_name, action, from_state, to_state)
//      VALUES ($1, $2, $3, $4, $5)`,
//       [
//         id, body.ownerName, 'triage_classified',
//         JSON.stringify({ stage: 'New', owner: null }),
//         JSON.stringify({ stage: 'Allocated', leadType: body.leadType, owner: body.ownerName }),
//       ]
//     )

//     return reply.send({ data: { id, leadType: body.leadType, owner: body.ownerName } })
//   })
// }
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query } from '../db/pool'
import {
  normaliseAccountName,
  generateDisplayId,
  computeSlaState,
  daysInStage,
  canTransition,
  defaultDivision,
} from '../domain/leads'

// ─── Validation schemas ───────────────────────────────────────────────────────

// PATCH /leads/:id payload. value is in RUPEES (stored as paise in estimated_value).
const UpdateLeadSchema = z.object({
  leadType: z.string().optional(),
  owner: z.string().nullable().optional(),
  value: z.number().min(0).nullable().optional(),
  estClose: z.string().nullable().optional(),   // YYYY-MM-DD
  contactName: z.string().optional(),
  contactRole: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
})

const CreateLeadSchema = z.object({
  account: z.object({
    name: z.string().min(2),
    location: z.string().optional(),
    pan: z.string().optional(),
  }),
  primaryContact: z.object({
    name: z.string().min(2),
    role: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }).optional(),
  leadType: z.enum(['Prospect', 'KOL', 'Partner Prospect', 'Distributor Prospect', 'Strategic Contact']).default('Prospect'),
  vertical: z.enum(['Industry', 'Marine', 'Vehicles', 'Small DG', 'Cross-vertical']).optional(),
  commercialModel: z.enum(['DaaS', 'OEM', 'CapEx', 'Consulting']).optional(),
  origin: z.enum(['Inbound', 'Outbound', 'Partner-originated']).optional(),
  estimatedValue: z.number().positive().optional(),
  estimatedCloseDate: z.string().optional(),
  captureSource: z.string().optional(),
  initialNotes: z.string().optional(),
  ownerName: z.string().optional(),
  ownerId: z.string().optional(),
  referredBy: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})

const LogActivitySchema = z.object({
  type: z.enum(['meeting', 'call', 'email', 'whatsapp', 'document', 'system']),
  channel: z.string().optional(),
  summary: z.string().min(3),
  outcome: z.enum(['positive', 'neutral', 'concern']).optional(),
  direction: z.string().optional(),
  durationMin: z.number().optional(),
  nextStepDescription: z.string().optional(),
  nextStepDueDate: z.string().optional(),
  occurredAt: z.string().optional(),
  actorName: z.string().optional(),
  actorId: z.string().optional(),
})

const AdvanceStageSchema = z.object({
  toStage: z.string(),
  reason: z.string().optional(),
})

const CloseSchema = z.object({
  outcome: z.enum(['WON', 'LOST']),
  finalValue: z.number().optional(),
  closeDate: z.string().optional(),
  reason: z.string().optional(),
  competitorName: z.string().optional(),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatLead(row: any) {
  return {
    id: row.id,
    displayId: row.display_id,
    company: row.account_name,
    accountId: row.account_id,
    location: row.location,
    vertical: row.vertical,
    model: row.commercial_model,
    origin: row.origin,
    division: row.division,
    owner: row.owner_name,
    ownerId: row.owner_id,
    stage: row.stage,
    slaState: row.sla_state,
    daysInStage: row.days_in_stage,
    value: row.estimated_value ? Number(row.estimated_value) / 100 : 0,
    estClose: row.estimated_close_date,
    captureSource: row.capture_source,
    initialNotes: row.initial_notes,
    leadType: row.lead_type ?? 'Prospect',
    referredBy: row.referred_by,
    reservedAccount: row.anchor_account ?? false,
    erpnextLeadId: row.erpnext_lead_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    contact: row.contact_name ? {
      name: row.contact_name,
      role: row.contact_role,
      email: row.contact_email,
      phone: row.primary_contact_phone ?? null,
    } : null,
    protection: row.protection_status ? {
      status: row.protection_status,
      startedAt: row.protection_started_at,
      expiresAt: row.protection_expires_at,
      daysLeft: Math.floor(
        (new Date(row.protection_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ),
    } : null,
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function leadsRoutes(fastify: FastifyInstance) {

  // GET /leads
  fastify.get('/leads', async (request, reply) => {
    const q = request.query as Record<string, string>

    const conditions: string[] = ['l.deleted_at IS NULL']
    const params: any[] = []
    let i = 1

    if (q.vertical) { conditions.push(`l.vertical = $${i++}`); params.push(q.vertical) }
    if (q.stage) { conditions.push(`l.stage = $${i++}`); params.push(q.stage) }
    if (q.ownerId) { conditions.push(`l.owner_id = $${i++}`); params.push(q.ownerId) }
    if (q.slaState) { conditions.push(`l.sla_state = $${i++}`); params.push(q.slaState) }

    const page = parseInt(q.page ?? '1')
    const pageSize = parseInt(q.pageSize ?? '50')
    const offset = (page - 1) * pageSize

    const sql = `
      SELECT
        l.*,
        a.name        AS account_name,
        a.location    AS location,
        a.anchor_account,
        c.name        AS contact_name,
        c.role        AS contact_role,
        c.email       AS contact_email,
        c.phone       AS primary_contact_phone,
        p.status      AS protection_status,
        p.opened_at  AS protection_started_at,
        p.expires_at  AS protection_expires_at
      FROM lead_service.leads l
      JOIN lead_service.accounts a ON a.id = l.account_id
      LEFT JOIN lead_service.contacts c
        ON c.id = l.primary_contact_id
      LEFT JOIN lead_service.lead_protections p
        ON p.lead_id = l.id AND p.status = 'ACTIVE'
      WHERE ${conditions.join(' AND ')}
      ORDER BY l.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `

    const countSql = `
      SELECT COUNT(*) FROM lead_service.leads l
      WHERE ${conditions.join(' AND ')}
    `

    const [rows, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, params),
    ])

    return reply.send({
      data: rows.rows.map(formatLead),
      meta: {
        total: parseInt(countResult.rows[0].count),
        page,
        pageSize,
      },
    })
  })

  // GET /leads/:id
  fastify.get<{ Params: { id: string } }>('/leads/:id', async (request, reply) => {
    const { id } = request.params

    const sql = `
      SELECT
        l.*,
        a.name        AS account_name,
        a.location    AS location,
        a.anchor_account,
        c.name        AS contact_name,
        c.role        AS contact_role,
        c.email       AS contact_email,
        c.phone       AS primary_contact_phone,
        p.status      AS protection_status,
        p.opened_at  AS protection_started_at,
        p.expires_at  AS protection_expires_at
      FROM lead_service.leads l
      JOIN lead_service.accounts a ON a.id = l.account_id
      LEFT JOIN lead_service.contacts c
        ON c.id = l.primary_contact_id
      LEFT JOIN lead_service.lead_protections p
        ON p.lead_id = l.id AND p.status = 'ACTIVE'
      WHERE l.id = $1 AND l.deleted_at IS NULL
    `

    const result = await query(sql, [id])
    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Lead not found' })
    }

    return reply.send({ data: formatLead(result.rows[0]) })
  })

  // POST /leads
  fastify.post('/leads', async (request, reply) => {
    const body = CreateLeadSchema.parse(request.body)
    const client = await (await import('../db/pool')).pool.connect()

    try {
      await client.query('BEGIN')

      // 1. Find or create account
      const nameNorm = normaliseAccountName(body.account.name)

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
          `INSERT INTO lead_service.accounts
             (name, name_normalized, location, pan)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [body.account.name, nameNorm, body.account.location ?? null, body.account.pan ?? null]
        )
        accountId = acc.rows[0].id
      }

      // 2. Create contact if provided
      let contactId: string | null = null
      if (body.primaryContact) {
        const c = await client.query(
          `INSERT INTO lead_service.contacts
             (account_id, name, role, email, phone, is_primary)
           VALUES ($1, $2, $3, $4, $5, true)
           RETURNING id`,
          [
            accountId,
            body.primaryContact.name,
            body.primaryContact.role ?? null,
            body.primaryContact.email ?? null,
            body.primaryContact.phone ?? null,
          ]
        )
        contactId = c.rows[0].id
      }

      // 3. Generate display ID
      const seqResult = await client.query(
        `SELECT nextval('lead_service.lead_id_seq') AS seq`
      )
      const displayId = generateDisplayId(Number(seqResult.rows[0].seq))

      // 4. Create lead
      const division = body.vertical ? defaultDivision(body.vertical) : 'GREENEDGE'
      const valueInPaise = body.estimatedValue ? body.estimatedValue * 100 : null

      const lead = await client.query(
        `INSERT INTO lead_service.leads (
          display_id, account_id, primary_contact_id,
          vertical, commercial_model, origin, division,
          owner_name, owner_id,
          estimated_value, estimated_close_date,
          capture_source, initial_notes,
          lead_type, referred_by, metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, $15, $16
        ) RETURNING *`,
        [
          displayId, accountId, contactId,
          body.vertical ?? null,
          body.commercialModel ?? null,
          body.origin ?? null,
          body.vertical ? defaultDivision(body.vertical) : 'GREENEDGE',
          body.ownerName ?? null,
          body.ownerId ?? null,
          body.estimatedValue ? body.estimatedValue * 100 : null,
          body.estimatedCloseDate ?? null,
          body.captureSource ?? 'INTERNAL',
          body.initialNotes ?? null,
          body.leadType ?? 'Prospect',
          body.referredBy ?? null,
          JSON.stringify(body.metadata ?? {}),
        ]
      )

      // 5. Audit log
      await client.query(
        `INSERT INTO lead_service.lead_audit_log
           (lead_id, actor_name, action, to_state)
         VALUES ($1, $2, $3, $4)`,
        [
          lead.rows[0].id,
          body.ownerName ?? 'System',
          'lead_created',
          JSON.stringify({ stage: 'New', vertical: body.vertical }),
        ]
      )

      await client.query('COMMIT')

      return reply.status(201).send({ data: { id: lead.rows[0].id, displayId } })

    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })

  // GET /leads/:id/activities
  fastify.get<{ Params: { id: string } }>('/leads/:id/activities', async (request, reply) => {
    const result = await query(
      `SELECT * FROM lead_service.lead_activities
       WHERE lead_id = $1
       ORDER BY occurred_at DESC`,
      [request.params.id]
    )

    return reply.send({
      data: result.rows.map(r => ({
        id: r.id,
        type: r.type,
        who: r.actor_name,
        when: r.occurred_at,
        summary: r.summary,
        channel: r.channel,
        outcome: r.outcome,
        direction: r.direction,
        durationMin: r.duration_min,
        nextStep: r.next_step_description ? {
          description: r.next_step_description,
          due: r.next_step_due_date,
        } : null,
        createdAt: r.created_at,
      })),
    })
  })

  // POST /leads/:id/activities
  fastify.post<{ Params: { id: string } }>('/leads/:id/activities', async (request, reply) => {
    const body = LogActivitySchema.parse(request.body)
    const { id } = request.params

    // Verify lead exists
    const lead = await query(
      `SELECT id FROM lead_service.leads WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )
    if (lead.rows.length === 0) {
      return reply.status(404).send({ error: 'Lead not found' })
    }

    const result = await query(
      `INSERT INTO lead_service.lead_activities (
        lead_id, actor_name, actor_id, actor_type,
        type, channel, summary, outcome,
        direction, duration_min,
        next_step_description, next_step_due_date,
        occurred_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13
      ) RETURNING *`,
      [
        id,
        body.actorName ?? 'Unknown',
        body.actorId ?? null,
        'USER',
        body.type,
        body.channel ?? null,
        body.summary,
        body.outcome ?? null,
        body.direction ?? null,
        body.durationMin ?? null,
        body.nextStepDescription ?? null,
        body.nextStepDueDate ?? null,
        body.occurredAt ? new Date(body.occurredAt) : new Date(),
      ]
    )

    return reply.status(201).send({ data: result.rows[0] })
  })

  // POST /leads/:id/advance
  fastify.post<{ Params: { id: string } }>('/leads/:id/advance', async (request, reply) => {
    const body = AdvanceStageSchema.parse(request.body)
    const { id } = request.params

    const lead = await query(
      `SELECT id, stage, version FROM lead_service.leads
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )

    if (lead.rows.length === 0) {
      return reply.status(404).send({ error: 'Lead not found' })
    }

    const current = lead.rows[0]

    if (!canTransition(current.stage, body.toStage)) {
      return reply.status(422).send({
        error: `Cannot transition from ${current.stage} to ${body.toStage}`,
      })
    }

    await query(
      `UPDATE lead_service.leads
       SET stage = $1, stage_changed_at = NOW(),
           sla_state = 'ok', days_in_stage = 0,
           version = version + 1, updated_at = NOW()
       WHERE id = $2`,
      [body.toStage, id]
    )

    await query(
      `INSERT INTO lead_service.lead_audit_log
         (lead_id, action, from_state, to_state, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        id, 'stage_changed',
        JSON.stringify({ stage: current.stage }),
        JSON.stringify({ stage: body.toStage }),
        body.reason ?? null,
      ]
    )

    return reply.send({ data: { id, stage: body.toStage } })
  })

  // POST /leads/:id/close
  fastify.post<{ Params: { id: string } }>('/leads/:id/close', async (request, reply) => {
    const body = CloseSchema.parse(request.body)
    const { id } = request.params

    const lead = await query(
      `SELECT id, stage FROM lead_service.leads
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )

    if (lead.rows.length === 0) {
      return reply.status(404).send({ error: 'Lead not found' })
    }

    if (lead.rows[0].stage !== 'Negotiation') {
      return reply.status(422).send({
        error: 'Only leads in Negotiation can be closed',
      })
    }

    const newStage = body.outcome === 'WON' ? 'Closed Won' : 'Closed Lost'

    await query(
      `UPDATE lead_service.leads
       SET stage = $1, stage_changed_at = NOW(),
           close_outcome = $2, close_reason = $3,
           competitor_name = $4,
           actual_close_date = $5,
           estimated_value = COALESCE($6, estimated_value),
           version = version + 1, updated_at = NOW()
       WHERE id = $7`,
      [
        newStage, body.outcome,
        body.reason ?? null,
        body.competitorName ?? null,
        body.closeDate ? new Date(body.closeDate) : new Date(),
        body.finalValue ? body.finalValue * 100 : null,
        id,
      ]
    )

    await query(
      `INSERT INTO lead_service.lead_audit_log
         (lead_id, action, from_state, to_state)
       VALUES ($1, $2, $3, $4)`,
      [
        id,
        body.outcome === 'WON' ? 'lead_closed_won' : 'lead_closed_lost',
        JSON.stringify({ stage: 'Negotiation' }),
        JSON.stringify({ stage: newStage }),
      ]
    )

    return reply.send({ data: { id, stage: newStage, outcome: body.outcome } })
  })

  // PATCH /leads/:id — edit lead facts + primary contact.
  // Lead columns: lead_type, owner_name, estimated_value (paise), estimated_close_date.
  // Contact fields live on lead_service.contacts (created if missing).
  fastify.patch<{ Params: { id: string } }>('/leads/:id', async (req, reply) => {
    const { id } = req.params
    const body = UpdateLeadSchema.parse(req.body ?? {})

    const leadRes = await query(
      `SELECT id, account_id, primary_contact_id FROM lead_service.leads
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )
    if (leadRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Lead not found' })
    }
    const lead = leadRes.rows[0]

    // --- lead columns ---
    const sets: string[] = []
    const vals: unknown[] = []
    let i = 1
    if ('leadType' in body) { sets.push(`lead_type = $${i++}`); vals.push(body.leadType) }
    if ('owner' in body)    { sets.push(`owner_name = $${i++}`); vals.push(body.owner || null) }
    if ('value' in body) {
      sets.push(`estimated_value = $${i++}`)
      vals.push(body.value == null ? null : Math.round(body.value * 100)) // rupees -> paise
    }
    if ('estClose' in body) { sets.push(`estimated_close_date = $${i++}`); vals.push(body.estClose || null) }

    if (sets.length) {
      vals.push(id)
      await query(
        `UPDATE lead_service.leads
            SET ${sets.join(', ')}, updated_at = NOW(), version = version + 1
          WHERE id = $${i}`,
        vals
      )
    }

    // --- primary contact ---
    const cSets: string[] = []
    const cVals: unknown[] = []
    let j = 1
    if ('contactName' in body) { cSets.push(`name = $${j++}`); cVals.push(body.contactName) }
    if ('contactRole' in body) { cSets.push(`role = $${j++}`); cVals.push(body.contactRole || null) }
    if ('email' in body)       { cSets.push(`email = $${j++}`); cVals.push(body.email || null) }
    if ('phone' in body)       { cSets.push(`phone = $${j++}`); cVals.push(body.phone || null) }

    if (cSets.length) {
      if (lead.primary_contact_id) {
        cVals.push(lead.primary_contact_id)
        await query(
          `UPDATE lead_service.contacts SET ${cSets.join(', ')} WHERE id = $${j}`,
          cVals
        )
      } else if (body.contactName) {
        const c = await query(
          `INSERT INTO lead_service.contacts (account_id, name, role, email, phone, is_primary)
           VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
          [lead.account_id, body.contactName, body.contactRole ?? null, body.email ?? null, body.phone ?? null]
        )
        await query(
          `UPDATE lead_service.leads SET primary_contact_id = $1, updated_at = NOW() WHERE id = $2`,
          [c.rows[0].id, id]
        )
      }
    }

    if (!sets.length && !cSets.length) {
      return reply.status(400).send({ error: 'no editable fields supplied' })
    }

    // Return the freshly formatted lead so the UI can refresh in place
    const fresh = await query(
      `SELECT
        l.*,
        a.name        AS account_name,
        a.location    AS location,
        a.anchor_account,
        c.name        AS contact_name,
        c.role        AS contact_role,
        c.email       AS contact_email,
        c.phone       AS primary_contact_phone,
        p.status      AS protection_status,
        p.opened_at  AS protection_started_at,
        p.expires_at  AS protection_expires_at
      FROM lead_service.leads l
      JOIN lead_service.accounts a ON a.id = l.account_id
      LEFT JOIN lead_service.contacts c ON c.id = l.primary_contact_id
      LEFT JOIN lead_service.lead_protections p ON p.lead_id = l.id AND p.status = 'ACTIVE'
      WHERE l.id = $1`,
      [id]
    )
    return reply.send({ data: formatLead(fresh.rows[0]) })
  })

  // DELETE /leads/:id  (soft delete)
  fastify.delete<{ Params: { id: string } }>('/leads/:id', async (request, reply) => {
    const { id } = request.params
    const body = (request.body ?? {}) as { reason?: string; actorName?: string }

    const lead = await query(
      `SELECT id, stage FROM lead_service.leads WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )
    if (lead.rows.length === 0) {
      return reply.status(404).send({ error: 'Lead not found' })
    }

    await query(
      `UPDATE lead_service.leads
     SET deleted_at = NOW(), updated_at = NOW(), version = version + 1
     WHERE id = $1`,
      [id]
    )

    await query(
      `INSERT INTO lead_service.lead_audit_log
       (lead_id, actor_name, action, from_state, reason)
     VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        body.actorName ?? 'System',
        'lead_deleted',
        JSON.stringify({ stage: lead.rows[0].stage }),
        body.reason ?? null,
      ]
    )

    return reply.send({ data: { id, deleted: true } })
  })

  // GET /pipeline
  fastify.get('/pipeline', async (request, reply) => {
    const result = await query(`
      SELECT
        stage,
        vertical,
        COUNT(*)              AS count,
        SUM(estimated_value)  AS total_value
      FROM lead_service.leads
      WHERE deleted_at IS NULL
        AND stage NOT IN ('Closed Won', 'Closed Lost')
      GROUP BY stage, vertical
      ORDER BY stage, vertical
    `)

    return reply.send({ data: result.rows })
  })

  // POST /leads/:id/triage
  fastify.post<{ Params: { id: string } }>('/leads/:id/triage', async (request, reply) => {
    const body = z.object({
      leadType: z.string(),
      vertical: z.string().optional(),
      ownerName: z.string(),
    }).parse(request.body)

    const { id } = request.params

    const lead = await query(
      `SELECT id FROM lead_service.leads WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )

    if (lead.rows.length === 0) {
      return reply.status(404).send({ error: 'Lead not found' })
    }

    await query(
      `UPDATE lead_service.leads
     SET lead_type = $1,
         vertical  = COALESCE($2, vertical),
         owner_name = $3,
         stage = 'Allocated',
         stage_changed_at = NOW(),
         updated_at = NOW()
     WHERE id = $4`,
      [body.leadType, body.vertical ?? null, body.ownerName, id]
    )

    await query(
      `INSERT INTO lead_service.lead_audit_log
       (lead_id, actor_name, action, from_state, to_state)
     VALUES ($1, $2, $3, $4, $5)`,
      [
        id, body.ownerName, 'triage_classified',
        JSON.stringify({ stage: 'New', owner: null }),
        JSON.stringify({ stage: 'Allocated', leadType: body.leadType, owner: body.ownerName }),
      ]
    )

    return reply.send({ data: { id, leadType: body.leadType, owner: body.ownerName } })
  })
}
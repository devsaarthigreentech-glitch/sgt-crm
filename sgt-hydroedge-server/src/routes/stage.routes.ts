// Stage Management endpoints. Mount with: app.register(stageRoutes)
// Every transition: validate -> update stage -> log transition -> publish event.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { query, pool } from '../db/pool'
import { publish } from '../domain/events'
import { releaseProtection } from '../domain/protection'
import {
  Stage, STAGE_LABELS, ACTIVE_STAGES, MIRROR_STAGES, TERMINAL_STAGES,
  nextAdvanceStage, qualificationGate, LOSS_REASONS, isStage,
} from '../domain/stage.domain'

// --- helpers -----------------------------------------------------------------
function actorOf(req: FastifyRequest) {
  // Real auth middleware should populate req.user. Dev fallback: header.
  const u = (req as any).user
  if (u?.id) return { type: 'user' as const, id: u.id }
  const hdr = req.headers['x-sgt-user'] as string | undefined
  return { type: 'user' as const, id: hdr ?? 'dev-user' }
}
function divisionOf(req: FastifyRequest) {
  return (req.headers['x-sgt-division'] as string) || 'corporate'
}

async function loadLead(id: string) {
  const r = await query(`SELECT * FROM lead_service.leads WHERE id = $1`, [id])
  return r.rows[0] as any | undefined
}

async function applyTransition(opts: {
  leadId: string; from: Stage | null; to: Stage; req: FastifyRequest
  reason?: string; meta?: Record<string, unknown>; probability?: number
}) {
  const { leadId, from, to, req } = opts
  const actor = actorOf(req)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE lead_service.leads
         SET stage = $1, stage_entered_at = now(), days_in_stage = 0, sla_state = 'ok',
             probability = COALESCE($2, probability),
             first_contact_at = CASE WHEN $1 = 'contacted' AND first_contact_at IS NULL
                                     THEN now() ELSE first_contact_at END
       WHERE id = $3`,
      [to, opts.probability ?? null, leadId]
    )
    await client.query(
      `INSERT INTO lead_service.lead_stage_transitions
         (id, lead_id, from_stage, to_stage, actor_type, actor_id, reason, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      ['tr_' + nanoid(14), leadId, from, to, actor.type, actor.id, opts.reason ?? null,
       JSON.stringify(opts.meta ?? {})]
    )
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

// --- routes ------------------------------------------------------------------
export default async function stageRoutes(app: FastifyInstance) {

  // POST /leads/:id/advance — sequential forward move only
  app.post('/leads/:id/advance', async (req, reply) => {
    const { id } = req.params as { id: string }
    const lead = await loadLead(id)
    if (!lead) return reply.code(404).send({ error: { code: 'not_found', message: 'Lead not found' } })

    const cur = lead.stage as Stage
    const next = nextAdvanceStage(cur)
    if (!next) {
      return reply.code(409).send({ error: { code: 'illegal_transition',
        message: `Cannot advance from ${STAGE_LABELS[cur] ?? cur}` } })
    }
    // advancing into Qualified runs the gate
    if (next === 'qualified') {
      const gate = qualificationGate(lead)
      if (!gate.ok) return reply.code(422).send({ error: { code: 'gate_failed',
        message: 'Qualification gate not satisfied', details: { failures: gate.failures } } })
    }
    await applyTransition({ leadId: id, from: cur, to: next, req })
    if (next === 'qualified') {
      await publish('lead.qualified', { aggregateId: id, division: divisionOf(req), actor: actorOf(req), data: {} })
    }
    return reply.send({ data: { id, stage: next } })
  })

  // POST /leads/:id/qualify — explicit gated promotion to Qualified
  app.post('/leads/:id/qualify', async (req, reply) => {
    const { id } = req.params as { id: string }
    const lead = await loadLead(id)
    if (!lead) return reply.code(404).send({ error: { code: 'not_found', message: 'Lead not found' } })
    if (lead.stage === 'qualified')
      return reply.code(409).send({ error: { code: 'already_qualified', message: 'Lead is already qualified' } })
    if (!['contacted', 'allocated', 'new'].includes(lead.stage))
      return reply.code(409).send({ error: { code: 'illegal_transition',
        message: `Cannot qualify from ${STAGE_LABELS[lead.stage as Stage] ?? lead.stage}` } })

    const gate = qualificationGate(lead)
    if (!gate.ok) return reply.code(422).send({ error: { code: 'gate_failed',
      message: 'Qualification gate not satisfied', details: { failures: gate.failures } } })

    await applyTransition({ leadId: id, from: lead.stage, to: 'qualified', req, probability: 40 })
    await publish('lead.qualified', { aggregateId: id, division: divisionOf(req), actor: actorOf(req), data: {} })
    return reply.send({ data: { id, stage: 'qualified' } })
  })

  // POST /leads/:id/handoff — target = poc | quote (Qualified -> mirror stage)
  const handoffBody = z.object({ target: z.enum(['poc', 'quote']) })
  app.post('/leads/:id/handoff', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = handoffBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: { code: 'bad_request', message: 'target must be poc|quote' } })
    const lead = await loadLead(id)
    if (!lead) return reply.code(404).send({ error: { code: 'not_found', message: 'Lead not found' } })
    if (lead.stage !== 'qualified')
      return reply.code(409).send({ error: { code: 'illegal_transition', message: 'Handoff requires a Qualified lead' } })

    const to: Stage = parsed.data.target === 'poc' ? 'in_poc' : 'proposal'
    await applyTransition({ leadId: id, from: 'qualified', to, req, meta: { handoff: parsed.data.target } })
    await publish(parsed.data.target === 'poc' ? 'lead.qualified' : 'lead.proposal_sent',
      { aggregateId: id, division: divisionOf(req), actor: actorOf(req), data: { handoff: parsed.data.target } })
    return reply.send({ data: { id, stage: to } })
  })

  // POST /leads/:id/close — outcome = won | lost
  const closeBody = z.object({
    outcome: z.enum(['won', 'lost']),
    orderRef: z.string().optional(),
    override: z.boolean().optional(),
    reason: z.string().optional(),
    lossReason: z.enum(LOSS_REASONS).optional(),
    note: z.string().optional(),
  })
  app.post('/leads/:id/close', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = closeBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: { code: 'bad_request', message: 'Invalid close payload' } })
    const lead = await loadLead(id)
    if (!lead) return reply.code(404).send({ error: { code: 'not_found', message: 'Lead not found' } })
    if (TERMINAL_STAGES.includes(lead.stage))
      return reply.code(409).send({ error: { code: 'already_closed', message: 'Lead is already closed' } })

    const b = parsed.data
    if (b.outcome === 'won') {
      // won-gate: order/PO reference present OR explicit override + reason
      if (!b.orderRef && !(b.override && b.reason)) {
        return reply.code(422).send({ error: { code: 'won_gate_failed',
          message: 'Close-Won needs an order/PO reference, or an explicit override with a reason' } })
      }
      await applyTransition({ leadId: id, from: lead.stage, to: 'closed_won', req,
        reason: b.orderRef ? `order:${b.orderRef}` : `override:${b.reason}`,
        meta: { orderRef: b.orderRef ?? null, override: !!b.override }, probability: 100 })
      await releaseProtection(id)
      await publish('lead.closed_won', { aggregateId: id, division: divisionOf(req), actor: actorOf(req),
        data: { value: lead.value ?? null, currency: 'INR', orderRef: b.orderRef ?? null } })
      return reply.send({ data: { id, stage: 'closed_won' } })
    }

    // lost: structured reason required
    if (!b.lossReason) {
      return reply.code(422).send({ error: { code: 'loss_reason_required',
        message: 'Close-Lost requires a structured loss reason', details: { allowed: LOSS_REASONS } } })
    }
    await applyTransition({ leadId: id, from: lead.stage, to: 'closed_lost', req,
      reason: b.lossReason, meta: { lossReason: b.lossReason, note: b.note ?? null }, probability: 0 })
    await releaseProtection(id)
    await publish('lead.closed_lost', { aggregateId: id, division: divisionOf(req), actor: actorOf(req),
      data: { lossReason: b.lossReason } })
    return reply.send({ data: { id, stage: 'closed_lost' } })
  })

  // POST /leads/:id/reopen — Closed-Lost -> last active stage, within 90 days
  const reopenBody = z.object({ reason: z.string().min(3) })
  app.post('/leads/:id/reopen', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = reopenBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: { code: 'bad_request', message: 'reason required' } })
    const lead = await loadLead(id)
    if (!lead) return reply.code(404).send({ error: { code: 'not_found', message: 'Lead not found' } })
    if (lead.stage !== 'closed_lost')
      return reply.code(409).send({ error: { code: 'not_lost', message: 'Only Closed-Lost leads can be reopened' } })

    const closeT = await query(
      `SELECT occurred_at, from_stage FROM lead_service.lead_stage_transitions
       WHERE lead_id = $1 AND to_stage = 'closed_lost' ORDER BY occurred_at DESC LIMIT 1`, [id]
    )
    const closedAt = closeT.rows[0]?.occurred_at
    if (closedAt && Date.now() - new Date(closedAt).getTime() > 90 * 86400_000) {
      return reply.code(409).send({ error: { code: 'reopen_window_expired',
        message: 'Reopen window (90 days) has passed' } })
    }
    const restore = (closeT.rows[0]?.from_stage as Stage) || 'contacted'
    await applyTransition({ leadId: id, from: 'closed_lost', to: restore, req, reason: parsed.data.reason })
    await publish('lead.reopened', { aggregateId: id, division: divisionOf(req), actor: actorOf(req),
      data: { restoredStage: restore, reason: parsed.data.reason } })
    return reply.send({ data: { id, stage: restore } })
  })

  // GET /leads/:id/transitions — audit history
  app.get('/leads/:id/transitions', async (req, reply) => {
    const { id } = req.params as { id: string }
    const r = await query(
      `SELECT id, from_stage, to_stage, actor_type, actor_id, reason, meta, occurred_at
       FROM lead_service.lead_stage_transitions WHERE lead_id = $1 ORDER BY occurred_at ASC`, [id]
    )
    return reply.send({ data: r.rows })
  })

  // GET /pipeline — rollup by stage (optionally by division)
  app.get('/pipeline', async (req, reply) => {
    const division = (req.query as any)?.division as string | undefined
    const r = await query(
      `SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(value),0)::bigint AS value
         FROM lead_service.leads
        ${division ? 'WHERE division = $1' : ''}
        GROUP BY stage`,
      division ? [division] : []
    )
    const byStage: Record<string, { count: number; value: number }> = {}
    for (const row of r.rows) byStage[row.stage] = { count: row.count, value: Number(row.value) }
    return reply.send({ data: { byStage, activeStages: ACTIVE_STAGES, mirrorStages: MIRROR_STAGES } })
  })
}
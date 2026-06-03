// Recomputes days_in_stage and sla_state for active leads from stage_sla_config.
// Lightweight scheduled sweep (BullMQ stand-in). Emits at-risk / breach events.
import { query } from '../db/pool'
import { publish } from './events'
import { ACTIVE_STAGES } from './stage.domain'

export async function refreshSla() {
  // pull thresholds once
  const cfg = await query(`SELECT division, stage, threshold_hours FROM lead_service.stage_sla_config`)
  const map = new Map<string, number>()
  for (const r of cfg.rows) map.set(`${r.division}:${r.stage}`, r.threshold_hours)

  const leads = await query(
    `SELECT id, division, stage, stage_entered_at, sla_state
       FROM lead_service.leads
      WHERE stage = ANY($1)`,
    [ACTIVE_STAGES]
  )

  for (const l of leads.rows) {
    const hours = (Date.now() - new Date(l.stage_entered_at).getTime()) / 3600_000
    const days = Math.floor(hours / 24)
    const threshold = map.get(`${l.division}:${l.stage}`)
    let state: 'ok' | 'at_risk' | 'breached' = 'ok'
    if (threshold) {
      if (hours >= threshold) state = 'breached'
      else if (hours >= threshold * 0.75) state = 'at_risk'
    }
    if (state !== l.sla_state || days !== undefined) {
      await query(
        `UPDATE lead_service.leads SET days_in_stage = $1, sla_state = $2 WHERE id = $3`,
        [days, state, l.id]
      )
    }
    if (state !== l.sla_state && state === 'at_risk') {
      await publish('lead.sla_at_risk', { aggregateId: l.id, division: l.division, data: { stage: l.stage } })
    }
    if (state !== l.sla_state && state === 'breached') {
      await publish('lead.sla_breached', { aggregateId: l.id, division: l.division, data: { stage: l.stage } })
    }
  }
}

let timer: NodeJS.Timeout | null = null
export function startSlaSweep(intervalMs = 15 * 60 * 1000) {
  if (timer) return
  setTimeout(() => refreshSla().catch(console.error), 7000)
  timer = setInterval(() => refreshSla().catch(console.error), intervalMs)
}
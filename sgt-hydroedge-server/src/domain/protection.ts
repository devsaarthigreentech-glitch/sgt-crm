// Lead-protection clock as a Postgres-backed sweep. This is the pragmatic
// stand-in for the Temporal workflow in the spec: durable (state lives in the
// table, not memory), survives restarts, and is testable. Swap the sweep for a
// Temporal workflow later without changing callers.
import { nanoid } from 'nanoid'
import { query } from '../db/pool'
import { publish } from './events'

const WINDOW_DAYS = 90
const EXTEND_WINDOW_DAYS = 30   // qualifying activity inside the final 30 days extends

export type ConflictState = 'clear' | 'conflict' | 'reserved'
export interface ConflictResult {
  state: ConflictState
  ownedByMe?: boolean
  heldByPartnerId?: string
  reservedLabel?: string
}

/** Three-state conflict check, scoped to the requesting partner. */
export async function conflictCheck(accountNorm: string, partnerId: string): Promise<ConflictResult> {
  const reserved = await query(
    `SELECT label FROM lead_service.reserved_accounts WHERE account_norm = $1`, [accountNorm]
  )
  if (reserved.rowCount) return { state: 'reserved', reservedLabel: reserved.rows[0].label }

  const prot = await query(
    `SELECT partner_id FROM lead_service.lead_protections
     WHERE account_norm = $1 AND status IN ('active','extended')
     ORDER BY opened_at ASC LIMIT 1`, [accountNorm]
  )
  if (prot.rowCount) {
    const holder = prot.rows[0].partner_id as string
    if (holder === partnerId) return { state: 'clear', ownedByMe: true }
    return { state: 'conflict', heldByPartnerId: holder }
  }
  return { state: 'clear' }
}

/** Opens a 90-day protection window and links it to the lead. */
export async function openProtection(opts: {
  leadId: string; accountNorm: string; partnerId: string; division?: string
}): Promise<string> {
  const id = 'prot_' + nanoid(14)
  const expires = new Date(Date.now() + WINDOW_DAYS * 86400_000)
  await query(
    `INSERT INTO lead_service.lead_protections
       (id, lead_id, account_norm, partner_id, status, expires_at)
     VALUES ($1,$2,$3,$4,'active',$5)`,
    [id, opts.leadId, opts.accountNorm, opts.partnerId, expires]
  )
  await query(`UPDATE lead_service.leads SET protection_id = $1 WHERE id = $2`, [id, opts.leadId])
  await publish('lead.protection_started', {
    aggregateId: opts.leadId, division: opts.division,
    data: { protectionId: id, partnerId: opts.partnerId, expiresAt: expires.toISOString() },
  })
  return id
}

/** Records qualifying activity; extends the window if inside the final 30 days. */
export async function touchProtection(protectionId: string) {
  await query(
    `UPDATE lead_service.lead_protections
       SET last_activity_at = now(),
           status = 'extended',
           expires_at = CASE
             WHEN expires_at - now() < interval '${EXTEND_WINDOW_DAYS} days'
             THEN now() + interval '${EXTEND_WINDOW_DAYS} days'
             ELSE expires_at END
     WHERE id = $1 AND status IN ('active','extended')`,
    [protectionId]
  )
}

/** Releases protection when a lead closes (won or lost). */
export async function releaseProtection(leadId: string) {
  await query(
    `UPDATE lead_service.lead_protections SET status = 'released'
     WHERE lead_id = $1 AND status IN ('active','extended')`, [leadId]
  )
}

/** Periodic sweep: expire lapsed windows. Call start() once from index.ts. */
export async function sweepExpiredProtections() {
  const lapsed = await query(
    `UPDATE lead_service.lead_protections
       SET status = 'expired'
     WHERE status IN ('active','extended') AND expires_at <= now()
     RETURNING id, lead_id, partner_id`
  )
  for (const row of lapsed.rows) {
    await publish('lead.protection_expired', {
      aggregateId: row.lead_id,
      data: { protectionId: row.id, partnerId: row.partner_id },
    })
  }
  return lapsed.rowCount ?? 0
}

let timer: NodeJS.Timeout | null = null
export function startProtectionSweep(intervalMs = 60 * 60 * 1000) {
  if (timer) return
  // run shortly after boot, then on the interval
  setTimeout(() => sweepExpiredProtections().catch(console.error), 5000)
  timer = setInterval(() => sweepExpiredProtections().catch(console.error), intervalMs)
}
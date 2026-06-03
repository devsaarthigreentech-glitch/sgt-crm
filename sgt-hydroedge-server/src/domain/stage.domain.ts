// Pure domain logic for Stage Management. No DB, no Fastify — just the rules.
// Mirrored on the frontend in web/src/lib/stages.ts (keep the two in sync).

export type Stage =
  | 'new' | 'allocated' | 'contacted' | 'qualified'
  | 'in_poc' | 'proposal' | 'closed_won' | 'closed_lost'

export const STAGE_LABELS: Record<Stage, string> = {
  new: 'New',
  allocated: 'Allocated',
  contacted: 'Contacted',
  qualified: 'Qualified',
  in_poc: 'In POC',
  proposal: 'Proposal',
  closed_won: 'Closed-Won',
  closed_lost: 'Closed-Lost',
}

// The forward, sequential path Stage Management owns. Advancing cannot skip.
export const ADVANCE_ORDER: Stage[] = ['new', 'allocated', 'contacted', 'qualified']

// Mirror states — set only from downstream module events (POC / Quote-to-Cash).
export const MIRROR_STAGES: Stage[] = ['in_poc', 'proposal']

export const TERMINAL_STAGES: Stage[] = ['closed_won', 'closed_lost']

export const ACTIVE_STAGES: Stage[] = [
  'new', 'allocated', 'contacted', 'qualified', 'in_poc', 'proposal',
]

export function isStage(v: string): v is Stage {
  return v in STAGE_LABELS
}

/** Next legal stage for a plain `advance`, or null if advancing isn't allowed. */
export function nextAdvanceStage(s: Stage): Stage | null {
  const i = ADVANCE_ORDER.indexOf(s)
  if (i === -1 || i === ADVANCE_ORDER.length - 1) return null
  return ADVANCE_ORDER[i + 1]
}

export const LOSS_REASONS = [
  'price', 'timing', 'competitor', 'no_budget',
  'disqualified', 'no_response', 'other',
] as const
export type LossReason = typeof LOSS_REASONS[number]

// ── Qualification gate ────────────────────────────────────────────────────────
export interface LeadForGate {
  contact_email?: string | null
  contact_phone?: string | null
  decision_authority?: string | null
  vertical?: string | null
  model?: string | null
  value?: number | null
  est_close?: string | null
  source?: string | null
  protection_id?: string | null
}

export interface GateResult { ok: boolean; failures: string[] }

/** Deterministic gate. AI may pre-fill fields, but it never passes the gate. */
export function qualificationGate(l: LeadForGate): GateResult {
  const f: string[] = []
  if (!l.contact_email && !l.contact_phone) f.push('reachable_contact_channel')
  if (!l.decision_authority) f.push('decision_authority')
  if (!l.vertical || l.vertical === 'unclassified') f.push('vertical')
  if (!l.model || l.model === 'unclassified') f.push('commercial_model')
  if (!l.value || l.value <= 0) f.push('estimated_value')
  if (!l.est_close || new Date(l.est_close).getTime() <= Date.now()) f.push('estimated_close_date_future')
  if (l.source === 'partner_portal' && !l.protection_id) f.push('active_lead_protection')
  return { ok: f.length === 0, failures: f }
}

// ── Account name normalisation (conflict / reserved matching) ─────────────────
const SUFFIXES = /\b(pvt|private|ltd|limited|llp|inc|incorporated|corp|corporation|co|company)\b/g
export function normalizeAccountName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(SUFFIXES, ' ')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}
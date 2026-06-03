// Frontend mirror of server/src/domain/stage.domain.ts — keep in sync.
export type Stage =
  | 'new' | 'allocated' | 'contacted' | 'qualified'
  | 'in_poc' | 'proposal' | 'closed_won' | 'closed_lost'

export const STAGE_LABELS: Record<Stage, string> = {
  new: 'New', allocated: 'Allocated', contacted: 'Contacted', qualified: 'Qualified',
  in_poc: 'In POC', proposal: 'Proposal', closed_won: 'Closed-Won', closed_lost: 'Closed-Lost',
}

export const ADVANCE_ORDER: Stage[] = ['new', 'allocated', 'contacted', 'qualified']
export const MIRROR_STAGES: Stage[] = ['in_poc', 'proposal']
export const TERMINAL_STAGES: Stage[] = ['closed_won', 'closed_lost']

export function isMirror(s: Stage) { return MIRROR_STAGES.includes(s) }
export function isTerminal(s: Stage) { return TERMINAL_STAGES.includes(s) }

export function nextAdvanceStage(s: Stage): Stage | null {
  const i = ADVANCE_ORDER.indexOf(s)
  if (i === -1 || i === ADVANCE_ORDER.length - 1) return null
  return ADVANCE_ORDER[i + 1]
}

export const LOSS_REASONS: { value: string; label: string }[] = [
  { value: 'price', label: 'Price' },
  { value: 'timing', label: 'Timing / no longer active' },
  { value: 'competitor', label: 'Lost to competitor' },
  { value: 'no_budget', label: 'No budget' },
  { value: 'disqualified', label: 'Disqualified / poor fit' },
  { value: 'no_response', label: 'No response' },
  { value: 'other', label: 'Other (add note)' },
]

// ── Client-side qualification gate (mirrors the server gate) ──────────────────
export interface GateLead {
  contactEmail?: string | null
  contactPhone?: string | null
  decisionAuthority?: string | null
  vertical?: string | null
  model?: string | null
  value?: number | null
  estClose?: string | null
  source?: string | null
  protectionId?: string | null
}

export interface GateCheck { key: string; label: string; pass: boolean }

export function qualificationChecklist(l: GateLead): GateCheck[] {
  return [
    { key: 'reachable_contact_channel', label: 'Reachable contact (email or phone)',
      pass: !!(l.contactEmail || l.contactPhone) },
    { key: 'decision_authority', label: 'Decision authority identified',
      pass: !!l.decisionAuthority },
    { key: 'vertical', label: 'Vertical set',
      pass: !!l.vertical && l.vertical !== 'unclassified' },
    { key: 'commercial_model', label: 'Commercial model set',
      pass: !!l.model && l.model !== 'unclassified' },
    { key: 'estimated_value', label: 'Estimated value present',
      pass: !!l.value && l.value > 0 },
    { key: 'estimated_close_date_future', label: 'Estimated close date in the future',
      pass: !!l.estClose && new Date(l.estClose).getTime() > Date.now() },
    ...(l.source === 'partner_portal'
      ? [{ key: 'active_lead_protection', label: 'Active lead protection', pass: !!l.protectionId }]
      : []),
  ]
}

export function gatePasses(l: GateLead) {
  return qualificationChecklist(l).every(c => c.pass)
}
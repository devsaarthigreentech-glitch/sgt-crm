// // Frontend mirror of server/src/domain/leads.ts VALID_TRANSITIONS — keep in sync.
// // These are the live pipeline stages (display-label values stored in the DB).

// export const PIPELINE_STAGES = [
//     'New', 'Allocated', 'Qualifying', 'Discovery', 'Proposal', 'Negotiation',
//   ] as const
  
//   export const VALID_TRANSITIONS: Record<string, string[]> = {
//     'New':         ['Allocated'],
//     'Allocated':   ['Qualifying',  'Closed Lost'],
//     'Qualifying':  ['Discovery',   'Closed Lost'],
//     'Discovery':   ['Proposal',    'Closed Lost'],
//     'Proposal':    ['Negotiation', 'Closed Lost'],
//     'Negotiation': ['Closed Won',  'Closed Lost'],
//     'Closed Won':  [],
//     'Closed Lost': [],
//   }
  
//   export function canTransition(from: string, to: string): boolean {
//     return VALID_TRANSITIONS[from]?.includes(to) ?? false
//   }
  
//   /** The forward (non-terminal) next stage, or null if there isn't one. */
//   export function nextStage(from: string): string | null {
//     const next = VALID_TRANSITIONS[from]?.find(
//       s => s !== 'Closed Lost' && s !== 'Closed Won'
//     )
//     return next ?? null
//   }
  
//   export function isTerminal(stage: string): boolean {
//     return stage === 'Closed Won' || stage === 'Closed Lost'
//   }
// Frontend mirror of server/src/domain/leads.ts canTransition — keep in sync.
// Stage values are display labels stored directly in the DB.

export const PIPELINE_STAGES = [
    'New', 'Allocated', 'Qualifying', 'Discovery', 'Proposal', 'Negotiation',
  ] as const
  
  export const TERMINAL_STAGES = ['Closed Won', 'Closed Lost'] as const
  
  /**
   * Movement rules:
   * - Between any two ACTIVE stages: allowed in BOTH directions (fix mistakes freely).
   * - Any active stage -> Closed Lost: allowed.
   * - Negotiation -> Closed Won: allowed (via the close endpoint).
   * - Out of a terminal stage: not allowed (reopen is a separate concern).
   */
  export function canTransition(from: string, to: string): boolean {
    if (from === to) return false
    const active = PIPELINE_STAGES as readonly string[]
    if (active.includes(from) && active.includes(to)) return true
    if (active.includes(from) && to === 'Closed Lost') return true
    if (from === 'Negotiation' && to === 'Closed Won') return true
    return false
  }
  
  /** The forward next stage in the canonical order, or null at the end. */
  export function nextStage(from: string): string | null {
    const i = (PIPELINE_STAGES as readonly string[]).indexOf(from)
    if (i === -1 || i === PIPELINE_STAGES.length - 1) return null
    return PIPELINE_STAGES[i + 1]
  }
  
  export function isTerminal(stage: string): boolean {
    return (TERMINAL_STAGES as readonly string[]).includes(stage)
  }
// Frontend mirror of server/src/domain/leads.ts VALID_TRANSITIONS — keep in sync.
// These are the live pipeline stages (display-label values stored in the DB).

export const PIPELINE_STAGES = [
    'New', 'Allocated', 'Qualifying', 'Discovery', 'Proposal', 'Negotiation',
  ] as const
  
  export const VALID_TRANSITIONS: Record<string, string[]> = {
    'New':         ['Allocated'],
    'Allocated':   ['Qualifying',  'Closed Lost'],
    'Qualifying':  ['Discovery',   'Closed Lost'],
    'Discovery':   ['Proposal',    'Closed Lost'],
    'Proposal':    ['Negotiation', 'Closed Lost'],
    'Negotiation': ['Closed Won',  'Closed Lost'],
    'Closed Won':  [],
    'Closed Lost': [],
  }
  
  export function canTransition(from: string, to: string): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false
  }
  
  /** The forward (non-terminal) next stage, or null if there isn't one. */
  export function nextStage(from: string): string | null {
    const next = VALID_TRANSITIONS[from]?.find(
      s => s !== 'Closed Lost' && s !== 'Closed Won'
    )
    return next ?? null
  }
  
  export function isTerminal(stage: string): boolean {
    return stage === 'Closed Won' || stage === 'Closed Lost'
  }
export function normaliseAccountName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\b(pvt|ltd|limited|private|india|industries|group|corp|corporation|inc|llp|llc)\b/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  
  export function generateDisplayId(seq: number): string {
    return `L-${String(seq).padStart(4, '0')}`
  }
  
  export function computeSlaState(
    stage: string,
    stageChangedAt: Date,
    now: Date = new Date()
  ): 'ok' | 'risk' | 'breach' {
    const days = Math.floor(
      (now.getTime() - stageChangedAt.getTime()) / (1000 * 60 * 60 * 24)
    )
  
    const thresholds: Record<string, { risk: number; breach: number }> = {
      'New':         { risk: 1,  breach: 2  },
      'Allocated':   { risk: 3,  breach: 5  },
      'Qualifying':  { risk: 7,  breach: 14 },
      'Discovery':   { risk: 14, breach: 21 },
      'Proposal':    { risk: 7,  breach: 14 },
      'Negotiation': { risk: 14, breach: 30 },
    }
  
    const t = thresholds[stage]
    if (!t) return 'ok'
    if (days >= t.breach) return 'breach'
    if (days >= t.risk)   return 'risk'
    return 'ok'
  }
  
  export function daysInStage(stageChangedAt: Date, now: Date = new Date()): number {
    return Math.floor(
      (now.getTime() - stageChangedAt.getTime()) / (1000 * 60 * 60 * 24)
    )
  }
  
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
  
  export function defaultDivision(vertical: string): string {
    const map: Record<string, string> = {
      'Industry':       'GREENEDGE',
      'Marine':         'MARINE',
      'Vehicles':       'GREENX',
      'Small DG':       'GREENX',
      'Cross-vertical': 'GREENEDGE',
    }
    return map[vertical] ?? 'GREENEDGE'
  }
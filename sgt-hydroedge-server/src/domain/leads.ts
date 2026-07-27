// export function normaliseAccountName(name: string): string {
//     return name
//       .toLowerCase()
//       .replace(/\b(pvt|ltd|limited|private|india|industries|group|corp|corporation|inc|llp|llc)\b/g, '')
//       .replace(/[^a-z0-9]/g, ' ')
//       .replace(/\s+/g, ' ')
//       .trim()
//   }
  
//   export function generateDisplayId(seq: number): string {
//     return `L-${String(seq).padStart(4, '0')}`
//   }
  
//   export function computeSlaState(
//     stage: string,
//     stageChangedAt: Date,
//     now: Date = new Date()
//   ): 'ok' | 'risk' | 'breach' {
//     const days = Math.floor(
//       (now.getTime() - stageChangedAt.getTime()) / (1000 * 60 * 60 * 24)
//     )
  
//     const thresholds: Record<string, { risk: number; breach: number }> = {
//       'New':         { risk: 1,  breach: 2  },
//       'Allocated':   { risk: 3,  breach: 5  },
//       'Qualifying':  { risk: 7,  breach: 14 },
//       'Discovery':   { risk: 14, breach: 21 },
//       'Proposal':    { risk: 7,  breach: 14 },
//       'Negotiation': { risk: 14, breach: 30 },
//     }
  
//     const t = thresholds[stage]
//     if (!t) return 'ok'
//     if (days >= t.breach) return 'breach'
//     if (days >= t.risk)   return 'risk'
//     return 'ok'
//   }
  
//   export function daysInStage(stageChangedAt: Date, now: Date = new Date()): number {
//     return Math.floor(
//       (now.getTime() - stageChangedAt.getTime()) / (1000 * 60 * 60 * 24)
//     )
//   }
  
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
  
//   export function defaultDivision(vertical: string): string {
//     const map: Record<string, string> = {
//       'Industry':       'GREENEDGE',
//       'Marine':         'MARINE',
//       'Vehicles':       'GREENX',
//       'Small DG':       'GREENX',
//       'Cross-vertical': 'GREENEDGE',
//     }
//     return map[vertical] ?? 'GREENEDGE'
//   }
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

export const ACTIVE_STAGES = [
  'New', 'Allocated', 'Qualifying', 'Discovery', 'Proposal', 'Negotiation',
]

/**
 * Movement rules (mirrored on the frontend in web/src/lib/pipeline.ts):
 * - Between any two ACTIVE stages: allowed in BOTH directions, so mistakes
 *   can be corrected by dragging a card back.
 * - Any active stage -> Closed Lost: allowed.
 * - Negotiation -> Closed Won: allowed (the /close endpoint enforces its own
 *   Negotiation-only rule and captures outcome/reason).
 * - Out of a terminal stage: not allowed.
 */
export function canTransition(from: string, to: string): boolean {
  if (from === to) return false
  if (ACTIVE_STAGES.includes(from) && ACTIVE_STAGES.includes(to)) return true
  if (ACTIVE_STAGES.includes(from) && to === 'Closed Lost') return true
  if (from === 'Negotiation' && to === 'Closed Won') return true
  return false
}

export function defaultDivision(vertical: string): string {
  const map: Record<string, string> = {
    'Industry':       'GREENEDGE',
    'Marine':         'MARINE',
    'Vehicles':       'GREENX',
    'Small DG':       'GREENX',
    'Mining':         'GREENEDGE',
    'Cross-vertical': 'GREENEDGE',
  }
  return map[vertical] ?? 'GREENEDGE'
}

/**
 * The Outreach desk and the leads side grew separate vertical vocabularies:
 *   outreach: DG | Mining | Marine | Vehicles | Small DG
 *   leads:    Industry | Mining | Marine | Vehicles | Small DG | Cross-vertical
 *
 * DG and Industry are the same thing under two names. Mining existed only on
 * the outreach side until it was added here, which is why promoted mining
 * contacts had nowhere to land.
 *
 * Returns undefined for an unrecognised or empty value rather than guessing —
 * an untagged lead is visible to directors and can be classified by hand,
 * whereas a wrongly-tagged one silently lands in someone else's pipeline.
 */
export function outreachVerticalToLead(outreachVertical: string | null | undefined): string | undefined {
  const map: Record<string, string> = {
    'dg':       'Industry',
    'industry': 'Industry',
    'mining':   'Mining',
    'marine':   'Marine',
    'vehicles': 'Vehicles',
    'small dg': 'Small DG',
  }
  return map[(outreachVertical ?? '').trim().toLowerCase()]
}
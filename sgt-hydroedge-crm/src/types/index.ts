// export type LeadType = 'Prospect' | 'KOL' | 'Partner Prospect' | 'Distributor Prospect' | 'Strategic Contact'

// export type Vertical = 'Industry' | 'Marine' | 'Vehicles' | 'Small DG' | 'Cross-vertical'
// export type CommercialModel = 'DaaS' | 'OEM' | 'CapEx' | 'Consulting'
// export type LeadOrigin = 'Inbound' | 'Outbound' | 'Partner-originated'
// export type LeadStage = 'New' | 'Allocated' | 'Qualifying' | 'Discovery' | 'Proposal' | 'Negotiation'
// export type SlaState = 'ok' | 'risk' | 'breach'
// export type ActivityType = 'meeting' | 'call' | 'email' | 'whatsapp' | 'document' | 'system'
// export type ActivityOutcome = 'positive' | 'neutral' | 'concern'

// export interface Contact {
//   name: string
//   role: string
//   email?: string | null
//   phone?: string | null
// }

// export interface Protection {
//   startedAt: string
//   expiresAt: string
//   daysLeft: number
// }

// export interface Activity {
//   type: ActivityType
//   who: string
//   when: string
//   summary: string
//   channel: string
//   outcome?: ActivityOutcome
//   nextStep?: {
//     description: string
//     due: string
//   }
// }

// export interface Lead {
//   id: string
//   displayId?: string
//   company: string
//   stage: string
//   leadType?: LeadType
//   vertical?: Vertical
//   model?: CommercialModel
//   origin?: string
//   owner: string | null
//   value: number
//   estClose: string
//   contact: Contact | null
//   location: string
//   reservedAccount: boolean
//   slaState: SlaState
//   daysInStage: number
//   protection?: Protection
//   referredBy?: string
//   closeOutcome?: 'WON' | 'LOST' | null
//   closeReason?: string | null
//   competitorName?: string | null
//   closedAt?: string | null
//   initialNotes?: string | null
//   captureSource?: string | null
//   onHold?: boolean
//   createdAt: string
//   updatedAt?: string
// }
export type LeadType = 'Prospect' | 'KOL' | 'Partner Prospect' | 'Distributor Prospect' | 'Strategic Contact'

export type Vertical = 'Industry' | 'Marine' | 'Vehicles' | 'Small DG' | 'Cross-vertical'
export type CommercialModel = 'DaaS' | 'OEM' | 'CapEx' | 'Consulting'
export type LeadOrigin = 'Inbound' | 'Outbound' | 'Partner-originated'
export type LeadStage = 'New' | 'Allocated' | 'Qualifying' | 'Discovery' | 'Proposal' | 'Negotiation'
export type SlaState = 'ok' | 'risk' | 'breach'
export type ActivityType = 'meeting' | 'call' | 'email' | 'whatsapp' | 'document' | 'system'
export type ActivityOutcome = 'positive' | 'neutral' | 'concern'

// (c) Prospect tier is the human's gut call; it renders as the star rating on the card.
export type ProspectTier = 'high' | 'medium' | 'low'

// (b) Momentum is derived from time since last logged activity. Logging any
// activity resets it to 'fresh'. Tiers are computed in the backend (single
// source of truth); the frontend only maps the key → label + colour.
export type Momentum = 'fresh' | 'active' | 'cooling' | 'stale' | 'dead'

export interface Contact {
  name: string
  role: string
  email?: string | null
  phone?: string | null
}

export interface Protection {
  startedAt: string
  expiresAt: string
  daysLeft: number
}

export interface Activity {
  type: ActivityType
  who: string
  when: string
  summary: string
  channel: string
  outcome?: ActivityOutcome
  nextStep?: {
    description: string
    due: string
  }
}

export interface Lead {
  id: string
  displayId?: string
  company: string
  stage: string
  leadType?: LeadType
  vertical?: Vertical
  model?: CommercialModel
  origin?: string
  owner: string | null
  value: number
  estClose: string
  contact: Contact | null
  location: string
  reservedAccount: boolean
  slaState: SlaState
  daysInStage: number
  protection?: Protection
  referredBy?: string
  closeOutcome?: 'WON' | 'LOST' | null
  closeReason?: string | null
  competitorName?: string | null
  closedAt?: string | null
  initialNotes?: string | null
  captureSource?: string | null
  onHold?: boolean

  // ── (c) Prospect rating ──────────────────────────────────────────────
  prospectTier?: ProspectTier | null   // human judgment → stars
  aiScore?: number | null              // reserved: sales-intelligence score 0..100
  aiScoreAt?: string | null            // reserved: when the AI last scored

  // ── (b) Momentum / freshness ─────────────────────────────────────────
  momentum?: Momentum
  lastActivityAt?: string | null
  daysSinceActivity?: number | null

  createdAt: string
  updatedAt?: string
}
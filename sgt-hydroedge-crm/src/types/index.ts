export type LeadType = 'Prospect' | 'KOL' | 'Partner Prospect' | 'Distributor Prospect' | 'Strategic Contact'

export type Vertical = 'Industry' | 'Marine' | 'Vehicles' | 'Small DG' | 'Cross-vertical'
export type CommercialModel = 'DaaS' | 'OEM' | 'CapEx' | 'Consulting'
export type LeadOrigin = 'Inbound' | 'Outbound' | 'Partner-originated'
export type LeadStage = 'New' | 'Allocated' | 'Qualifying' | 'Discovery' | 'Proposal' | 'Negotiation'
export type SlaState = 'ok' | 'risk' | 'breach'
export type ActivityType = 'meeting' | 'call' | 'email' | 'whatsapp' | 'document' | 'system'
export type ActivityOutcome = 'positive' | 'neutral' | 'concern'

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
  createdAt: string
  updatedAt?: string
}
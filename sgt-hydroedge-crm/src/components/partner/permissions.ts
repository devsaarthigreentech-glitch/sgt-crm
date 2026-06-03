// Which tabs each archetype sees. Derived from the Partner record so one
// codebase serves both the full and lite (Channel) portals.
export type TabKey =
  | 'leads' | 'register' | 'customers' | 'scorecard'
  | 'statements' | 'documents' | 'training' | 'tickets'

export const TAB_LABELS: Record<TabKey, string> = {
  leads: 'My Leads',
  register: 'Register Lead',
  customers: 'My Customers',
  scorecard: 'My Scorecard',
  statements: 'Statements',
  documents: 'Document Hub',
  training: 'Training',
  tickets: 'Service Tickets',
}

const FULL: TabKey[] = ['leads', 'register', 'customers', 'scorecard', 'statements', 'documents', 'training']
const LITE: TabKey[] = ['leads', 'register', 'statements', 'documents', 'training', 'tickets']

export function tabsForPartner(p: { portal: 'full' | 'lite' }): TabKey[] {
  return p.portal === 'full' ? FULL : LITE
}

export const ARCHETYPE_LABELS: Record<string, string> = {
  oem_t1: 'OEM Tier 1 · Authorised Reseller',
  oem_t2: 'OEM Tier 2 · White-Label',
  oem_t3: 'OEM Tier 3 · Manufacturing Licensee',
  daas_l1: 'DaaS L1 · Origination',
  daas_l2: 'DaaS L2 · Managed Services',
  channel: 'Channel / Referral Partner',
}
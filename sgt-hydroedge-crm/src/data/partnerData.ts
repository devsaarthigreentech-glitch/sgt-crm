import type { Lead } from '../types'

export const PARTNER = {
  id: 'p1',
  name: 'Suzlon Energy Services',
  archetype: 'DaaS L1',
  tier: 'Active',
  initials: 'SE',
  division: 'GreenEdge',
}

export const PARTNER_LEADS: Lead[] = [
  {
    id: 'L-1067',
    company: 'Cochin Shipyard Ltd',
    stage: 'Proposal',
    vertical: 'Marine',
    model: 'DaaS',
    origin: 'Partner-originated',
    owner: 'Priya Sharma',
    value: 18_75_000,
    estClose: '2026-07-30',
    contact: { name: 'Capt. Suresh Nair', role: 'Director Operations', email: 's.nair@cochinshipyard.in' },
    location: 'Kochi, Kerala',
    reservedAccount: false,
    slaState: 'ok',
    daysInStage: 4,
    protection: { startedAt: '2026-03-22', expiresAt: '2026-06-20', daysLeft: 35 },
    createdAt: '2026-03-22',
  },
  {
    id: 'L-2014',
    company: 'Goa Shipyard Limited',
    stage: 'Qualifying',
    vertical: 'Marine',
    model: 'DaaS',
    origin: 'Partner-originated',
    owner: 'Priya Sharma',
    value: 14_00_000,
    estClose: '2026-07-26',
    contact: { name: 'Cmde. A. Fernandes', role: 'GM Projects', email: 'a.fernandes@goashipyard.in' },
    location: 'Vasco da Gama, Goa',
    reservedAccount: false,
    slaState: 'ok',
    daysInStage: 6,
    protection: { startedAt: '2026-03-16', expiresAt: '2026-07-26', daysLeft: 71 },
    createdAt: '2026-03-16',
  },
  {
    id: 'L-2031',
    company: 'Garden Reach Shipbuilders',
    stage: 'Discovery',
    vertical: 'Marine',
    model: 'DaaS',
    origin: 'Partner-originated',
    owner: 'Priya Sharma',
    value: 22_50_000,
    estClose: '2026-08-20',
    contact: { name: 'Rear Adm. S. Roy (Retd.)', role: 'Director Technical', email: 's.roy@grse.in' },
    location: 'Kolkata, West Bengal',
    reservedAccount: false,
    slaState: 'ok',
    daysInStage: 8,
    protection: { startedAt: '2026-03-26', expiresAt: '2026-07-13', daysLeft: 58 },
    createdAt: '2026-03-26',
  },
]

// Accounts that will trigger conflict states in the live check
export const CONFLICT_ACCOUNTS = ['cochin', 'mahindra', 'ashok leyland', 'greaves']
export const RESERVED_ACCOUNTS = ['reliance', 'tata', 'adani', 'jsw', 'bharat forge']
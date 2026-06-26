// lib/vaultApi.ts — Customer Knowledge Vault client.
// Uses authFetch (Bearer token) exactly like the other guarded calls.
import { authFetch } from './auth'

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1'

async function get<T>(path: string): Promise<T> {
  const r = await authFetch(`${BASE}${path}`)
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
  return body.data as T
}

// ---- Shared types (mirror services/vault.ts) --------------------------------
export interface CustomerListItem {
  id: string
  name: string
  industry: string | null
  customerStatus: string
  location: string | null
  pocCount: number
  docCount: number
  lastActivityAt: string | null
}

export interface Workspace {
  account: {
    id: string; name: string; industry: string | null; customerStatus: string
    location: string | null; website: string | null; erpnextId: string | null; gstin: string | null
  }
  stats: {
    pocs: number; activePocs: number; documents: number; openIssues: number
    contacts: number; sites: number; lastActivityAt: string | null
  }
  sites: Site[]
  contacts: Contact[]
  team: TeamMember[]
  pocs: Poc[]
  documents: DocItem[]
  timeline: TimelineEvent[]
}

export interface Site {
  id: string; name: string; siteType: string | null; address: string | null
  city: string | null; state: string | null; country: string | null
  status: string | null; latitude: number | null; longitude: number | null
}
export interface Contact {
  id: string; name: string; designation: string | null; department: string | null
  email: string | null; phone: string | null; roleInProject: string | null
  status: string; periodFrom: string | null; periodTo: string | null; notes: string | null
}
export interface TeamMember {
  id: string; memberName: string; teamRole: string; active: boolean
  periodFrom: string | null; periodTo: string | null; notes: string | null
}
export interface Poc {
  id: string; displayId: string; product: string; application: string | null
  equipmentMake: string | null; equipmentModel: string | null
  ratingValue: number | null; ratingUnit: string | null; fuelType: string | null
  status: string; savingsPct: number | null
  startDate: string | null; endDate: string | null
  finalResult: string | null; recommendedNextStep: string | null
}
export interface DocItem {
  id: string; displayId: string; category: string; title: string
  confidentiality: string; currentVersion: number
  uploadedByName: string | null; createdAt: string
  fileName: string | null; sizeBytes: number | null
}
export interface TimelineEvent {
  id: string; eventType: string; title: string; body: string | null
  occurredAt: string; source: string | null; actorName: string | null
}

// by-erp returns either a workspace (linked) or null (no vault account yet)
export interface ByErpResult { data: Workspace | null; linked: boolean }
async function getRaw<T>(path: string): Promise<T> {
  const r = await authFetch(`${BASE}${path}`)
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
  return body as T
}

export const vaultApi = {
  getCustomers: () => get<CustomerListItem[]>('/vault/customers'),
  getWorkspace: (id: string) => get<Workspace>(`/vault/customers/${id}/workspace`),
  getWorkspaceByErp: (erpId: string, name?: string) =>
    getRaw<ByErpResult>(`/vault/by-erp/workspace?erpId=${encodeURIComponent(erpId)}${name ? `&name=${encodeURIComponent(name)}` : ''}`),
}
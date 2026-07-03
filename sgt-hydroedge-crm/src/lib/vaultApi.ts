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
// Thin POC shape carried inside the Workspace payload (from getCustomerWorkspace).
// The POCs tab hydrates to the fuller VaultPoc below via listPocs().
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

// ---- POC full record (mirrors services/vault.ts VaultPoc) -------------------
// Superset of Poc — every Poc field is present, so a VaultPoc is assignable
// wherever a Poc is expected (e.g. <PocCard p={...} />).
export interface VaultPoc {
  id: string; displayId: string; accountId: string
  siteId: string | null; leadId: string | null
  product: string; application: string | null
  equipmentMake: string | null; equipmentModel: string | null
  ratingValue: number | null; ratingUnit: string | null; fuelType: string | null
  spec: Record<string, unknown>
  baselineFrom: string | null; baselineTo: string | null
  trialFrom: string | null; trialTo: string | null
  startDate: string | null; endDate: string | null
  status: string; savingsPct: number | null
  finalResult: string | null; recommendedNextStep: string | null
  sgtComments: string | null; customerComments: string | null
  ownerId: string | null; ownerName: string | null
  createdByName: string | null; createdAt: string; updatedAt: string
}
export interface CreatePocInput {
  accountId: string; product: string
  siteId?: string | null; leadId?: string | null
  application?: string | null; equipmentMake?: string | null; equipmentModel?: string | null
  ratingValue?: number | null; ratingUnit?: string | null; fuelType?: string | null
  spec?: Record<string, unknown>
  baselineFrom?: string | null; baselineTo?: string | null
  trialFrom?: string | null; trialTo?: string | null
  startDate?: string | null; endDate?: string | null
  status?: string; savingsPct?: number | null
  finalResult?: string | null; recommendedNextStep?: string | null
  sgtComments?: string | null; customerComments?: string | null
  ownerId?: string | null; ownerName?: string | null
}

// by-erp returns either a workspace (linked) or null (no vault account yet)
export interface ByErpResult { data: Workspace | null; linked: boolean }
async function getRaw<T>(path: string): Promise<T> {
  const r = await authFetch(`${BASE}${path}`)
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
  return body as T
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  const r = await authFetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
  return body.data as T
}

async function del<T>(path: string): Promise<T> {
  const r = await authFetch(`${BASE}${path}`, { method: 'DELETE' })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
  return body.data as T
}

// ---- Document write/upload types --------------------------------------------
export interface VaultDoc {
  id: string; displayId: string; category: string; title: string
  description: string | null; confidentiality: string; tags: string[]
  currentVersion: number; fileName: string | null; mimeType: string | null
  sizeBytes: number | null; uploadedByName: string | null; createdAt: string; ready: boolean
}
export interface UploadTarget {
  uploadUrl: string; method: 'PUT'; headers: Record<string, string>; bucket: string; key: string
}
export interface InitiateResult { documentId: string; displayId: string; versionId: string; upload: UploadTarget }
export interface DocMeta { categories: string[]; confidentiality: string[] }

export interface InitiateInput {
  accountId: string; category: string; title: string; description?: string
  confidentiality?: string; tags?: string[]
  fileName: string; mimeType: string; sizeBytes?: number
}
// For the uploadDocument helper — fileName/mimeType/sizeBytes come from the File.
export type UploadDocInput = Omit<InitiateInput, 'fileName' | 'mimeType' | 'sizeBytes'>

export const vaultApi = {
  getCustomers: () => get<CustomerListItem[]>('/vault/customers'),
  getWorkspace: (id: string) => get<Workspace>(`/vault/customers/${id}/workspace`),
  getWorkspaceByErp: (erpId: string, name?: string) =>
    getRaw<ByErpResult>(`/vault/by-erp/workspace?erpId=${encodeURIComponent(erpId)}${name ? `&name=${encodeURIComponent(name)}` : ''}`),
  createVaultFromErp: (erpId: string, name?: string) =>
    post<Workspace>('/vault/by-erp/create', { erpId, name }),

  // ---- POCs ----
  listPocs: (accountId: string) => get<VaultPoc[]>(`/vault/accounts/${accountId}/pocs`),
  getPoc: (id: string) => get<VaultPoc>(`/vault/pocs/${id}`),
  createPoc: (input: CreatePocInput) => post<VaultPoc>('/vault/pocs', input),

  // ---- documents ----
  getDocMeta: () => get<DocMeta>('/vault/documents/meta'),
  listDocuments: (accountId: string) => get<VaultDoc[]>(`/vault/accounts/${accountId}/documents`),
  initiateUpload: (input: InitiateInput) => post<InitiateResult>('/vault/documents/initiate', input),
  completeUpload: (id: string, body: { sizeBytes?: number; checksum?: string }) =>
    post<{ ok: true }>(`/vault/documents/${id}/complete`, body),
  getDownloadUrl: (id: string) => get<{ url: string; fileName: string }>(`/vault/documents/${id}/download`),

  async fetchDocBlob(id: string, opts: { inline?: boolean; mimeType?: string | null } = {}): Promise<{ blob: Blob; fileName: string }> {
    const meta = await this.getDownloadUrl(id)
    let url = meta.url
    if (opts.inline && !/^https?:\/\//i.test(url)) {
      url += (url.includes('?') ? '&' : '?') + 'disposition=inline'
    }
    const isAbsolute = /^https?:\/\//i.test(url)
    const res = isAbsolute
      ? await fetch(url)
      : await authFetch(url)
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
    let blob = await res.blob()
    if ((!blob.type || blob.type === 'application/octet-stream') && opts.mimeType) {
      blob = new Blob([await blob.arrayBuffer()], { type: opts.mimeType })
    }
    return { blob, fileName: meta.fileName }
  },
  deleteDocument: (id: string) => del<{ ok: true }>(`/vault/documents/${id}`),

  async uploadDocument(input: UploadDocInput, file: File): Promise<string> {
    const init = await this.initiateUpload({
      ...input,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    })
    const { uploadUrl, headers } = init.upload
    const isAbsolute = /^https?:\/\//i.test(uploadUrl)
    const put = isAbsolute
      ? await fetch(uploadUrl, { method: 'PUT', headers, body: file })
      : await authFetch(uploadUrl, { method: 'PUT', headers, body: file })
    if (!put.ok) throw new Error(`Upload failed: HTTP ${put.status}`)
    await this.completeUpload(init.documentId, { sizeBytes: file.size })
    return init.documentId
  },
}
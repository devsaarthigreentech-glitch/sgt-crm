// Distributor portal API client. Talks only to /portal — the single prefix
// an external role can reach (see server src/auth/policy.ts).

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3004/api/v1'

function getToken(): string | null {
  try {
    return (
      localStorage.getItem('token') ||
      localStorage.getItem('sgt_token') ||
      localStorage.getItem('authToken') ||
      localStorage.getItem('jwt') ||
      sessionStorage.getItem('token') ||
      null
    )
  } catch {
    return null
  }
}

/** Thrown on 422 so the form can mark individual fields. */
export class ValidationError extends Error {
  fields: Record<string, string>
  constructor(message: string, fields: Record<string, string>) {
    super(message)
    this.name = 'ValidationError'
    this.fields = fields
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  // Only send a JSON content-type when there is a body — Fastify rejects
  // an empty body with that header as 400 FST_ERR_CTP_EMPTY_JSON_BODY.
  const hasBody = options?.body !== undefined && options?.body !== null
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any))
    const msg = body?.error?.message ?? `HTTP ${res.status}`
    if (res.status === 422 && body?.fields) throw new ValidationError(msg, body.fields)
    throw new Error(msg)
  }
  return res.json()
}

export interface PortalMe {
  user: { id: string; name?: string; email?: string }
  org: {
    code: string
    legal_name: string
    trade_name: string | null
    org_type: string
    dealer_type: string | null
    territory: string | null
    gstin: string | null
    created_at: string
  }
  counts: { dealers: string; sub_dealers: string }
}

export interface PortalDealer {
  id: number
  code: string
  legal_name: string
  trade_name: string | null
  org_type: 'dealer' | 'sub_dealer'
  dealer_type: 'SS' | 'SM' | null
  territory: string | null
  gstin: string | null
  is_active: boolean
  parent_code: string | null
}

export interface PortalReference {
  states: { code: string; name: string }[]
  constitutions: string[]
  productLines: string[]
  industries: string[]
  dealerTypes: { value: string; label: string }[]
  parent: { code: string; legal_name: string }
}

export interface PortalRegistration {
  id: number
  legal_name: string
  trade_name: string | null
  dealer_type: 'SS' | 'SM' | null
  status: string
  gstin: string | null
  city: string | null
  state: string | null
  allotted_code: string | null
  rejection_reason: string | null
  [key: string]: any
}

export const portalApi = {
  me: () => request<{ data: PortalMe }>('/portal/me').then(r => r.data),
  dealers: () => request<{ data: PortalDealer[] }>('/portal/dealers').then(r => r.data),
  reference: () => request<{ data: PortalReference }>('/portal/reference').then(r => r.data),

  registrations: () =>
    request<{ data: PortalRegistration[] }>('/portal/registrations').then(r => r.data),
  registration: (id: number) =>
    request<{ data: PortalRegistration }>(`/portal/registrations/${id}`).then(r => r.data),
  createRegistration: (legal_name: string) =>
    request<{ data: PortalRegistration }>('/portal/registrations', {
      method: 'POST', body: JSON.stringify({ legal_name }),
    }).then(r => r.data),
  saveRegistration: (id: number, patch: Record<string, unknown>) =>
    request<{ data: PortalRegistration }>(`/portal/registrations/${id}`, {
      method: 'PATCH', body: JSON.stringify(patch),
    }).then(r => r.data),
  submitRegistration: (id: number) =>
    request<{ data: PortalRegistration }>(`/portal/registrations/${id}/submit`, {
      method: 'POST',
    }).then(r => r.data),
  inspectGstin: (gstin: string) =>
    request<{ data: any }>('/portal/gstin/inspect', {
      method: 'POST', body: JSON.stringify({ gstin }),
    }).then(r => r.data),
}

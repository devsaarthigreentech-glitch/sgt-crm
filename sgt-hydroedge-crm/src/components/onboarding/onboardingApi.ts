// Partner onboarding API client.
// Mirrors lib/api.ts: same BASE_URL convention, same bearer-token handling,
// same { data } / { error } envelope.

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

/** Thrown on 422 so the form can mark individual fields rather than one banner. */
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
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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

export interface Reference {
  constitutions: string[]
  productLines: string[]
  dealerTypes: { value: string; label: string; canSell: boolean; canService: boolean }[]
  docTypes: { value: string; label: string }[]
  states: { code: string; name: string }[]
  distributors: { id: number; code: string; legal_name: string }[]
}

export interface Registration {
  id: number
  partner_type: 'distributor' | 'dealer'
  dealer_type: 'SS' | 'SM' | null
  parent_org_id: number | null
  status: string
  legal_name: string
  [key: string]: any
}

export interface GstinInspection {
  valid: boolean
  message?: string
  stateCode?: string
  stateName?: string | null
  pan?: string
  entityType?: string
  constitutionHint?: string | null
}

export const onboardingApi = {
  /** Offline structure + checksum check. No external API, nothing metered. */
  inspectGstin: (gstin: string) =>
    request<{ data: GstinInspection }>('/partners/gstin/inspect', {
      method: 'POST',
      body: JSON.stringify({ gstin }),
    }).then(r => r.data),

  reference: () =>
    request<{ data: Reference }>('/partners/reference').then(r => r.data),

  list: (status?: string) =>
    request<{ data: Registration[] }>(
      `/partners/registrations${status ? `?status=${encodeURIComponent(status)}` : ''}`,
    ).then(r => r.data),

  get: (id: number) =>
    request<{ data: Registration }>(`/partners/registrations/${id}`).then(r => r.data),

  create: (body: { legal_name: string; partner_type: string }) =>
    request<{ data: Registration }>('/partners/registrations', {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(r => r.data),

  /** Draft save — server runs no validation on this path. */
  save: (id: number, patch: Record<string, unknown>) =>
    request<{ data: Registration }>(`/partners/registrations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }).then(r => r.data),

  /** Throws ValidationError with a field map on 422. */
  submit: (id: number) =>
    request<{ data: Registration }>(`/partners/registrations/${id}/submit`, {
      method: 'POST',
    }).then(r => r.data),
}

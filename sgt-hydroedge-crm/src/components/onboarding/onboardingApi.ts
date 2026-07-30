// Partner onboarding API client.
// Mirrors lib/api.ts: same BASE_URL convention, same bearer-token handling,
// same { data } / { error } envelope.

export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3004/api/v1'

export function getToken(): string | null {
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
  // Only declare a JSON content-type when there IS a body. Fastify rejects
  // `Content-Type: application/json` with an empty body as 400
  // FST_ERR_CTP_EMPTY_JSON_BODY, which broke submit and delete-contact —
  // both send no body.
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

/** A partner who actually exists — a row in quote_service.org, not an application. */
export interface PartnerOrg {
  id: number
  code: string
  legal_name: string
  trade_name: string | null
  org_type: 'distributor' | 'dealer' | 'sub_dealer'
  dealer_type: 'SS' | 'SM' | null
  territory: string | null
  gstin: string | null
  is_active: boolean
  parent_code: string | null
  parent_name: string | null
}

export interface RegContact {
  id: number
  name: string
  designation: string | null
  mobile: string | null
  email: string | null
  notes: string | null
}

export interface OrgDetail extends PartnerOrg {
  status: 'active' | 'suspended' | 'terminated'
  address_line1: string | null; city: string | null; state: string | null; pincode: string | null
  contact_name: string | null; contact_designation: string | null
  contact_mobile: string | null; contact_email: string | null
  pan: string | null; bank_name: string | null; bank_ifsc: string | null
  bank_account_name: string | null; bank_account_number: string | null; bank_branch: string | null
  notes: string | null
  parent_name: string | null
  events: { event_type: string; actor_name: string | null; changes: any; note: string | null; created_at: string }[]
  codes: { code: string; allotted_at: string; retired_at: string | null; retired_reason: string | null }[]
}

export const onboardingApi = {
  addContact: (id: number, body: Partial<RegContact> & { name: string }) =>
    request<{ data: RegContact }>(`/partners/registrations/${id}/contacts`, {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(r => r.data),

  deleteContact: (id: number, contactId: number) =>
    request<{ data: unknown }>(`/partners/registrations/${id}/contacts/${contactId}`, {
      method: 'DELETE',
    }),

  /** The live partner network. Distinct from registrations. */
  orgs: () => request<{ data: PartnerOrg[] }>('/partners/orgs').then(r => r.data),

  org: (id: number) => request<{ data: OrgDetail }>(`/partners/orgs/${id}`).then(r => r.data),

  /** Throws ValidationError on 422; Error on 409 if the GSTIN is taken. */
  saveOrg: (id: number, patch: Record<string, unknown>) =>
    request<{ data: OrgDetail; changed?: string[] }>(`/partners/orgs/${id}`, {
      method: 'PATCH', body: JSON.stringify(patch),
    }),

  setOrgStatus: (id: number, status: string, reason?: string) =>
    request<{ data: OrgDetail }>(`/partners/orgs/${id}/status`, {
      method: 'POST', body: JSON.stringify({ status, reason }),
    }),

  /** Mints a NEW code and retires the old one. Not an edit. */
  changeDealerType: (id: number, dealer_type: 'SS' | 'SM', reason?: string) =>
    request<{ data: { old_code: string; code: string; dealer_type: string } }>(
      `/partners/orgs/${id}/dealer-type`,
      { method: 'POST', body: JSON.stringify({ dealer_type, reason }) },
    ),

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

  /**
   * Approve. Without `attachOrgId` this mints a new code and creates the org.
   * With it, the registration is linked to an org that already exists and
   * NO code is minted — for grandfathered partners like EDINGX001.
   * Throws on 409 when the GSTIN already belongs to someone.
   */
  /**
   * Draft/rejected/withdrawn are deleted outright; submitted becomes
   * withdrawn; approved is refused — see the route for why.
   */
  removeRegistration: (id: number) =>
    request<{ data: any; withdrawn?: boolean }>(`/partners/registrations/${id}`, {
      method: 'DELETE',
    }),

  approve: (id: number, attachOrgId?: number) =>
    request<{ data: Registration; org?: any; code?: string; attached?: any }>(
      `/partners/registrations/${id}/approve`,
      attachOrgId
        ? { method: 'POST', body: JSON.stringify({ attach_org_id: attachOrgId }) }
        : { method: 'POST' },
    ),

  reject: (id: number, reason: string) =>
    request<{ data: Registration }>(`/partners/registrations/${id}/reject`, {
      method: 'POST', body: JSON.stringify({ reason }),
    }),

  /** Throws ValidationError with a field map on 422. */
  submit: (id: number) =>
    request<{ data: Registration }>(`/partners/registrations/${id}/submit`, {
      method: 'POST',
    }).then(r => r.data),
}

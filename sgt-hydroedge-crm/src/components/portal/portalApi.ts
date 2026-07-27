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

async function request<T>(path: string): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any))
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
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

export const portalApi = {
  me: () => request<{ data: PortalMe }>('/portal/me').then(r => r.data),
  dealers: () => request<{ data: PortalDealer[] }>('/portal/dealers').then(r => r.data),
}

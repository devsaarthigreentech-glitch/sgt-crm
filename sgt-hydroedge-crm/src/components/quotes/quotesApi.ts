// Quotation API for SGT staff. The portal has its own adapter pointing at
// /portal/quotes — same shape, so QuoteScreen serves both.

import type { QuoteApi, Resolution } from './QuoteScreen'

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
  } catch { return null }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
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
    throw new Error(body?.error?.message ?? body?.message ?? `HTTP ${res.status}`)
  }
  return res.json()
}

/** Builds an adapter for a given prefix — /quotes for staff, /portal/quotes for partners. */
export function makeQuoteApi(prefix: string, withPartners: boolean): QuoteApi {
  return {
    resolve: (kva: string) =>
      request<{ data: Resolution }>(`${prefix}/resolve`, {
        method: 'POST', body: JSON.stringify({ kva }),
      }).then(r => r.data),

    create: (body) =>
      request<any>(`${prefix}`, { method: 'POST', body: JSON.stringify(body) }),

    list: () => request<{ data: any[] }>(`${prefix}`).then(r => r.data),

    termsList: () =>
      request<{ data: { templates: string[]; default: string } }>(`${prefix}/terms`)
        .then(r => r.data),

    termsBody: (name: string) =>
      request<{ data: { name: string; terms: string } }>(
        `${prefix}/terms/${encodeURIComponent(name)}`).then(r => r.data.terms),

    ...(withPartners
      ? {
          partners: () =>
            request<{ data: any[] }>('/partners/orgs').then(r =>
              r.data.map(o => ({ id: o.id, code: o.code, legal_name: o.legal_name }))),
        }
      : {}),
  }
}

export const staffQuoteApi = makeQuoteApi('/quotes', true)
export const portalQuoteApi = makeQuoteApi('/portal/quotes', false)

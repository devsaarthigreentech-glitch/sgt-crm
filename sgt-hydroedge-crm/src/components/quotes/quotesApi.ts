// Quotation API for SGT staff. The portal has its own adapter pointing at
// /portal/quotes — same shape, so QuoteScreen serves both.

import type {
  QuoteApi, Resolution, SpecField, QuoteAttachment, RecipientPlan,
} from './QuoteScreen'

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

    loadForEdit: (erpName: string) =>
      request<{ data: any }>(`${prefix}/${encodeURIComponent(erpName)}/edit`)
        .then(r => r.data),

    update: (erpName: string, body: any) =>
      request<any>(`${prefix}/${encodeURIComponent(erpName)}`, {
        method: 'PUT', body: JSON.stringify(body),
      }),

    recipients: (erpName: string) =>
      request<{ data: RecipientPlan }>(
        `${prefix}/${encodeURIComponent(erpName)}/recipients`).then(r => r.data),

    send: (erpName: string, body: {
      to?: string; subject?: string; message?: string
      messageFormat?: 'text' | 'html'
      attachments?: string[]
    }) =>
      request<{ data: { provider: string; to: string[]; cc: string[]; loggedToErp: boolean; note?: string; attached?: string[] } }>(
        `${prefix}/${encodeURIComponent(erpName)}/send`,
        { method: 'POST', body: JSON.stringify(body) }).then(r => r.data),

    limits: () =>
      request<{ data: { discountCaps: Record<string, number>; maxDiscount?: number; amcPct: number; attachMaxMb?: number } }>(
        `${prefix}/limits`).then(r => r.data),

    /** The optional product-spec form, defined once on the server. */
    specFields: () =>
      request<{ data: SpecField[] }>(`${prefix}/spec-fields`).then(r => r.data),

    attachments: (erpName: string) =>
      request<{ data: QuoteAttachment[] }>(
        `${prefix}/${encodeURIComponent(erpName)}/attachments`).then(r => r.data),

    /**
     * Base64 rather than multipart: the server takes JSON on this route
     * and raises its own body limit to suit, so there is no upload
     * pipeline to maintain on either side for what is a handful of PDFs.
     */
    attach: (erpName: string, file: File) =>
      new Promise<QuoteAttachment>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
        reader.onload = () => {
          const url = String(reader.result ?? '')
          request<{ data: QuoteAttachment }>(
            `${prefix}/${encodeURIComponent(erpName)}/attachments`,
            {
              method: 'POST',
              body: JSON.stringify({
                filename: file.name,
                contentType: file.type || 'application/octet-stream',
                base64: url.slice(url.indexOf(',') + 1),
              }),
            }).then(r => resolve(r.data), reject)
        }
        reader.readAsDataURL(file)
      }),

    detach: (erpName: string, fileName: string) =>
      request<{ data: { removed: string } }>(
        `${prefix}/${encodeURIComponent(erpName)}/attachments/${encodeURIComponent(fileName)}`,
        { method: 'DELETE' }).then(r => r.data),

    termsList: () =>
      request<{ data: { templates: string[]; default: string } }>(`${prefix}/terms`)
        .then(r => r.data),

    searchCustomers: (q: string) =>
      request<{ data: any[] }>(`${prefix}/customers?q=${encodeURIComponent(q)}`).then(r => r.data),

    createCustomer: (body: Record<string, string>) =>
      request<{ data: { erpName: string; matchedOn: string } }>(`${prefix}/customers`, {
        method: 'POST', body: JSON.stringify(body),
      }).then(r => r.data),

    customerDetail: (erpName: string) =>
      request<{ data: any }>(`${prefix}/customers/${encodeURIComponent(erpName)}`)
        .then(r => r.data),

    updateCustomer: (erpName: string, body: Record<string, any>) =>
      request<{ data: { erpName: string; changed: string[]; note?: string } }>(
        `${prefix}/customers/${encodeURIComponent(erpName)}`, {
          method: 'PATCH', body: JSON.stringify(body),
        }).then(r => r.data),

    /** Fetched as a blob because the PDF route needs the bearer token. */
    pdfUrl: async (erpName: string) => {
      const token = getToken()
      const res = await fetch(`${BASE_URL}${prefix}/${encodeURIComponent(erpName)}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any))
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
      }
      return URL.createObjectURL(await res.blob())
    },

    /** The editable form — plain text, one clause per paragraph. */
    termsBody: (name: string) =>
      request<{ data: { name: string; terms: string; text?: string } }>(
        `${prefix}/terms/${encodeURIComponent(name)}`)
        .then(r => r.data.text ?? r.data.terms),

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

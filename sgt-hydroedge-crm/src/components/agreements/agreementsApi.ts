// Dealer agreement API. Two prefixes, one adapter — /agreements for SGT
// staff, /portal/agreements for a distributor. AgreementScreen serves both,
// because the document they produce is the same document.

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

export interface DealerOption {
  id: number
  code: string
  legal_name: string
  dealer_type: string | null
  territory: string | null
  distributor_code: string | null
  distributor_name: string | null
  agreements?: string | number
}

/** Mirrors AgreementFields on the server, which mirrors the ERPNext doctype. */
export interface AgreementFields {
  effective_date?: string | null
  distributor_name?: string | null
  distributor_code?: string | null
  distributor_associate?: string | null
  distributor_region?: string | null
  distributor_email?: string | null
  distributor_address?: string | null
  distributor_signatory?: string | null
  distributor_signatory_designation?: string | null
  distributor_sign_name?: string | null
  distributor_sign_designation?: string | null
  distributor_signature_url?: string | null
  dealer_name?: string | null
  dealer_code?: string | null
  dealer_type?: string | null
  dealer_constitution?: string | null
  dealer_gstin?: string | null
  dealer_operating_area?: string | null
  dealer_address?: string | null
  dealer_signatory?: string | null
  dealer_signatory_designation?: string | null
  dealer_email?: string | null
  dealer_mobile?: string | null
  sgt_signatory?: string | null
  sgt_signatory_designation?: string | null
  sgt_signature_url?: string | null
  agreement_body?: string | null
}

export interface Resolved {
  dealerOrgId: number
  distributorOrgId: number | null
  fields: AgreementFields
  recipients: string[]
  warnings: string[]
}

export interface Agreement {
  id: number
  erp_name: string
  dealer_org_id: number
  distributor_org_id: number | null
  effective_date: string | null
  status: 'draft' | 'generated' | 'sent' | 'signed' | 'cancelled'
  dealer_code: string | null
  dealer_name: string | null
  dealer_type: string | null
  distributor_code: string | null
  distributor_name: string | null
  sent_at: string | null
  sent_to: string[]
  signed_at: string | null
  signed_filename: string | null
  raised_by_name: string | null
  raised_via: string
  created_at: string
}

export interface Draft {
  to: string[]
  cc: string[]
  subject: string
  messageText: string
  provider: string
}

export interface AgreementEvent {
  event_type: string
  from_status: string | null
  to_status: string | null
  actor_name: string | null
  payload: Record<string, any>
  created_at: string
}

export interface AgreementApi {
  meta(): Promise<{ provider: string; doctype: string; signedMaxMb: number; surface: string }>
  dealers(all?: boolean): Promise<DealerOption[]>
  resolve(dealerOrgId: number): Promise<Resolved>
  create(dealerOrgId: number, overrides?: Partial<AgreementFields>): Promise<Agreement>
  list(): Promise<Agreement[]>
  history(id: number): Promise<AgreementEvent[]>
  draft(id: number): Promise<Draft>
  send(id: number, body: { to?: string[]; cc?: string[]; subject?: string; messageText?: string }):
    Promise<{ provider: string; to: string[]; cc: string[]; loggedToErp: boolean; note?: string }>
  pdfUrl(id: number): Promise<string>
  uploadSigned(id: number, file: File): Promise<{ key: string; size: number }>
  signedUrl(id: number): Promise<string>
  /** Only for agreements that were never sent. The server enforces it too. */
  remove(id: number): Promise<{ deleted: string }>
  cancel(id: number, reason: string): Promise<Agreement>
}

/**
 * Can this be deleted outright, or only cancelled?
 *
 * The same rule the server applies, duplicated here so the UI does not
 * offer a button that will 409. The server remains the authority — this
 * is about not asking, not about permission.
 */
export const canDelete = (a: Agreement): boolean =>
  !a.sent_at && !a.signed_at && a.status !== 'sent' && a.status !== 'signed'

/** Fetched as a blob, not linked: these routes need the bearer token. */
async function blobUrl(path: string): Promise<string> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any))
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
  }
  return URL.createObjectURL(await res.blob())
}

export function makeAgreementApi(prefix: string): AgreementApi {
  return {
    meta: () => request<{ data: any }>(`${prefix}/meta`).then(r => r.data),

    dealers: (all = false) =>
      request<{ data: DealerOption[] }>(`${prefix}/dealers${all ? '?all=1' : ''}`)
        .then(r => r.data),

    resolve: (dealerOrgId) =>
      request<{ data: Resolved }>(`${prefix}/resolve/${dealerOrgId}`).then(r => r.data),

    create: (dealerOrgId, overrides) =>
      request<{ data: Agreement }>(prefix, {
        method: 'POST',
        body: JSON.stringify({ dealerOrgId, overrides: overrides ?? {} }),
      }).then(r => r.data),

    list: () => request<{ data: Agreement[] }>(prefix).then(r => r.data),

    history: (id) =>
      request<{ data: AgreementEvent[] }>(`${prefix}/${id}/history`).then(r => r.data),

    draft: (id) => request<{ data: Draft }>(`${prefix}/${id}/draft`).then(r => r.data),

    send: (id, body) =>
      request<{ data: any }>(`${prefix}/${id}/send`, {
        method: 'POST', body: JSON.stringify(body),
      }).then(r => r.data),

    remove: (id) =>
      request<{ data: { deleted: string } }>(`${prefix}/${id}`, { method: 'DELETE' })
        .then(r => r.data),

    cancel: (id, reason) =>
      request<{ data: Agreement }>(`${prefix}/${id}/cancel`, {
        method: 'POST', body: JSON.stringify({ reason }),
      }).then(r => r.data),

    pdfUrl: (id) => blobUrl(`${prefix}/${id}/pdf`),

    signedUrl: (id) => blobUrl(`${prefix}/${id}/signed`),

    // Base64 rather than multipart: the server takes JSON on this route and
    // raises its own body limit to suit, matching the quotation attachment
    // path. One upload convention in the codebase, not two.
    uploadSigned: (id, file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
        reader.onload = () => {
          const url = String(reader.result ?? '')
          request<{ data: { key: string; size: number } }>(`${prefix}/${id}/signed`, {
            method: 'POST',
            body: JSON.stringify({
              filename: file.name,
              mime: file.type || 'application/pdf',
              base64: url.slice(url.indexOf(',') + 1),
            }),
          }).then(r => resolve(r.data), reject)
        }
        reader.readAsDataURL(file)
      }),
  }
}

export const staffAgreementApi = makeAgreementApi('/agreements')
export const portalAgreementApi = makeAgreementApi('/portal/agreements')

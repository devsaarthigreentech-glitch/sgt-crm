// // // // const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3004/api/v1'

// // // // async function request<T>(
// // // //   path: string,
// // // //   options?: RequestInit
// // // // ): Promise<T> {
// // // //   const res = await fetch(`${BASE_URL}${path}`, {
// // // //     headers: { 'Content-Type': 'application/json' },
// // // //     ...options,
// // // //   })

// // // //   if (!res.ok) {
// // // //     const body = await res.json().catch(() => ({}))
// // // //     const msg = typeof body.error === 'string'
// // // //       ? body.error
// // // //       : (body.error?.message ?? `HTTP ${res.status}`)
// // // //     throw new Error(msg)
// // // //   }

// // // //   return res.json()
// // // // }
// // // // export const stageApi = {
// // // //   advance: (id: string) => request<{ data: any }>(`/leads/${id}/advance`, { method: 'POST' }),
// // // //   qualify: (id: string) => request<{ data: any }>(`/leads/${id}/qualify`, { method: 'POST' }),
// // // //   handoff: (id: string, target: 'poc' | 'quote') =>
// // // //     request<{ data: any }>(`/leads/${id}/handoff`, { method: 'POST', body: JSON.stringify({ target }) }),
// // // //   closeWon: (id: string, p: { orderRef?: string; override?: boolean; reason?: string }) =>
// // // //     request<{ data: any }>(`/leads/${id}/close`, { method: 'POST', body: JSON.stringify({ outcome: 'won', ...p }) }),
// // // //   closeLost: (id: string, p: { lossReason: string; note?: string }) =>
// // // //     request<{ data: any }>(`/leads/${id}/close`, { method: 'POST', body: JSON.stringify({ outcome: 'lost', ...p }) }),
// // // //   reopen: (id: string, reason: string) =>
// // // //     request<{ data: any }>(`/leads/${id}/reopen`, { method: 'POST', body: JSON.stringify({ reason }) }),
// // // //   transitions: (id: string) => request<{ data: any[] }>(`/leads/${id}/transitions`),
// // // // }

// // // // export const api = {
// // // //   // Leads
// // // //   getLeads: (params?: Record<string, string>) => {
// // // //     const qs = params ? '?' + new URLSearchParams(params).toString() : ''
// // // //     return request<{ data: any[]; meta: any }>(`/leads${qs}`)
// // // //   },

// // // //   getLead: (id: string) =>
// // // //     request<{ data: any }>(`/leads/${id}`),

// // // //   createLead: (body: any) =>
// // // //     request<{ data: any }>('/leads', {
// // // //       method: 'POST',
// // // //       body: JSON.stringify(body),
// // // //     }),

// // // //   deleteLead: (id: string,body?: { reason?: string; actorName?: string }) =>
// // // //     request<{ data: any }>(`/leads/${id}`,
// // // //       {
// // // //         method: 'DELETE',
// // // //         headers: { 'Content-Type': 'application/json' },
// // // //         body: JSON.stringify(body ?? {}),
// // // //       }),


// // // //   // Activities
// // // //   getActivities: (leadId: string) =>
// // // //     request<{ data: any[] }>(`/leads/${leadId}/activities`),

// // // //   logActivity: (leadId: string, body: any) =>
// // // //     request<{ data: any }>(`/leads/${leadId}/activities`, {
// // // //       method: 'POST',
// // // //       body: JSON.stringify(body),
// // // //     }),

// // // //   // Stage transitions
// // // //   advanceStage: (leadId: string, body: any) =>
// // // //     request<{ data: any }>(`/leads/${leadId}/advance`, {
// // // //       method: 'POST',
// // // //       body: JSON.stringify(body),
// // // //     }),

// // // //   closeLead: (leadId: string, body: any) =>
// // // //     request<{ data: any }>(`/leads/${leadId}/close`, {
// // // //       method: 'POST',
// // // //       body: JSON.stringify(body),
// // // //     }),

// // // //   //Triage Queue
// // // //   triageLead: (leadId: string, body: {
// // // //     leadType: string
// // // //     vertical?: string
// // // //     ownerName: string
// // // //   }) =>
// // // //     request<{ data: any }>(`/leads/${leadId}/triage`, {
// // // //       method: 'POST',
// // // //       body: JSON.stringify(body),
// // // //     }),

// // // //   // Pipeline
// // // //   getPipeline: () =>
// // // //     request<{ data: any[] }>('/pipeline'),
// // // // }
// // // const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3004/api/v1'

// // // async function request<T>(
// // //   path: string,
// // //   options?: RequestInit
// // // ): Promise<T> {
// // //   const res = await fetch(`${BASE_URL}${path}`, {
// // //     headers: { 'Content-Type': 'application/json' },
// // //     ...options,
// // //   })

// // //   if (!res.ok) {
// // //     const body = await res.json().catch(() => ({}))
// // //     const msg = typeof body.error === 'string'
// // //       ? body.error
// // //       : (body.error?.message ?? `HTTP ${res.status}`)
// // //     throw new Error(msg)
// // //   }

// // //   return res.json()
// // // }
// // // export const stageApi = {
// // //   advance: (id: string) => request<{ data: any }>(`/leads/${id}/advance`, { method: 'POST' }),
// // //   qualify: (id: string) => request<{ data: any }>(`/leads/${id}/qualify`, { method: 'POST' }),
// // //   handoff: (id: string, target: 'poc' | 'quote') =>
// // //     request<{ data: any }>(`/leads/${id}/handoff`, { method: 'POST', body: JSON.stringify({ target }) }),
// // //   closeWon: (id: string, p: { orderRef?: string; override?: boolean; reason?: string }) =>
// // //     request<{ data: any }>(`/leads/${id}/close`, { method: 'POST', body: JSON.stringify({ outcome: 'won', ...p }) }),
// // //   closeLost: (id: string, p: { lossReason: string; note?: string }) =>
// // //     request<{ data: any }>(`/leads/${id}/close`, { method: 'POST', body: JSON.stringify({ outcome: 'lost', ...p }) }),
// // //   reopen: (id: string, reason: string) =>
// // //     request<{ data: any }>(`/leads/${id}/reopen`, { method: 'POST', body: JSON.stringify({ reason }) }),
// // //   transitions: (id: string) => request<{ data: any[] }>(`/leads/${id}/transitions`),
// // // }

// // // export const api = {
// // //   // Leads
// // //   getLeads: (params?: Record<string, string>) => {
// // //     const qs = params ? '?' + new URLSearchParams(params).toString() : ''
// // //     return request<{ data: any[]; meta: any }>(`/leads${qs}`)
// // //   },

// // //   getLead: (id: string) =>
// // //     request<{ data: any }>(`/leads/${id}`),

// // //   createLead: (body: any) =>
// // //     request<{ data: any }>('/leads', {
// // //       method: 'POST',
// // //       body: JSON.stringify(body),
// // //     }),

// // //   deleteLead: (id: string, body?: { reason?: string; actorName?: string }) =>
// // //     request<{ data: any }>(`/leads/${id}`,
// // //       {
// // //         method: 'DELETE',
// // //         headers: { 'Content-Type': 'application/json' },
// // //         body: JSON.stringify(body ?? {}),
// // //       }),

// // //   // Users (real employees from lead_service.app_user)
// // //   getUsers: () =>
// // //     request<{ data: { id: number; name: string; email: string; role: string }[] }>('/users'),

// // //   // Activities
// // //   getActivities: (leadId: string) =>
// // //     request<{ data: any[] }>(`/leads/${leadId}/activities`),

// // //   logActivity: (leadId: string, body: any) =>
// // //     request<{ data: any }>(`/leads/${leadId}/activities`, {
// // //       method: 'POST',
// // //       body: JSON.stringify(body),
// // //     }),

// // //   // Stage transitions
// // //   advanceStage: (leadId: string, body: { toStage: string; reason?: string }) =>
// // //     request<{ data: any }>(`/leads/${leadId}/advance`, {
// // //       method: 'POST',
// // //       body: JSON.stringify(body),
// // //     }),

// // //   closeLead: (leadId: string, body: any) =>
// // //     request<{ data: any }>(`/leads/${leadId}/close`, {
// // //       method: 'POST',
// // //       body: JSON.stringify(body),
// // //     }),

// // //   //Triage Queue
// // //   triageLead: (leadId: string, body: {
// // //     leadType: string
// // //     vertical?: string
// // //     ownerName: string
// // //   }) =>
// // //     request<{ data: any }>(`/leads/${leadId}/triage`, {
// // //       method: 'POST',
// // //       body: JSON.stringify(body),
// // //     }),

// // //   // Pipeline
// // //   getPipeline: () =>
// // //     request<{ data: any[] }>('/pipeline'),
// // // }
// // const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3004/api/v1'

// // async function request<T>(
// //   path: string,
// //   options?: RequestInit
// // ): Promise<T> {
// //   const res = await fetch(`${BASE_URL}${path}`, {
// //     headers: { 'Content-Type': 'application/json' },
// //     ...options,
// //   })

// //   if (!res.ok) {
// //     const body = await res.json().catch(() => ({}))
// //     const msg = typeof body.error === 'string'
// //       ? body.error
// //       : (body.error?.message ?? `HTTP ${res.status}`)
// //     throw new Error(msg)
// //   }

// //   return res.json()
// // }
// // export const stageApi = {
// //   advance: (id: string) => request<{ data: any }>(`/leads/${id}/advance`, { method: 'POST' }),
// //   qualify: (id: string) => request<{ data: any }>(`/leads/${id}/qualify`, { method: 'POST' }),
// //   handoff: (id: string, target: 'poc' | 'quote') =>
// //     request<{ data: any }>(`/leads/${id}/handoff`, { method: 'POST', body: JSON.stringify({ target }) }),
// //   closeWon: (id: string, p: { orderRef?: string; override?: boolean; reason?: string }) =>
// //     request<{ data: any }>(`/leads/${id}/close`, { method: 'POST', body: JSON.stringify({ outcome: 'won', ...p }) }),
// //   closeLost: (id: string, p: { lossReason: string; note?: string }) =>
// //     request<{ data: any }>(`/leads/${id}/close`, { method: 'POST', body: JSON.stringify({ outcome: 'lost', ...p }) }),
// //   reopen: (id: string, reason: string) =>
// //     request<{ data: any }>(`/leads/${id}/reopen`, { method: 'POST', body: JSON.stringify({ reason }) }),
// //   transitions: (id: string) => request<{ data: any[] }>(`/leads/${id}/transitions`),
// // }

// // export const api = {
// //   // Leads
// //   getLeads: (params?: Record<string, string>) => {
// //     const qs = params ? '?' + new URLSearchParams(params).toString() : ''
// //     return request<{ data: any[]; meta: any }>(`/leads${qs}`)
// //   },

// //   getLead: (id: string) =>
// //     request<{ data: any }>(`/leads/${id}`),

// //   createLead: (body: any) =>
// //     request<{ data: any }>('/leads', {
// //       method: 'POST',
// //       body: JSON.stringify(body),
// //     }),

// //   // Edit lead facts + primary contact. value is in RUPEES.
// //   updateLead: (id: string, body: {
// //     leadType?: string
// //     owner?: string | null
// //     value?: number | null
// //     estClose?: string | null
// //     contactName?: string
// //     contactRole?: string
// //     email?: string
// //     phone?: string
// //     onHold?: boolean
// //   }) =>
// //     request<{ data: any }>(`/leads/${id}`, {
// //       method: 'PATCH',
// //       body: JSON.stringify(body),
// //     }),

// //   // Contacts (account-level; `description` is free text)
// //   getContacts: (leadId: string) =>
// //     request<{ data: { id: string; name: string; description: string | null; email: string | null; phone: string | null; isPrimary: boolean }[] }>(`/leads/${leadId}/contacts`),

// //   addContact: (leadId: string, body: { name: string; description?: string; email?: string; phone?: string; makePrimary?: boolean }) =>
// //     request<{ data: any }>(`/leads/${leadId}/contacts`, { method: 'POST', body: JSON.stringify(body) }),

// //   updateContact: (contactId: string, body: { name?: string; description?: string; email?: string; phone?: string }) =>
// //     request<{ data: any }>(`/contacts/${contactId}`, { method: 'PATCH', body: JSON.stringify(body) }),

// //   makeContactPrimary: (leadId: string, contactId: string) =>
// //     request<{ data: any }>(`/leads/${leadId}/contacts/${contactId}/primary`, { method: 'POST' }),

// //   deleteContact: (contactId: string) =>
// //     request<{ data: any }>(`/contacts/${contactId}`, { method: 'DELETE' }),

// //   deleteLead: (id: string, body?: { reason?: string; actorName?: string }) =>
// //     request<{ data: any }>(`/leads/${id}`,
// //       {
// //         method: 'DELETE',
// //         headers: { 'Content-Type': 'application/json' },
// //         body: JSON.stringify(body ?? {}),
// //       }),

// //   // Users (real employees from lead_service.app_user)
// //   getUsers: () =>
// //     request<{ data: { id: number; name: string; email: string; role: string }[] }>('/users'),

// //   // Activities
// //   getActivities: (leadId: string) =>
// //     request<{ data: any[] }>(`/leads/${leadId}/activities`),

// //   logActivity: (leadId: string, body: any) =>
// //     request<{ data: any }>(`/leads/${leadId}/activities`, {
// //       method: 'POST',
// //       body: JSON.stringify(body),
// //     }),

// //   // Stage transitions
// //   advanceStage: (leadId: string, body: { toStage: string; reason?: string }) =>
// //     request<{ data: any }>(`/leads/${leadId}/advance`, {
// //       method: 'POST',
// //       body: JSON.stringify(body),
// //     }),

// //   closeLead: (leadId: string, body: any) =>
// //     request<{ data: any }>(`/leads/${leadId}/close`, {
// //       method: 'POST',
// //       body: JSON.stringify(body),
// //     }),

// //   //Triage Queue
// //   triageLead: (leadId: string, body: {
// //     leadType: string
// //     vertical?: string
// //     ownerName: string
// //   }) =>
// //     request<{ data: any }>(`/leads/${leadId}/triage`, {
// //       method: 'POST',
// //       body: JSON.stringify(body),
// //     }),

// //   // Pipeline
// //   getPipeline: () =>
// //     request<{ data: any[] }>('/pipeline'),
// // }
// const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3004/api/v1'

// async function request<T>(
//   path: string,
//   options?: RequestInit
// ): Promise<T> {
//   const res = await fetch(`${BASE_URL}${path}`, {
//     headers: { 'Content-Type': 'application/json' },
//     ...options,
//   })

//   if (!res.ok) {
//     const body = await res.json().catch(() => ({}))
//     const msg = typeof body.error === 'string'
//       ? body.error
//       : (body.error?.message ?? `HTTP ${res.status}`)
//     throw new Error(msg)
//   }

//   return res.json()
// }
// export const stageApi = {
//   advance: (id: string) => request<{ data: any }>(`/leads/${id}/advance`, { method: 'POST' }),
//   qualify: (id: string) => request<{ data: any }>(`/leads/${id}/qualify`, { method: 'POST' }),
//   handoff: (id: string, target: 'poc' | 'quote') =>
//     request<{ data: any }>(`/leads/${id}/handoff`, { method: 'POST', body: JSON.stringify({ target }) }),
//   closeWon: (id: string, p: { orderRef?: string; override?: boolean; reason?: string }) =>
//     request<{ data: any }>(`/leads/${id}/close`, { method: 'POST', body: JSON.stringify({ outcome: 'won', ...p }) }),
//   closeLost: (id: string, p: { lossReason: string; note?: string }) =>
//     request<{ data: any }>(`/leads/${id}/close`, { method: 'POST', body: JSON.stringify({ outcome: 'lost', ...p }) }),
//   reopen: (id: string, reason: string) =>
//     request<{ data: any }>(`/leads/${id}/reopen`, { method: 'POST', body: JSON.stringify({ reason }) }),
//   transitions: (id: string) => request<{ data: any[] }>(`/leads/${id}/transitions`),
// }

// export const api = {
//   // Leads
//   getLeads: (params?: Record<string, string>) => {
//     const qs = params ? '?' + new URLSearchParams(params).toString() : ''
//     return request<{ data: any[]; meta: any }>(`/leads${qs}`)
//   },

//   getLead: (id: string) =>
//     request<{ data: any }>(`/leads/${id}`),

//   createLead: (body: any) =>
//     request<{ data: any }>('/leads', {
//       method: 'POST',
//       body: JSON.stringify(body),
//     }),

//   // Edit lead facts + primary contact. value is in RUPEES.
//   updateLead: (id: string, body: {
//     leadType?: string
//     owner?: string | null
//     value?: number | null
//     estClose?: string | null
//     contactName?: string
//     contactRole?: string
//     email?: string
//     phone?: string
//     onHold?: boolean
//     prospectTier?: 'high' | 'medium' | 'low' | null
//   }) =>
//     request<{ data: any }>(`/leads/${id}`, {
//       method: 'PATCH',
//       body: JSON.stringify(body),
//     }),

//   // Contacts (account-level; `description` is free text)
//   getContacts: (leadId: string) =>
//     request<{ data: { id: string; name: string; description: string | null; email: string | null; phone: string | null; isPrimary: boolean }[] }>(`/leads/${leadId}/contacts`),

//   addContact: (leadId: string, body: { name: string; description?: string; email?: string; phone?: string; makePrimary?: boolean }) =>
//     request<{ data: any }>(`/leads/${leadId}/contacts`, { method: 'POST', body: JSON.stringify(body) }),

//   updateContact: (contactId: string, body: { name?: string; description?: string; email?: string; phone?: string }) =>
//     request<{ data: any }>(`/contacts/${contactId}`, { method: 'PATCH', body: JSON.stringify(body) }),

//   makeContactPrimary: (leadId: string, contactId: string) =>
//     request<{ data: any }>(`/leads/${leadId}/contacts/${contactId}/primary`, { method: 'POST' }),

//   deleteContact: (contactId: string) =>
//     request<{ data: any }>(`/contacts/${contactId}`, { method: 'DELETE' }),

//   deleteLead: (id: string, body?: { reason?: string; actorName?: string }) =>
//     request<{ data: any }>(`/leads/${id}`,
//       {
//         method: 'DELETE',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify(body ?? {}),
//       }),

//   // Users (real employees from lead_service.app_user)
//   getUsers: () =>
//     request<{ data: { id: number; name: string; email: string; role: string }[] }>('/users'),

//   // Activities
//   getActivities: (leadId: string) =>
//     request<{ data: any[] }>(`/leads/${leadId}/activities`),

//   logActivity: (leadId: string, body: any) =>
//     request<{ data: any }>(`/leads/${leadId}/activities`, {
//       method: 'POST',
//       body: JSON.stringify(body),
//     }),

//   // Stage transitions
//   advanceStage: (leadId: string, body: { toStage: string; reason?: string }) =>
//     request<{ data: any }>(`/leads/${leadId}/advance`, {
//       method: 'POST',
//       body: JSON.stringify(body),
//     }),

//   closeLead: (leadId: string, body: any) =>
//     request<{ data: any }>(`/leads/${leadId}/close`, {
//       method: 'POST',
//       body: JSON.stringify(body),
//     }),

//   //Triage Queue
//   triageLead: (leadId: string, body: {
//     leadType: string
//     vertical?: string
//     ownerName: string
//   }) =>
//     request<{ data: any }>(`/leads/${leadId}/triage`, {
//       method: 'POST',
//       body: JSON.stringify(body),
//     }),

//   // Pipeline
//   getPipeline: () =>
//     request<{ data: any[] }>('/pipeline'),
// }
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3004/api/v1'

// JWT from /auth/login. Reads the common localStorage keys; if your login stores
// it elsewhere (a different key, sessionStorage, or a JSON {token,user} blob),
// adjust this one function — it's the single source of truth for the token.
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

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,                                    // method/body first
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),                 // caller-supplied headers last; token survives
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const msg = typeof body.error === 'string'
      ? body.error
      : (body.error?.message ?? `HTTP ${res.status}`)
    throw new Error(msg)
  }

  return res.json()
}
export const stageApi = {
  advance: (id: string) => request<{ data: any }>(`/leads/${id}/advance`, { method: 'POST' }),
  qualify: (id: string) => request<{ data: any }>(`/leads/${id}/qualify`, { method: 'POST' }),
  handoff: (id: string, target: 'poc' | 'quote') =>
    request<{ data: any }>(`/leads/${id}/handoff`, { method: 'POST', body: JSON.stringify({ target }) }),
  closeWon: (id: string, p: { orderRef?: string; override?: boolean; reason?: string }) =>
    request<{ data: any }>(`/leads/${id}/close`, { method: 'POST', body: JSON.stringify({ outcome: 'won', ...p }) }),
  closeLost: (id: string, p: { lossReason: string; note?: string }) =>
    request<{ data: any }>(`/leads/${id}/close`, { method: 'POST', body: JSON.stringify({ outcome: 'lost', ...p }) }),
  reopen: (id: string, reason: string) =>
    request<{ data: any }>(`/leads/${id}/reopen`, { method: 'POST', body: JSON.stringify({ reason }) }),
  transitions: (id: string) => request<{ data: any[] }>(`/leads/${id}/transitions`),
}

export const api = {
  // Leads
  getLeads: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return request<{ data: any[]; meta: any }>(`/leads${qs}`)
  },

  getLead: (id: string) =>
    request<{ data: any }>(`/leads/${id}`),

  createLead: (body: any) =>
    request<{ data: any }>('/leads', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Edit lead facts + primary contact. value is in RUPEES.
  updateLead: (id: string, body: {
    leadType?: string
    owner?: string | null
    value?: number | null
    estClose?: string | null
    contactName?: string
    contactRole?: string
    email?: string
    phone?: string
    onHold?: boolean
    prospectTier?: 'high' | 'medium' | 'low' | null
  }) =>
    request<{ data: any }>(`/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  // Contacts (account-level; `description` is free text)
  getContacts: (leadId: string) =>
    request<{ data: { id: string; name: string; description: string | null; email: string | null; phone: string | null; isPrimary: boolean }[] }>(`/leads/${leadId}/contacts`),

  addContact: (leadId: string, body: { name: string; description?: string; email?: string; phone?: string; makePrimary?: boolean }) =>
    request<{ data: any }>(`/leads/${leadId}/contacts`, { method: 'POST', body: JSON.stringify(body) }),

  updateContact: (contactId: string, body: { name?: string; description?: string; email?: string; phone?: string }) =>
    request<{ data: any }>(`/contacts/${contactId}`, { method: 'PATCH', body: JSON.stringify(body) }),

  makeContactPrimary: (leadId: string, contactId: string) =>
    request<{ data: any }>(`/leads/${leadId}/contacts/${contactId}/primary`, { method: 'POST' }),

  deleteContact: (contactId: string) =>
    request<{ data: any }>(`/contacts/${contactId}`, { method: 'DELETE' }),

  deleteLead: (id: string, body?: { reason?: string; actorName?: string }) =>
    request<{ data: any }>(`/leads/${id}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      }),

  // Users (real employees from lead_service.app_user)
  getUsers: () =>
    request<{ data: { id: number; name: string; email: string; role: string }[] }>('/users'),

  // Activities
  getActivities: (leadId: string) =>
    request<{ data: any[] }>(`/leads/${leadId}/activities`),

  logActivity: (leadId: string, body: any) =>
    request<{ data: any }>(`/leads/${leadId}/activities`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Stage transitions
  advanceStage: (leadId: string, body: { toStage: string; reason?: string }) =>
    request<{ data: any }>(`/leads/${leadId}/advance`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  closeLead: (leadId: string, body: any) =>
    request<{ data: any }>(`/leads/${leadId}/close`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  //Triage Queue
  triageLead: (leadId: string, body: {
    leadType: string
    vertical?: string
    ownerName: string
  }) =>
    request<{ data: any }>(`/leads/${leadId}/triage`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Pipeline
  getPipeline: () =>
    request<{ data: any[] }>('/pipeline'),
}
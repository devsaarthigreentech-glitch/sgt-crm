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

//   deleteLead: (id: string,body?: { reason?: string; actorName?: string }) =>
//     request<{ data: any }>(`/leads/${id}`,
//       {
//         method: 'DELETE',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify(body ?? {}),
//       }),


//   // Activities
//   getActivities: (leadId: string) =>
//     request<{ data: any[] }>(`/leads/${leadId}/activities`),

//   logActivity: (leadId: string, body: any) =>
//     request<{ data: any }>(`/leads/${leadId}/activities`, {
//       method: 'POST',
//       body: JSON.stringify(body),
//     }),

//   // Stage transitions
//   advanceStage: (leadId: string, body: any) =>
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

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
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
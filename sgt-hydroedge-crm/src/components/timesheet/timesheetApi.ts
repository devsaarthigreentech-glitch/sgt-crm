// Timesheet API client.
// Same conventions as onboardingApi.ts: shared BASE_URL, bearer token from
// the same localStorage keys, { data } / { error } envelope, and a 422 that
// carries per-field messages so the form can mark the offending box rather
// than showing one banner for everything.

import { BASE_URL, getToken } from '../onboarding/onboardingApi'

export interface TimesheetEntry {
  id: string
  userId: string
  userName: string
  entryDate: string           // YYYY-MM-DD
  workDone: string
  problemsFaced: string
  additionalNotes: string
  createdAt: string
  editedAt: string | null
  /** Server's answer, not ours: author, and still inside the edit window. */
  canEdit: boolean
}

export interface TimesheetConfig {
  today: string
  earliestDate: string
  backdateDays: number
  editGraceDays: number
  canViewTeam: boolean
}

export interface TimesheetUserSummary {
  userId: string
  userName: string
  role: string
  entries: number
  daysFiled: number
  lastEntryDate: string | null
  filedToday: boolean
}

/** Thrown on 422 so the form can highlight individual fields. */
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
  // Only declare a JSON content-type when there IS a body — Fastify rejects
  // an empty body carrying application/json as FST_ERR_CTP_EMPTY_JSON_BODY.
  const hasBody = options?.body !== undefined && options?.body !== null
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  })

  if (res.status === 204) return undefined as T

  const body = await res.json().catch(() => ({} as any))
  if (!res.ok) {
    if (res.status === 422 && body?.fields) {
      throw new ValidationError(body?.error?.message ?? 'Check the highlighted fields', body.fields)
    }
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
  }
  return body
}

export interface ListParams {
  scope?: 'mine' | 'team'
  userId?: string
  from?: string
  to?: string
  limit?: number
}

export const timesheetApi = {
  config: () => request<{ data: TimesheetConfig }>('/timesheets/config').then(r => r.data),

  list: (p: ListParams = {}) => {
    const qs = new URLSearchParams()
    if (p.scope) qs.set('scope', p.scope)
    if (p.userId) qs.set('userId', p.userId)
    if (p.from) qs.set('from', p.from)
    if (p.to) qs.set('to', p.to)
    if (p.limit) qs.set('limit', String(p.limit))
    const q = qs.toString()
    return request<{ data: TimesheetEntry[]; meta: { from: string; to: string; scope: string } }>(
      `/timesheets${q ? `?${q}` : ''}`,
    )
  },

  summary: (from?: string, to?: string) => {
    const qs = new URLSearchParams()
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
    const q = qs.toString()
    return request<{ data: TimesheetUserSummary[] }>(`/timesheets/summary${q ? `?${q}` : ''}`)
      .then(r => r.data)
  },

  create: (p: {
    entryDate: string
    workDone: string
    problemsFaced: string
    additionalNotes: string
  }) =>
    request<{ data: TimesheetEntry }>('/timesheets', {
      method: 'POST',
      body: JSON.stringify(p),
    }).then(r => r.data),

  update: (
    id: string,
    p: { workDone: string; problemsFaced: string; additionalNotes: string },
  ) =>
    request<{ data: TimesheetEntry }>(`/timesheets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(p),
    }).then(r => r.data),

  remove: (id: string) => request<void>(`/timesheets/${id}`, { method: 'DELETE' }),
}

// Partner-scoped API client. In production the partner session comes from an
// email+OTP login; for dev we send X-Partner-Id (set localStorage 'sgt_partner_id').
import { useEffect, useRef, useState } from 'react'

const BASE = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3004'

export class PartnerApiError extends Error {
  code: string; status: number
  constructor(status: number, code: string, message: string) {
    super(message); this.status = status; this.code = code
  }
}

async function req<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const partnerId = localStorage.getItem('sgt_partner_id') ?? 'P-DEMO'
  const res = await fetch(`${BASE}/partners/me${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Partner-Id': partnerId,
      ...(opts.headers ?? {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = json?.error ?? {}
    throw new PartnerApiError(res.status, e.code ?? 'error', e.message ?? res.statusText)
  }
  return json.data as T
}

export const partnerApi = {
  me: () => req('/'),
  leads: () => req('/leads'),
  conflictCheck: (account: string) => req(`/conflict-check?account=${encodeURIComponent(account)}`),
  register: (body: any) => req('/leads', { method: 'POST', body: JSON.stringify(body) }),
  customers: () => req('/customers'),
  scorecard: () => req('/scorecard'),
  statements: () => req('/statements'),
  documents: () => req('/documents'),
  training: () => req('/training'),
  tickets: () => req('/tickets'),
  createTicket: (body: any) => req('/tickets', { method: 'POST', body: JSON.stringify(body) }),
}

export type ConflictState = 'idle' | 'checking' | 'clear' | 'conflict' | 'reserved'

/** Debounced live conflict-check for the Register Lead form. */
export function useConflictCheck(company: string, delay = 400) {
  const [state, setState] = useState<ConflictState>('idle')
  const [detail, setDetail] = useState<any>(null)
  const timer = useRef<any>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (company.trim().length < 2) { setState('idle'); setDetail(null); return }
    setState('checking')
    timer.current = setTimeout(async () => {
      try {
        const r = await partnerApi.conflictCheck(company)
        setState(r.state as ConflictState)
        setDetail(r)
      } catch { setState('idle') }
    }, delay)
    return () => timer.current && clearTimeout(timer.current)
  }, [company, delay])

  return { state, detail }
}

/** Generic data hook. */
export function useResource<T = any>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refetch = () => {
    setLoading(true)
    fn().then(d => { setData(d); setError(null) })
      .catch(e => setError(e?.message ?? 'Failed to load'))
      .finally(() => setLoading(false))
  }
  useEffect(refetch, deps) // eslint-disable-line
  return { data, loading, error, refetch }
}
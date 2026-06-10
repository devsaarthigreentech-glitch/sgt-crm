const API = import.meta.env.VITE_API_URL ?? '/api/v1'
const KEY = 'sgt_token'

export type User = { id: number; email: string; name: string; role: string }

export const getToken = () => localStorage.getItem(KEY)
export const setToken = (t: string) => localStorage.setItem(KEY, t)
export const clearToken = () => localStorage.removeItem(KEY)

export async function login(email: string, password: string): Promise<User> {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d?.error?.message ?? 'Login failed')
  setToken(d.token)
  return d.user
}

export async function me(): Promise<User | null> {
  const t = getToken(); if (!t) return null
  const r = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${t}` } })
  if (!r.ok) { clearToken(); return null }
  return (await r.json()).user
}

// drop-in replacement for fetch on protected calls
export async function authFetch(url: string, init: RequestInit = {}) {
  const t = getToken()
  const r = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) },
  })
  if (r.status === 401) { clearToken(); location.reload() }
  return r
}
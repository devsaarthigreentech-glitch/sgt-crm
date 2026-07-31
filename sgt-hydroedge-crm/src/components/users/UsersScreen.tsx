// Logins — create, reset, deactivate. DIRECTOR ONLY.
//
// Replaces shelling into the droplet to run create-partner-user.ts. The
// same rules apply, enforced server-side in services/userAccounts.ts:
// a partner login must carry a partner role, and the role must match
// what the org actually is.
//
// Passwords are GENERATED and shown exactly once. There is no endpoint
// that can return one again — if it is lost, it is reset. That is why
// the reveal panel is deliberately hard to dismiss by accident.

import { useEffect, useState } from 'react'
import { Check, AlertCircle, Plus, KeyRound, UserX, UserCheck, Copy } from 'lucide-react'
import { BASE_URL, getToken } from '../onboarding/onboardingApi'

const INK = '#161614'
const MUTED = '#6A675F'
const LINE = '#DDD7C6'
const FAINT = '#A39F94'
const DANGER = '#A6301C'
const OK = '#2F6B4F'
const PAPER = '#ECE8DA'
const WARN_BG = '#FBF0DA'
const WARN_FG = '#6F2F0E'

interface Account {
  id: string; email: string; name: string; role: string; active: boolean
  createdAt: string; orgCode: string | null; orgName: string | null; orgType: string | null
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const hasBody = options?.body !== undefined && options?.body !== null
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  const body = await res.json().catch(() => ({} as any))
  if (!res.ok) {
    const err: any = new Error(body?.error?.message ?? `HTTP ${res.status}`)
    err.fields = body?.fields
    throw err
  }
  return body
}

const inputStyle = (bad?: boolean): React.CSSProperties => ({
  width: '100%', boxSizing: 'border-box', padding: '9px 10px', fontSize: 13.5,
  color: INK, backgroundColor: '#fff', border: `1px solid ${bad ? DANGER : LINE}`,
  borderRadius: 6, outline: 'none', fontFamily: 'inherit',
})
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 5,
}

/** Partner roles need an org; SGT roles must not have one. */
const PARTNER_ROLES = ['distributor', 'dealer']
const STAFF_ROLES = ['director', 'sales', 'accounts', 'supply_chain']

export default function UsersScreen() {
  const [rows, setRows] = useState<Account[]>([])
  const [orgs, setOrgs] = useState<{ code: string; legal_name: string; org_type: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', role: 'sales', orgCode: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [reveal, setReveal] = useState<{ email: string; password: string; fresh: boolean } | null>(null)
  const [copied, setCopied] = useState(false)

  const load = () => {
    setLoading(true)
    api<{ data: Account[] }>('/users/accounts')
      .then(r => setRows(r.data))
      .catch(e => setBanner(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    api<{ data: any[] }>('/partners/orgs')
      .then(r => setOrgs(r.data.map(o => ({
        code: o.code, legal_name: o.legal_name, org_type: o.org_type,
      }))))
      .catch(() => { /* the picker just stays empty */ })
  }, [])

  const isPartnerRole = PARTNER_ROLES.includes(form.role)

  const submit = async () => {
    setErrors({}); setBanner(null)
    try {
      const r = await api<{ data: Account & { password: string } }>('/users/accounts', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email.trim(), name: form.name.trim(), role: form.role,
          orgCode: isPartnerRole ? form.orgCode : '',
        }),
      })
      setReveal({ email: r.data.email, password: r.data.password, fresh: true })
      setAdding(false)
      setForm({ email: '', name: '', role: 'sales', orgCode: '' })
      load()
    } catch (e: any) {
      if (e.fields) setErrors(e.fields)
      else setBanner(e.message)
    }
  }

  const resetPw = async (a: Account) => {
    setBanner(null)
    try {
      const r = await api<{ data: Account & { password: string } }>(
        `/users/accounts/${a.id}/password`, { method: 'POST', body: JSON.stringify({}) })
      setReveal({ email: a.email, password: r.data.password, fresh: false })
    } catch (e: any) { setBanner(e.message) }
  }

  const toggle = async (a: Account) => {
    setBanner(null)
    try {
      await api(`/users/accounts/${a.id}/status`, {
        method: 'POST', body: JSON.stringify({ active: !a.active }),
      })
      load()
    } catch (e: any) { setBanner(e.message) }
  }

  return (
    <div style={{ backgroundColor: PAPER, height: '100%', overflowY: 'auto', padding: '20px 18px 60px' }}>
      <h1 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: INK }}>Logins</h1>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: MUTED }}>
        SGT staff and partner accounts. A partner login reaches only the portal,
        scoped to their own org and whatever sits beneath it.
      </p>

      {banner && (
        <div style={{ padding: '10px 12px', marginBottom: 13, borderRadius: 8, backgroundColor: '#F3DAD5', color: DANGER, fontSize: 12.5 }}>
          {banner}
        </div>
      )}

      {/* Shown once. There is no way to retrieve it again. */}
      {reveal && (
        <div style={{
          padding: '14px 16px', marginBottom: 14, borderRadius: 10,
          backgroundColor: WARN_BG, color: WARN_FG, border: '1px solid #E4CDA0',
        }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>
            {reveal.fresh ? 'Account created' : 'Password reset'} — {reveal.email}
          </div>
          <div style={{ fontSize: 11.5, marginBottom: 9 }}>
            This is the only time this password is shown. Send it to them now;
            if it is lost you will have to reset it again.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{
              flex: 1, padding: '9px 11px', borderRadius: 6, background: '#fff',
              border: `1px solid ${LINE}`, fontSize: 14, letterSpacing: '0.05em',
              fontFamily: 'ui-monospace, monospace', color: INK, wordBreak: 'break-all',
            }}>{reveal.password}</code>
            <button type="button"
              onClick={() => {
                navigator.clipboard?.writeText(reveal.password)
                setCopied(true); setTimeout(() => setCopied(false), 1800)
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '9px 12px',
                fontSize: 12.5, fontFamily: 'inherit', border: `1px solid ${LINE}`,
                borderRadius: 6, cursor: 'pointer', background: '#fff', color: MUTED,
              }}>
              {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
            </button>
            <button type="button" onClick={() => setReveal(null)} style={{
              padding: '9px 12px', fontSize: 12.5, fontFamily: 'inherit',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              background: INK, color: '#fff',
            }}>I've sent it</button>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 760 }}>
        {!adding && (
          <button onClick={() => { setAdding(true); setErrors({}) }} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', marginBottom: 16,
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            backgroundColor: INK, color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer',
          }}>
            <Plus size={15} /> Add a login
          </button>
        )}

        {adding && (
          <div style={{
            backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 10,
            padding: 15, marginBottom: 16,
          }}>
            <h3 style={{ margin: '0 0 13px', fontSize: 14, fontWeight: 700, color: INK }}>New login</h3>

            <div style={{ marginBottom: 13 }}>
              <label style={labelStyle}>Role</label>
              <select value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value, orgCode: '' }))}
                style={{ ...inputStyle(!!errors.role), appearance: 'auto' }}>
                <optgroup label="SGT">
                  {STAFF_ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </optgroup>
                <optgroup label="Partner — portal only">
                  {PARTNER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </optgroup>
              </select>
              {errors.role && <div style={{ fontSize: 11.5, color: DANGER, marginTop: 4 }}>{errors.role}</div>}
            </div>

            {isPartnerRole && (
              <div style={{ marginBottom: 13 }}>
                <label style={labelStyle}>Partner</label>
                <select value={form.orgCode}
                  onChange={e => setForm(f => ({ ...f, orgCode: e.target.value }))}
                  style={{ ...inputStyle(!!errors.orgCode), appearance: 'auto' }}>
                  <option value="">Select…</option>
                  {orgs
                    .filter(o => o.org_type === form.role)
                    .map(o => <option key={o.code} value={o.code}>{o.legal_name} ({o.code})</option>)}
                </select>
                <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>
                  Only {form.role}s are listed — a login must match what the org is.
                </div>
                {errors.orgCode && <div style={{ fontSize: 11.5, color: DANGER, marginTop: 4 }}>{errors.orgCode}</div>}
              </div>
            )}

            <div style={{ marginBottom: 13 }}>
              <label style={labelStyle}>Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={inputStyle(!!errors.name)} />
              {errors.name && <div style={{ fontSize: 11.5, color: DANGER, marginTop: 4 }}>{errors.name}</div>}
            </div>

            <div style={{ marginBottom: 13 }}>
              <label style={labelStyle}>Email</label>
              <input value={form.email} type="email"
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                style={inputStyle(!!errors.email)} />
              {errors.email && <div style={{ fontSize: 11.5, color: DANGER, marginTop: 4 }}>{errors.email}</div>}
              <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>
                They sign in with this. A password is generated and shown once.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submit} style={{
                padding: '9px 15px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                border: 'none', borderRadius: 7, cursor: 'pointer', backgroundColor: INK, color: '#fff',
              }}>Create login</button>
              <button onClick={() => { setAdding(false); setErrors({}) }} style={{
                padding: '9px 15px', fontSize: 13, fontFamily: 'inherit',
                border: `1px solid ${LINE}`, borderRadius: 7, cursor: 'pointer',
                background: '#fff', color: MUTED,
              }}>Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <p style={{ fontSize: 13, color: FAINT }}>Loading…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map(a => (
              <div key={a.id} style={{
                backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 9,
                padding: '11px 13px', opacity: a.active ? 1 : 0.55,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>
                      {a.name}
                      {!a.active && <span style={{ color: MUTED, fontWeight: 500 }}> · deactivated</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                      {a.email} · {a.role.replace('_', ' ')}
                      {a.orgCode ? ` · ${a.orgName} (${a.orgCode})` : ' · SGT'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                    <button type="button" onClick={() => resetPw(a)} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      color: MUTED, fontSize: 12, fontFamily: 'inherit',
                    }}>
                      <KeyRound size={13} /> Reset password
                    </button>
                    <button type="button" onClick={() => toggle(a)} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      color: a.active ? MUTED : OK, fontSize: 12, fontFamily: 'inherit',
                    }}>
                      {a.active ? <><UserX size={13} /> Deactivate</> : <><UserCheck size={13} /> Reactivate</>}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!rows.length && (
              <div style={{ display: 'flex', gap: 6, fontSize: 12.5, color: MUTED }}>
                <AlertCircle size={14} /> No accounts yet.
              </div>
            )}
          </div>
        )}

        <p style={{ fontSize: 11, color: FAINT, marginTop: 18, lineHeight: 1.6 }}>
          Accounts are deactivated, never deleted — quotations and leads point at
          them, and "who raised this" has to stay answerable. Only SGT can create
          logins; a distributor cannot mint one for their own dealers.
        </p>
      </div>
    </div>
  )
}

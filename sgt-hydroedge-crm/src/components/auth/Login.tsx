import { useState } from 'react'
import { login, type User } from '../../lib/auth'

export default function Login({ onSuccess }: { onSuccess: (u: User) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true); setErr(null)
    try { onSuccess(await login(email.trim(), password)) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Login failed') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F0E5' }}>
      <div style={{ width: 320, background: '#fff', border: '1px solid #DDD7C6', borderRadius: 14, padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.03em' }}>SGT</span>
          <span style={{ fontSize: 16, fontWeight: 500, color: '#0E5550' }}>HydroEdge</span>
        </div>
        <p style={{ fontSize: 12.5, color: '#6A675F', margin: '0 0 18px' }}>Sign in to continue</p>

        <input type="email" placeholder="Email" value={email} autoFocus
          onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
          style={inp} />
        <input type="password" placeholder="Password" value={password}
          onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
          style={{ ...inp, marginTop: 10 }} />

        {err && <div style={{ color: '#C84A3A', fontSize: 12, marginTop: 10 }}>{err}</div>}

        <button onClick={submit} disabled={busy}
          style={{ width: '100%', marginTop: 16, padding: '10px 0', border: 'none', borderRadius: 8,
            background: '#1F4E2E', color: '#fff', fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 11px', border: '1px solid #DDD7C6',
  borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
}
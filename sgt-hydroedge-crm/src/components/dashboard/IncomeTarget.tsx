// src/components/dashboard/IncomeTarget.tsx
// Quarter-wise income targets vs ERPNext actuals, with shortfall carry-forward.
// Editable by directors only (PUT is role-guarded on the server too).
import { useEffect, useState } from 'react'
import { Target, Pencil, ArrowDownToLine } from 'lucide-react'
import { authFetch } from '../../lib/auth'

const API = import.meta.env.VITE_API_URL ?? '/api/v1'
const C = { forest: '#1F4E2E', green2: '#2D7A4F', gold: '#C9A24E', red: '#C84A3A', healthy: '#3B9D6E' }

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
const inrShort = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1e7) return '₹' + (n / 1e7).toFixed(2).replace(/\.00$/, '') + 'Cr'
  if (a >= 1e5) return '₹' + (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L'
  return inr(n)
}

type Quarter = {
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'
  baseTarget: number
  carriedIn: number
  effectiveTarget: number
  actual: number
  shortfall: number
  met: boolean
  pct: number
}
type TargetData = {
  fiscalYear: string
  totalTarget: number
  totalActual: number
  totalPct: number
  totalShortfall: number
  carryForwardOutstanding: number
  quarters: Quarter[]
  updatedBy: string | null
  updatedAt: string | null
  isDefault: boolean
}

export default function IncomeTarget({ role }: { role: string }) {
  const isDirector = role === 'director'
  const [data, setData] = useState<TargetData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const load = () => {
    setErr(null)
    fetch(`${API}/targets/income`)
      .then(r => r.json())
      .then(d => { if (d.error) setErr(d.error); else setData(d) })
      .catch(e => setErr(String(e)))
  }
  useEffect(load, [])

  if (err) {
    return (
      <Wrap>
        <Head data={null} isDirector={false} onEdit={() => {}} />
        <div style={{ color: C.red, fontSize: 13 }}>Targets: {err}</div>
      </Wrap>
    )
  }
  if (!data) {
    return <Wrap><Head data={null} isDirector={false} onEdit={() => {}} /><div style={{ color: C.green2, fontSize: 13 }}>Loading targets…</div></Wrap>
  }

  return (
    <Wrap>
      <Head data={data} isDirector={isDirector} onEdit={() => setEditing(true)} />

      {/* Annual progress bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: C.forest, fontWeight: 600 }}>
            {inrShort(data.totalActual)} <span style={{ color: '#999', fontWeight: 500 }}>of {inrShort(data.totalTarget)}</span>
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: data.totalPct >= 1 ? C.healthy : C.gold }}>
            {(data.totalPct * 100).toFixed(1)}%
          </span>
        </div>
        <div style={{ height: 9, background: '#f0efe8', borderRadius: 5, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${Math.max(0, Math.min(100, data.totalPct * 100))}%`,
            background: data.totalPct >= 1 ? C.healthy : C.green2, borderRadius: 5, transition: 'width 400ms ease',
          }} />
        </div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 5 }}>
          {data.totalShortfall > 0
            ? <>Remaining to target: <b style={{ color: C.gold }}>{inrShort(data.totalShortfall)}</b></>
            : <span style={{ color: C.healthy }}>Annual target met 🎉</span>}
        </div>
      </div>

      {/* Quarter grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {data.quarters.map(q => (
          <div key={q.quarter} style={{
            background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '12px 13px',
            borderTop: `3px solid ${q.met ? C.healthy : q.pct >= 0.5 ? C.gold : C.red}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.forest }}>{q.quarter}</span>
              <span style={{
                fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                color: q.met ? '#1f6b3f' : '#7A4A0E',
                background: q.met ? '#DDE9C9' : '#F3E2BE',
              }}>
                {q.met ? 'Met' : `${(q.pct * 100).toFixed(0)}%`}
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.green2, fontFamily: 'monospace' }}>
              {inrShort(q.actual)}
            </div>
            <div style={{ fontSize: 10.5, color: '#999', marginTop: 2 }}>
              target {inrShort(q.effectiveTarget)}
            </div>
            <div style={{ height: 5, background: '#f0efe8', borderRadius: 3, overflow: 'hidden', margin: '7px 0 6px' }}>
              <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, q.pct * 100))}%`, background: q.met ? C.healthy : C.gold, borderRadius: 3 }} />
            </div>
            {q.carriedIn > 0 && (
              <div style={{ fontSize: 10, color: C.red, display: 'flex', alignItems: 'center', gap: 3 }}>
                <ArrowDownToLine size={10} strokeWidth={2.25} />
                +{inrShort(q.carriedIn)} carried in
              </div>
            )}
            {q.carriedIn === 0 && q.shortfall < 0 && (
              <div style={{ fontSize: 10, color: C.healthy }}>
                {inrShort(-q.shortfall)} ahead
              </div>
            )}
          </div>
        ))}
      </div>

      {data.carryForwardOutstanding > 0 && (
        <div style={{
          marginTop: 12, padding: '9px 12px', borderRadius: 8,
          background: '#FCF6EE', border: '1px solid #efe3cd',
          fontSize: 12, color: '#7A4A0E', display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <ArrowDownToLine size={13} strokeWidth={2} />
          <span><b>{inrShort(data.carryForwardOutstanding)}</b> shortfall still carried forward beyond Q4.</span>
        </div>
      )}

      <div style={{ fontSize: 10.5, color: '#bbb', marginTop: 10 }}>
        {data.isDefault
          ? 'Using default targets — not yet customised.'
          : `Last updated by ${data.updatedBy ?? 'director'}${data.updatedAt ? ' · ' + new Date(data.updatedAt).toLocaleDateString('en-IN') : ''}`}
      </div>

      {editing && (
        <EditTargets
          data={data}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load() }}
        />
      )}
    </Wrap>
  )
}

function Head({ data, isDirector, onEdit }: { data: TargetData | null; isDirector: boolean; onEdit: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
      <h2 style={{ color: C.forest, margin: 0, fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Target size={17} strokeWidth={2} />
        Income target{data ? ` · ${data.fiscalYear}` : ''}
      </h2>
      {isDirector && (
        <button onClick={onEdit} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '6px 11px', border: `1px solid ${C.green2}`, background: '#fff',
          borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.forest, cursor: 'pointer',
        }}>
          <Pencil size={12} strokeWidth={2} />
          Edit targets
        </button>
      )}
    </div>
  )
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#FAFAF7', padding: 20, borderRadius: 14, fontFamily: 'system-ui, sans-serif' }}>
      {children}
    </div>
  )
}

// ── Edit modal (director only) ──
function EditTargets({ data, onClose, onSaved }: {
  data: TargetData
  onClose: () => void
  onSaved: () => void
}) {
  const [total, setTotal] = useState<string>(String(data.totalTarget))
  const [q, setQ] = useState({
    Q1: String(data.quarters[0]?.baseTarget ?? 0),
    Q2: String(data.quarters[1]?.baseTarget ?? 0),
    Q3: String(data.quarters[2]?.baseTarget ?? 0),
    Q4: String(data.quarters[3]?.baseTarget ?? 0),
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const qSum = (['Q1', 'Q2', 'Q3', 'Q4'] as const).reduce((s, k) => s + (Number(q[k]) || 0), 0)
  const totalNum = Number(total) || 0
  const mismatch = Math.abs(qSum - totalNum) > 1

  const save = async () => {
    setSaving(true); setErr(null)
    try {
      const r = await authFetch(`${API}/targets/income`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fiscalYear: data.fiscalYear,
          totalTarget: totalNum,
          quarters: {
            Q1: Number(q.Q1) || 0, Q2: Number(q.Q2) || 0,
            Q3: Number(q.Q3) || 0, Q4: Number(q.Q4) || 0,
          },
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error?.message ?? d?.error ?? `HTTP ${r.status}`)
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
      setSaving(false)
    }
  }

  const splitEven = () => {
    const each = Math.round(totalNum / 4)
    setQ({ Q1: String(each), Q2: String(each), Q3: String(each), Q4: String(totalNum - each * 3) })
  }

  return (
    <div onClick={() => !saving && onClose()} style={overlay}>
      <div onClick={e => e.stopPropagation()} style={modal}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, color: C.forest }}>Edit income targets</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#777' }}>
          Fiscal year {data.fiscalYear} · all values in ₹
        </p>

        <label style={lbl}>Annual total target</label>
        <input type="number" min={0} step={100000} value={total}
          onChange={e => setTotal(e.target.value)} style={inp} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '-4px 0 12px' }}>
          <span style={{ fontSize: 11.5, color: C.green2, fontFamily: 'monospace' }}>{inrShort(totalNum)}</span>
          <button onClick={splitEven} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5,
            color: C.forest, fontWeight: 600, textDecoration: 'underline', padding: 0,
          }}>Split evenly across quarters</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
          {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map(k => (
            <div key={k}>
              <label style={lbl}>{k} target</label>
              <input type="number" min={0} step={100000} value={q[k]}
                onChange={e => setQ(prev => ({ ...prev, [k]: e.target.value }))} style={inp} />
            </div>
          ))}
        </div>

        <div style={{
          fontSize: 11.5, marginBottom: 12,
          color: mismatch ? '#7A4A0E' : '#999',
          background: mismatch ? '#F3E2BE' : 'transparent',
          padding: mismatch ? '6px 10px' : 0, borderRadius: 6,
        }}>
          Quarters sum to <b>{inrShort(qSum)}</b>
          {mismatch ? ` — doesn't match the annual total (${inrShort(totalNum)}). That's allowed, but worth a look.` : ' ✓ matches annual total.'}
        </div>

        {err && <p style={{ fontSize: 12.5, color: C.red, margin: '0 0 10px' }}>{err}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={btnGhost}>Cancel</button>
          <button onClick={save} disabled={saving} style={btnPrimary}>
            {saving ? 'Saving…' : 'Save targets'}
          </button>
        </div>
      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(20,20,18,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100,
} as const
const modal = {
  background: '#fff', borderRadius: 14, padding: '20px 22px',
  width: '100%', maxWidth: 440, boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
} as const
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 10.5, fontWeight: 700, color: '#777',
  letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 5,
}
const inp: React.CSSProperties = {
  width: '100%', padding: '8px 10px', marginBottom: 10,
  border: '1px solid #ddd', borderRadius: 7, fontSize: 13, outline: 'none',
}
const btnGhost: React.CSSProperties = {
  padding: '8px 14px', background: '#fff', color: '#161614',
  border: '1px solid #ddd', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnPrimary: React.CSSProperties = {
  padding: '8px 14px', background: C.forest, color: '#fff',
  border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
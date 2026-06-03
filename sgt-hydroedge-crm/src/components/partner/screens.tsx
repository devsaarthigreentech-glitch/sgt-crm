// All Partner Portal screens in one file (they share styling atoms).
import { useState } from 'react'
import { partnerApi, useResource, useConflictCheck, type ConflictState } from './partnerApi'
import { t } from '../../lib/tokens'

const fmtINR = (n?: number | null) =>
  n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN')

// ── My Leads ──────────────────────────────────────────────────────────────────
export function MyLeads() {
  const { data, loading, error } = useResource(() => partnerApi.leads())
  if (loading) return <Loading />
  if (error) return <ErrorMsg msg={error} />
  const leads = data ?? []
  return (
    <Section title="My registered leads" subtitle={`${leads.length} active`}>
      {leads.length === 0 && <Empty msg="No leads yet — register one." />}
      {leads.map((l: any) => (
        <Card key={l.id}>
          <Row>
            <strong style={{ color: t.ink }}>{l.company}</strong>
            <Tag>{l.stage}</Tag>
          </Row>
          <Row>
            <span style={{ color: t.muted, fontSize: 13 }}>{l.vertical ?? '—'} · {fmtINR(l.value)}</span>
            {l.protectionDaysLeft != null && (
              <span style={{
                fontSize: 12, fontWeight: 600, color: l.protectionDaysLeft < 15 ? t.lost : t.green2,
              }}>
                {l.protectionStatus === 'expired'
                  ? 'protection expired'
                  : `protected · ${l.protectionDaysLeft}d left`}
              </span>
            )}
          </Row>
        </Card>
      ))}
    </Section>
  )
}

// ── Register Lead (live conflict-check) ────────────────────────────────────────
export function RegisterLead({ onDone }: { onDone?: () => void }) {
  const [company, setCompany] = useState('')
  const [vertical, setVertical] = useState('')
  const [value, setValue] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const { state, detail } = useConflictCheck(company)

  const blocked = state === 'conflict' || state === 'reserved'
  const canSubmit = company.trim().length >= 2 && !blocked && state !== 'checking'

  async function submit() {
    setBusy(true); setMsg(null)
    try {
      await partnerApi.register({
        company, vertical: vertical || undefined,
        value: value ? Number(value) : undefined,
        contactName: contactName || undefined,
        contactEmail: contactEmail || undefined,
      })
      setMsg('✓ Lead registered and protected for 90 days.')
      setCompany(''); setVertical(''); setValue(''); setContactName(''); setContactEmail('')
      onDone?.()
    } catch (e: any) { setMsg(e?.message ?? 'Could not register lead') }
    finally { setBusy(false) }
  }

  return (
    <Section title="Register a lead" subtitle="First-come-first-served. We check for conflicts as you type.">
      <ConflictBanner state={state} detail={detail} />
      <Field label="Company name">
        <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Customer organisation" style={input} />
      </Field>
      <Field label="Vertical">
        <select value={vertical} onChange={e => setVertical(e.target.value)} style={input}>
          <option value="">Select…</option>
          {['Industry', 'Marine', 'Vehicles', 'Small DG', 'Cross-vertical'].map(v => <option key={v}>{v}</option>)}
        </select>
      </Field>
      <Field label="Estimated value (₹)">
        <input value={value} onChange={e => setValue(e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 4500000" style={input} />
      </Field>
      <Field label="Contact name"><input value={contactName} onChange={e => setContactName(e.target.value)} style={input} /></Field>
      <Field label="Contact email"><input value={contactEmail} onChange={e => setContactEmail(e.target.value)} style={input} /></Field>
      <button disabled={!canSubmit || busy} onClick={submit} style={{
        marginTop: 8, padding: '11px 16px', borderRadius: 8, border: 'none',
        backgroundColor: canSubmit ? t.green : t.border, color: '#fff', fontWeight: 700,
        fontSize: 14, cursor: canSubmit ? 'pointer' : 'not-allowed', width: '100%',
      }}>
        {blocked ? 'Blocked — resolve conflict' : busy ? 'Registering…' : 'Register lead'}
      </button>
      {msg && <p style={{ fontSize: 13, color: msg.startsWith('✓') ? t.green2 : t.lost, marginTop: 10 }}>{msg}</p>}
    </Section>
  )
}

function ConflictBanner({ state, detail }: { state: ConflictState; detail: any }) {
  if (state === 'idle') return null
  const map: Record<string, { bg: string; fg: string; text: string }> = {
    checking: { bg: t.ground, fg: t.muted, text: 'Checking for conflicts…' },
    clear: { bg: t.okBg, fg: t.green, text: detail?.ownedByMe ? 'You already hold this account — all clear.' : 'All clear — this account is available.' },
    conflict: { bg: t.amberBg, fg: t.amber, text: 'Conflict — another partner holds an active protection window. Routed to Programme Lead.' },
    reserved: { bg: t.redBg, fg: t.lost, text: `Reserved — ${detail?.reservedLabel ?? 'this'} is a direct SGT anchor account and cannot be registered.` },
  }
  const s = map[state]
  if (!s) return null
  return (
    <div style={{
      backgroundColor: s.bg, color: s.fg, borderRadius: 8, padding: '10px 12px',
      fontSize: 13, fontWeight: 600, marginBottom: 14,
    }}>{s.text}</div>
  )
}

// ── My Customers ───────────────────────────────────────────────────────────────
export function MyCustomers() {
  const { data, loading, error } = useResource(() => partnerApi.customers())
  if (loading) return <Loading />
  if (error) return <ErrorMsg msg={error} />
  return (
    <Section title="My customers" subtitle="Health across your installed base">
      {(data ?? []).map((c: any) => (
        <Card key={c.account}>
          <Row>
            <strong>{c.account}</strong>
            <HealthDot score={c.health_score} />
          </Row>
          <Row>
            <span style={{ fontSize: 13, color: t.muted }}>Churn risk: {c.churn_risk}</span>
            {c.expansion && <span style={{ fontSize: 12, color: t.green2 }}>{c.expansion}</span>}
          </Row>
          <Bar value={c.health_score} />
        </Card>
      ))}
    </Section>
  )
}
function HealthDot({ score }: { score: number }) {
  const c = score >= 75 ? t.green2 : score >= 55 ? t.amber : t.lost
  return <span style={{ fontWeight: 700, color: c }}>{score}</span>
}
function Bar({ value }: { value: number }) {
  const c = value >= 75 ? t.green2 : value >= 55 ? t.amber : t.lost
  return (
    <div style={{ height: 6, borderRadius: 999, backgroundColor: t.ground, marginTop: 8 }}>
      <div style={{ height: 6, borderRadius: 999, width: `${value}%`, backgroundColor: c }} />
    </div>
  )
}

// ── Scorecard ────────────────────────────────────────────────────────────────
export function Scorecard() {
  const { data, loading, error } = useResource(() => partnerApi.scorecard())
  if (loading) return <Loading />
  if (error) return <ErrorMsg msg={error} />
  if (!data) return <Empty msg="No scorecard yet." />
  return (
    <Section title="My scorecard" subtitle={data.period}>
      {data.elevation_eligible && (
        <div style={{ backgroundColor: t.okBg, color: t.green, borderRadius: 8, padding: '10px 12px', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          ★ Eligible for tier elevation
        </div>
      )}
      {(data.metrics ?? []).map((m: any, i: number) => {
        const pct = m.target ? Math.min(100, Math.round((m.value / m.target) * 100)) : 0
        const hit = m.value >= m.target
        return (
          <Card key={i}>
            <Row>
              <span style={{ color: t.ink, fontWeight: 600 }}>{m.label}</span>
              <span style={{ color: hit ? t.green2 : t.amber, fontWeight: 700 }}>
                {m.value}{m.unit} <span style={{ color: t.muted, fontWeight: 400 }}>/ {m.target}{m.unit}</span>
              </span>
            </Row>
            <Bar value={pct} />
          </Card>
        )
      })}
    </Section>
  )
}

// ── Statements ──────────────────────────────────────────────────────────────
export function Statements() {
  const { data, loading, error } = useResource(() => partnerApi.statements())
  if (loading) return <Loading />
  if (error) return <ErrorMsg msg={error} />
  const labels: Record<string, string> = { commission: 'Commission', carbon: 'Carbon Credit', margin: 'Margin' }
  return (
    <Section title="Statements" subtitle="In the contractually required format">
      {(data ?? []).map((s: any) => (
        <Card key={s.id}>
          <Row>
            <span><strong>{labels[s.type] ?? s.type}</strong> · {s.period}</span>
            <Tag color={s.status === 'paid' ? t.green2 : t.amber}>{s.status}</Tag>
          </Row>
          <Row>
            <span style={{ color: t.ink }}>{fmtINR(s.amount)}</span>
            <a href={s.url ?? '#'} style={{ fontSize: 13, color: t.green, fontWeight: 600 }}>Download</a>
          </Row>
        </Card>
      ))}
    </Section>
  )
}

// ── Document Hub ───────────────────────────────────────────────────────────────
export function DocumentHub() {
  const { data, loading, error } = useResource(() => partnerApi.documents())
  if (loading) return <Loading />
  if (error) return <ErrorMsg msg={error} />
  return (
    <Section title="Document hub" subtitle="Only what your tier and agreements permit">
      {(data ?? []).map((d: any) => (
        <Card key={d.id}>
          <Row>
            <span><strong>{d.title}</strong></span>
            <Tag>{d.doc_class}</Tag>
          </Row>
          <Row>
            <span style={{ fontSize: 12, color: t.muted }}>{d.scope} · {d.version}</span>
            <a href={d.url ?? '#'} style={{ fontSize: 13, color: t.green, fontWeight: 600 }}>Open latest</a>
          </Row>
        </Card>
      ))}
    </Section>
  )
}

// ── Training ─────────────────────────────────────────────────────────────────
export function Training() {
  const { data, loading, error } = useResource(() => partnerApi.training())
  if (loading) return <Loading />
  if (error) return <ErrorMsg msg={error} />
  const color: Record<string, string> = { completed: t.green2, in_progress: t.amber, assigned: t.muted }
  return (
    <Section title="Training" subtitle="Completion gates dispatch eligibility & tier elevation">
      {(data ?? []).map((m: any) => (
        <Card key={m.id}>
          <Row>
            <span style={{ color: t.ink }}>{m.module}</span>
            <Tag color={color[m.status]}>{m.status.replace('_', ' ')}</Tag>
          </Row>
        </Card>
      ))}
    </Section>
  )
}

// ── Service Tickets (lite) ─────────────────────────────────────────────────────
export function ServiceTickets() {
  const { data, loading, error, refetch } = useResource(() => partnerApi.tickets())
  const [subject, setSubject] = useState('')
  const [busy, setBusy] = useState(false)
  async function create() {
    if (subject.trim().length < 3) return
    setBusy(true)
    try { await partnerApi.createTicket({ subject }); setSubject(''); refetch() }
    finally { setBusy(false) }
  }
  if (loading) return <Loading />
  if (error) return <ErrorMsg msg={error} />
  const color: Record<string, string> = { open: t.amber, in_progress: t.green2, resolved: t.muted }
  return (
    <Section title="Service tickets" subtitle="Raise and track service requests">
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Describe the issue" style={{ ...input, marginBottom: 0 }} />
        <button disabled={busy} onClick={create} style={{
          padding: '9px 14px', borderRadius: 8, border: 'none', backgroundColor: t.green,
          color: '#fff', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer',
        }}>Raise</button>
      </div>
      {(data ?? []).map((tk: any) => (
        <Card key={tk.id}>
          <Row>
            <span style={{ color: t.ink }}>{tk.subject}</span>
            <Tag color={color[tk.status]}>{tk.status.replace('_', ' ')}</Tag>
          </Row>
          <span style={{ fontSize: 12, color: t.muted }}>{tk.id} · {tk.priority}</span>
        </Card>
      ))}
    </Section>
  )
}

// ── Shared atoms ───────────────────────────────────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 2px', fontSize: 18, color: t.ink }}>{title}</h2>
      {subtitle && <p style={{ margin: '0 0 16px', fontSize: 13, color: t.muted }}>{subtitle}</p>}
      {children}
    </div>
  )
}
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: t.surface, border: `1px solid ${t.border}`, borderRadius: t.radius,
      padding: 14, marginBottom: 10,
    }}>{children}</div>
  )
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 2 }}>{children}</div>
}
function Tag({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
      backgroundColor: t.ground, color: color ?? t.muted, textTransform: 'capitalize',
    }}>{children}</span>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 12, color: t.muted, marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  )
}
const input: React.CSSProperties = {
  width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${t.border}`,
  fontSize: 14, color: t.ink, backgroundColor: t.surface, boxSizing: 'border-box', marginBottom: 0,
}
function Loading() { return <p style={{ color: t.muted, fontSize: 14 }}>Loading…</p> }
function ErrorMsg({ msg }: { msg: string }) { return <p style={{ color: t.lost, fontSize: 14 }}>{msg}</p> }
function Empty({ msg }: { msg: string }) { return <p style={{ color: t.muted, fontSize: 14 }}>{msg}</p> }
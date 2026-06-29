// components/customer/CustomerWorkspace.tsx
// The Customer 360 "workspace" — one screen that holds a customer's whole story.
// Two ways to use it:
//   <CustomerWorkspace workspace={DEMO_WORKSPACE} />   // instant preview, no backend
//   <CustomerWorkspace accountId={id} onBack={...} />  // fetches the real workspace
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, Search, Phone, Mail, Calendar, MapPin, FileText, Clock,
  Download, Shield, TrendingUp, Building, Briefcase, Zap, ChevronRight,
  Upload, Plus, X, Trash2, Loader, Eye,
} from 'lucide-react'
import { t } from '../../lib/tokens'

// One-time spin keyframes for loader icons (kept local; no global CSS edits).
if (typeof document !== 'undefined' && !document.getElementById('vault-spin-kf')) {
  const _s = document.createElement('style')
  _s.id = 'vault-spin-kf'
  _s.textContent = '@keyframes vaultspin{to{transform:rotate(360deg)}} .spin{animation:vaultspin .8s linear infinite}'
  document.head.appendChild(_s)
}
import { useIsMobile } from '../../hooks/useIsMobile'
import { vaultApi, type Workspace, type Contact, type Poc, type DocItem, type TimelineEvent, type VaultDoc, type DocMeta } from '../../lib/vaultApi'

// ---------- label / colour maps ---------------------------------------------
const ROLE_META: Record<string, { label: string; bg: string; fg: string }> = {
  decision_maker:      { label: 'Decision maker',      bg: '#EAF3EC', fg: '#1F4E2E' },
  influencer:          { label: 'Influencer',          bg: '#EEF1F6', fg: '#3A4A66' },
  technical_evaluator: { label: 'Technical evaluator', bg: '#EEF1F6', fg: '#3A4A66' },
  procurement:         { label: 'Procurement',         bg: '#FBF1DC', fg: '#7A5A12' },
  finance:             { label: 'Finance',             bg: '#FBF1DC', fg: '#7A5A12' },
  plant_head:          { label: 'Plant head',          bg: '#EEF1F6', fg: '#3A4A66' },
  sustainability:      { label: 'Sustainability',      bg: '#EAF3EC', fg: '#1F4E2E' },
  operations:          { label: 'Operations',          bg: '#EEF1F6', fg: '#3A4A66' },
  champion:            { label: 'Champion',            bg: '#F6ECCF', fg: '#8A6A12' },
  blocker:             { label: 'Blocker',             bg: '#F7E4E0', fg: '#B23A2E' },
}
const CONTACT_STATUS: Record<string, { label: string; fg: string }> = {
  active:      { label: 'Active',      fg: '#3B9D6E' },
  inactive:    { label: 'Inactive',    fg: '#9A968B' },
  transferred: { label: 'Transferred', fg: '#C9881F' },
  retired:     { label: 'Retired',     fg: '#9A968B' },
  unknown:     { label: 'Unknown',     fg: '#9A968B' },
}
const TEAM_ROLE: Record<string, string> = {
  executive_sponsor: 'Executive sponsor', sales_owner: 'Sales owner',
  technical_owner: 'Technical owner', field_engineer: 'Field engineer',
  greenvision_owner: 'GreenVision owner', operations_owner: 'Operations owner',
  service_owner: 'Service owner', proposal_owner: 'Proposal owner', reporting_owner: 'Reporting owner',
}
const POC_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  planned:    { label: 'Planned',    bg: '#EEF1F6', fg: '#3A4A66' },
  installing: { label: 'Installing', bg: '#FBF1DC', fg: '#7A5A12' },
  monitoring: { label: 'Monitoring', bg: '#EAF3EC', fg: '#1F4E2E' },
  completed:  { label: 'Completed',  bg: '#EAF3EC', fg: '#2D7A4F' },
  aborted:    { label: 'Aborted',    bg: '#F7E4E0', fg: '#B23A2E' },
}
const DOC_CATEGORY: Record<string, string> = {
  nda: 'NDA', proposal: 'Proposal', poc_proposal: 'POC proposal', site_survey: 'Site survey',
  installation_report: 'Installation report', test_data: 'Test data', fuel_log: 'Fuel log',
  emission_report: 'Emission report', nabl_report: 'NABL report', customer_report: 'Customer report',
  commercial_proposal: 'Commercial proposal', purchase_order: 'Purchase order', invoice: 'Invoice',
  service_report: 'Service report', case_study: 'Case study', meeting_notes: 'Meeting notes',
  customer_feedback: 'Customer feedback', internal_review: 'Internal review', legal_compliance: 'Legal / compliance', other: 'Other',
}
const CONF_FG: Record<string, string> = {
  public: '#3B9D6E', internal: '#6A675F', confidential: '#C9881F', restricted: '#B23A2E',
}
const EVENT_TONE: Record<string, string> = {
  order_received: t.gold, asset_commissioned: t.gold,
  issue_raised: '#B23A2E', issue_closed: '#3B9D6E',
  poc_approved: '#2D7A4F', installation_completed: '#2D7A4F', report_submitted: '#2D7A4F',
}
function eventTone(type: string) { return EVENT_TONE[type] ?? t.green2 }

// ---------- formatters -------------------------------------------------------
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtSize(b: number | null): string {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}
function titleCase(s: string | null): string {
  if (!s) return '—'
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ---------- tiny presentational helpers --------------------------------------
function Chip({ label, bg, fg }: { label: string; bg?: string; fg: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 11, fontWeight: 600, letterSpacing: '0.01em',
      padding: '3px 8px', borderRadius: 999,
      background: bg ?? 'transparent', color: fg,
      border: bg ? 'none' : `1px solid ${fg}55`,
    }}>{label}</span>
  )
}
function Empty({ text }: { text: string }) {
  return (
    <div style={{
      padding: '36px 16px', textAlign: 'center', color: t.muted, fontSize: 13,
      border: `1px dashed ${t.border}`, borderRadius: t.radius, background: t.surface,
    }}>{text}</div>
  )
}
function Card({ children, pad = 16 }: { children: React.ReactNode; pad?: number }) {
  return (
    <div style={{
      background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.radius,
      padding: pad, boxShadow: '0 1px 2px rgba(22,22,20,0.03)',
    }}>{children}</div>
  )
}

// derive a short, data-driven snapshot line (placeholder for the future AI summary)
function snapshot(ws: Workspace): string {
  const parts: string[] = []
  const champ = ws.contacts.find((c) => c.roleInProject === 'champion' && c.status === 'active')
  const lead = ws.pocs[0]
  parts.push(`${ws.stats.pocs} POC${ws.stats.pocs === 1 ? '' : 's'}, ${ws.stats.documents} document${ws.stats.documents === 1 ? '' : 's'} on record.`)
  if (lead) {
    const rating = lead.ratingValue ? `${lead.ratingValue} ${lead.ratingUnit ?? ''}`.trim() : ''
    const sv = lead.savingsPct != null ? ` showing ~${lead.savingsPct}% savings` : ''
    parts.push(`Latest: ${lead.product}${rating ? ` on ${rating} ${titleCase(lead.application)}` : ''}${sv}.`)
  }
  if (champ) parts.push(`Champion: ${champ.name}.`)
  if (ws.stats.openIssues > 0) parts.push(`${ws.stats.openIssues} open issue${ws.stats.openIssues === 1 ? '' : 's'}.`)
  return parts.join(' ')
}

type TabKey = 'overview' | 'timeline' | 'contacts' | 'team' | 'pocs' | 'documents' | 'sites'

interface Props {
  accountId?: string
  workspace?: Workspace
  onBack?: () => void
}

export default function CustomerWorkspace({ accountId, workspace, onBack }: Props) {
  const isMobile = useIsMobile()
  const [ws, setWs] = useState<Workspace | null>(workspace ?? null)
  const [loading, setLoading] = useState(!workspace)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('overview')
  const [docQuery, setDocQuery] = useState('')

  useEffect(() => {
    if (workspace || !accountId) return
    setLoading(true); setError(null)
    vaultApi.getWorkspace(accountId)
      .then(setWs)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [accountId, workspace])

  if (loading) return <Centered text="Loading workspace…" />
  if (error) return <Centered text={error} tone="#B23A2E" />
  if (!ws) return <Centered text="No workspace to show." />

  const a = ws.account
  const statusFg = a.customerStatus === 'active' ? '#7FE3A6' : '#E6D9A8'

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'timeline', label: 'Timeline', count: ws.timeline.length },
    { key: 'contacts', label: 'Contacts', count: ws.contacts.length },
    { key: 'team', label: 'SGT team', count: ws.team.length },
    { key: 'pocs', label: 'POCs', count: ws.pocs.length },
    { key: 'documents', label: 'Documents', count: ws.documents.length },
    { key: 'sites', label: 'Sites', count: ws.sites.length },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: t.ground }}>
      {/* ---- Hero: customer identity (the one bold band) ---- */}
      <div style={{
        background: 'linear-gradient(135deg, #1F4E2E 0%, #16391F 100%)',
        color: '#fff', padding: isMobile ? '16px 16px 18px' : '20px 28px 22px',
        flexShrink: 0, position: 'relative',
      }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: t.gold }} />
        {onBack && (
          <button onClick={onBack} style={{
            background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff',
            display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            fontSize: 12.5, fontWeight: 600, padding: '5px 10px', borderRadius: 6, marginBottom: 14,
          }}><ArrowLeft size={14} /> All customers</button>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{
              margin: 0, fontSize: isMobile ? 22 : 27, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1,
            }}>{a.name}</h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
              {a.industry && <Chip label={a.industry} fg="#CDEBD7" />}
              <Chip label={titleCase(a.customerStatus)} fg={statusFg} />
              {a.location && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#BFE0C9' }}>
                  <MapPin size={12} /> {a.location}
                </span>
              )}
              {a.erpnextId && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#BFE0C9' }}>
                  <Building size={12} /> ERP linked
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---- Stat strip ---- */}
      <div style={{
        display: 'grid', gap: 8, padding: isMobile ? '12px 12px 0' : '14px 28px 0',
        gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)', flexShrink: 0,
      }}>
        <Stat n={ws.stats.pocs} label="POCs" />
        <Stat n={ws.stats.activePocs} label="Active" accent={t.green2} />
        <Stat n={ws.stats.documents} label="Documents" />
        <Stat n={ws.stats.openIssues} label="Open issues" accent={ws.stats.openIssues > 0 ? '#B23A2E' : undefined} />
        <Stat n={ws.stats.contacts} label="Contacts" />
        <Stat n={ws.stats.sites} label="Sites" />
      </div>

      {/* ---- Tabs ---- */}
      <div style={{
        display: 'flex', gap: 2, padding: isMobile ? '12px 8px 0' : '14px 28px 0',
        overflowX: 'auto', flexShrink: 0,
      }}>
        {tabs.map((tb) => {
          const active = tab === tb.key
          return (
            <button key={tb.key} onClick={() => setTab(tb.key)} style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              padding: '8px 12px 10px', whiteSpace: 'nowrap',
              fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? t.green : t.muted,
              borderBottom: `2px solid ${active ? t.green : 'transparent'}`,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {tb.label}
              {tb.count != null && (
                <span style={{
                  fontSize: 10.5, fontWeight: 700, color: active ? t.green : t.muted,
                  background: active ? '#EAF3EC' : '#EFEcE2', borderRadius: 999, padding: '1px 6px',
                }}>{tb.count}</span>
              )}
            </button>
          )
        })}
      </div>
      <div style={{ height: 1, background: t.border, flexShrink: 0 }} />

      {/* ---- Body ---- */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isMobile ? 14 : '20px 28px 40px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          {tab === 'overview' && <Overview ws={ws} isMobile={isMobile} onSeeAll={setTab} />}
          {tab === 'timeline' && <Timeline events={ws.timeline} />}
          {tab === 'contacts' && <Contacts contacts={ws.contacts} />}
          {tab === 'team' && <Team team={ws.team} />}
          {tab === 'pocs' && <Pocs pocs={ws.pocs} />}
          {tab === 'documents' && <Documents accountId={ws.account.id} initialDocs={ws.documents} q={docQuery} setQ={setDocQuery} />}
          {tab === 'sites' && <Sites sites={ws.sites} />}
        </div>
      </div>
    </div>
  )
}

// ---------- sub-sections -----------------------------------------------------
function Centered({ text, tone = t.muted }: { text: string; tone?: string }) {
  return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: tone, fontSize: 13 }}>{text}</div>
}
function Stat({ n, label, accent }: { n: number; label: string; accent?: string }) {
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.radius, padding: '10px 12px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ?? t.ink, letterSpacing: '-0.02em' }}>{n}</div>
      <div style={{ fontSize: 10.5, color: t.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{label}</div>
    </div>
  )
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: t.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{children}</div>
}

function Overview({ ws, isMobile, onSeeAll }: { ws: Workspace; isMobile: boolean; onSeeAll: (t: TabKey) => void }) {
  const champions = ws.contacts.filter((c) => (c.roleInProject === 'champion' || c.roleInProject === 'decision_maker') && c.status === 'active').slice(0, 3)
  const recent = ws.timeline.slice(0, 6)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1fr', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <Zap size={15} color={t.gold} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: t.ink }}>Snapshot</span>
          </div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: '#39362F' }}>{snapshot(ws)}</p>
          <div style={{ marginTop: 10, fontSize: 11.5, color: t.muted }}>
            Auto-summarised from records. AI summary lands in a later round.
          </div>
        </Card>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <SectionLabel>Active POCs</SectionLabel>
            <SeeAll onClick={() => onSeeAll('pocs')} />
          </div>
          {ws.pocs.length === 0 ? <Empty text="No POCs yet. Create one to start tracking a trial." />
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{ws.pocs.slice(0, 3).map((p) => <PocCard key={p.id} p={p} compact />)}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <SectionLabel>Recent activity</SectionLabel>
            <SeeAll onClick={() => onSeeAll('timeline')} />
          </div>
          {recent.length === 0 ? <Empty text="No activity recorded yet." /> : <TimelineRail events={recent} />}
        </div>
        <div>
          <SectionLabel>Key people</SectionLabel>
          {champions.length === 0 ? <Empty text="No key contacts flagged yet." />
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{champions.map((c) => <MiniContact key={c.id} c={c} />)}</div>}
        </div>
      </div>
    </div>
  )
}
function SeeAll({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer', color: t.green2,
      fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2,
    }}>See all <ChevronRight size={13} /></button>
  )
}
function MiniContact({ c }: { c: Contact }) {
  const rm = c.roleInProject ? ROLE_META[c.roleInProject] : undefined
  return (
    <Card pad={11}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.ink }}>{c.name}</div>
          <div style={{ fontSize: 11.5, color: t.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {[c.designation, c.department].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
        {rm && <Chip label={rm.label} bg={rm.bg} fg={rm.fg} />}
      </div>
    </Card>
  )
}

function TimelineRail({ events }: { events: TimelineEvent[] }) {
  return (
    <div style={{ position: 'relative', paddingLeft: 18 }}>
      <div style={{ position: 'absolute', left: 5, top: 4, bottom: 4, width: 2, background: t.border }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {events.map((e) => (
          <div key={e.id} style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: -17, top: 3, width: 10, height: 10, borderRadius: '50%',
              background: eventTone(e.eventType), border: '2px solid #fff', boxShadow: `0 0 0 1px ${t.border}`,
            }} />
            <div style={{ fontSize: 12.5, fontWeight: 600, color: t.ink }}>{e.title}</div>
            {e.body && <div style={{ fontSize: 12, color: '#54514A', marginTop: 1 }}>{e.body}</div>}
            <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>{fmtDate(e.occurredAt)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <Empty text="No events yet. Activity will appear here automatically as the relationship progresses." />
  return <Card><TimelineRail events={events} /></Card>
}

function Contacts({ contacts }: { contacts: Contact[] }) {
  if (contacts.length === 0) return <Empty text="No contacts yet. Add the people on the customer side so this memory survives staff changes." />
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
      {contacts.map((c) => {
        const rm = c.roleInProject ? ROLE_META[c.roleInProject] : undefined
        const st = CONTACT_STATUS[c.status] ?? CONTACT_STATUS.unknown
        const dim = c.status !== 'active'
        return (
          <Card key={c.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, opacity: dim ? 0.7 : 1 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.ink }}>{c.name}</div>
                <div style={{ fontSize: 12, color: t.muted, marginTop: 1 }}>{[c.designation, c.department].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: st.fg, whiteSpace: 'nowrap' }}>{st.label}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {rm && <Chip label={rm.label} bg={rm.bg} fg={rm.fg} />}
            </div>
            {(c.email || c.phone) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
                {c.email && <Line icon={<Mail size={12} />} text={c.email} />}
                {c.phone && <Line icon={<Phone size={12} />} text={c.phone} />}
              </div>
            )}
            {(c.periodFrom || c.notes) && (
              <div style={{ borderTop: `1px solid ${t.border}`, marginTop: 10, paddingTop: 8 }}>
                {c.periodFrom && <Line icon={<Calendar size={12} />} text={`Since ${fmtDate(c.periodFrom)}${c.periodTo ? ` · until ${fmtDate(c.periodTo)}` : ''}`} />}
                {c.notes && <div style={{ fontSize: 12, color: '#54514A', marginTop: 6, lineHeight: 1.45 }}>{c.notes}</div>}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
function Line({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#54514A' }}>
      <span style={{ color: t.muted, display: 'inline-flex' }}>{icon}</span>{text}
    </div>
  )
}

function Team({ team }: { team: Workspace['team'] }) {
  if (team.length === 0) return <Empty text="No SGT team assigned yet. Record who owns this account so handovers don't lose context." />
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
      {team.map((m) => (
        <Card key={m.id} pad={13}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', background: '#EAF3EC', color: t.green,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, flexShrink: 0,
            }}>{m.memberName.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.memberName}</div>
              <div style={{ fontSize: 11.5, color: t.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Briefcase size={11} /> {TEAM_ROLE[m.teamRole] ?? titleCase(m.teamRole)}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

function Pocs({ pocs }: { pocs: Poc[] }) {
  if (pocs.length === 0) return <Empty text="No POCs yet. Each trial gets its own record — equipment, baseline, readings, and result." />
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{pocs.map((p) => <PocCard key={p.id} p={p} />)}</div>
}
function PocCard({ p, compact }: { p: Poc; compact?: boolean }) {
  const st = POC_STATUS[p.status] ?? { label: titleCase(p.status), bg: '#EEF1F6', fg: '#3A4A66' }
  const rating = p.ratingValue ? `${p.ratingValue} ${p.ratingUnit ?? ''}`.trim() : null
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: t.ink }}>{p.product}</span>
            <span style={{ fontSize: 11, color: t.muted, fontWeight: 600 }}>{p.displayId}</span>
            <Chip label={st.label} bg={st.bg} fg={st.fg} />
          </div>
          <div style={{ fontSize: 12.5, color: '#54514A', marginTop: 4 }}>
            {[titleCase(p.application), rating, [p.equipmentMake, p.equipmentModel].filter(Boolean).join(' '), p.fuelType ? titleCase(p.fuelType) : null].filter(Boolean).join(' · ')}
          </div>
        </div>
        {p.savingsPct != null && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, background: '#EAF3EC', color: t.green,
            borderRadius: 8, padding: '6px 10px', fontWeight: 700, fontSize: 14,
          }}><TrendingUp size={15} /> {p.savingsPct}%</div>
        )}
      </div>
      {!compact && (p.finalResult || p.recommendedNextStep) && (
        <div style={{ borderTop: `1px solid ${t.border}`, marginTop: 12, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {p.finalResult && <KeyVal k="Result" v={p.finalResult} />}
          {p.recommendedNextStep && <KeyVal k="Next step" v={p.recommendedNextStep} icon={<ChevronRight size={13} color={t.gold} />} />}
          {(p.startDate || p.endDate) && (
            <div style={{ fontSize: 11.5, color: t.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Clock size={12} /> {fmtDate(p.startDate)}{p.endDate ? ` → ${fmtDate(p.endDate)}` : ''}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
function KeyVal({ k, v, icon }: { k: string; v: string; icon?: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
      <span style={{ fontWeight: 700, color: t.ink, marginRight: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}>{icon}{k}</span>
      <span style={{ color: '#54514A' }}>{v}</span>
    </div>
  )
}

function Documents({ accountId, initialDocs, q, setQ }: {
  accountId: string
  initialDocs: DocItem[]
  q: string
  setQ: (s: string) => void
}) {
  // Manage our own list so it refreshes after an upload. Seed from the workspace.
  const [docs, setDocs] = useState<VaultDoc[]>(() =>
    initialDocs.map((d) => ({
      id: d.id, displayId: '', category: d.category, title: d.title,
      description: null, confidentiality: d.confidentiality, tags: [],
      currentVersion: d.currentVersion, fileName: d.fileName, mimeType: null,
      sizeBytes: d.sizeBytes, uploadedByName: d.uploadedByName ?? null,
      createdAt: d.createdAt, ready: d.currentVersion >= 1,
    })),
  )
  const [showAdd, setShowAdd] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)

  const refresh = () => { vaultApi.listDocuments(accountId).then(setDocs).catch(() => {}) }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return docs
    return docs.filter((d) =>
      (d.fileName ?? '').toLowerCase().includes(needle) ||
      d.title.toLowerCase().includes(needle) ||
      (DOC_CATEGORY[d.category] ?? d.category).toLowerCase().includes(needle))
  }, [docs, q])

  // Download: fetch bytes WITH auth, then save via a temporary object URL.
  async function download(id: string) {
    setDownloading(id)
    try {
      const { blob, fileName } = await vaultApi.fetchDocBlob(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName || 'document'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Download failed')
    } finally { setDownloading(null) }
  }

  // Preview: fetch bytes WITH auth, open inline in a new tab (PDF/image render
  // in the browser; other types fall back to the browser's default handling).
  async function preview(id: string) {
    setPreviewing(id)
    try {
      const { blob } = await vaultApi.fetchDocBlob(id)
      const url = URL.createObjectURL(blob)
      const w = window.open(url, '_blank')
      if (!w) { // popup blocked — fall back to same-tab
        window.location.href = url
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Preview failed')
    } finally { setPreviewing(null) }
  }

  async function remove(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This can’t be undone from here.`)) return
    try { await vaultApi.deleteDocument(id); setDocs((ds) => ds.filter((d) => d.id !== id)) }
    catch (e) { alert(e instanceof Error ? e.message : 'Delete failed') }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 380 }}>
          <Search size={15} color={t.muted} style={{ position: 'absolute', left: 11, top: 10 }} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents by file name…"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 34px',
              border: `1px solid ${t.border}`, borderRadius: 8, fontSize: 13, background: t.surface, color: t.ink,
            }} />
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px',
            border: 'none', borderRadius: 8, background: t.green, color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
          <Plus size={15} /> Add document
        </button>
      </div>

      {docs.length === 0 ? <Empty text="No documents yet. Add the first one with the button above." />
        : filtered.length === 0 ? <Empty text={`No documents match “${q}”.`} />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((d) => (
              <Card key={d.id} pad={12}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 8, background: '#F1EEE4', color: t.green,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}><FileText size={16} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</div>
                    <div style={{ fontSize: 11.5, color: t.muted, display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                      <span>{DOC_CATEGORY[d.category] ?? d.category}</span>
                      {d.fileName && <span>· {d.fileName}</span>}
                      {d.sizeBytes ? <span>· {fmtSize(d.sizeBytes)}</span> : null}
                    </div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: CONF_FG[d.confidentiality] ?? t.muted }}>
                    <Shield size={12} /> {titleCase(d.confidentiality)}
                  </span>
                  <button
                    onClick={() => preview(d.id)} disabled={!d.ready || previewing === d.id}
                    title={d.ready ? 'Preview' : 'Upload still finishing'}
                    style={{ border: 'none', background: 'transparent', cursor: d.ready ? 'pointer' : 'not-allowed', color: d.ready ? t.muted : t.border, display: 'inline-flex' }}>
                    {previewing === d.id ? <Loader size={16} className="spin" /> : <Eye size={16} />}
                  </button>
                  <button
                    onClick={() => download(d.id)} disabled={!d.ready || downloading === d.id}
                    title={d.ready ? 'Download' : 'Upload still finishing'}
                    style={{ border: 'none', background: 'transparent', cursor: d.ready ? 'pointer' : 'not-allowed', color: d.ready ? t.green : t.border, display: 'inline-flex' }}>
                    {downloading === d.id ? <Loader size={16} className="spin" /> : <Download size={16} />}
                  </button>
                  <button
                    onClick={() => remove(d.id, d.title)} title="Delete"
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.muted, display: 'inline-flex' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}

      {showAdd && (
        <AddDocumentModal
          accountId={accountId}
          onClose={() => setShowAdd(false)}
          onDone={() => { setShowAdd(false); refresh() }}
        />
      )}
    </div>
  )
}
function Sites({ sites }: { sites: Workspace['sites'] }) {
  if (sites.length === 0) return <Empty text="No sites yet. Add the plants and locations where assets live." />
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
      {sites.map((s) => (
        <Card key={s.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={15} color={t.green2} />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: t.ink }}>{s.name}</span>
          </div>
          <div style={{ fontSize: 12, color: t.muted, marginTop: 6 }}>
            {[titleCase(s.siteType), [s.city, s.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
          </div>
          {s.latitude != null && s.longitude != null && (
            <div style={{ fontSize: 11.5, color: t.muted, marginTop: 4 }}>{s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}</div>
          )}
        </Card>
      ))}
    </div>
  )
}

// =============================================================================
// DEMO_WORKSPACE — lets you preview the look with no backend:
//   <CustomerWorkspace workspace={DEMO_WORKSPACE} />
// Mirrors what seed_vault_demo.ts inserts, so the preview matches real data.
// =============================================================================
// ---- Add Document modal -----------------------------------------------------

function AddDocumentModal({ accountId, onClose, onDone }: {
  accountId: string
  onClose: () => void
  onDone: () => void
}) {
  const [meta, setMeta] = useState<DocMeta | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('other')
  const [confidentiality, setConfidentiality] = useState('internal')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => { vaultApi.getDocMeta().then(setMeta).catch(() => {}) }, [])

  function pick(f: File | null) {
    if (!f) return
    setFile(f)
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  async function submit() {
    if (!file) { setError('Choose a file first.'); return }
    if (!title.trim()) { setError('Give the document a title.'); return }
    setBusy(true); setError(null)
    try {
      await vaultApi.uploadDocument(
        { accountId, category, title: title.trim(), description: description.trim() || undefined, confidentiality },
        file,
      )
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
      setBusy(false)
    }
  }

  const cats = meta?.categories ?? ['other']
  const confs = meta?.confidentiality ?? ['internal']

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 300 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 'min(520px, 100%)', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 16px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: t.green }}>Add document</div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.muted, display: 'inline-flex' }}><X size={18} /></button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* drop zone */}
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files?.[0] ?? null) }}
            style={{
              border: `2px dashed ${dragOver ? t.green : t.border}`, borderRadius: 12, padding: '22px 16px',
              textAlign: 'center', cursor: 'pointer', background: dragOver ? '#F2F8F4' : t.surface, display: 'block',
            }}>
            <input type="file" style={{ display: 'none' }} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            <Upload size={22} color={t.green} />
            <div style={{ fontSize: 13, color: t.ink, marginTop: 8, fontWeight: 600 }}>
              {file ? file.name : 'Drop a file here or click to choose'}
            </div>
            <div style={{ fontSize: 11.5, color: t.muted, marginTop: 3 }}>
              {file ? fmtSize(file.size) : 'PDF, images, reports — up to a few MB'}
            </div>
          </label>

          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Signed NDA – March 2026"
              style={inputStyle} />
          </Field>

          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="Category" grow>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
                {cats.map((c) => <option key={c} value={c}>{DOC_CATEGORY[c] ?? c}</option>)}
              </select>
            </Field>
            <Field label="Confidentiality" grow>
              <select value={confidentiality} onChange={(e) => setConfidentiality(e.target.value)} style={inputStyle}>
                {confs.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Description (optional)">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              placeholder="Any notes about this document…"
              style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>

          {error && <div style={{ fontSize: 12.5, color: '#C84A3A' }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: `1px solid ${t.border}` }}>
          <button onClick={onClose} disabled={busy}
            style={{ padding: '9px 16px', border: `1px solid ${t.border}`, borderRadius: 8, background: '#fff', color: t.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={busy}
            style={{ padding: '9px 18px', border: 'none', borderRadius: 8, background: t.green, color: '#fff', fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            {busy ? <><Loader size={14} className="spin" /> Uploading…</> : <>Upload</>}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 11px',
  border: '1px solid #DDD7C6', borderRadius: 8, fontSize: 13, background: '#fff', color: '#161614',
}

function Field({ label, children, grow }: { label: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <div style={{ flex: grow ? 1 : undefined, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6A675F', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  )
}

export const DEMO_WORKSPACE: Workspace = {
  account: { id: 'demo', name: "Dr Reddy's Laboratories", industry: 'Pharmaceuticals', customerStatus: 'active', location: 'Hyderabad, Telangana', website: 'https://www.drreddys.com', erpnextId: 'CUST-0042', gstin: '36AAACR1234F1Z5' },
  stats: { pocs: 1, activePocs: 1, documents: 5, openIssues: 0, contacts: 4, sites: 1, lastActivityAt: '2025-12-10' },
  sites: [{ id: 's1', name: 'Bollaram API Plant', siteType: 'plant', address: 'Bollaram, Sangareddy', city: 'Hyderabad', state: 'Telangana', country: 'India', status: 'active', latitude: 17.535, longitude: 78.347 }],
  contacts: [
    { id: 'c1', name: 'Sunil Patkar', designation: 'VP Engineering', department: 'Utilities', email: 'sunil.patkar@drreddys-demo.com', phone: '+91 98480 11122', roleInProject: 'champion', status: 'active', periodFrom: '2025-08-01', periodTo: null, notes: 'Drove the POC internally; strong advocate.' },
    { id: 'c2', name: 'Meera Iyer', designation: 'Head – Sustainability', department: 'ESG', email: 'meera.iyer@drreddys-demo.com', phone: '+91 98490 33344', roleInProject: 'decision_maker', status: 'active', periodFrom: '2025-08-01', periodTo: null, notes: 'Signs off on emission-linked initiatives.' },
    { id: 'c3', name: 'R. Krishnan', designation: 'Sr. Manager', department: 'Procurement', email: 'r.krishnan@drreddys-demo.com', phone: null, roleInProject: 'procurement', status: 'active', periodFrom: '2025-09-15', periodTo: null, notes: 'Cautious on commercials; needs ROI proof.' },
    { id: 'c4', name: 'Anand Rao', designation: 'Plant Head', department: 'Operations', email: 'anand.rao@drreddys-demo.com', phone: null, roleInProject: 'plant_head', status: 'transferred', periodFrom: '2025-08-01', periodTo: '2026-02-01', notes: 'Moved to another site — kept for history.' },
  ],
  team: [
    { id: 'm1', memberName: 'Aryan Bhasein', teamRole: 'executive_sponsor', active: true, periodFrom: null, periodTo: null, notes: null },
    { id: 'm2', memberName: 'Ajinkya Kale', teamRole: 'sales_owner', active: true, periodFrom: null, periodTo: null, notes: null },
    { id: 'm3', memberName: 'Field Team – South', teamRole: 'field_engineer', active: true, periodFrom: null, periodTo: null, notes: null },
    { id: 'm4', memberName: 'GreenVision Ops', teamRole: 'greenvision_owner', active: true, periodFrom: null, periodTo: null, notes: null },
  ],
  pocs: [{
    id: 'p1', displayId: 'POC-1001', product: 'GreenDrive', application: 'dg', equipmentMake: 'Cummins', equipmentModel: 'C500D5',
    ratingValue: 500, ratingUnit: 'kVA', fuelType: 'diesel', status: 'monitoring', savingsPct: 8.4,
    startDate: '2025-10-16', endDate: null,
    finalResult: 'Baseline 212 L/day; trial avg 194 L/day. ~8.4% diesel reduction, NOx down ~11%.',
    recommendedNextStep: 'Extend to 2 more DG sets at Bollaram; prepare commercial proposal.',
  }],
  documents: [
    { id: 'd1', displayId: 'DOC-1001', category: 'nda', title: 'Mutual NDA — Dr Reddy x SGT', confidentiality: 'confidential', currentVersion: 1, uploadedByName: 'Ajinkya Kale', createdAt: '2025-08-20', fileName: 'NDA_DrReddy_SGT_signed.pdf', sizeBytes: 184320 },
    { id: 'd2', displayId: 'DOC-1002', category: 'poc_proposal', title: 'POC Proposal — 500 kVA DG (Bollaram)', confidentiality: 'internal', currentVersion: 1, uploadedByName: 'Ajinkya Kale', createdAt: '2025-10-02', fileName: 'POC_Proposal_DrReddy_500kVA.pdf', sizeBytes: 542000 },
    { id: 'd3', displayId: 'DOC-1003', category: 'installation_report', title: 'Installation Report — DG-2', confidentiality: 'internal', currentVersion: 1, uploadedByName: 'Ajinkya Kale', createdAt: '2025-10-16', fileName: 'Install_Report_DG2.pdf', sizeBytes: 921600 },
    { id: 'd4', displayId: 'DOC-1004', category: 'emission_report', title: 'Emission Test — NOx Baseline vs Trial', confidentiality: 'confidential', currentVersion: 1, uploadedByName: 'Ajinkya Kale', createdAt: '2025-12-01', fileName: 'Emission_NOx_DrReddy.pdf', sizeBytes: 410000 },
    { id: 'd5', displayId: 'DOC-1005', category: 'fuel_log', title: 'Fuel Log — Oct–Nov trial', confidentiality: 'internal', currentVersion: 1, uploadedByName: 'Ajinkya Kale', createdAt: '2025-11-30', fileName: 'Fuel_Log_OctNov.xlsx', sizeBytes: 78000 },
  ],
  timeline: [
    { id: 't10', eventType: 'customer_feedback_received', title: 'Customer feedback', body: 'Positive; awaiting procurement', occurredAt: '2025-12-10', source: 'system', actorName: 'System' },
    { id: 't9', eventType: 'report_submitted', title: 'Interim report submitted', body: '8.4% diesel, 11% NOx reduction', occurredAt: '2025-12-02', source: 'system', actorName: 'System' },
    { id: 't8', eventType: 'monitoring_started', title: 'Monitoring started', body: 'GreenVision telemetry live', occurredAt: '2025-10-17', source: 'system', actorName: 'System' },
    { id: 't7', eventType: 'installation_completed', title: 'Installation completed', body: 'GreenDrive fitted on DG-2', occurredAt: '2025-10-16', source: 'system', actorName: 'System' },
    { id: 't6', eventType: 'poc_approved', title: 'POC approved', body: 'Utilities + Sustainability approved', occurredAt: '2025-10-10', source: 'system', actorName: 'System' },
    { id: 't5', eventType: 'poc_proposal_sent', title: 'POC proposal sent', body: '60-day trial on DG-2', occurredAt: '2025-10-02', source: 'system', actorName: 'System' },
    { id: 't4', eventType: 'site_survey', title: 'Site survey', body: 'Surveyed 500 kVA Cummins set', occurredAt: '2025-09-22', source: 'system', actorName: 'System' },
    { id: 't3', eventType: 'technical_meeting', title: 'Technical meeting', body: 'Reviewed DG fleet at Bollaram', occurredAt: '2025-09-05', source: 'system', actorName: 'System' },
    { id: 't2', eventType: 'nda_signed', title: 'NDA signed', body: 'Mutual NDA executed', occurredAt: '2025-08-20', source: 'system', actorName: 'System' },
    { id: 't1', eventType: 'lead_created', title: 'Lead created', body: 'Inbound interest in DG fuel reduction', occurredAt: '2025-08-01', source: 'system', actorName: 'System' },
  ],
}
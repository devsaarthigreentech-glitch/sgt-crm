// Partner onboarding (P4) — registration list + multi-section form.
//
// Two behaviours worth knowing before reading:
//
//  • Drafts autosave. Every edit debounces into a PATCH, which the server
//    accepts without validation. A half-filled form is always saveable, so
//    the user can leave and come back.
//  • Validation only happens on submit, and comes back as a field map. The
//    server is the single source of truth — there is no second copy of the
//    required-field matrix here, deliberately. This screen just renders
//    whatever it is told is wrong.
//
// Inline styles only, per house convention.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Plus, Check, AlertCircle, Trash2, X, RefreshCw } from 'lucide-react'
import OrgDetailScreen from './OrgDetailScreen'
import {
  onboardingApi, ValidationError,
  type Reference, type Registration, type GstinInspection, type PartnerOrg,
  type RegContact,
} from './onboardingApi'

const PAPER = '#ECE8DA'
const INK = '#161614'
const MUTED = '#6A675F'
const LINE = '#DDD7C6'
const FAINT = '#A39F94'
const DANGER = '#A6301C'
const OK = '#2F6B4F'

type Form = Record<string, any>

// Applications in these states need nothing further from a director. They
// stay visible behind a toggle — an approved one is the record of how a
// partner came to exist — but they should not clutter the queue.
const CLOSED_STATUSES = ['approved', 'rejected', 'withdrawn']

const STATUS_COLOURS: Record<string, { bg: string; fg: string }> = {
  draft: { bg: '#EFEADC', fg: '#6A675F' },
  submitted: { bg: '#DDE8F0', fg: '#1F4E6B' },
  under_review: { bg: '#F5E0CC', fg: '#6F2F0E' },
  approved: { bg: '#DCEBE1', fg: '#2F6B4F' },
  rejected: { bg: '#F3DAD5', fg: '#A6301C' },
  withdrawn: { bg: '#EDEDEA', fg: '#6A675F' },
}

// ---------------------------------------------------------------------------
// Small field primitives. Local to this screen — not worth a shared module yet.
// ---------------------------------------------------------------------------

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 5, letterSpacing: '0.01em' }}>
      {children}{required && <span style={{ color: DANGER }}> *</span>}
    </label>
  )
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11.5, color: DANGER }}>
      <AlertCircle size={12} /> {msg}
    </div>
  )
}

const inputStyle = (bad?: boolean): React.CSSProperties => ({
  width: '100%', boxSizing: 'border-box',
  padding: '9px 10px', fontSize: 13.5, color: INK,
  backgroundColor: '#fff',
  border: `1px solid ${bad ? DANGER : LINE}`,
  borderRadius: 6, outline: 'none',
  fontFamily: 'inherit',
})

function Text({
  label, value, onChange, error, required, placeholder, type = 'text',
}: {
  label: string; value: any; onChange: (v: string) => void
  error?: string; required?: boolean; placeholder?: string; type?: string
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Label required={required}>{label}</Label>
      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={inputStyle(!!error)}
      />
      <FieldError msg={error} />
    </div>
  )
}

function Select({
  label, value, onChange, options, error, required, placeholder = 'Select…',
}: {
  label: string; value: any; onChange: (v: string) => void
  options: { value: string; label: string }[]
  error?: string; required?: boolean; placeholder?: string
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Label required={required}>{label}</Label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle(!!error), appearance: 'auto' }}
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <FieldError msg={error} />
    </div>
  )
}

function Chips({
  label, values, onChange, options, error, required,
}: {
  label: string; values: string[]; onChange: (v: string[]) => void
  options: string[]; error?: string; required?: boolean
}) {
  const toggle = (o: string) =>
    onChange(values.includes(o) ? values.filter(v => v !== o) : [...values, o])
  return (
    <div style={{ marginBottom: 14 }}>
      <Label required={required}>{label}</Label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(o => {
          const on = values.includes(o)
          return (
            <button
              key={o} type="button" onClick={() => toggle(o)}
              style={{
                padding: '6px 11px', fontSize: 12.5, fontWeight: on ? 600 : 500,
                borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                backgroundColor: on ? INK : '#fff',
                color: on ? '#fff' : MUTED,
                border: `1px solid ${on ? INK : LINE}`,
              }}
            >
              {o}
            </button>
          )
        })}
      </div>
      <FieldError msg={error} />
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: '#fff', border: `1px solid ${LINE}`,
      borderRadius: 10, padding: '16px 16px 4px', marginBottom: 14,
    }}>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: INK }}>{title}</h3>
        {hint && <p style={{ margin: '3px 0 0', fontSize: 11.5, color: FAINT }}>{hint}</p>}
      </div>
      {children}
    </div>
  )
}

// Levenshtein distance, two-row DP. Used only for the duplicate-partner
// warning, against a handful of orgs — no need for anything cleverer.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev: number[] = Array.from({ length: n + 1 }, (_, i) => i)
  let cur: number[] = new Array(n + 1)
  for (let i = 1; i <= m; i++) {
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    ;[prev, cur] = [cur, prev]
  }
  return prev[n]
}

function nearMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const x = norm(a), y = norm(b)
  if (!x || !y) return false
  const tolerance = Math.max(2, Math.floor(Math.max(x.length, y.length) * 0.1))
  return levenshtein(x, y) <= tolerance
}

function StatusChip({ status }: { status: string }) {
  const c = STATUS_COLOURS[status] ?? STATUS_COLOURS.draft
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700,
      backgroundColor: c.bg, color: c.fg, textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      {status.replace('_', ' ')}
    </span>
  )
}

// ---------------------------------------------------------------------------


/**
 * The partner's login, shown once.
 *
 * Deliberately a blocking dialog with a copy button rather than a line in
 * a banner: there is no endpoint anywhere that can return this password
 * again, so dismissing it without copying means resetting it. Making that
 * a conscious click is the whole design.
 *
 * If it IS lost, nothing is broken — Logins → Reset password issues a new
 * one in two clicks.
 */
function CredentialsModal({ cred, copied, onCopied, onClose }: {
  cred: { company: string; code?: string; email: string; password: string }
  copied: boolean
  onCopied: () => void
  onClose: () => void
}) {
  const block = `${cred.company}${cred.code ? ` (${cred.code})` : ''}
` +
    `Portal: https://crm.sgthydroedge.com
` +
    `Email: ${cred.email}
Password: ${cred.password}`

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 80, backgroundColor: 'rgba(22,22,20,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        backgroundColor: '#fff', borderRadius: 12, padding: 22,
        width: '100%', maxWidth: 520, maxHeight: '86vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Check size={18} style={{ color: OK }} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: INK }}>
            {cred.company} approved
          </h3>
        </div>
        {cred.code && (
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>
            Partner code <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{cred.code}</strong>
          </div>
        )}

        <div style={{
          padding: '12px 14px', borderRadius: 8, marginBottom: 12,
          backgroundColor: '#FBF0DA', color: '#6F2F0E', fontSize: 12, lineHeight: 1.5,
        }}>
          <strong>Copy this now.</strong> The password is not stored anywhere
          readable and cannot be shown again. If it is lost, reset it from
          Logins — nothing breaks.
        </div>

        <div style={{
          border: `1px solid ${LINE}`, borderRadius: 8, padding: '12px 14px',
          marginBottom: 12, backgroundColor: '#FCFBF7',
        }}>
          <div style={{ fontSize: 11, color: FAINT, marginBottom: 3 }}>Email</div>
          <div style={{ fontSize: 13.5, color: INK, marginBottom: 10, wordBreak: 'break-all' }}>
            {cred.email}
          </div>
          <div style={{ fontSize: 11, color: FAINT, marginBottom: 3 }}>Password</div>
          <code style={{
            display: 'block', fontSize: 15, letterSpacing: '0.04em',
            fontFamily: 'ui-monospace, monospace', color: INK, wordBreak: 'break-all',
          }}>{cred.password}</code>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => { navigator.clipboard?.writeText(block); onCopied() }}
            style={{
              flex: 1, padding: '11px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
              border: 'none', borderRadius: 7, cursor: 'pointer',
              backgroundColor: copied ? OK : INK, color: '#fff',
            }}
          >
            {copied ? 'Copied to clipboard' : 'Copy email and password'}
          </button>
          <button
            type="button" onClick={onClose}
            style={{
              padding: '11px 16px', fontSize: 13.5, fontFamily: 'inherit',
              border: `1px solid ${LINE}`, borderRadius: 7, cursor: 'pointer',
              background: '#fff', color: MUTED,
            }}
          >
            {copied ? 'Done' : 'Close without copying'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PartnerOnboarding() {
  // The partner's login, shown ONCE after approval. Never fetched again —
  // there is no endpoint that can return a password. Dismissing this
  // without copying means resetting it from the Logins screen.
  const [credentials, setCredentials] = useState<
    { company: string; code?: string; email: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const [ref, setRef] = useState<Reference | null>(null)
  const [list, setList] = useState<Registration[]>([])
  const [orgs, setOrgs] = useState<PartnerOrg[]>([])
  const [tab, setTab] = useState<'network' | 'applications'>('network')
  const [showClosed, setShowClosed] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [openOrgId, setOpenOrgId] = useState<number | null>(null)
  const [form, setForm] = useState<Form>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [banner, setBanner] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [gstin, setGstin] = useState<GstinInspection | null>(null)
  const [contacts, setContacts] = useState<RegContact[]>([])
  const [newContact, setNewContact] = useState({ name: '', designation: '', mobile: '', email: '' })

  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gstinTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    Promise.all([onboardingApi.reference(), onboardingApi.list(), onboardingApi.orgs()])
      .then(([r, l, o]) => { setRef(r); setList(l); setOrgs(o) })
      .catch(e => setBanner(e.message))
      .finally(() => setLoading(false))
  }, [])

  /**
   * A draft that looks like a partner who already exists.
   *
   * GSTIN first — it is authoritative. Falling back to the legal name needs
   * real edit distance rather than a prefix or substring test: the case this
   * exists for is "Contiental" vs "Continental", a single dropped letter in
   * the middle, which no prefix comparison catches.
   *
   * Tolerance scales with length (10%, floor 2), which separates the typo
   * (distance 1) from a genuinely different company like "Oriental Power
   * System" (distance 4). This only ever raises a warning — it never blocks.
   */
  const looksLikeExisting = (r: Registration): PartnerOrg | undefined => {
    // An approved registration CREATED an org, so of course it matches one.
    // Warning about that is noise, and worse — it implies approving again
    // would duplicate something, when the registration is already closed.
    if (r.status === 'approved' || r.created_org_id) return undefined
    if (r.gstin) {
      const byGstin = orgs.find(
        o => o.gstin && o.gstin.toUpperCase() === String(r.gstin).toUpperCase())
      if (byGstin) return byGstin
    }
    if (!r.legal_name) return undefined
    return orgs.find(o => nearMatch(o.legal_name, r.legal_name))
  }

  // ---- Autosave. Debounced; never runs on the initial load of a record. ----
  useEffect(() => {
    if (openId === null || !dirty.current) return
    if (timer.current) clearTimeout(timer.current)
    setSaving('saving')
    timer.current = setTimeout(async () => {
      try {
        await onboardingApi.save(openId, form)
        setSaving('saved')
        setTimeout(() => setSaving(s => (s === 'saved' ? 'idle' : s)), 1600)
      } catch (e: any) {
        setSaving('idle')
        setBanner(e.message)
      }
    }, 700)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [form, openId])

  const set = (key: string, value: any) => {
    dirty.current = true
    setForm(f => ({ ...f, [key]: value }))
    setErrors(e => { if (!e[key]) return e; const n = { ...e }; delete n[key]; return n })
  }

  /**
   * GSTIN is self-describing, so once 15 characters are in we derive state,
   * PAN and constitution from it rather than making the user retype them.
   * Debounced, and only fires at full length — no call per keystroke.
   * Derived fields are only filled when currently empty, so a deliberate
   * override is never silently undone.
   */
  const onGstinChange = (raw: string) => {
    const v = raw.toUpperCase().replace(/\s/g, '')
    set('gstin', v)
    setGstin(null)
    if (gstinTimer.current) clearTimeout(gstinTimer.current)
    if (v.length !== 15) return
    gstinTimer.current = setTimeout(async () => {
      try {
        const r = await onboardingApi.inspectGstin(v)
        setGstin(r)
        if (!r.valid) return
        setForm(f => {
          const next = { ...f }
          if (r.pan && !f.pan) next.pan = r.pan
          if (r.stateName && !f.state) next.state = r.stateName
          if (r.stateCode && !f.state_code) next.state_code = r.stateCode
          if (r.constitutionHint && !f.constitution) next.constitution = r.constitutionHint
          return next
        })
        dirty.current = true
      } catch { /* inspection is a convenience; submit still validates */ }
    }, 450)
  }

  const setProfile = (key: string, value: any) => {
    dirty.current = true
    setForm(f => ({ ...f, profile: { ...(f.profile ?? {}), [key]: value } }))
    setErrors(e => {
      const k = `profile.${key}`
      if (!e[k]) return e
      const n = { ...e }; delete n[k]; return n
    })
  }

  const openRecord = async (id: number) => {
    dirty.current = false
    setErrors({}); setBanner(null)
    try {
      const r = await onboardingApi.get(id)
      setForm({ ...r, profile: r.profile ?? {} })
      setContacts(r.contacts ?? [])
      setGstin(null)
      setNewContact({ name: '', designation: '', mobile: '', email: '' })
      setOpenId(id)
    } catch (e: any) { setBanner(e.message) }
  }

  const startNew = async (partnerType: 'distributor' | 'dealer') => {
    const name = window.prompt(
      `Legal name of the ${partnerType}?\n\nJust enough to open a draft — everything else can wait.`,
    )
    if (!name?.trim()) return
    try {
      const r = await onboardingApi.create({ legal_name: name.trim(), partner_type: partnerType })
      setList(l => [r, ...l])
      dirty.current = false
      setForm({ ...r, profile: {} })
      setContacts([])
      setGstin(null)
      setNewContact({ name: '', designation: '', mobile: '', email: '' })
      setOpenId(r.id)
      setErrors({}); setBanner(null)
    } catch (e: any) { setBanner(e.message) }
  }

  const submit = async () => {
    if (openId === null) return
    setBanner(null)
    try {
      // Flush any pending debounce so the server validates what's on screen.
      if (timer.current) clearTimeout(timer.current)
      if (dirty.current) await onboardingApi.save(openId, form)
      const r = await onboardingApi.submit(openId)
      setErrors({})
      setForm({ ...r, profile: r.profile ?? {} })
      setList(await onboardingApi.list())
      setBanner(null)
    } catch (e: any) {
      if (e instanceof ValidationError) {
        setErrors(e.fields)
        setBanner(`${Object.keys(e.fields).length} field(s) need attention before submitting.`)
      } else setBanner(e.message)
    }
  }

  // ---- Which conditional sections apply -----------------------------------
  const isDealer = form.partner_type === 'dealer'
  const isIndividual = (form.entity_type ?? 'company') === 'individual'
  const sells = !isDealer || form.dealer_type === 'SS' || form.dealer_type === 'SM'
  const services = isDealer && form.dealer_type === 'SS'
  const editable = form.status === 'draft'

  const openApplications = useMemo(
    () => list.filter(r => !CLOSED_STATUSES.includes(r.status)), [list])
  const closedApplications = useMemo(
    () => list.filter(r => CLOSED_STATUSES.includes(r.status)), [list])

  const stateOptions = useMemo(
    () => (ref?.states ?? []).map(s => ({ value: s.name, label: `${s.name} (${s.code})` })),
    [ref],
  )

  if (loading) {
    return <div style={{ padding: 40, color: MUTED, backgroundColor: PAPER, height: '100%' }}>Loading…</div>
  }

  // A live partner record — separate screen, because it edits the org rather
  // than the application.
  if (openOrgId !== null) {
    return (
      <OrgDetailScreen
        orgId={openOrgId}
        onBack={() => {
          setOpenOrgId(null)
          onboardingApi.orgs().then(setOrgs).catch(() => {})
        }}
      />
    )
  }

  // ---- List view ----------------------------------------------------------
  if (openId === null) {
    return (
      <div style={{ backgroundColor: PAPER, height: '100%', overflowY: 'auto', padding: '20px 18px 60px' }}>
        {credentials && (
          <CredentialsModal
            cred={credentials} copied={copied}
            onCopied={() => setCopied(true)}
            onClose={() => { setCredentials(null); setCopied(false) }}
          />
        )}
        <h1 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: INK }}>Partner onboarding</h1>
        <p style={{ margin: '0 0 18px', fontSize: 12.5, color: MUTED }}>
          Register a distributor or a dealer. Drafts save as you type.
        </p>

        {banner && (
          <div style={{ padding: '10px 12px', marginBottom: 14, borderRadius: 8, backgroundColor: '#F3DAD5', color: DANGER, fontSize: 12.5 }}>
            {banner}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {(['distributor', 'dealer'] as const).map(t => (
            <button
              key={t} onClick={() => startNew(t)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 14px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                backgroundColor: INK, color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer',
              }}
            >
              <Plus size={15} /> New {t}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: `1px solid ${LINE}` }}>
          {([
            ['network', `Partner network (${orgs.length})`],
            ['applications', `Applications (${list.length})`],
          ] as const).map(([id, label]) => (
            <button
              key={id} onClick={() => setTab(id)}
              style={{
                padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
                background: 'none', border: 'none', marginBottom: -1,
                fontWeight: tab === id ? 700 : 500,
                color: tab === id ? INK : MUTED,
                borderBottom: `2px solid ${tab === id ? INK : 'transparent'}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'network' ? (
          orgs.length === 0 ? (
            <p style={{ fontSize: 13, color: FAINT }}>No partners yet.</p>
          ) : (
            <>
              <p style={{ fontSize: 11.5, color: FAINT, margin: '0 0 10px' }}>
                Partners who already hold a code. These exist independently of the
                application queue — onboard someone here only if they are not on this list.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {orgs.map(o => (
                  <button
                    key={o.id}
                    onClick={() => setOpenOrgId(o.id)}
                    style={{
                      backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 9,
                      padding: '12px 14px', textAlign: 'left', width: '100%',
                      cursor: 'pointer', fontFamily: 'inherit',
                      marginLeft: o.org_type === 'distributor' ? 0 : 18,
                      opacity: o.is_active ? 1 : 0.6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{o.legal_name}</div>
                        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                          {o.org_type === 'distributor'
                            ? 'Distributor'
                            : `Dealer${o.dealer_type ? ` · ${o.dealer_type}` : ''}${o.parent_code ? ` · under ${o.parent_code}` : ''}`}
                          {o.territory ? ` · ${o.territory}` : ''}
                        </div>
                      </div>
                      <span style={{
                        fontFamily: 'ui-monospace, monospace', fontSize: 11.5, fontWeight: 700,
                        padding: '3px 8px', borderRadius: 5,
                        backgroundColor: '#EFEADC', color: INK, whiteSpace: 'nowrap',
                      }}>
                        {o.code}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )
        ) : list.length === 0 ? (
          <p style={{ fontSize: 13, color: FAINT }}>No applications yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {openApplications.length === 0 && !showClosed && (
              <p style={{ fontSize: 13, color: FAINT, margin: '0 0 4px' }}>
                Nothing waiting on you.
              </p>
            )}
            {closedApplications.length > 0 && (
              <button
                onClick={() => setShowClosed(s => !s)}
                style={{
                  alignSelf: 'flex-start', background: 'none', border: 'none',
                  cursor: 'pointer', color: MUTED, fontSize: 12.5,
                  fontFamily: 'inherit', padding: '2px 0 6px',
                }}
              >
                {showClosed ? 'Hide' : 'Show'} {closedApplications.length} closed (approved, rejected, withdrawn)
              </button>
            )}
            {(showClosed ? [...openApplications, ...closedApplications] : openApplications).map(r => {
              const dupe = looksLikeExisting(r)
              const closed = CLOSED_STATUSES.includes(r.status)
              return (
                <div key={r.id} style={{
                  backgroundColor: '#fff',
                  border: `1px solid ${dupe ? '#E0A94F' : LINE}`,
                  borderRadius: 9, overflow: 'hidden',
                  opacity: closed && r.status !== 'approved' ? 0.72 : 1,
                }}>
                  <button
                    onClick={() => openRecord(r.id)}
                    style={{
                      textAlign: 'left', width: '100%', cursor: 'pointer',
                      fontFamily: 'inherit', background: 'none', border: 'none',
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.legal_name}
                        </div>
                        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                          {r.partner_type === 'dealer'
                            ? `Dealer${r.dealer_type ? ` · ${r.dealer_type}` : ''}`
                            : 'Distributor'}
                          {r.city ? ` · ${r.city}` : ''}
                          {r.allotted_code ? ` · ${r.allotted_code}` : ''}
                        </div>
                      </div>
                      <StatusChip status={r.status} />
                    </div>
                    {dupe && (
                      <div style={{
                        marginTop: 8, padding: '7px 9px', borderRadius: 6, fontSize: 11.5,
                        backgroundColor: '#FBF0DA', color: '#6F2F0E',
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}>
                        <AlertCircle size={13} />
                        Looks like <strong>{dupe.legal_name}</strong> ({dupe.code}), who already
                        holds a code. Approving this would create a second record.
                      </div>
                    )}
                  </button>

                  {/* An approved application records how a partner came to
                      exist, so it cannot be removed — suspend the partner
                      instead. Everything else can go. */}
                  {r.status !== 'approved' && (
                    <div style={{
                      borderTop: `1px solid ${LINE}`, padding: '7px 12px',
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', gap: 8, flexWrap: 'wrap',
                    }}>
                      {/* Decide without opening the application. Offered only
                          for the two statuses the server will actually act on,
                          so a button never exists that is guaranteed to 409. */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(r.status === 'submitted' || r.status === 'under_review') && (
                          <>
                            <button
                              onClick={async () => {
                                // A GSTIN clash has a right answer that is not
                                // "approve": attach to the partner who already
                                // holds the code. That flow lives in the detail
                                // view, so send them there rather than mint a
                                // duplicate on one click.
                                if (dupe) {
                                  setBanner(
                                    `${r.legal_name} shares a GSTIN with ${dupe.legal_name} (${dupe.code}). ` +
                                    `Open the application and attach it to them instead of allotting a second code.`)
                                  openRecord(r.id)
                                  return
                                }
                                if (!window.confirm(
                                  `Approve "${r.legal_name}" and allot a partner code?\n\n` +
                                  `This cannot be undone.`)) return
                                try {
                                  const res = await onboardingApi.approve(r.id)
                                  setList(await onboardingApi.list())
                                  setOrgs(await onboardingApi.orgs())
                                  if (res.login?.created) {
                                    setCopied(false)
                                    setCredentials({
                                      company: r.legal_name,
                                      code: res.data.allotted_code ?? res.code,
                                      email: res.login.email,
                                      password: res.login.password,
                                    })
                                    setBanner(null)
                                  } else {
                                    setBanner(
                                      `${r.legal_name} approved — code ${res.data.allotted_code ?? 'allotted'}.` +
                                      (res.login?.created === false ? ` No login created: ${res.login.reason}` : ''))
                                  }
                                } catch (e: any) { setBanner(e.message) }
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: '#1F4E3D', fontSize: 11.5, fontWeight: 600,
                                fontFamily: 'inherit', padding: '2px 4px',
                              }}
                            >
                              <Check size={13} /> Approve
                            </button>
                            <button
                              onClick={async () => {
                                // The reason is mandatory server-side and the
                                // partner reads it, so it is asked for here
                                // rather than sent as a placeholder.
                                const reason = window.prompt(
                                  `Reject "${r.legal_name}"?\n\nWhy? The partner will see this.`)
                                if (!reason?.trim()) return
                                try {
                                  await onboardingApi.reject(r.id, reason.trim())
                                  setList(await onboardingApi.list())
                                  setBanner(`${r.legal_name} rejected.`)
                                } catch (e: any) { setBanner(e.message) }
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: DANGER, fontSize: 11.5, fontWeight: 600,
                                fontFamily: 'inherit', padding: '2px 4px',
                              }}
                            >
                              <X size={13} /> Reject
                            </button>
                            {/* Neither approve nor reject — just "this was
                                filled in wrong". Offered on the same two
                                statuses because those are the only ones the
                                server will reopen. */}
                            <button
                              onClick={async () => {
                                const reason = window.prompt(
                                  `Reopen "${r.legal_name}" for editing?\n\n` +
                                  'It goes back to draft so the details can be corrected, ' +
                                  'then submitted again.\n\nReason (optional):') ?? ''
                                try {
                                  await onboardingApi.reopen(r.id, reason.trim() || undefined)
                                  setList(await onboardingApi.list())
                                  setBanner(`${r.legal_name} is a draft again — open it to edit.`)
                                } catch (e: any) { setBanner(e.message) }
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: MUTED, fontSize: 11.5, fontWeight: 600,
                                fontFamily: 'inherit', padding: '2px 4px',
                              }}
                            >
                              <RefreshCw size={13} /> Reopen
                            </button>
                          </>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          const sent = r.status === 'submitted' || r.status === 'under_review'
                          if (!window.confirm(
                            `${sent ? 'Withdraw' : 'Delete'} "${r.legal_name}"?` +
                            (sent
                              ? '\n\nIt was sent to SGT, so it is marked withdrawn rather than removed.'
                              : '\n\nThis permanently removes the draft.'))) return
                          try {
                            await onboardingApi.removeRegistration(r.id)
                            setList(await onboardingApi.list())
                            setBanner(null)
                          } catch (e: any) { setBanner(e.message) }
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: FAINT, fontSize: 11.5, fontFamily: 'inherit', padding: '2px 4px',
                        }}
                      >
                        <Trash2 size={13} />
                        {r.status === 'submitted' || r.status === 'under_review' ? 'Withdraw' : 'Delete'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ---- Form view ----------------------------------------------------------
  return (
    <div style={{ backgroundColor: PAPER, height: '100%', overflowY: 'auto' }}>
      {credentials && (
        <CredentialsModal
          cred={credentials} copied={copied}
          onCopied={() => setCopied(true)}
          onClose={() => { setCredentials(null); setCopied(false) }}
        />
      )}
      <div style={{
        position: 'sticky', top: 0, zIndex: 2, backgroundColor: PAPER,
        padding: '14px 18px 10px', borderBottom: `1px solid ${LINE}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button
          onClick={() => {
            setOpenId(null)
            onboardingApi.list().then(setList).catch(() => {})
            onboardingApi.orgs().then(setOrgs).catch(() => {})
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 13, fontFamily: 'inherit', padding: 0 }}
        >
          <ArrowLeft size={16} /> All
        </button>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {form.legal_name}
        </div>
        {saving === 'saving' && <span style={{ fontSize: 11.5, color: FAINT }}>Saving…</span>}
        {saving === 'saved' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11.5, color: OK }}>
            <Check size={13} /> Saved
          </span>
        )}
        <StatusChip status={form.status} />
      </div>

      <div style={{ padding: '14px 18px 80px', maxWidth: 720, margin: '0 auto' }}>
        {banner && (
          <div style={{ padding: '10px 12px', marginBottom: 14, borderRadius: 8, backgroundColor: '#F3DAD5', color: DANGER, fontSize: 12.5 }}>
            {banner}
          </div>
        )}
        {!editable && (
          <div style={{ padding: '10px 12px', marginBottom: 14, borderRadius: 8, backgroundColor: '#DDE8F0', color: '#1F4E6B', fontSize: 12.5 }}>
            This registration has been submitted and is read-only.
          </div>
        )}

        <fieldset disabled={!editable} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
          <Section title="Partner type">
            <Select
              label="Type" required value={form.partner_type}
              onChange={v => set('partner_type', v)}
              error={errors.partner_type}
              options={[
                { value: 'distributor', label: 'Distributor' },
                { value: 'dealer', label: 'Dealer' },
              ]}
            />
            {isDealer && (
              <>
                <Select
                  label="Dealer type" required value={form.dealer_type}
                  onChange={v => set('dealer_type', v)}
                  error={errors.dealer_type}
                  options={(ref?.dealerTypes ?? []).map(d => ({ value: d.value, label: `${d.label} (${d.value})` }))}
                />
                <Select
                  label="Applies under distributor" required value={form.parent_org_id}
                  onChange={v => set('parent_org_id', v ? Number(v) : null)}
                  error={errors.parent_org_id}
                  options={(ref?.distributors ?? []).map(d => ({ value: String(d.id), label: `${d.legal_name} (${d.code})` }))}
                />
              </>
            )}
            {/* A partner can be a person trading in their own name. The
                firm-shaped questions below disappear when they are, and the
                server stops requiring them — see partnerValidation.ts. */}
            <Select
              label="Company or individual" required value={form.entity_type ?? 'company'}
              onChange={v => set('entity_type', v)}
              error={errors.entity_type}
              options={[
                { value: 'company', label: 'A company or firm' },
                { value: 'individual', label: 'An individual' },
              ]}
            />
          </Section>

          <Section title={isIndividual ? 'Identity' : 'Business identity'}>
            <Text label={isIndividual ? 'Full name' : 'Legal name'} required
                  value={form.legal_name} onChange={v => set('legal_name', v)} error={errors.legal_name} />
            {!isIndividual && (
              <>
                <Text label="Trade name" value={form.trade_name} onChange={v => set('trade_name', v)} />
                <Select
                  label="Constitution" value={form.constitution}
                  onChange={v => set('constitution', v)} error={errors.constitution}
                  options={(ref?.constitutions ?? []).map(c => ({ value: c, label: c }))}
                />
                <Text label="Years in business" type="number" value={form.years_in_business}
                      onChange={v => set('years_in_business', v === '' ? null : Number(v))} />
              </>
            )}
          </Section>

          <Section title="Tax identity" hint="The GSTIN's own checksum is verified as you type — no external lookup, nothing metered.">
            <Text label="GSTIN" value={form.gstin} placeholder="08AABCC1234D1ZB"
                  onChange={onGstinChange} error={errors.gstin} />
            {gstin && (
              <div style={{
                marginTop: -8, marginBottom: 14, padding: '8px 10px', borderRadius: 6, fontSize: 12,
                backgroundColor: gstin.valid ? '#DCEBE1' : '#F3DAD5',
                color: gstin.valid ? OK : DANGER,
              }}>
                {gstin.valid ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Check size={13} />
                    Checksum valid · {gstin.stateName ?? gstin.stateCode} · PAN {gstin.pan}
                    {gstin.entityType ? ` · ${gstin.entityType}` : ''}
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <AlertCircle size={13} /> {gstin.message}
                  </span>
                )}
              </div>
            )}
            <Text label="PAN" value={form.pan} placeholder="AABCC1234D"
                  onChange={v => set('pan', v.toUpperCase())} error={errors.pan} />
            <Text label="Udyam number" value={form.udyam_number} onChange={v => set('udyam_number', v)} />
          </Section>

          {/* Required for an individual: it is the only thing locating them. */}
          <Section title={isIndividual ? 'Address' : 'Registered address'}>
            <Text label="Address" required={isIndividual} value={form.address_line1} onChange={v => set('address_line1', v)} error={errors.address_line1} />
            <Text label="Address line 2" value={form.address_line2} onChange={v => set('address_line2', v)} />
            <Text label="City" required={isIndividual} value={form.city} onChange={v => set('city', v)} error={errors.city} />
            <Select label="State" required={isIndividual} value={form.state} onChange={v => set('state', v)}
                    error={errors.state} options={stateOptions} />
            <Text label="PIN code" value={form.pincode} onChange={v => set('pincode', v)} error={errors.pincode} />
          </Section>

          {/* Optional throughout. Most partners work out of the address
              above and leave this empty, in which case nothing about the
              quotation changes. Where it IS filled in, it prints ABOVE the
              registered office on the quotation — the branch is where the
              customer actually deals with them; the registered office is
              where the GST certificate points. */}
          <Section
            title="Branch office"
            hint="Optional. The office they actually operate from, if it differs from the registered address. When filled in, it prints first on quotations."
          >
            <Text label="Address" value={form.branch_address_line1} onChange={v => set('branch_address_line1', v)} />
            <Text label="Address line 2" value={form.branch_address_line2} onChange={v => set('branch_address_line2', v)} />
            <Text label="City" value={form.branch_city} onChange={v => set('branch_city', v)} />
            <Select label="State" value={form.branch_state} onChange={v => set('branch_state', v)}
                    options={stateOptions} />
            <Text label="PIN code" value={form.branch_pincode} onChange={v => set('branch_pincode', v)} error={errors.branch_pincode} />
            <Text label="Phone" value={form.branch_phone} onChange={v => set('branch_phone', v)} />
            <Text label="Email" type="email" value={form.branch_email}
                  onChange={v => set('branch_email', v)} error={errors.branch_email} />
          </Section>

          <Section title="Primary contact">
            <Text label="Name" required value={form.contact_name} onChange={v => set('contact_name', v)} error={errors.contact_name} />
            <Text label="Designation" value={form.contact_designation} onChange={v => set('contact_designation', v)} />
            <Text label="Mobile" required value={form.contact_mobile} placeholder="9876543210"
                  onChange={v => set('contact_mobile', v)} error={errors.contact_mobile} />
            <Text label="Email" type="email" value={form.contact_email}
                  onChange={v => set('contact_email', v)} error={errors.contact_email} />
          </Section>

          <Section
            title={`Other contacts${contacts.length ? ` (${contacts.length})` : ''}`}
            hint="Anyone else at the partner — service head, accounts, a second principal. A name is enough; fill the rest in when you have it."
          >
            {contacts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {contacts.map(c => (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 11px', borderRadius: 7,
                    backgroundColor: '#F7F4EA', border: `1px solid ${LINE}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>
                        {c.name}
                        {c.designation && (
                          <span style={{ fontWeight: 500, color: MUTED }}> · {c.designation}</span>
                        )}
                      </div>
                      {(c.mobile || c.email) && (
                        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                          {[c.mobile, c.email].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    {editable && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (openId === null) return
                          try {
                            await onboardingApi.deleteContact(openId, c.id)
                            setContacts(cs => cs.filter(x => x.id !== c.id))
                          } catch (e: any) { setBanner(e.message) }
                        }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: FAINT, padding: 4, display: 'flex', alignItems: 'center',
                        }}
                        aria-label={`Remove ${c.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {editable && (
              <div style={{
                padding: 11, borderRadius: 8,
                border: `1px dashed ${LINE}`, backgroundColor: '#FCFBF7',
              }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 150px' }}>
                    <input
                      placeholder="Name *" value={newContact.name}
                      onChange={e => setNewContact(c => ({ ...c, name: e.target.value }))}
                      style={inputStyle()}
                    />
                  </div>
                  <div style={{ flex: '1 1 130px' }}>
                    <input
                      placeholder="Designation" value={newContact.designation}
                      onChange={e => setNewContact(c => ({ ...c, designation: e.target.value }))}
                      style={inputStyle()}
                    />
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <input
                      placeholder="Mobile" value={newContact.mobile}
                      onChange={e => setNewContact(c => ({ ...c, mobile: e.target.value }))}
                      style={inputStyle()}
                    />
                  </div>
                  <div style={{ flex: '1 1 160px' }}>
                    <input
                      placeholder="Email" value={newContact.email}
                      onChange={e => setNewContact(c => ({ ...c, email: e.target.value }))}
                      style={inputStyle()}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!newContact.name.trim()}
                  onClick={async () => {
                    if (openId === null || !newContact.name.trim()) return
                    try {
                      const added = await onboardingApi.addContact(openId, {
                        name: newContact.name.trim(),
                        designation: newContact.designation.trim() || null,
                        mobile: newContact.mobile.trim() || null,
                        email: newContact.email.trim() || null,
                      })
                      setContacts(cs => [...cs, added])
                      setNewContact({ name: '', designation: '', mobile: '', email: '' })
                    } catch (e: any) { setBanner(e.message) }
                  }}
                  style={{
                    marginTop: 9, display: 'flex', alignItems: 'center', gap: 5,
                    padding: '7px 12px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                    border: 'none', borderRadius: 6,
                    cursor: newContact.name.trim() ? 'pointer' : 'not-allowed',
                    backgroundColor: newContact.name.trim() ? INK : '#D8D3C4',
                    color: newContact.name.trim() ? '#fff' : '#8C887E',
                  }}
                >
                  <Plus size={14} /> Add contact
                </button>
              </div>
            )}
          </Section>

          <Section title="Banking" hint="Must match the cancelled cheque uploaded later. This account is printed on their quotations as the one the customer pays into.">
            <Text label="Account holder name" value={form.bank_account_name} onChange={v => set('bank_account_name', v)} error={errors.bank_account_name} />
            <Text label="Account number" value={form.bank_account_number} onChange={v => set('bank_account_number', v)} error={errors.bank_account_number} />
            <Text label="IFSC" value={form.bank_ifsc} placeholder="HDFC0001234"
                  onChange={v => set('bank_ifsc', v.toUpperCase())} error={errors.bank_ifsc} />
            <Text label="Bank name" value={form.bank_name} onChange={v => set('bank_name', v)} error={errors.bank_name} />
            <Text label="Branch" value={form.bank_branch} onChange={v => set('bank_branch', v)} />
          </Section>

          <Section title="Commercial">
            <Chips label="Product lines" values={form.product_lines ?? []}
                   onChange={v => set('product_lines', v)} options={ref?.productLines ?? []}
                   error={errors.product_lines} />
            {sells && (
              <>
                <Text label="Proposed territory" value={form.proposed_territory}
                      onChange={v => set('proposed_territory', v)} error={errors.proposed_territory} />
                {/* A question about a firm's book of business — not asked of a
                    person, and not required of one by the server either. */}
                {!isIndividual && (
                  <Chips label="Industries of operation" required values={form.customer_segments ?? []}
                         onChange={v => set('customer_segments', v)} error={errors.customer_segments}
                         options={['Industrial', 'Commercial', 'Infrastructure', 'Mining', 'Marine', 'Hospitality', 'Healthcare', 'Data centre']} />
                )}
                <Text label="Sales team size" type="number" value={form.profile?.sales_team_size}
                      onChange={v => setProfile('sales_team_size', v === '' ? null : Number(v))}
                      error={errors['profile.sales_team_size']} />
                <Text label="Expected annual units" type="number" value={form.expected_annual_units}
                      onChange={v => set('expected_annual_units', v === '' ? null : Number(v))} />
                <Text label="Existing brands handled" value={form.existing_brands} onChange={v => set('existing_brands', v)} />
              </>
            )}
          </Section>

          {services && (
            <Section title="Service capability" hint="Required for Sales & Service (SS) dealers.">
              <Text label="Number of service engineers" type="number"
                    value={form.profile?.service_engineers_count}
                    onChange={v => setProfile('service_engineers_count', v === '' ? null : Number(v))}
                    error={errors['profile.service_engineers_count']} />
              <Text label="Workshop and tooling" value={form.profile?.workshop_details}
                    onChange={v => setProfile('workshop_details', v)}
                    error={errors['profile.workshop_details']} />
              <Text label="Service area coverage" value={form.profile?.service_area_coverage}
                    onChange={v => setProfile('service_area_coverage', v)}
                    error={errors['profile.service_area_coverage']} />
              <Text label="DG / electrical experience" value={form.profile?.dg_experience}
                    onChange={v => setProfile('dg_experience', v)}
                    error={errors['profile.dg_experience']} />
            </Section>
          )}

          {!isDealer && (
            <Section title="Warehouse" hint="Distributors hold stock, so a warehouse address is required.">
              <Text label="Warehouse address" value={form.profile?.warehouse_address}
                    onChange={v => setProfile('warehouse_address', v)}
                    error={errors['profile.warehouse_address']} />
            </Section>
          )}
        </fieldset>

        {/* Director review — only once it has actually been submitted. */}
        {(form.status === 'submitted' || form.status === 'under_review') && (
          <div style={{
            backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 10,
            padding: '15px 15px 16px', marginBottom: 14,
          }}>
            <h3 style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: INK }}>Review</h3>
            <p style={{ margin: '0 0 13px', fontSize: 11.5, color: FAINT }}>
              Approving mints the partner code and creates the organisation, in one transaction.
            </p>

            {(() => {
              const dupe = looksLikeExisting(form as Registration)
              return dupe ? (
                <div style={{
                  padding: '10px 11px', marginBottom: 12, borderRadius: 7, fontSize: 12,
                  backgroundColor: '#FBF0DA', color: '#6F2F0E',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                    <AlertCircle size={13} />
                    <span><strong>{dupe.legal_name}</strong> ({dupe.code}) already exists.</span>
                  </div>
                  <button
                    onClick={async () => {
                      if (openId === null) return
                      if (!window.confirm(
                        `Link this registration to ${dupe.legal_name} (${dupe.code})?\n\nNo new code is minted — their existing one is kept.`)) return
                      try {
                        const r = await onboardingApi.approve(openId, dupe.id)
                        setForm({ ...r.data, profile: r.data.profile ?? {} })
                        setList(await onboardingApi.list())
                        setOrgs(await onboardingApi.orgs())
                        setBanner(null)
                      } catch (e: any) { setBanner(e.message) }
                    }}
                    style={{
                      padding: '7px 12px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                      border: `1px solid #6F2F0E`, borderRadius: 6, cursor: 'pointer',
                      background: 'none', color: '#6F2F0E',
                    }}
                  >
                    Attach to {dupe.code} instead
                  </button>
                </div>
              ) : null
            })()}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={async () => {
                  if (openId === null) return
                  if (!window.confirm('Approve and mint a partner code? This cannot be undone.')) return
                  try {
                    const r = await onboardingApi.approve(openId)
                    setForm({ ...r.data, profile: r.data.profile ?? {} })
                    setList(await onboardingApi.list())
                    setOrgs(await onboardingApi.orgs())
                    setBanner(null)
                    if (r.login?.created) {
                      setCopied(false)
                      setCredentials({
                        company: r.data.legal_name,
                        code: r.data.allotted_code ?? r.code,
                        email: r.login.email,
                        password: r.login.password,
                      })
                    } else if (r.login?.created === false) {
                      setBanner(`Approved, but no login was created: ${r.login.reason}`)
                    }
                  } catch (e: any) { setBanner(e.message) }
                }}
                style={{
                  flex: '1 1 160px', padding: '11px', fontSize: 13.5, fontWeight: 700,
                  fontFamily: 'inherit', border: 'none', borderRadius: 7, cursor: 'pointer',
                  backgroundColor: '#1F4E3D', color: '#fff',
                }}
              >
                Approve &amp; allot code
              </button>
              <button
                onClick={async () => {
                  if (openId === null) return
                  const reason = window.prompt('Why is this being rejected?\n\nThe partner will see this.')
                  if (!reason?.trim()) return
                  try {
                    const r = await onboardingApi.reject(openId, reason.trim())
                    setForm({ ...r.data, profile: r.data.profile ?? {} })
                    setList(await onboardingApi.list())
                    setBanner(null)
                  } catch (e: any) { setBanner(e.message) }
                }}
                style={{
                  flex: '1 1 110px', padding: '11px', fontSize: 13.5, fontWeight: 600,
                  fontFamily: 'inherit', border: `1px solid ${LINE}`, borderRadius: 7,
                  cursor: 'pointer', background: '#fff', color: DANGER,
                }}
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {form.status === 'approved' && form.allotted_code && (
          <div style={{
            padding: '13px 15px', marginBottom: 14, borderRadius: 10,
            backgroundColor: '#DCEBE1', color: OK,
            display: 'flex', alignItems: 'center', gap: 9,
          }}>
            <Check size={17} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                Approved · {form.allotted_code}
              </div>
              <div style={{ fontSize: 11.5, opacity: 0.85 }}>
                {form.approved_by ? `by ${form.approved_by}` : ''} — now live in the partner network
              </div>
            </div>
          </div>
        )}

        {form.status === 'rejected' && form.rejection_reason && (
          <div style={{
            padding: '12px 14px', marginBottom: 14, borderRadius: 10,
            backgroundColor: '#F3DAD5', color: DANGER, fontSize: 12.5,
          }}>
            <strong>Rejected.</strong> {form.rejection_reason}
          </div>
        )}

        {editable && (
          <button
            onClick={submit}
            style={{
              width: '100%', padding: '13px', marginTop: 6,
              fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
              backgroundColor: INK, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
            }}
          >
            Submit registration
          </button>
        )}
        <p style={{ fontSize: 11, color: FAINT, textAlign: 'center', marginTop: 10 }}>
          Drafts save automatically. Validation runs only when you submit.
        </p>
      </div>
    </div>
  )
}

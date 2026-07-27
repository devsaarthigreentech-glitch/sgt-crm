// Dealer registration, filled in by the DISTRIBUTOR for their own network.
//
// Deliberately shorter than the director's form. Only four things are
// required — dealer type, legal name, contact name and mobile, and the
// industries they operate in. Everything else is optional, because a small
// dealer may not be GST-registered or have a company bank account yet, and
// blocking on that means they never get onboarded.
//
// Optional is not the same as unchecked: a supplied GSTIN, PAN, IFSC, PIN or
// email is still validated. Wrong data that looks real is worse than none.
//
// The distributor never picks the parent org — the server forces it to their
// own, and there is no field here to express anything else.

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, AlertCircle, Plus } from 'lucide-react'
import {
  portalApi, ValidationError,
  type PortalReference, type PortalRegistration,
} from './portalApi'

const PAPER = '#ECE8DA'
const INK = '#161614'
const MUTED = '#6A675F'
const LINE = '#DDD7C6'
const FAINT = '#A39F94'
const DANGER = '#A6301C'
const OK = '#2F6B4F'

const STATUS: Record<string, { bg: string; fg: string; note?: string }> = {
  draft: { bg: '#EFEADC', fg: '#6A675F', note: 'Not sent to SGT yet' },
  submitted: { bg: '#DDE8F0', fg: '#1F4E6B', note: 'With SGT for approval' },
  under_review: { bg: '#F5E0CC', fg: '#6F2F0E', note: 'SGT is reviewing' },
  approved: { bg: '#DCEBE1', fg: '#2F6B4F', note: 'Approved — code allotted' },
  rejected: { bg: '#F3DAD5', fg: '#A6301C' },
  withdrawn: { bg: '#EDEDEA', fg: '#6A675F' },
}

const inputStyle = (bad?: boolean): React.CSSProperties => ({
  width: '100%', boxSizing: 'border-box', padding: '9px 10px',
  fontSize: 13.5, color: INK, backgroundColor: '#fff',
  border: `1px solid ${bad ? DANGER : LINE}`, borderRadius: 6,
  outline: 'none', fontFamily: 'inherit',
})

function Field({
  label, value, onChange, error, required, placeholder, type = 'text',
}: {
  label: string; value: any; onChange: (v: string) => void
  error?: string; required?: boolean; placeholder?: string; type?: string
}) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 5 }}>
        {label}{required && <span style={{ color: DANGER }}> *</span>}
      </label>
      <input type={type} value={value ?? ''} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} style={inputStyle(!!error)} />
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11.5, color: DANGER }}>
          <AlertCircle size={12} /> {error}
        </div>
      )}
    </div>
  )
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: '15px 15px 3px', marginBottom: 13 }}>
      <h3 style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: INK }}>{title}</h3>
      {hint && <p style={{ margin: '0 0 13px', fontSize: 11.5, color: FAINT }}>{hint}</p>}
      {!hint && <div style={{ height: 13 }} />}
      {children}
    </div>
  )
}

export default function DealerRegistration() {
  const [ref, setRef] = useState<PortalReference | null>(null)
  const [list, setList] = useState<PortalRegistration[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const [form, setForm] = useState<Record<string, any>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [gstin, setGstin] = useState<any>(null)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [banner, setBanner] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    Promise.all([portalApi.reference(), portalApi.registrations()])
      .then(([r, l]) => { setRef(r); setList(l) })
      .catch(e => setBanner(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (openId === null || !dirty.current) return
    if (timer.current) clearTimeout(timer.current)
    setSaving('saving')
    timer.current = setTimeout(async () => {
      try {
        await portalApi.saveRegistration(openId, form)
        setSaving('saved')
        setTimeout(() => setSaving(s => (s === 'saved' ? 'idle' : s)), 1500)
      } catch (e: any) { setSaving('idle'); setBanner(e.message) }
    }, 700)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [form, openId])

  const set = (k: string, v: any) => {
    dirty.current = true
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n })
  }

  const onGstin = (raw: string) => {
    const v = raw.toUpperCase().replace(/\s/g, '')
    set('gstin', v); setGstin(null)
    if (gTimer.current) clearTimeout(gTimer.current)
    if (v.length !== 15) return
    gTimer.current = setTimeout(async () => {
      try {
        const r = await portalApi.inspectGstin(v)
        setGstin(r)
        if (!r.valid) return
        setForm(f => ({
          ...f,
          pan: f.pan || r.pan || '',
          state: f.state || r.stateName || '',
          state_code: f.state_code || r.stateCode || '',
        }))
        dirty.current = true
      } catch { /* convenience only */ }
    }, 450)
  }

  const open = async (id: number) => {
    dirty.current = false; setErrors({}); setBanner(null); setGstin(null)
    try {
      const r = await portalApi.registration(id)
      setForm(r); setOpenId(id)
    } catch (e: any) { setBanner(e.message) }
  }

  const startNew = async () => {
    const name = window.prompt('Dealer’s business name?\n\nJust the name to begin — the rest can wait.')
    if (!name?.trim()) return
    try {
      const r = await portalApi.createRegistration(name.trim())
      setList(l => [r, ...l])
      dirty.current = false; setErrors({}); setBanner(null); setGstin(null)
      setForm(r); setOpenId(r.id)
    } catch (e: any) { setBanner(e.message) }
  }

  const submit = async () => {
    if (openId === null) return
    setBanner(null)
    try {
      if (timer.current) clearTimeout(timer.current)
      if (dirty.current) await portalApi.saveRegistration(openId, form)
      const r = await portalApi.submitRegistration(openId)
      setErrors({}); setForm(r)
      setList(await portalApi.registrations())
    } catch (e: any) {
      if (e instanceof ValidationError) {
        setErrors(e.fields)
        setBanner(`${Object.keys(e.fields).length} field(s) still needed.`)
      } else setBanner(e.message)
    }
  }

  if (loading) {
    return <div style={{ padding: 40, color: MUTED, backgroundColor: PAPER, height: '100%' }}>Loading…</div>
  }

  // ---- List ---------------------------------------------------------------
  if (openId === null) {
    return (
      <div style={{ backgroundColor: PAPER, height: '100%', overflowY: 'auto', padding: '20px 18px 60px' }}>
        <h1 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: INK }}>My dealers</h1>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: MUTED }}>
          Register a dealer under {ref?.parent.legal_name}. SGT approves and allots the code.
        </p>
        {banner && (
          <div style={{ padding: '10px 12px', marginBottom: 14, borderRadius: 8, backgroundColor: '#F3DAD5', color: DANGER, fontSize: 12.5 }}>{banner}</div>
        )}
        <button onClick={startNew} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', marginBottom: 18,
          fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
          backgroundColor: INK, color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer',
        }}>
          <Plus size={15} /> Register a dealer
        </button>

        {list.length === 0 ? (
          <p style={{ fontSize: 13, color: FAINT }}>No dealer registrations yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map(r => {
              const s = STATUS[r.status] ?? STATUS.draft
              return (
                <button key={r.id} onClick={() => open(r.id)} style={{
                  textAlign: 'left', width: '100%', cursor: 'pointer', fontFamily: 'inherit',
                  backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 9, padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{r.legal_name}</div>
                      <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                        {r.dealer_type ? `${r.dealer_type === 'SS' ? 'Sales & Service' : 'Sales & Marketing'}` : 'Type not set'}
                        {r.city ? ` · ${r.city}` : ''}
                        {r.allotted_code ? ` · ${r.allotted_code}` : ''}
                        {s.note ? ` · ${s.note}` : ''}
                      </div>
                      {r.status === 'rejected' && r.rejection_reason && (
                        <div style={{ fontSize: 11.5, color: DANGER, marginTop: 4 }}>{r.rejection_reason}</div>
                      )}
                    </div>
                    <span style={{
                      padding: '3px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700,
                      backgroundColor: s.bg, color: s.fg, textTransform: 'uppercase',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap',
                    }}>{r.status.replace('_', ' ')}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ---- Form ---------------------------------------------------------------
  const editable = form.status === 'draft'
  return (
    <div style={{ backgroundColor: PAPER, height: '100%', overflowY: 'auto' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 2, backgroundColor: PAPER,
        padding: '13px 18px 10px', borderBottom: `1px solid ${LINE}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button onClick={() => { setOpenId(null); portalApi.registrations().then(setList).catch(() => {}) }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 13, fontFamily: 'inherit', padding: 0 }}>
          <ArrowLeft size={16} /> All
        </button>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {form.legal_name}
        </div>
        {saving === 'saving' && <span style={{ fontSize: 11.5, color: FAINT }}>Saving…</span>}
        {saving === 'saved' && <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11.5, color: OK }}><Check size={13} /> Saved</span>}
      </div>

      <div style={{ padding: '14px 18px 80px', maxWidth: 640, margin: '0 auto' }}>
        {banner && <div style={{ padding: '10px 12px', marginBottom: 13, borderRadius: 8, backgroundColor: '#F3DAD5', color: DANGER, fontSize: 12.5 }}>{banner}</div>}
        {!editable && (
          <div style={{ padding: '10px 12px', marginBottom: 13, borderRadius: 8, backgroundColor: '#DDE8F0', color: '#1F4E6B', fontSize: 12.5 }}>
            {STATUS[form.status]?.note ?? 'This registration is read-only.'}
          </div>
        )}

        <fieldset disabled={!editable} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
          <Card title="Dealer type" hint={`They will sit under ${ref?.parent.legal_name} (${ref?.parent.code}).`}>
            <div style={{ marginBottom: 13 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 5 }}>
                Type<span style={{ color: DANGER }}> *</span>
              </label>
              <select value={form.dealer_type ?? ''} onChange={e => set('dealer_type', e.target.value)}
                style={{ ...inputStyle(!!errors.dealer_type), appearance: 'auto' }}>
                <option value="">Select…</option>
                {(ref?.dealerTypes ?? []).map(d => <option key={d.value} value={d.value}>{d.label} ({d.value})</option>)}
              </select>
              {errors.dealer_type && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11.5, color: DANGER }}>
                  <AlertCircle size={12} /> {errors.dealer_type}
                </div>
              )}
            </div>
          </Card>

          <Card title="Business">
            <Field label="Business name" required value={form.legal_name} onChange={v => set('legal_name', v)} error={errors.legal_name} />
            <Field label="Trade name" value={form.trade_name} onChange={v => set('trade_name', v)} />
          </Card>

          <Card title="Contact" hint="The person you deal with.">
            <Field label="Name" required value={form.contact_name} onChange={v => set('contact_name', v)} error={errors.contact_name} />
            <Field label="Mobile" required value={form.contact_mobile} placeholder="9876543210" onChange={v => set('contact_mobile', v)} error={errors.contact_mobile} />
            <Field label="Email" type="email" value={form.contact_email} onChange={v => set('contact_email', v)} error={errors.contact_email} />
          </Card>

          <Card title="Industries of operation" hint="Which sectors they sell into.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 13 }}>
              {(ref?.industries ?? []).map(o => {
                const on = (form.customer_segments ?? []).includes(o)
                return (
                  <button key={o} type="button"
                    onClick={() => set('customer_segments', on
                      ? (form.customer_segments ?? []).filter((x: string) => x !== o)
                      : [...(form.customer_segments ?? []), o])}
                    style={{
                      padding: '6px 11px', fontSize: 12.5, fontWeight: on ? 600 : 500,
                      borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                      backgroundColor: on ? INK : '#fff', color: on ? '#fff' : MUTED,
                      border: `1px solid ${on ? INK : LINE}`,
                    }}>{o}</button>
                )
              })}
            </div>
            {errors.customer_segments && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 13, fontSize: 11.5, color: DANGER }}>
                <AlertCircle size={12} /> {errors.customer_segments}
              </div>
            )}
          </Card>

          <Card title="Tax details" hint="Optional — leave blank if they are not registered yet.">
            <Field label="GSTIN" value={form.gstin} placeholder="08AABCC1234D1ZB" onChange={onGstin} error={errors.gstin} />
            {gstin && (
              <div style={{
                marginTop: -8, marginBottom: 13, padding: '8px 10px', borderRadius: 6, fontSize: 12,
                backgroundColor: gstin.valid ? '#DCEBE1' : '#F3DAD5', color: gstin.valid ? OK : DANGER,
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                {gstin.valid
                  ? <><Check size={13} /> Valid · {gstin.stateName ?? gstin.stateCode} · PAN {gstin.pan}</>
                  : <><AlertCircle size={13} /> {gstin.message}</>}
              </div>
            )}
            <Field label="PAN" value={form.pan} placeholder="AABCC1234D" onChange={v => set('pan', v.toUpperCase())} error={errors.pan} />
          </Card>

          <Card title="Location" hint="Optional.">
            <Field label="Address" value={form.address_line1} onChange={v => set('address_line1', v)} />
            <Field label="City" value={form.city} onChange={v => set('city', v)} />
            <div style={{ marginBottom: 13 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 5 }}>State</label>
              <select value={form.state ?? ''} onChange={e => set('state', e.target.value)} style={{ ...inputStyle(), appearance: 'auto' }}>
                <option value="">Select…</option>
                {(ref?.states ?? []).map(s => <option key={s.code} value={s.name}>{s.name} ({s.code})</option>)}
              </select>
            </div>
            <Field label="PIN code" value={form.pincode} onChange={v => set('pincode', v)} error={errors.pincode} />
          </Card>

          <Card title="Background" hint="Optional — useful when SGT reviews.">
            <Field label="Brands they already handle" value={form.existing_brands} placeholder="Volvo Penta, FG Wilson…" onChange={v => set('existing_brands', v)} />
            <Field label="Territory they cover" value={form.proposed_territory} onChange={v => set('proposed_territory', v)} />
          </Card>
        </fieldset>

        {editable && (
          <button onClick={submit} style={{
            width: '100%', padding: '13px', marginTop: 4, fontSize: 14, fontWeight: 700,
            fontFamily: 'inherit', backgroundColor: INK, color: '#fff', border: 'none',
            borderRadius: 8, cursor: 'pointer',
          }}>
            Send to SGT for approval
          </button>
        )}
        <p style={{ fontSize: 11, color: FAINT, textAlign: 'center', marginTop: 10 }}>
          Saves as you type. Only name, contact and industries are required.
        </p>
      </div>
    </div>
  )
}

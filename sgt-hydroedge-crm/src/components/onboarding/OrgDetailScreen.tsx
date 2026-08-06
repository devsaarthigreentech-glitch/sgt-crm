// A LIVE partner record — editable, unlike their frozen registration.
//
// The split: partner_service.registration is what they applied for and never
// changes; quote_service.org is what they are now. Everything here edits the
// org, so a partner who registers for GST six months later has somewhere for
// it to go.
//
// Dealer type is deliberately NOT an ordinary field. Changing it mints a new
// code and retires the old, per the owner's rule, so it gets its own control
// and its own confirmation.

import { useEffect, useState } from 'react'
import { ArrowLeft, Check, AlertCircle, History, RefreshCw } from 'lucide-react'
import {
  onboardingApi, ValidationError, BASE_URL, getToken, type OrgDetail,
} from './onboardingApi'
import LogoField, { logoApiFor } from '../common/LogoField'

const INK = '#161614'
const MUTED = '#6A675F'
const LINE = '#DDD7C6'
const FAINT = '#A39F94'
const DANGER = '#A6301C'
const OK = '#2F6B4F'
const PAPER = '#ECE8DA'

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  active: { bg: '#DCEBE1', fg: '#2F6B4F' },
  suspended: { bg: '#F5E0CC', fg: '#6F2F0E' },
  terminated: { bg: '#F3DAD5', fg: '#A6301C' },
}

const inputStyle = (bad?: boolean): React.CSSProperties => ({
  width: '100%', boxSizing: 'border-box', padding: '9px 10px', fontSize: 13.5,
  color: INK, backgroundColor: '#fff', border: `1px solid ${bad ? DANGER : LINE}`,
  borderRadius: 6, outline: 'none', fontFamily: 'inherit',
})

function F({ label, value, onChange, error, placeholder }: {
  label: string; value: any; onChange: (v: string) => void; error?: string; placeholder?: string
}) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 5 }}>{label}</label>
      <input value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={inputStyle(!!error)} />
      {error && <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11.5, color: DANGER }}><AlertCircle size={12} /> {error}</div>}
    </div>
  )
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: '15px 15px 3px', marginBottom: 13 }}>
      <h3 style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: INK }}>{title}</h3>
      {hint ? <p style={{ margin: '0 0 13px', fontSize: 11.5, color: FAINT }}>{hint}</p> : <div style={{ height: 13 }} />}
      {children}
    </div>
  )
}

export default function OrgDetailScreen({ orgId, onBack }: { orgId: number; onBack: () => void }) {
  const [org, setOrg] = useState<OrgDetail | null>(null)
  const [form, setForm] = useState<Record<string, any>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showLog, setShowLog] = useState(false)

  const load = () => onboardingApi.org(orgId)
    .then(o => { setOrg(o); setForm(o); setErrors({}) })
    .catch(e => setBanner(e.message))

  useEffect(() => { load() }, [orgId])

  const set = (k: string, v: any) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n })
    setOkMsg(null)
  }

  const save = async () => {
    setBusy(true); setBanner(null); setOkMsg(null)
    try {
      const r = await onboardingApi.saveOrg(orgId, form)
      setOrg(r.data); setForm(r.data); setErrors({})
      setOkMsg(r.changed?.length ? `Saved — ${r.changed.length} field(s) updated.` : 'Nothing had changed.')
      await load()
    } catch (e: any) {
      if (e instanceof ValidationError) { setErrors(e.fields); setBanner('Some fields need attention.') }
      else setBanner(e.message)
    } finally { setBusy(false) }
  }

  if (!org) {
    return <div style={{ padding: 40, color: MUTED, backgroundColor: PAPER, height: '100%' }}>
      {banner ?? 'Loading…'}
    </div>
  }

  const st = STATUS_STYLE[org.status] ?? STATUS_STYLE.active
  const isDealer = org.org_type === 'dealer'

  return (
    <div style={{ backgroundColor: PAPER, height: '100%', overflowY: 'auto' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 2, backgroundColor: PAPER,
        padding: '13px 18px 10px', borderBottom: `1px solid ${LINE}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 13, fontFamily: 'inherit', padding: 0 }}>
          <ArrowLeft size={16} /> Network
        </button>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {org.legal_name}
        </div>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 5, backgroundColor: '#EFEADC', color: INK }}>
          {org.code}
        </span>
        <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, backgroundColor: st.bg, color: st.fg, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {org.status}
        </span>
      </div>

      <div style={{ padding: '14px 18px 80px', maxWidth: 680, margin: '0 auto' }}>
        {banner && <div style={{ padding: '10px 12px', marginBottom: 13, borderRadius: 8, backgroundColor: '#F3DAD5', color: DANGER, fontSize: 12.5 }}>{banner}</div>}
        {okMsg && <div style={{ padding: '10px 12px', marginBottom: 13, borderRadius: 8, backgroundColor: '#DCEBE1', color: OK, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}><Check size={14} /> {okMsg}</div>}

        <p style={{ fontSize: 11.5, color: FAINT, margin: '0 0 13px' }}>
          {org.org_type === 'distributor' ? 'Distributor' : `Dealer${org.dealer_type ? ` · ${org.dealer_type}` : ''}`}
          {org.parent_code ? ` · under ${org.parent_code}` : ''}
          {' · '}This is the live record. Their original application stays unchanged.
        </p>

        <Card title="Identity">
          <F label="Legal name" value={form.legal_name} onChange={v => set('legal_name', v)} error={errors.legal_name} />
          <F label="Trade name" value={form.trade_name} onChange={v => set('trade_name', v)} />
          <F label="Territory" value={form.territory} onChange={v => set('territory', v)} />
        </Card>

        {/* The only place a DISTRIBUTOR's own logo can be set — the portal
            lets a partner edit the orgs beneath them, never themselves. */}
        <Card title="Logo" hint="Printed beside SGT’s mark on quotations this partner raises.">
          <LogoField
            key={orgId}
            api={logoApiFor(BASE_URL, `/partners/orgs/${orgId}`, getToken)}
            hint="Takes effect on their next quotation."
          />
        </Card>

        {/* The second signature on every quotation and PO they raise. SGT
            signs the left block; this is the right one. Without it the
            document prints a ruled space under their name for them to
            sign by hand — never somebody else's signature, which is what
            the old shared config produced. */}
        <Card title="Signature"
          hint="Printed under the terms on quotations and POs this partner raises, beside SGT’s.">
          <LogoField
            key={`sign-${orgId}`}
            noun="signature"
            api={logoApiFor(BASE_URL, `/partners/orgs/${orgId}`, getToken, 'sign')}
            hint="Takes effect on their next document. Until one is set, their documents print a blank signing line."
          />
        </Card>

        <Card title="Tax" hint="Leave blank if they are not registered. A wrong GSTIN is rejected.">
          <F label="GSTIN" value={form.gstin} placeholder="08AABCC1234D1ZB" onChange={v => set('gstin', v.toUpperCase())} error={errors.gstin} />
          <F label="PAN" value={form.pan} placeholder="AABCC1234D" onChange={v => set('pan', v.toUpperCase())} error={errors.pan} />
        </Card>

        <Card title="Contact">
          <F label="Name" value={form.contact_name} onChange={v => set('contact_name', v)} />
          <F label="Designation" value={form.contact_designation} onChange={v => set('contact_designation', v)} />
          <F label="Mobile" value={form.contact_mobile} onChange={v => set('contact_mobile', v)} />
          <F label="Email" value={form.contact_email} onChange={v => set('contact_email', v)} error={errors.contact_email} />
        </Card>

        <Card title="Address">
          <F label="Address" value={form.address_line1} onChange={v => set('address_line1', v)} />
          <F label="City" value={form.city} onChange={v => set('city', v)} />
          <F label="State" value={form.state} onChange={v => set('state', v)} />
          <F label="PIN code" value={form.pincode} onChange={v => set('pincode', v)} error={errors.pincode} />
        </Card>

        <Card title="Banking">
          <F label="Account holder" value={form.bank_account_name} onChange={v => set('bank_account_name', v)} />
          <F label="Account number" value={form.bank_account_number} onChange={v => set('bank_account_number', v)} />
          <F label="IFSC" value={form.bank_ifsc} placeholder="HDFC0001234" onChange={v => set('bank_ifsc', v.toUpperCase())} error={errors.bank_ifsc} />
          <F label="Bank" value={form.bank_name} onChange={v => set('bank_name', v)} />
        </Card>

        <Card title="Notes">
          <F label="Internal notes" value={form.notes} onChange={v => set('notes', v)} />
        </Card>

        <button onClick={save} disabled={busy} style={{
          width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
          border: 'none', borderRadius: 8, cursor: busy ? 'wait' : 'pointer',
          backgroundColor: INK, color: '#fff', marginBottom: 20,
        }}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>

        {/* Dealer type — a code-minting operation, not a field. */}
        {isDealer && (
          <Card title="Dealer type" hint="Changing this mints a NEW code and retires the current one. The old code is never reused.">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 13 }}>
              {(['SM', 'SS'] as const).map(t => (
                <button key={t} disabled={org.dealer_type === t}
                  onClick={async () => {
                    const label = t === 'SS' ? 'Sales & Service' : 'Sales & Marketing'
                    if (!window.confirm(`Change to ${label} (${t})?\n\n${org.code} will be retired and a new code minted. This cannot be undone.`)) return
                    const reason = window.prompt('Reason (optional)') ?? ''
                    setBusy(true); setBanner(null)
                    try {
                      const r = await onboardingApi.changeDealerType(orgId, t, reason)
                      setOkMsg(`${r.data.old_code} retired — now ${r.data.code}`)
                      await load()
                    } catch (e: any) { setBanner(e.message) } finally { setBusy(false) }
                  }}
                  style={{
                    padding: '8px 14px', fontSize: 12.5, fontFamily: 'inherit', borderRadius: 7,
                    cursor: org.dealer_type === t ? 'default' : 'pointer',
                    fontWeight: org.dealer_type === t ? 700 : 500,
                    border: `1px solid ${org.dealer_type === t ? INK : LINE}`,
                    backgroundColor: org.dealer_type === t ? INK : '#fff',
                    color: org.dealer_type === t ? '#fff' : MUTED,
                  }}>
                  {t === 'SS' ? 'Sales & Service' : 'Sales & Marketing'} ({t})
                </button>
              ))}
            </div>
          </Card>
        )}

        <Card title="Status" hint="Suspending or terminating requires a reason. A terminated partner's code is retired, never reissued.">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 13 }}>
            {(['active', 'suspended', 'terminated'] as const).map(s => (
              <button key={s} disabled={org.status === s}
                onClick={async () => {
                  let reason = ''
                  if (s !== 'active') {
                    reason = window.prompt(`Reason for marking ${s}?`) ?? ''
                    if (!reason.trim()) return
                  }
                  setBusy(true); setBanner(null)
                  try { await onboardingApi.setOrgStatus(orgId, s, reason); setOkMsg(`Marked ${s}.`); await load() }
                  catch (e: any) { setBanner(e.message) } finally { setBusy(false) }
                }}
                style={{
                  padding: '8px 14px', fontSize: 12.5, fontFamily: 'inherit', borderRadius: 7,
                  cursor: org.status === s ? 'default' : 'pointer',
                  fontWeight: org.status === s ? 700 : 500,
                  border: `1px solid ${org.status === s ? INK : LINE}`,
                  backgroundColor: org.status === s ? INK : '#fff',
                  color: org.status === s ? '#fff' : MUTED,
                  textTransform: 'capitalize',
                }}>{s}</button>
            ))}
          </div>
        </Card>

        {/* Codes this partner has held */}
        {org.codes?.length > 1 && (
          <Card title="Code history">
            <div style={{ marginBottom: 13 }}>
              {org.codes.map(c => (
                <div key={c.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '5px 0', color: c.retired_at ? FAINT : INK }}>
                  <span style={{ fontFamily: 'ui-monospace, monospace', textDecoration: c.retired_at ? 'line-through' : 'none' }}>{c.code}</span>
                  <span style={{ fontSize: 11 }}>{c.retired_at ? (c.retired_reason ?? 'retired') : 'current'}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <button onClick={() => setShowLog(s => !s)} style={{
          display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
          cursor: 'pointer', color: MUTED, fontSize: 12.5, fontFamily: 'inherit', padding: '4px 0',
        }}>
          <History size={14} /> {showLog ? 'Hide' : 'Show'} change history ({org.events?.length ?? 0})
        </button>

        {showLog && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(org.events ?? []).length === 0 && <p style={{ fontSize: 12, color: FAINT }}>No changes recorded yet.</p>}
            {(org.events ?? []).map((e, i) => (
              <div key={i} style={{ backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 8, padding: '9px 11px', fontSize: 11.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: MUTED }}>
                  <strong style={{ color: INK }}>{e.event_type.replace(/_/g, ' ')}</strong>
                  <span>{new Date(e.created_at).toLocaleString()}</span>
                </div>
                {e.actor_name && <div style={{ color: FAINT, marginTop: 2 }}>by {e.actor_name}</div>}
                {e.note && <div style={{ color: MUTED, marginTop: 3 }}>{e.note}</div>}
                {e.changes && Object.keys(e.changes).length > 0 && (
                  <div style={{ marginTop: 4, color: MUTED }}>
                    {Object.entries(e.changes).map(([k, v]: any) => (
                      <div key={k}>{k}: <span style={{ color: FAINT }}>{String(v.from ?? '—')}</span> → {String(v.to ?? '—')}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button onClick={load} style={{
          display: 'flex', alignItems: 'center', gap: 5, marginTop: 16,
          background: 'none', border: 'none', cursor: 'pointer', color: FAINT,
          fontSize: 12, fontFamily: 'inherit', padding: 0,
        }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
    </div>
  )
}

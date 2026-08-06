// A dealer's live record, edited by the DISTRIBUTOR who manages them.
//
// Same master-data fields the director gets, minus two:
//
//   status      — suspending or terminating a partner is SGT's call.
//   dealer type — changing it mints a new code, and codes are SGT's to allot.
//
// Both omissions are enforced server-side; this screen simply does not offer
// them. Every save is written to the org's change history attributed to the
// distributor, so SGT can see who changed what.

import { useEffect, useState } from 'react'
import { ArrowLeft, Check, AlertCircle } from 'lucide-react'
import { portalApi, ValidationError, BASE_URL, getToken } from './portalApi'
import LogoField, { logoApiFor } from '../common/LogoField'

const PAPER = '#ECE8DA'
const INK = '#161614'
const MUTED = '#6A675F'
const LINE = '#DDD7C6'
const FAINT = '#A39F94'
const DANGER = '#A6301C'
const OK = '#2F6B4F'

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

export default function DealerEdit({ dealerId, onBack }: { dealerId: number; onBack: () => void }) {
  const [org, setOrg] = useState<any>(null)
  const [form, setForm] = useState<Record<string, any>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    portalApi.dealer(dealerId)
      .then(o => { setOrg(o); setForm(o) })
      .catch(e => setBanner(e.message))
  }, [dealerId])

  const set = (k: string, v: any) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n })
    setOkMsg(null)
  }

  const save = async () => {
    setBusy(true); setBanner(null); setOkMsg(null)
    try {
      const r = await portalApi.saveDealer(dealerId, form)
      setOrg(r.data); setForm(r.data); setErrors({})
      setOkMsg(r.changed?.length ? `Saved — ${r.changed.length} field(s) updated.` : 'Nothing had changed.')
    } catch (e: any) {
      if (e instanceof ValidationError) { setErrors(e.fields); setBanner('Some fields need attention.') }
      else setBanner(e.message)
    } finally { setBusy(false) }
  }

  if (!org) {
    return <div style={{ padding: 30, color: MUTED, backgroundColor: PAPER, height: '100%' }}>{banner ?? 'Loading…'}</div>
  }

  return (
    <div style={{ backgroundColor: PAPER, height: '100%', overflowY: 'auto' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 2, backgroundColor: PAPER,
        padding: '13px 18px 10px', borderBottom: `1px solid ${LINE}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 13, fontFamily: 'inherit', padding: 0 }}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {org.legal_name}
        </div>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 5, backgroundColor: '#EFEADC', color: INK }}>
          {org.code}
        </span>
      </div>

      <div style={{ padding: '14px 18px 80px', maxWidth: 640, margin: '0 auto' }}>
        {banner && <div style={{ padding: '10px 12px', marginBottom: 13, borderRadius: 8, backgroundColor: '#F3DAD5', color: DANGER, fontSize: 12.5 }}>{banner}</div>}
        {okMsg && <div style={{ padding: '10px 12px', marginBottom: 13, borderRadius: 8, backgroundColor: '#DCEBE1', color: OK, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}><Check size={14} /> {okMsg}</div>}

        <p style={{ fontSize: 11.5, color: FAINT, margin: '0 0 13px' }}>
          {org.dealer_type === 'SS' ? 'Sales & Service' : org.dealer_type === 'SM' ? 'Sales & Marketing' : 'Dealer'}
          {' · '}Changes are logged and visible to SGT. To change their type or
          suspend them, ask SGT — those affect the partner code.
        </p>

        <Card title="Business">
          <div style={{ marginBottom: 13 }}>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 5 }}>
              They are
            </label>
            <select value={form.entity_type ?? 'company'} onChange={e => set('entity_type', e.target.value)}
              style={{ ...inputStyle(!!errors.entity_type), appearance: 'auto' }}>
              <option value="company">A company or firm</option>
              <option value="individual">An individual</option>
            </select>
            {errors.entity_type && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11.5, color: DANGER }}>
                <AlertCircle size={12} /> {errors.entity_type}
              </div>
            )}
          </div>
          <F label={(form.entity_type ?? 'company') === 'individual' ? 'Full name' : 'Name'}
             value={form.legal_name} onChange={v => set('legal_name', v)} error={errors.legal_name} />
          <F label="Trade name" value={form.trade_name} onChange={v => set('trade_name', v)} />
          <F label="Territory" value={form.territory} onChange={v => set('territory', v)} />
        </Card>

        {/* Applies from the NEXT quotation onward. Ones already raised keep
            the logo they were printed with — the snapshot is deliberate. */}
        <Card title="Logo" hint="Printed beside SGT’s mark on quotations this dealer raises.">
          <LogoField
            key={dealerId}
            api={logoApiFor(BASE_URL, `/portal/dealers/${dealerId}`, getToken)}
            hint="Takes effect on their next quotation."
          />
        </Card>

        {/* Same snapshot rule as the logo: documents already raised keep
            the signature they were printed with. */}
        <Card title="Signature"
          hint="Printed under the terms on quotations and POs this dealer raises, beside SGT’s.">
          <LogoField
            key={`sign-${dealerId}`}
            noun="signature"
            api={logoApiFor(BASE_URL, `/portal/dealers/${dealerId}`, getToken, 'sign')}
            hint="Takes effect on their next document. Until one is set, their documents print a blank signing line."
          />
        </Card>

        <Card title="Contact">
          <F label="Name" value={form.contact_name} onChange={v => set('contact_name', v)} />
          <F label="Designation" value={form.contact_designation} onChange={v => set('contact_designation', v)} />
          <F label="Mobile" value={form.contact_mobile} onChange={v => set('contact_mobile', v)} />
          <F label="Email" value={form.contact_email} onChange={v => set('contact_email', v)} error={errors.contact_email} />
        </Card>

        <Card title="Tax" hint="Leave blank if they are not registered yet.">
          <F label="GSTIN" value={form.gstin} placeholder="08AABCC1234D1ZB" onChange={v => set('gstin', v.toUpperCase())} error={errors.gstin} />
          <F label="PAN" value={form.pan} placeholder="AABCC1234D" onChange={v => set('pan', v.toUpperCase())} error={errors.pan} />
        </Card>

        <Card title="Address">
          <F label="Address" value={form.address_line1} onChange={v => set('address_line1', v)} />
          <F label="City" value={form.city} onChange={v => set('city', v)} />
          <F label="State" value={form.state} onChange={v => set('state', v)} />
          <F label="PIN code" value={form.pincode} onChange={v => set('pincode', v)} error={errors.pincode} />
        </Card>

        <Card title="Banking" hint="Printed on their quotations as the account the customer pays into. Check it carefully.">
          <F label="Account holder" value={form.bank_account_name} onChange={v => set('bank_account_name', v)} />
          <F label="Account number" value={form.bank_account_number} onChange={v => set('bank_account_number', v)} />
          <F label="IFSC" value={form.bank_ifsc} placeholder="HDFC0001234" onChange={v => set('bank_ifsc', v.toUpperCase())} error={errors.bank_ifsc} />
          <F label="Bank" value={form.bank_name} onChange={v => set('bank_name', v)} />
        </Card>

        <button onClick={save} disabled={busy} style={{
          width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
          border: 'none', borderRadius: 8, cursor: busy ? 'wait' : 'pointer',
          backgroundColor: INK, color: '#fff',
        }}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

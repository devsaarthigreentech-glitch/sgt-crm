// Quotation creation. Used by BOTH the CRM (director/sales) and the
// distributor portal — same component, different endpoints, so the two
// cannot drift.
//
// ERPNext owns the resulting document. This screen does two things:
//   1. resolve — type a kVA, see which GreenX model covers it and at what
//      rate. Free, no side effects, debounced.
//   2. create — an explicit act that writes a Quotation to ERPNext.
//
// The rate shown is whatever ERPNext will actually use, read from its
// Item Price. If that disagrees with our seeded price book the screen
// says so rather than quietly picking one.

import { useEffect, useRef, useState } from 'react'
import { Check, AlertCircle, Zap, FileText, Eye, Download, Send } from 'lucide-react'

const INK = '#161614'
const MUTED = '#6A675F'
const LINE = '#DDD7C6'
const FAINT = '#A39F94'
const DANGER = '#A6301C'
const OK = '#2F6B4F'
const PAPER = '#ECE8DA'
const WARN_BG = '#FBF0DA'
const WARN_FG = '#6F2F0E'

export interface Resolution {
  resolved: boolean
  reason?: string
  message?: string
  modelCode?: string
  ratingLabel?: string
  coversUptoKva?: string
  rate?: string | null
  rateSource?: 'erpnext' | 'price_book' | 'none'
  priceBookMrp?: string | null
  rateMismatch?: boolean
  gstRate?: string
  amcOptions?: { years: number; itemCode: string; rate: string | null }[]
}

export interface ErpCustomer {
  name: string
  customer_name?: string
  gstin?: string | null
  primary_address?: string | null
}

export interface QuoteApi {
  resolve(kva: string): Promise<Resolution>
  create(body: {
    kva: string; qty: number; rate?: string | null
    customerErpName: string
    discountPct?: number | null
    discountAmount?: number | null
    amcYears?: number | null
    orgId?: number | null
    termsTemplate?: string | null
    termsHtml?: string | null
  }): Promise<any>
  searchCustomers(q: string): Promise<ErpCustomer[]>
  createCustomer(body: Record<string, string>): Promise<{ erpName: string; matchedOn: string }>
  pdfUrl(erpName: string): Promise<string>
  recipients(erpName: string): Promise<{ to: string[]; cc: string[]; customerName: string; provider: string }>
  send(erpName: string, body: { to?: string; subject?: string; message?: string }):
    Promise<{ provider: string; to: string[]; cc: string[]; loggedToErp: boolean; note?: string }>
  limits(): Promise<{ discountCaps: Record<string, number>; maxDiscount?: number; amcPct: number }>
  termsList(): Promise<{ templates: string[]; default: string }>
  termsBody(name: string): Promise<string>
  list(): Promise<any[]>
  /** Partner pickers only make sense for SGT staff. */
  partners?: () => Promise<{ id: number; code: string; legal_name: string }[]>
}

const rupees = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? '—'
    : '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })

const inputStyle = (bad?: boolean): React.CSSProperties => ({
  width: '100%', boxSizing: 'border-box', padding: '9px 10px', fontSize: 13.5,
  color: INK, backgroundColor: '#fff', border: `1px solid ${bad ? DANGER : LINE}`,
  borderRadius: 6, outline: 'none', fontFamily: 'inherit',
})

function F({ label, value, onChange, placeholder, type = 'text', hint }: {
  label: string; value: any; onChange: (v: string) => void
  placeholder?: string; type?: string; hint?: string
}) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 5 }}>{label}</label>
      <input type={type} value={value ?? ''} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} style={inputStyle()} />
      {hint && <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: '15px 15px 3px', marginBottom: 13 }}>
      <h3 style={{ margin: '0 0 13px', fontSize: 14, fontWeight: 700, color: INK }}>{title}</h3>
      {children}
    </div>
  )
}

export default function QuoteScreen({ api, showPartnerPicker = false }: {
  api: QuoteApi; showPartnerPicker?: boolean
}) {
  const [kva, setKva] = useState('')
  const [qty, setQty] = useState(1)
  const [res, setRes] = useState<Resolution | null>(null)
  const [resolving, setResolving] = useState(false)
  const [picked, setPicked] = useState<ErpCustomer | null>(null)
  const [custQuery, setCustQuery] = useState('')
  const [custHits, setCustHits] = useState<ErpCustomer[]>([])
  const [custSearching, setCustSearching] = useState(false)
  const [addingCust, setAddingCust] = useState(false)
  const [newCust, setNewCust] = useState({ name: '', gstin: '', state: '', city: '' })
  const [custErrors, setCustErrors] = useState<Record<string, string>>({})
  const [pdfFor, setPdfFor] = useState<{ name: string; url: string } | null>(null)
  const [sendFor, setSendFor] = useState<{
    name: string; to: string; cc: string[]; subject: string; customerName: string; provider: string
  } | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [discountMode, setDiscountMode] = useState<'pct' | 'amount'>('pct')
  const [discountPct, setDiscountPct] = useState('')
  const [discountAmt, setDiscountAmt] = useState('')
  const [amcYears, setAmcYears] = useState(0)
  const [limits, setLimits] = useState<{ discountCaps: Record<string, number>; maxDiscount?: number; amcPct: number } | null>(null)
  const [orgId, setOrgId] = useState<number | null>(null)
  const [partners, setPartners] = useState<{ id: number; code: string; legal_name: string }[]>([])
  const [list, setList] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [made, setMade] = useState<any>(null)
  const [terms, setTerms] = useState<{ templates: string[]; default: string } | null>(null)
  const [termsName, setTermsName] = useState('')
  const [termsHtml, setTermsHtml] = useState('')
  const [termsEdited, setTermsEdited] = useState(false)
  const [showTerms, setShowTerms] = useState(false)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = () => api.list().then(setList).catch(() => {})
  useEffect(() => {
    refresh()
    if (showPartnerPicker && api.partners) api.partners().then(setPartners).catch(() => {})
    api.limits().then(setLimits).catch(() => {})
    api.termsList()
      .then(t => {
        setTerms(t)
        const pick = t.templates.includes(t.default) ? t.default : (t.templates[0] ?? '')
        setTermsName(pick)
      })
      .catch(() => {})
  }, [])

  // Pull the chosen template's wording so it can be read and edited before
  // sending. An edit is never overwritten by a later template load.
  useEffect(() => {
    if (!termsName) { setTermsHtml(''); return }
    let cancelled = false
    api.termsBody(termsName)
      .then(html => { if (!cancelled && !termsEdited) setTermsHtml(html) })
      .catch(() => { if (!cancelled && !termsEdited) setTermsHtml('') })
    return () => { cancelled = true }
  }, [termsName])

  // Debounced preview — resolving is free, so it can run as they type.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!kva.trim()) { setRes(null); return }
    setResolving(true)
    timer.current = setTimeout(async () => {
      try { setRes(await api.resolve(kva)) }
      catch (e: any) { setBanner(e.message) }
      finally { setResolving(false) }
    }, 400)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [kva])

  const custTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (custTimer.current) clearTimeout(custTimer.current)
    if (picked || custQuery.trim().length < 2) { setCustHits([]); return }
    setCustSearching(true)
    custTimer.current = setTimeout(async () => {
      try { setCustHits(await api.searchCustomers(custQuery)) }
      catch { setCustHits([]) }
      finally { setCustSearching(false) }
    }, 350)
    return () => { if (custTimer.current) clearTimeout(custTimer.current) }
  }, [custQuery, picked])

  const addCustomer = async () => {
    setCustErrors({})
    try {
      const r = await api.createCustomer({
        name: newCust.name.trim(), gstin: newCust.gstin.trim(),
        state: newCust.state.trim(), city: newCust.city.trim(),
      })
      setPicked({ name: r.erpName, customer_name: newCust.name.trim(), gstin: newCust.gstin.trim() || null })
      setAddingCust(false)
      setNewCust({ name: '', gstin: '', state: '', city: '' })
      setBanner(null)
    } catch (e: any) {
      if (e?.fields) setCustErrors(e.fields)
      else setBanner(e.message)
    }
  }

  const maxDiscount = limits?.maxDiscount
    ?? Math.max(0, ...Object.values(limits?.discountCaps ?? {}))
  const machineAmt = (Number(res?.rate) || 0) * qty

  // AMC is its own priced item now, so take the real figure rather than
  // recomputing 10% here and risking a number the document will not carry.
  const amcOption = res?.amcOptions?.find(o => o.years === amcYears)
  const amcAmt = amcYears > 0 && amcOption?.rate ? Number(amcOption.rate) * qty : 0
  const amcMissing = amcYears > 0 && !amcOption?.rate

  // The discount applies to the MACHINE LINE only — never to the AMC.
  const discNum = discountMode === 'pct' ? (Number(discountPct) || 0) : 0
  const discAmtNum = discountMode === 'amount' ? (Number(discountAmt) || 0) : 0
  const discountValue = discountMode === 'pct'
    ? Math.round(machineAmt * discNum / 100)
    : Math.round(discAmtNum)
  const effectivePct = machineAmt > 0
    ? Math.round((discountValue / machineAmt) * 10000) / 100
    : 0
  const overCap = effectivePct > maxDiscount
  const netEstimate = machineAmt + amcAmt - discountValue

  const canCreate = !!res?.resolved && !!picked && !busy && !overCap

  const create = async () => {
    if (!canCreate) return
    setBusy(true); setBanner(null); setMade(null)
    try {
      const r = await api.create({
        kva, qty,
        rate: res?.rate ?? null,
        customerErpName: picked!.name,
        ...(showPartnerPicker ? { orgId } : {}),
        discountPct: discountMode === 'pct' && discountPct.trim() ? Number(discountPct) : null,
        discountAmount: discountMode === 'amount' && discountAmt.trim() ? Number(discountAmt) : null,
        amcYears: amcYears > 0 ? amcYears : null,
        termsTemplate: termsName || null,
        termsHtml: termsEdited && termsHtml.trim() ? termsHtml : null,
      })
      setMade(r.data ?? r)
      setKva(''); setRes(null); setQty(1)
      setPicked(null); setCustQuery(''); setCustHits([])
      setDiscountPct(''); setDiscountAmt(''); setAmcYears(0)
      setTermsEdited(false)
      refresh()
    } catch (e: any) { setBanner(e.message) } finally { setBusy(false) }
  }

  return (
    <div style={{ backgroundColor: PAPER, height: '100%', overflowY: 'auto', padding: '20px 18px 60px' }}>
      {sent && (
        <div style={{ padding: '11px 13px', marginBottom: 13, borderRadius: 8, backgroundColor: '#DCEBE1', color: OK, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Check size={15} /> {sent}
        </div>
      )}

      {sendFor && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 60, backgroundColor: 'rgba(22,22,20,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            backgroundColor: '#fff', borderRadius: 12, padding: 20,
            width: '100%', maxWidth: 520, maxHeight: '86vh', overflowY: 'auto',
          }}>
            <h3 style={{ margin: '0 0 3px', fontSize: 15.5, fontWeight: 700, color: INK }}>
              Send {sendFor.name}
            </h3>
            <p style={{ margin: '0 0 15px', fontSize: 12, color: MUTED }}>
              The PDF is attached automatically.
            </p>

            <F label="To" value={sendFor.to}
               onChange={v => setSendFor(x => x && { ...x, to: v })}
               hint="Comma-separated for more than one." />

            <div style={{ marginBottom: 13 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 5 }}>
                Copied automatically
              </label>
              {sendFor.cc.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {sendFor.cc.map(a => (
                    <span key={a} style={{
                      fontSize: 11.5, padding: '4px 9px', borderRadius: 999,
                      backgroundColor: '#EFEADC', color: INK,
                    }}>{a}</span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11.5, color: WARN_FG }}>
                  Nobody yet — set QUOTE_CC_SGT, and a contact email on the partner org.
                </div>
              )}
            </div>

            <F label="Subject" value={sendFor.subject}
               onChange={v => setSendFor(x => x && { ...x, subject: v })} />

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                disabled={sending || !sendFor.to.trim()}
                onClick={async () => {
                  if (!sendFor) return
                  setSending(true); setBanner(null)
                  try {
                    const r = await api.send(sendFor.name, {
                      to: sendFor.to, subject: sendFor.subject,
                    })
                    setSent(
                      `${sendFor.name} sent to ${r.to.join(', ')}` +
                      (r.cc.length ? `, copied to ${r.cc.length}` : '') +
                      (r.note ? ` — ${r.note}` : ''))
                    setSendFor(null)
                  } catch (e: any) { setBanner(e.message) } finally { setSending(false) }
                }}
                style={{
                  flex: 1, padding: '11px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
                  border: 'none', borderRadius: 7,
                  cursor: sending || !sendFor.to.trim() ? 'not-allowed' : 'pointer',
                  backgroundColor: sending || !sendFor.to.trim() ? '#D8D3C4' : INK,
                  color: sending || !sendFor.to.trim() ? '#8C887E' : '#fff',
                }}>
                {sending ? 'Sending…' : 'Send now'}
              </button>
              <button onClick={() => setSendFor(null)} disabled={sending} style={{
                padding: '11px 16px', fontSize: 13.5, fontFamily: 'inherit',
                border: `1px solid ${LINE}`, borderRadius: 7, cursor: 'pointer',
                background: '#fff', color: MUTED,
              }}>Cancel</button>
            </div>
            <div style={{ fontSize: 10.5, color: FAINT, marginTop: 9, textAlign: 'center' }}>
              via {sendFor.provider === 'n8n' ? 'n8n' : 'ERPNext'}
            </div>
          </div>
        </div>
      )}

      {pdfFor && (
        <div
          onClick={() => { URL.revokeObjectURL(pdfFor.url); setPdfFor(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(22,22,20,0.55)',
            display: 'flex', flexDirection: 'column', padding: '3vh 3vw',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1, color: '#fff', fontSize: 13.5, fontWeight: 600 }}>{pdfFor.name}</div>
            <a href={pdfFor.url} download={`${pdfFor.name}.pdf`} onClick={e => e.stopPropagation()}
              style={{ color: '#fff', fontSize: 12.5, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 6, padding: '5px 11px' }}>
              Download
            </a>
            <button onClick={() => { URL.revokeObjectURL(pdfFor.url); setPdfFor(null) }}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,0.5)', color: '#fff', borderRadius: 6, padding: '5px 11px', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit' }}>
              Close
            </button>
          </div>
          <iframe title={pdfFor.name} src={pdfFor.url} onClick={e => e.stopPropagation()}
            style={{ flex: 1, width: '100%', border: 'none', borderRadius: 8, backgroundColor: '#fff' }} />
        </div>
      )}

      <h1 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: INK }}>Quotations</h1>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: MUTED }}>
        Enter the customer's DG rating; the matching GreenX model is selected automatically.
      </p>

      {banner && (
        <div style={{ padding: '10px 12px', marginBottom: 13, borderRadius: 8, backgroundColor: '#F3DAD5', color: DANGER, fontSize: 12.5 }}>
          {banner}
        </div>
      )}

      {made && (
        <div style={{ padding: '13px 15px', marginBottom: 13, borderRadius: 10, backgroundColor: '#DCEBE1', color: OK }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700 }}>
            <Check size={16} /> {made.erpName} created in ERPNext
          </div>
          <div style={{ fontSize: 11.5, opacity: 0.9, marginTop: 4 }}>
            {made.model} × {made.qty} · net {rupees(made.netTotal)}
            {' · GST '}{rupees(made.totalTax)} · total {rupees(made.grandTotal)}
            {made.totalCommission ? ` · commission ${rupees(made.totalCommission)}` : ''}
            {made.customer?.matchedOn === 'created' ? ' · new customer created' : ''}
          </div>
          {made.taxWarning && (
            <div style={{
              marginTop: 8, padding: '8px 10px', borderRadius: 6, fontSize: 11.5,
              backgroundColor: WARN_BG, color: WARN_FG,
              display: 'flex', alignItems: 'flex-start', gap: 5,
            }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span><strong>No GST on this quotation.</strong> {made.taxWarning}</span>
            </div>
          )}
          {made.termsWarning && (
            <div style={{
              marginTop: 8, padding: '8px 10px', borderRadius: 6, fontSize: 11.5,
              backgroundColor: WARN_BG, color: WARN_FG,
              display: 'flex', alignItems: 'flex-start', gap: 5,
            }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{made.termsWarning}</span>
            </div>
          )}
          {made.termsTemplate && !made.termsWarning && (
            <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 3 }}>
              Terms: {made.termsTemplate}
            </div>
          )}
          {made.mirrored === false && (
            <div style={{ fontSize: 11.5, marginTop: 5, color: WARN_FG }}>
              Saved in ERPNext but not mirrored locally — it may not appear in the list below.
            </div>
          )}
        </div>
      )}

      <div style={{ maxWidth: 620 }}>
        <Card title="Machine">
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 2 }}>
              <F label="DG rating (kVA)" value={kva} onChange={setKva} placeholder="e.g. 70" type="number" />
            </div>
            <div style={{ flex: 1 }}>
              <F label="Quantity" value={qty} onChange={v => setQty(Math.max(1, Number(v) || 1))} type="number" />
            </div>
          </div>

          {resolving && <div style={{ fontSize: 12, color: FAINT, marginBottom: 13 }}>Resolving…</div>}

          {res && !resolving && (
            res.resolved ? (
              <div style={{ padding: '11px 12px', marginBottom: 13, borderRadius: 8, backgroundColor: '#F2F6F2', border: `1px solid #CFE0D4` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, color: INK }}>
                  <Zap size={14} /> {res.modelCode}
                </div>
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3 }}>
                  covers DG up to {res.coversUptoKva} kVA · GST {res.gstRate}%
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: INK, marginTop: 6 }}>
                  {rupees(res.rate)} <span style={{ fontSize: 11, fontWeight: 500, color: FAINT }}>
                    per unit, ex-GST{qty > 1 ? ` · ${qty} units = ${rupees(Number(res.rate ?? 0) * qty)}` : ''}
                  </span>
                </div>
                {res.rateSource === 'price_book' && (
                  <div style={{ fontSize: 11, color: WARN_FG, marginTop: 5 }}>
                    ERPNext has no price for this item — using the CRM price book.
                  </div>
                )}
                {res.rateMismatch && (
                  <div style={{ fontSize: 11, color: WARN_FG, marginTop: 5, display: 'flex', gap: 4 }}>
                    <AlertCircle size={12} />
                    ERPNext says {rupees(res.rate)}, the CRM price book says {rupees(res.priceBookMrp)}. ERPNext wins.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '11px 12px', marginBottom: 13, borderRadius: 8, backgroundColor: WARN_BG, color: WARN_FG, fontSize: 12.5, display: 'flex', gap: 6 }}>
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{res.message}</span>
              </div>
            )
          )}
        </Card>

        <Card title="Customer">
          {picked ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13,
              padding: '10px 12px', borderRadius: 7,
              backgroundColor: '#F2F6F2', border: '1px solid #CFE0D4',
            }}>
              <Check size={15} style={{ color: OK, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>
                  {picked.customer_name || picked.name}
                </div>
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                  {picked.gstin ? `GSTIN ${picked.gstin}` : 'No GSTIN on record'}
                </div>
              </div>
              <button type="button" onClick={() => { setPicked(null); setCustQuery('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 12, fontFamily: 'inherit' }}>
                Change
              </button>
            </div>
          ) : addingCust ? (
            <div style={{ marginBottom: 13, padding: 12, borderRadius: 8, border: `1px dashed ${LINE}`, backgroundColor: '#FCFBF7' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 10 }}>New customer</div>
              <F label="Name" value={newCust.name} onChange={v => setNewCust(c => ({ ...c, name: v }))} />
              {custErrors.name && <div style={{ fontSize: 11.5, color: DANGER, marginTop: -8, marginBottom: 10 }}>{custErrors.name}</div>}
              <F label="GSTIN" value={newCust.gstin} placeholder="27AAECC3132G1Z1"
                 onChange={v => setNewCust(c => ({ ...c, gstin: v.toUpperCase() }))} />
              {custErrors.gstin && <div style={{ fontSize: 11.5, color: DANGER, marginTop: -8, marginBottom: 10 }}>{custErrors.gstin}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <F label="City" value={newCust.city} onChange={v => setNewCust(c => ({ ...c, city: v }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <F label="State" value={newCust.state} onChange={v => setNewCust(c => ({ ...c, state: v }))} />
                </div>
              </div>
              {custErrors.state && <div style={{ fontSize: 11.5, color: DANGER, marginTop: -8, marginBottom: 10 }}>{custErrors.state}</div>}
              <div style={{ fontSize: 11, color: FAINT, marginBottom: 10 }}>
                A GSTIN or a state is required — without one, GST cannot be worked out
                and the quotation would go out with no tax.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={addCustomer} style={{
                  padding: '8px 14px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                  border: 'none', borderRadius: 6, cursor: 'pointer', backgroundColor: INK, color: '#fff',
                }}>Add customer</button>
                <button type="button" onClick={() => { setAddingCust(false); setCustErrors({}) }} style={{
                  padding: '8px 14px', fontSize: 12.5, fontFamily: 'inherit',
                  border: `1px solid ${LINE}`, borderRadius: 6, cursor: 'pointer',
                  background: '#fff', color: MUTED,
                }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 13 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 5 }}>
                Search existing customers
              </label>
              <input value={custQuery} onChange={e => setCustQuery(e.target.value)}
                placeholder="Name or GSTIN — at least 2 characters" style={inputStyle()} />
              {custSearching && <div style={{ fontSize: 11.5, color: FAINT, marginTop: 5 }}>Searching…</div>}
              {custHits.length > 0 && (
                <div style={{ marginTop: 6, border: `1px solid ${LINE}`, borderRadius: 7, overflow: 'hidden' }}>
                  {custHits.map(c => (
                    <button key={c.name} type="button" onClick={() => { setPicked(c); setCustHits([]) }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                        padding: '9px 11px', background: '#fff', border: 'none',
                        borderBottom: `1px solid ${LINE}`, fontFamily: 'inherit',
                      }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>{c.customer_name || c.name}</div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>
                        {c.gstin ? `GSTIN ${c.gstin}` : 'No GSTIN'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {custQuery.trim().length >= 2 && !custSearching && custHits.length === 0 && (
                <div style={{ fontSize: 12, color: MUTED, marginTop: 7 }}>No match.</div>
              )}
              <button type="button" onClick={() => { setAddingCust(true); setNewCust(c => ({ ...c, name: custQuery.trim() })) }}
                style={{
                  marginTop: 9, display: 'flex', alignItems: 'center', gap: 5,
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: MUTED, fontSize: 12.5, fontFamily: 'inherit',
                }}>
                + Add a new customer
              </button>
              <div style={{ fontSize: 11, color: FAINT, marginTop: 6 }}>
                Quoting never creates a customer on its own — adding one is a separate step.
              </div>
            </div>
          )}
        </Card>

        {showPartnerPicker && (
          <Card title="Partner">
            <div style={{ marginBottom: 13 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 5 }}>
                Raised through
              </label>
              <select value={orgId ?? ''} onChange={e => setOrgId(e.target.value ? Number(e.target.value) : null)}
                style={{ ...inputStyle(), appearance: 'auto' }}>
                <option value="">SGT direct — no partner</option>
                {partners.map(p => <option key={p.id} value={p.id}>{p.legal_name} ({p.code})</option>)}
              </select>
              <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>
                Sets the sales partner on the ERPNext quotation so their commission is computed.
              </div>
            </div>
          </Card>
        )}

        <Card title="Commercials">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 5 }}>
                Discount on {res?.resolved ? res.modelCode : 'the unit'}
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={discountMode}
                  onChange={e => { setDiscountMode(e.target.value as 'pct' | 'amount'); setDiscountPct(''); setDiscountAmt('') }}
                  style={{ ...inputStyle(), appearance: 'auto', width: 92, flexShrink: 0 }}>
                  <option value="pct">%</option>
                  <option value="amount">₹</option>
                </select>
                {discountMode === 'pct' ? (
                  <input type="number" value={discountPct} min={0} max={maxDiscount} step="0.5"
                    onChange={e => setDiscountPct(e.target.value)}
                    placeholder="0" style={inputStyle(overCap)} />
                ) : (
                  <input type="number" value={discountAmt} min={0} step="1000"
                    onChange={e => setDiscountAmt(e.target.value)}
                    placeholder="0" style={inputStyle(overCap)} />
                )}
              </div>
              <div style={{ fontSize: 11, color: overCap ? DANGER : FAINT, marginTop: 3 }}>
                {overCap
                  ? `${effectivePct}% is over your ${maxDiscount}% limit — most you can give is ${rupees(Math.floor(machineAmt * maxDiscount / 100))}.`
                  : discountMode === 'amount' && discountValue > 0
                    ? `${effectivePct}% of the unit line. Limit ${maxDiscount}%.`
                    : `Up to ${maxDiscount}%, on the unit only — never the AMC.`}
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 5 }}>
                AMC
              </label>
              <select value={amcYears} onChange={e => setAmcYears(Number(e.target.value))}
                style={{ ...inputStyle(amcMissing), appearance: 'auto' }}>
                <option value={0}>Not included</option>
                {(res?.amcOptions ?? [{ years: 1 }, { years: 2 }, { years: 3 }] as any).map((o: any) => (
                  <option key={o.years} value={o.years}>
                    {o.years} year{o.years > 1 ? 's' : ''}{o.rate ? ` — ${rupees(o.rate)}` : ''}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: amcMissing ? DANGER : FAINT, marginTop: 3 }}>
                {amcMissing
                  ? 'No price in ERPNext for this AMC — run the AMC matrix script.'
                  : 'Priced per model. Not discounted.'}
              </div>
            </div>
          </div>

          {res?.resolved && (discountValue > 0 || amcAmt > 0) && (
            <div style={{
              marginTop: 13, marginBottom: 13, padding: '10px 12px', borderRadius: 7,
              backgroundColor: '#F7F4EA', border: `1px solid ${LINE}`, fontSize: 12, color: INK,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{res.modelCode} × {qty}</span><span>{rupees(machineAmt)}</span>
              </div>
              {discountValue > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, color: WARN_FG }}>
                  <span>Less discount ({effectivePct}%)</span><span>− {rupees(discountValue)}</span>
                </div>
              )}
              {amcAmt > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                  <span>AMC · {amcYears} yr{amcYears > 1 ? 's' : ''}{qty > 1 ? ` × ${qty}` : ''}</span>
                  <span>{rupees(amcAmt)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: `1px solid ${LINE}`, fontWeight: 700 }}>
                <span>Net, before GST</span><span>{rupees(netEstimate)}</span>
              </div>
              <div style={{ fontSize: 10.5, color: FAINT, marginTop: 4 }}>
                Estimate — ERPNext computes the binding figures.
              </div>
            </div>
          )}
        </Card>

        <Card title="Terms and conditions">
          <div style={{ marginBottom: 13 }}>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 5 }}>
              Template
            </label>
            <select
              value={termsName}
              onChange={e => { setTermsName(e.target.value); setTermsEdited(false) }}
              style={{ ...inputStyle(), appearance: 'auto' }}
            >
              <option value="">No terms</option>
              {(terms?.templates ?? []).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>
              Applied to every quotation unless you change it here.
            </div>
          </div>

          {termsName && (
            <div style={{ marginBottom: 13 }}>
              <button
                type="button"
                onClick={() => setShowTerms(v => !v)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: MUTED, fontSize: 12.5, fontFamily: 'inherit',
                }}
              >
                {showTerms ? 'Hide' : 'Read / edit'} the wording
                {termsEdited && <span style={{ color: WARN_FG }}> · edited for this quote</span>}
              </button>

              {showTerms && (
                <>
                  <div
                    style={{
                      marginTop: 8, padding: '10px 12px', borderRadius: 7,
                      border: `1px solid ${LINE}`, backgroundColor: '#FCFBF7',
                      fontSize: 12, color: INK, maxHeight: 190, overflowY: 'auto',
                    }}
                    dangerouslySetInnerHTML={{ __html: termsHtml || '<em>Nothing to show.</em>' }}
                  />
                  <textarea
                    value={termsHtml}
                    onChange={e => { setTermsHtml(e.target.value); setTermsEdited(true) }}
                    rows={7}
                    spellCheck={false}
                    style={{
                      ...inputStyle(), marginTop: 8, fontFamily: 'ui-monospace, monospace',
                      fontSize: 11.5, lineHeight: 1.5, resize: 'vertical',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 5 }}>
                    <span style={{ fontSize: 11, color: FAINT }}>
                      Edits apply to this quotation only — the template is unchanged.
                    </span>
                    {termsEdited && (
                      <button
                        type="button"
                        onClick={() => {
                          setTermsEdited(false)
                          api.termsBody(termsName).then(setTermsHtml).catch(() => {})
                        }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                          color: MUTED, fontSize: 11, fontFamily: 'inherit', whiteSpace: 'nowrap',
                        }}
                      >
                        Reset to template
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </Card>

        <button onClick={create} disabled={!canCreate} style={{
          width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
          border: 'none', borderRadius: 8, marginBottom: 24,
          cursor: canCreate ? 'pointer' : 'not-allowed',
          backgroundColor: canCreate ? INK : '#D8D3C4',
          color: canCreate ? '#fff' : '#8C887E',
        }}>
          {busy ? 'Creating in ERPNext…' : 'Create quotation'}
        </button>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: INK }}>Recent</h2>
          <button type="button" onClick={refresh} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: MUTED, fontSize: 12, fontFamily: 'inherit',
          }}>
            Refresh
          </button>
          <span style={{ fontSize: 11, color: FAINT }}>
            checked against ERPNext each time
          </span>
        </div>
        {list.length === 0 ? (
          <p style={{ fontSize: 13, color: FAINT }}>No quotations yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map(q => (
              <div key={q.erp_name} style={{ backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 9, padding: '11px 13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <FileText size={13} /> {q.customer_name}
                    </div>
                    <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                      {q.erp_name} · {q.model_code}{q.qty > 1 ? ` × ${q.qty}` : ''}
                      {q.input_kva ? ` · ${Number(q.input_kva)} kVA` : ''}
                      {q.org_code ? ` · ${q.org_code}` : ' · SGT direct'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{rupees(q.grand_total)}</div>
                    <div style={{ fontSize: 10.5, color: FAINT }}>incl. GST</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${LINE}` }}>
                  <button type="button"
                    onClick={async () => {
                      setBanner(null)
                      try { setPdfFor({ name: q.erp_name, url: await api.pdfUrl(q.erp_name) }) }
                      catch (e: any) { setBanner(e.message) }
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: MUTED, fontSize: 11.5, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Eye size={13} /> Preview
                  </button>
                  <button type="button"
                    onClick={async () => {
                      setBanner(null)
                      try {
                        const url = await api.pdfUrl(q.erp_name)
                        const a = document.createElement('a')
                        a.href = url; a.download = `${q.erp_name}.pdf`
                        document.body.appendChild(a); a.click(); a.remove()
                        setTimeout(() => URL.revokeObjectURL(url), 30000)
                      } catch (e: any) { setBanner(e.message) }
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: MUTED, fontSize: 11.5, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Download size={13} /> Download
                  </button>
                  <button type="button"
                    onClick={async () => {
                      setBanner(null); setSent(null)
                      try {
                        const r = await api.recipients(q.erp_name)
                        setSendFor({
                          name: q.erp_name,
                          to: r.to.join(', '),
                          cc: r.cc,
                          customerName: r.customerName,
                          provider: r.provider,
                          subject: `Quotation ${q.erp_name} from SGT HydroEdge`,
                        })
                      } catch (e: any) { setBanner(e.message) }
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: MUTED, fontSize: 11.5, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Send size={13} /> Send
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

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
import { Check, AlertCircle, Zap, FileText } from 'lucide-react'

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
}

export interface QuoteApi {
  resolve(kva: string): Promise<Resolution>
  create(body: {
    kva: string; qty: number; rate?: string | null
    customer: { name: string; gstin?: string; state?: string; city?: string }
    orgId?: number | null
    termsTemplate?: string | null
    termsHtml?: string | null
  }): Promise<any>
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
  const [cust, setCust] = useState({ name: '', gstin: '', state: '', city: '' })
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

  const canCreate = !!res?.resolved && !!cust.name.trim() && !busy

  const create = async () => {
    if (!canCreate) return
    setBusy(true); setBanner(null); setMade(null)
    try {
      const r = await api.create({
        kva, qty,
        rate: res?.rate ?? null,
        customer: {
          name: cust.name.trim(),
          gstin: cust.gstin.trim() || undefined,
          state: cust.state.trim() || undefined,
          city: cust.city.trim() || undefined,
        },
        ...(showPartnerPicker ? { orgId } : {}),
        termsTemplate: termsName || null,
        termsHtml: termsEdited && termsHtml.trim() ? termsHtml : null,
      })
      setMade(r.data ?? r)
      setKva(''); setRes(null); setQty(1)
      setCust({ name: '', gstin: '', state: '', city: '' })
      setTermsEdited(false)
      refresh()
    } catch (e: any) { setBanner(e.message) } finally { setBusy(false) }
  }

  return (
    <div style={{ backgroundColor: PAPER, height: '100%', overflowY: 'auto', padding: '20px 18px 60px' }}>
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
          <F label="Name" value={cust.name} onChange={v => setCust(c => ({ ...c, name: v }))} />
          <F label="GSTIN" value={cust.gstin} placeholder="Optional"
             onChange={v => setCust(c => ({ ...c, gstin: v.toUpperCase() }))}
             hint="Used to match an existing ERPNext customer, and to decide CGST+SGST vs IGST." />
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><F label="City" value={cust.city} onChange={v => setCust(c => ({ ...c, city: v }))} /></div>
            <div style={{ flex: 1 }}><F label="State" value={cust.state} onChange={v => setCust(c => ({ ...c, state: v }))} /></div>
          </div>
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

        <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: INK }}>Recent</h2>
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

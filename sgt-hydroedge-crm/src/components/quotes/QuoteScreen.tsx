// Quotation creation. Used by BOTH the CRM (director/sales) and the
// distributor portal — same component, different endpoints, so the two
// cannot drift.
//
// ERPNext owns the resulting document. This screen does two things:
//   1. resolve — type a kVA, see which GreenX model covers it and at what
//      rate. Free, no side effects, debounced. Once per machine.
//   2. create — an explicit act that writes a Quotation to ERPNext.
//
// The rate shown is whatever ERPNext will actually use, read from its
// Item Price. If that disagrees with our seeded price book the screen
// says so rather than quietly picking one.
//
// MANY MACHINES, ONE QUOTATION. A plant room is rarely one set: three
// DGs of three ratings is one enquiry and should be one document. Each
// line resolves, prices and discounts on its own — MachineLine below owns
// its own debounce and reports its resolution upward.

import { useEffect, useRef, useState } from 'react'
import {
  Check, AlertCircle, Zap, FileText, Send, Plus, X, Paperclip, Trash2,
} from 'lucide-react'

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

/** One optional specification input, defined server-side. */
export interface SpecField {
  key: string
  label: string
  group: string
  placeholder?: string
  unit?: string
  numeric?: boolean
}

/** A document attached to the quotation in ERPNext. */
export interface QuoteAttachment {
  name: string
  fileName: string
  fileUrl: string
  sizeBytes: number | null
  createdAt: string | null
}

export interface RecipientPlan {
  to: string[]
  cc: string[]
  customerName: string
  provider: string
  attachments?: QuoteAttachment[]
  suggestedSubject?: string
  /** Plain text — what the sender reads and edits. */
  suggestedMessageText?: string
  /** The same letter as HTML, which is what the customer receives. */
  suggestedMessage?: string
}

/** What the screen sends for one machine. */
export interface QuoteLinePayload {
  kva: string
  qty: number
  rate?: string | null
  discountPct?: number | null
  discountAmount?: number | null
  amcYears?: number | null
  spec?: Record<string, string> | null
}

export interface QuoteApi {
  resolve(kva: string): Promise<Resolution>
  create(body: {
    lines: QuoteLinePayload[]
    customerErpName: string
    taxMode?: 'auto' | 'in_state' | 'out_state'
    orgId?: number | null
    termsTemplate?: string | null
    termsHtml?: string | null
  }): Promise<any>
  searchCustomers(q: string): Promise<ErpCustomer[]>
  createCustomer(body: Record<string, string>): Promise<{ erpName: string; matchedOn: string }>
  pdfUrl(erpName: string): Promise<string>
  recipients(erpName: string): Promise<RecipientPlan>
  send(erpName: string, body: {
    to?: string; subject?: string; message?: string
    /** 'text' means the server converts the message to HTML before sending. */
    messageFormat?: 'text' | 'html'
    attachments?: string[]
  }): Promise<{ provider: string; to: string[]; cc: string[]; loggedToErp: boolean; note?: string; attached?: string[] }>
  limits(): Promise<{ discountCaps: Record<string, number>; maxDiscount?: number; amcPct: number; attachMaxMb?: number }>
  termsList(): Promise<{ templates: string[]; default: string }>
  termsBody(name: string): Promise<string>
  list(): Promise<any[]>
  specFields(): Promise<SpecField[]>
  attachments(erpName: string): Promise<QuoteAttachment[]>
  attach(erpName: string, file: File): Promise<QuoteAttachment>
  detach(erpName: string, fileName: string): Promise<{ removed: string }>
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

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 5,
}

function F({ label, value, onChange, placeholder, type = 'text', hint }: {
  label: string; value: any; onChange: (v: string) => void
  placeholder?: string; type?: string; hint?: string
}) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={value ?? ''} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} style={inputStyle()} />
      {hint && <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

function Card({ title, right, children }: {
  title: string; right?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div style={{ backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: '15px 15px 3px', marginBottom: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 13px' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: INK, flex: 1 }}>{title}</h3>
        {right}
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------
// One machine on the quotation.
// ---------------------------------------------------------------------

interface LineState {
  /** Stable across re-orders, so React keys never collide. */
  id: number
  kva: string
  qty: number
  discountMode: 'pct' | 'amount'
  discountPct: string
  discountAmt: string
  amcYears: number
  spec: Record<string, string>
  showSpec: boolean
  res: Resolution | null
  resolving: boolean
}

let nextLineId = 1
const blankLine = (): LineState => ({
  id: nextLineId++,
  kva: '', qty: 1,
  discountMode: 'pct', discountPct: '', discountAmt: '',
  amcYears: 0, spec: {}, showSpec: false,
  res: null, resolving: false,
})

/** Machine value, discount and AMC for one line — one place, so the
 *  summary, the cap check and the payload can never disagree. */
function lineMaths(l: LineState) {
  const machineAmt = (Number(l.res?.rate) || 0) * l.qty
  const amcOption = l.res?.amcOptions?.find(o => o.years === l.amcYears)
  const amcAmt = l.amcYears > 0 && amcOption?.rate ? Number(amcOption.rate) * l.qty : 0
  const amcMissing = l.amcYears > 0 && !amcOption?.rate
  const discountValue = l.discountMode === 'pct'
    ? Math.round(machineAmt * (Number(l.discountPct) || 0) / 100)
    : Math.round(Number(l.discountAmt) || 0)
  const effectivePct = machineAmt > 0
    ? Math.round((discountValue / machineAmt) * 10000) / 100
    : 0
  return { machineAmt, amcAmt, amcMissing, discountValue, effectivePct }
}

function MachineLine({
  line, index, count, maxDiscount, specFields, api, onChange, onRemove,
}: {
  line: LineState
  index: number
  count: number
  maxDiscount: number
  specFields: SpecField[]
  api: QuoteApi
  onChange: (patch: Partial<LineState>) => void
  onRemove: () => void
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced preview — resolving is free, so it can run as they type.
  // Owned by the line rather than the screen: with several machines on
  // one quotation a single shared timer would cancel its siblings.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!line.kva.trim()) {
      if (line.res || line.resolving) onChange({ res: null, resolving: false })
      return
    }
    onChange({ resolving: true })
    timer.current = setTimeout(async () => {
      try { onChange({ res: await api.resolve(line.kva), resolving: false }) }
      catch { onChange({ resolving: false }) }
    }, 400)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [line.kva])

  const m = lineMaths(line)
  const overCap = m.effectivePct > maxDiscount
  const res = line.res
  const specCount = Object.values(line.spec).filter(v => String(v).trim()).length

  const groups = [...new Set(specFields.map(f => f.group))]

  return (
    <div style={{
      border: `1px solid ${LINE}`, borderRadius: 9, padding: '12px 13px 1px',
      marginBottom: 11, backgroundColor: '#FCFBF7',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
          color: FAINT, flex: 1,
        }}>
          Machine {index + 1}{count > 1 ? ` of ${count}` : ''}
        </span>
        {count > 1 && (
          <button type="button" onClick={onRemove} title="Remove this machine"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: FAINT, padding: 2, display: 'flex' }}>
            <X size={15} />
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 2 }}>
          <F label="DG rating (kVA)" value={line.kva} type="number" placeholder="e.g. 70"
             onChange={v => onChange({ kva: v })} />
        </div>
        <div style={{ flex: 1 }}>
          <F label="Quantity" value={line.qty} type="number"
             onChange={v => onChange({ qty: Math.max(1, Number(v) || 1) })} />
        </div>
      </div>

      {line.resolving && <div style={{ fontSize: 12, color: FAINT, marginBottom: 13 }}>Resolving…</div>}

      {res && !line.resolving && (
        res.resolved ? (
          <div style={{ padding: '11px 12px', marginBottom: 13, borderRadius: 8, backgroundColor: '#F2F6F2', border: '1px solid #CFE0D4' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, color: INK }}>
              <Zap size={14} /> {res.modelCode}
            </div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3 }}>
              covers DG up to {res.coversUptoKva} kVA · GST {res.gstRate}%
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: INK, marginTop: 6 }}>
              {rupees(res.rate)} <span style={{ fontSize: 11, fontWeight: 500, color: FAINT }}>
                per unit, ex-GST{line.qty > 1 ? ` · ${line.qty} units = ${rupees(m.machineAmt)}` : ''}
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

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Discount</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={line.discountMode}
              onChange={e => onChange({
                discountMode: e.target.value as 'pct' | 'amount',
                discountPct: '', discountAmt: '',
              })}
              style={{ ...inputStyle(), appearance: 'auto', width: 74, flexShrink: 0 }}>
              <option value="pct">%</option>
              <option value="amount">₹</option>
            </select>
            {line.discountMode === 'pct' ? (
              <input type="number" value={line.discountPct} min={0} max={maxDiscount} step="0.5"
                onChange={e => onChange({ discountPct: e.target.value })}
                placeholder="0" style={inputStyle(overCap)} />
            ) : (
              <input type="number" value={line.discountAmt} min={0} step="1000"
                onChange={e => onChange({ discountAmt: e.target.value })}
                placeholder="0" style={inputStyle(overCap)} />
            )}
          </div>
          <div style={{ fontSize: 11, color: overCap ? DANGER : FAINT, marginTop: 3 }}>
            {overCap
              ? `${m.effectivePct}% is over your ${maxDiscount}% limit — most you can give on this machine is ${rupees(Math.floor(m.machineAmt * maxDiscount / 100))}.`
              : line.discountMode === 'amount' && m.discountValue > 0
                ? `${m.effectivePct}% of this machine. Limit ${maxDiscount}%.`
                : `Up to ${maxDiscount}%, on this machine only — never the AMC.`}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <label style={labelStyle}>AMC</label>
          <select value={line.amcYears} onChange={e => onChange({ amcYears: Number(e.target.value) })}
            style={{ ...inputStyle(m.amcMissing), appearance: 'auto' }}>
            <option value={0}>Not included</option>
            {(res?.amcOptions ?? [{ years: 1 }, { years: 2 }, { years: 3 }] as any).map((o: any) => (
              <option key={o.years} value={o.years}>
                {o.years} year{o.years > 1 ? 's' : ''}{o.rate ? ` — ${rupees(o.rate)}` : ''}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: m.amcMissing ? DANGER : FAINT, marginTop: 3 }}>
            {m.amcMissing
              ? 'No price in ERPNext for this AMC — run the AMC matrix script.'
              : 'Priced per model. Not discounted.'}
          </div>
        </div>
      </div>

      {/* ---- Specification: optional, and collapsed until asked for ---- */}
      <div style={{ marginTop: 13, marginBottom: 13 }}>
        <button type="button" onClick={() => onChange({ showSpec: !line.showSpec })}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: MUTED, fontSize: 12.5, fontFamily: 'inherit',
          }}>
          {line.showSpec ? 'Hide' : 'Add'} specification
          {specCount > 0 && <span style={{ color: OK }}> · {specCount} filled in</span>}
        </button>
        <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>
          Engine, alternator, dimensions. All optional — whatever you fill in is
          printed under this line on the quotation.
        </div>

        {line.showSpec && (
          <div style={{ marginTop: 10 }}>
            {groups.map(g => (
              <div key={g} style={{ marginBottom: 6 }}>
                <div style={{
                  fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em',
                  textTransform: 'uppercase', color: FAINT, marginBottom: 7,
                }}>{g}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {specFields.filter(f => f.group === g).map(f => (
                    <div key={f.key} style={{ flex: '1 1 200px', minWidth: 0, marginBottom: 11 }}>
                      <label style={labelStyle}>
                        {f.label}{f.unit ? ` (${f.unit})` : ''}
                      </label>
                      <input
                        type={f.numeric ? 'number' : 'text'}
                        value={line.spec[f.key] ?? ''}
                        placeholder={f.placeholder}
                        onChange={e => onChange({ spec: { ...line.spec, [f.key]: e.target.value } })}
                        style={inputStyle()}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {specCount > 0 && (
              <button type="button" onClick={() => onChange({ spec: {} })}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: MUTED, fontSize: 11.5, fontFamily: 'inherit', marginBottom: 11,
                }}>
                Clear this specification
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------

export default function QuoteScreen({ api, showPartnerPicker = false }: {
  api: QuoteApi; showPartnerPicker?: boolean
}) {
  const [lines, setLines] = useState<LineState[]>([blankLine()])
  const [specFields, setSpecFields] = useState<SpecField[]>([])
  const [picked, setPicked] = useState<ErpCustomer | null>(null)
  const [custQuery, setCustQuery] = useState('')
  const [custHits, setCustHits] = useState<ErpCustomer[]>([])
  const [custSearching, setCustSearching] = useState(false)
  const [addingCust, setAddingCust] = useState(false)
  const [newCust, setNewCust] = useState({ name: '', gstin: '', state: '', city: '', entityType: 'Company' })
  const [custErrors, setCustErrors] = useState<Record<string, string>>({})
  const [taxMode, setTaxMode] = useState<'auto' | 'in_state' | 'out_state'>('auto')
  const [pdfFor, setPdfFor] = useState<{ name: string; url: string } | null>(null)
  const [sendFor, setSendFor] = useState<{
    name: string; to: string; cc: string[]; subject: string; message: string
    customerName: string; provider: string
    attachments: QuoteAttachment[]; chosen: string[]
  } | null>(null)
  const [sending, setSending] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [limits, setLimits] = useState<{ discountCaps: Record<string, number>; maxDiscount?: number; amcPct: number; attachMaxMb?: number } | null>(null)
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

  const fileInput = useRef<HTMLInputElement | null>(null)

  const refresh = () => api.list().then(setList).catch(() => {})
  useEffect(() => {
    refresh()
    if (showPartnerPicker && api.partners) api.partners().then(setPartners).catch(() => {})
    api.limits().then(setLimits).catch(() => {})
    api.specFields().then(setSpecFields).catch(() => {})
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
        entityType: newCust.entityType,
      })
      setPicked({ name: r.erpName, customer_name: newCust.name.trim(), gstin: newCust.gstin.trim() || null })
      setAddingCust(false)
      setNewCust({ name: '', gstin: '', state: '', city: '', entityType: 'Company' })
      setBanner(null)
    } catch (e: any) {
      if (e?.fields) setCustErrors(e.fields)
      else setBanner(e.message)
    }
  }

  const patchLine = (id: number, patch: Partial<LineState>) =>
    setLines(ls => ls.map(l => (l.id === id ? { ...l, ...patch } : l)))

  const maxDiscount = limits?.maxDiscount
    ?? Math.max(0, ...Object.values(limits?.discountCaps ?? {}))

  const filled = lines.filter(l => l.kva.trim())
  const totals = filled.reduce((acc, l) => {
    const m = lineMaths(l)
    return {
      machine: acc.machine + m.machineAmt,
      amc: acc.amc + m.amcAmt,
      discount: acc.discount + m.discountValue,
    }
  }, { machine: 0, amc: 0, discount: 0 })
  const netEstimate = totals.machine + totals.amc - totals.discount

  const anyOverCap = filled.some(l => lineMaths(l).effectivePct > maxDiscount)
  const allResolved = filled.length > 0 && filled.every(l => l.res?.resolved)
  const canCreate = allResolved && !!picked && !busy && !anyOverCap

  const create = async () => {
    if (!canCreate) return
    setBusy(true); setBanner(null); setMade(null)
    try {
      const r = await api.create({
        lines: filled.map(l => ({
          kva: l.kva,
          qty: l.qty,
          rate: l.res?.rate ?? null,
          discountPct: l.discountMode === 'pct' && l.discountPct.trim() ? Number(l.discountPct) : null,
          discountAmount: l.discountMode === 'amount' && l.discountAmt.trim() ? Number(l.discountAmt) : null,
          amcYears: l.amcYears > 0 ? l.amcYears : null,
          spec: Object.keys(l.spec).length ? l.spec : null,
        })),
        customerErpName: picked!.name,
        taxMode,
        ...(showPartnerPicker ? { orgId } : {}),
        termsTemplate: termsName || null,
        termsHtml: termsEdited && termsHtml.trim() ? termsHtml : null,
      })
      setMade(r.data ?? r)
      setLines([blankLine()])
      setPicked(null); setCustQuery(''); setCustHits([])
      setTaxMode('auto')
      setTermsEdited(false)
      refresh()
    } catch (e: any) { setBanner(e.message) } finally { setBusy(false) }
  }

  const openSend = async (erpName: string) => {
    setBanner(null)
    try {
      const r = await api.recipients(erpName)
      const attachments = r.attachments ?? []
      setSendFor({
        name: erpName,
        to: r.to.join(', '),
        cc: r.cc,
        subject: r.suggestedSubject ?? `Quotation ${erpName} from SGT HydroEdge`,
        // Plain text on purpose — the server turns it into HTML on send.
        message: r.suggestedMessageText ?? '',
        customerName: r.customerName,
        provider: r.provider,
        attachments,
        // Everything already on the document is ticked: a file someone
        // deliberately attached is one they meant the customer to have.
        chosen: attachments.map(a => a.name),
      })
    } catch (e: any) { setBanner(e.message) }
  }

  const uploadAttachment = async (file: File) => {
    if (!sendFor) return
    setAttaching(true); setBanner(null)
    try {
      const a = await api.attach(sendFor.name, file)
      setSendFor(x => x && {
        ...x,
        attachments: [...x.attachments, a],
        chosen: [...x.chosen, a.name],
      })
    } catch (e: any) { setBanner(e.message) } finally { setAttaching(false) }
  }

  const removeAttachment = async (a: QuoteAttachment) => {
    if (!sendFor) return
    try {
      await api.detach(sendFor.name, a.name)
      setSendFor(x => x && {
        ...x,
        attachments: x.attachments.filter(f => f.name !== a.name),
        chosen: x.chosen.filter(n => n !== a.name),
      })
    } catch (e: any) { setBanner(e.message) }
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
            width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto',
          }}>
            <h3 style={{ margin: '0 0 3px', fontSize: 15.5, fontWeight: 700, color: INK }}>
              Send {sendFor.name}
            </h3>
            <p style={{ margin: '0 0 15px', fontSize: 12, color: MUTED }}>
              The quotation PDF is attached automatically.
            </p>

            <F label="To" value={sendFor.to}
               onChange={v => setSendFor(x => x && { ...x, to: v })}
               hint="Comma-separated for more than one." />

            <div style={{ marginBottom: 13 }}>
              <label style={labelStyle}>Copied automatically</label>
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

            {/* Plain text, deliberately. Nobody should have to proofread
                <p> tags before a quotation goes to a customer — the server
                turns this into HTML at the moment of sending. */}
            <div style={{ marginBottom: 13 }}>
              <label style={labelStyle}>Message</label>
              <textarea
                value={sendFor.message}
                onChange={e => setSendFor(x => x && { ...x, message: e.target.value })}
                rows={13}
                spellCheck
                style={{
                  ...inputStyle(), fontSize: 13, lineHeight: 1.6,
                  resize: 'vertical',
                }}
              />
              <div style={{ fontSize: 11, color: FAINT, marginTop: 4 }}>
                Write it as you would a letter. A blank line starts a new
                paragraph, and <code>**text**</code> comes out bold. It is sent
                as a properly formatted email — no HTML to type.
              </div>
            </div>

            {/* ---- Extra documents ---------------------------------- */}
            <div style={{ marginBottom: 15 }}>
              <label style={labelStyle}>Attachments</label>
              {sendFor.attachments.length === 0 && (
                <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 7 }}>
                  Nothing extra yet. Add a spec sheet, a drawing, a certificate —
                  it goes out with the quotation and stays on the document.
                </div>
              )}
              {sendFor.attachments.map(a => {
                const on = sendFor.chosen.includes(a.name)
                return (
                  <div key={a.name} style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                    padding: '7px 9px', borderRadius: 7, border: `1px solid ${LINE}`,
                    backgroundColor: on ? '#F7F4EA' : '#fff',
                  }}>
                    <input type="checkbox" checked={on}
                      onChange={() => setSendFor(x => x && {
                        ...x,
                        chosen: on ? x.chosen.filter(n => n !== a.name) : [...x.chosen, a.name],
                      })} />
                    <Paperclip size={13} style={{ color: FAINT, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.fileName}
                    </span>
                    {a.sizeBytes != null && (
                      <span style={{ fontSize: 11, color: FAINT, whiteSpace: 'nowrap' }}>
                        {(a.sizeBytes / 1024).toFixed(0)} KB
                      </span>
                    )}
                    <button type="button" onClick={() => removeAttachment(a)} title="Remove from the quotation"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: FAINT, padding: 2, display: 'flex' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
              <input ref={fileInput} type="file" style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) uploadAttachment(f)
                }} />
              <button type="button" disabled={attaching} onClick={() => fileInput.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, marginTop: 4,
                  padding: '7px 12px', fontSize: 12.5, fontFamily: 'inherit',
                  border: `1px solid ${LINE}`, borderRadius: 7,
                  cursor: attaching ? 'wait' : 'pointer', background: '#fff', color: MUTED,
                }}>
                <Plus size={14} /> {attaching ? 'Uploading…' : 'Attach a file'}
              </button>
              <div style={{ fontSize: 11, color: FAINT, marginTop: 5 }}>
                Up to {limits?.attachMaxMb ?? 15} MB each. Unticked files stay on the
                quotation but are not emailed.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                disabled={sending || !sendFor.to.trim()}
                onClick={async () => {
                  if (!sendFor) return
                  setSending(true); setBanner(null)
                  try {
                    const r = await api.send(sendFor.name, {
                      to: sendFor.to, subject: sendFor.subject,
                      message: sendFor.message,
                      messageFormat: 'text',
                      attachments: sendFor.chosen,
                    })
                    setSent(
                      `${sendFor.name} sent to ${r.to.join(', ')}` +
                      (r.cc.length ? `, copied to ${r.cc.length}` : '') +
                      (r.attached?.length ? `, with ${r.attached.length} attachment(s)` : '') +
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
        Enter the customer's DG rating; the matching GreenX model is selected
        automatically. Add a machine for every set they need.
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
            {made.model} × {made.qty}
            {made.lineCount > 1 ? ` and ${made.lineCount - 1} more machine${made.lineCount > 2 ? 's' : ''}` : ''}
            {' · net '}{rupees(made.netTotal)}
            {' · GST '}{rupees(made.totalTax)} · total {rupees(made.grandTotal)}
            {made.totalCommission ? ` · commission ${rupees(made.totalCommission)}` : ''}
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

      <div style={{ maxWidth: 660 }}>
        <Card
          title={lines.length > 1 ? `Machines (${lines.length})` : 'Machine'}
          right={
            <button type="button" onClick={() => setLines(ls => [...ls, blankLine()])}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 11px', fontSize: 12.5, fontFamily: 'inherit',
                border: `1px solid ${LINE}`, borderRadius: 7, cursor: 'pointer',
                background: '#fff', color: MUTED,
              }}>
              <Plus size={14} /> Add machine
            </button>
          }
        >
          {lines.map((l, i) => (
            <MachineLine
              key={l.id}
              line={l}
              index={i}
              count={lines.length}
              maxDiscount={maxDiscount}
              specFields={specFields}
              api={api}
              onChange={patch => patchLine(l.id, patch)}
              onRemove={() => setLines(ls => ls.filter(x => x.id !== l.id))}
            />
          ))}

          {filled.length > 0 && (totals.discount > 0 || totals.amc > 0 || filled.length > 1) && (
            <div style={{
              marginBottom: 13, padding: '10px 12px', borderRadius: 7,
              backgroundColor: '#F7F4EA', border: `1px solid ${LINE}`, fontSize: 12, color: INK,
            }}>
              {filled.map(l => {
                const m = lineMaths(l)
                return (
                  <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span>{l.res?.resolved ? l.res.modelCode : `${l.kva} kVA`} × {l.qty}</span>
                    <span>{rupees(m.machineAmt)}</span>
                  </div>
                )
              })}
              {totals.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, color: WARN_FG }}>
                  <span>Less discount</span><span>− {rupees(totals.discount)}</span>
                </div>
              )}
              {totals.amc > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                  <span>AMC</span><span>{rupees(totals.amc)}</span>
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

              <div style={{ marginBottom: 13 }}>
                <label style={labelStyle}>They are</label>
                <select value={newCust.entityType}
                  onChange={e => setNewCust(c => ({ ...c, entityType: e.target.value }))}
                  style={{ ...inputStyle(), appearance: 'auto' }}>
                  <option value="Company">A company or firm</option>
                  <option value="Individual">An individual</option>
                </select>
                <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>
                  Recorded as the customer type in ERPNext.
                </div>
              </div>

              <F label={newCust.entityType === 'Individual' ? 'Full name' : 'Name'}
                 value={newCust.name} onChange={v => setNewCust(c => ({ ...c, name: v }))} />
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
                Without a GSTIN, ERPNext cannot work out where they are — set the
                GST below by hand, or the quotation goes out with no tax.
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
              <label style={labelStyle}>Search existing customers</label>
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

          {/* GST treatment. Derived by default; chosen when nothing can
              derive it — an individual with no GSTIN and no address. */}
          <div style={{ marginBottom: 13 }}>
            <label style={labelStyle}>GST</label>
            <select value={taxMode} onChange={e => setTaxMode(e.target.value as any)}
              style={{ ...inputStyle(), appearance: 'auto' }}>
              <option value="auto">Work it out from the customer's GSTIN</option>
              <option value="in_state">CGST + SGST — same state as SGT</option>
              <option value="out_state">IGST — another state</option>
            </select>
            <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>
              {taxMode === 'auto'
                ? 'Uses the GSTIN or billing address ERPNext holds. Pick by hand if they have neither.'
                : 'Chosen by hand — this overrides whatever ERPNext would have derived.'}
            </div>
          </div>
        </Card>

        {showPartnerPicker && (
          <Card title="Partner">
            <div style={{ marginBottom: 13 }}>
              <label style={labelStyle}>Raised through</label>
              <select value={orgId ?? ''} onChange={e => setOrgId(e.target.value ? Number(e.target.value) : null)}
                style={{ ...inputStyle(), appearance: 'auto' }}>
                <option value="">SGT direct — no partner</option>
                {partners.map(p => <option key={p.id} value={p.id}>{p.legal_name} ({p.code})</option>)}
              </select>
              <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>
                Sets the sales partner on the ERPNext quotation so their commission is
                computed, and prints their bank account as the one to pay.
              </div>
            </div>
          </Card>
        )}

        <Card title="Terms and conditions">
          <div style={{ marginBottom: 13 }}>
            <label style={labelStyle}>Template</label>
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
          {busy
            ? 'Creating in ERPNext…'
            : `Create quotation${filled.length > 1 ? ` · ${filled.length} machines` : ''}`}
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
                      {/* Raised by someone below me — a distributor seeing a
                          dealer's quotation. `mine` is only sent by the portal. */}
                      {q.mine === false && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                          textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4,
                          backgroundColor: '#EFEADC', color: MUTED, whiteSpace: 'nowrap',
                        }}>
                          {q.org_name ?? q.org_code}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                      {q.erp_name} · {q.model_code}{q.qty > 1 ? ` × ${q.qty}` : ''}
                      {q.line_count > 1 ? ` +${q.line_count - 1} more` : ''}
                      {q.input_kva ? ` · ${Number(q.input_kva)} kVA` : ''}
                      {q.org_code ? ` · ${q.org_code}` : ' · SGT direct'}
                      {q.mine === false && q.raised_by_name ? ` · ${q.raised_by_name}` : ''}
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
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      color: MUTED, fontSize: 12, fontFamily: 'inherit',
                    }}>
                    <FileText size={13} /> Preview
                  </button>
                  <button type="button" onClick={() => openSend(q.erp_name)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      color: MUTED, fontSize: 12, fontFamily: 'inherit',
                    }}>
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

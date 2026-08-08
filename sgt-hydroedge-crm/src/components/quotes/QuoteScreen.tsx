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
  Check, AlertCircle, FileText, Send, Plus, Paperclip, Trash2, Pencil,
  FilePlus,
} from 'lucide-react'

import {
  INK, MUTED, LINE, FAINT, DANGER, OK, PAPER, WARN_BG, WARN_FG,
  rupees, inputStyle, labelStyle,
} from './theme'
import {
  MachineLine, blankLine, lineMaths, type LineState,
} from './lineEditor'
import { F } from './Field'
import { PoDialog } from './PoDialog'


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

/**
 * A dealer PO, as the mirror holds it.
 *
 * Keyed to its quotation by `quotation_erp_name`, which is how the list
 * below decides whether a row offers "Raise PO" or shows the one that
 * already exists.
 */
export interface PoRow {
  id: number
  erp_name: string
  quotation_erp_name: string
  status: string
  customer_name: string | null
  grand_total: string | null
  po_date: string | null
  created_at: string
  /** Only present on the row returned by raisePo(). */
  warnings?: string[]
}

/** One quoted line, as the PO negotiation dialog opens with it. */
export interface PoEditorLine {
  kva: number | string | null
  qty: number
  /** MRP the quotation carried. The PO prices off this, not today's. */
  listRate: string | number | null
  /** What the quotation charged per unit, for the was/now comparison. */
  quotedRate: string | number | null
  discountPct: number | null
  /** Whole-line rupees, as it was typed — not per unit. */
  discountAmount: number | null
  amcYears: number | null
  spec: Record<string, string> | null
  modelCode: string | null
}

/** Everything the PO dialog needs before it can show anything. */
export interface PoResolve {
  quotationErpName: string
  summary: {
    customerName: string | null
    netTotal: number | null
    grandTotal: number | null
    lineCount: number
  }
  lines: PoEditorLine[]
  discount: { actor: string; maxPct: number; rateCardMarginPct: number }
  taxRules: { description: string | null; rate: number; charge_type?: string | null }[]
  /** Set when prices cannot safely be renegotiated on this quotation. */
  taxBlocker: string | null
  warnings: string[]
  /** POs already raised against THIS quotation. */
  existing: PoRow[]
  /**
   * Every PO for this CUSTOMER, whichever quotation it came from — a
   * customer negotiates once, and the order they want amended may sit
   * against an earlier offer to the same company.
   */
  forCustomer?: PoRow[]
}

/** What the screen sends for one machine. */
export interface QuoteLinePayload {
  kva: string
  qty: number
  /**
   * The list price to work from. The quote screen leaves this null and
   * lets the catalogue price it; the PO dialog sends the rate the
   * QUOTATION carried, so a negotiated order prices off what the customer
   * was offered rather than off whatever the price list says today.
   */
  rate?: string | number | null
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
    /** Plain text; the server turns it into the document's markup. */
    termsText?: string | null
  }): Promise<any>
  searchCustomers(q: string): Promise<ErpCustomer[]>
  createCustomer(body: Record<string, any>):
    Promise<{ erpName: string; matchedOn: string; addressWritten?: boolean; note?: string }>
  customerDetail(erpName: string): Promise<{
    erpName: string; customerName: string; gstin: string | null
    address: { line1?: string | null; line2?: string | null; city?: string | null
              state?: string | null; pincode?: string | null } | null
  }>
  updateCustomer(erpName: string, body: Record<string, any>):
    Promise<{ erpName: string; changed: string[]; note?: string }>
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
  loadForEdit(erpName: string): Promise<{
    erpName: string; editable: boolean; reason: string | null
    orgId: number | null; taxMode: 'auto' | 'in_state' | 'out_state'
    customerErpName: string; customerName: string
    lines: any[]; termsTemplate?: string | null
  }>
  update(erpName: string, body: any): Promise<any>
  specFields(): Promise<SpecField[]>
  attachments(erpName: string): Promise<QuoteAttachment[]>
  attach(erpName: string, file: File): Promise<QuoteAttachment>
  detach(erpName: string, fileName: string): Promise<{ removed: string }>
  /** Every PO this caller may see, newest first. */
  listPos(): Promise<PoRow[]>
  /** What a PO for this quotation would say, and what may be changed. */
  resolvePo(quotationErpName: string): Promise<PoResolve>
  /** Reload an existing PO into the editor — its own lines, not the quote's. */
  loadPoForEdit(id: number): Promise<PoResolve & { po: PoRow }>
  /**
   * Raise one. Omit `lines` to take the quotation exactly as it stands —
   * the server then copies its figures rather than recomputing them.
   */
  raisePo(quotationErpName: string, lines?: QuoteLinePayload[]): Promise<PoRow>
  /** Rewrite one that already exists. Same payload as raising. */
  updatePo(id: number, lines?: QuoteLinePayload[]): Promise<PoRow>
  /** By mirror id, not by ERPNext name — POs are scoped on our side. */
  poPdfUrl(id: number): Promise<string>
  /** Partner pickers only make sense for SGT staff. */
  partners?: () => Promise<{ id: number; code: string; legal_name: string }[]>
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

// One machine, as a form. Shared with the PO negotiation dialog — see
// ./lineEditor.


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
  const [editCust, setEditCust] = useState<{
    gstin: string; entityType: string
    line1: string; city: string; state: string; pincode: string
  } | null>(null)
  const [custNote, setCustNote] = useState<string | null>(null)
  const [newCust, setNewCust] = useState({
    name: '', gstin: '', entityType: 'Company',
    line1: '', city: '', state: '', pincode: '',
  })
  const [custErrors, setCustErrors] = useState<Record<string, string>>({})
  // Kept out of `banner` on purpose. This one is not a validation failure
  // — nothing they can retype fixes it — so it belongs at the button they
  // just pressed, where they are looking, rather than at the top of a
  // form they have scrolled past.
  const [custBlocked, setCustBlocked] = useState<string | null>(null)
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
  /**
   * Every PO this caller can see, indexed by the quotation it came from.
   * Loaded once alongside the quotation list rather than per row: a
   * request per quotation would be twenty requests to render one screen.
   */
  const [posByQuote, setPosByQuote] = useState<Record<string, PoRow[]>>({})
  /** The quotation whose PO dialog is open, if any. */
  const [poFor, setPoFor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [made, setMade] = useState<any>(null)
  /** Set while rewriting an existing draft rather than raising a new one. */
  const [editing, setEditing] = useState<string | null>(null)
  const [terms, setTerms] = useState<{ templates: string[]; default: string } | null>(null)
  const [termsName, setTermsName] = useState('')
  const [termsHtml, setTermsHtml] = useState('')
  const [termsEdited, setTermsEdited] = useState(false)
  const [showTerms, setShowTerms] = useState(false)

  const fileInput = useRef<HTMLInputElement | null>(null)

  /** Group the flat PO list by the quotation each was raised against. */
  const indexPos = (rows: PoRow[]) => {
    const by: Record<string, PoRow[]> = {}
    for (const p of rows) (by[p.quotation_erp_name] ??= []).push(p)
    setPosByQuote(by)
  }

  // Both lists, together. The PO fetch is swallowed on failure like the
  // quotation one: a site that has not run migrate_po_01.ts yet should
  // still show its quotations rather than a blank screen.
  const refresh = () => {
    api.list().then(setList).catch(() => {})
    api.listPos().then(indexPos).catch(() => {})
  }
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
    setCustErrors({}); setCustNote(null); setCustBlocked(null)
    try {
      const r = await api.createCustomer({
        name: newCust.name.trim(),
        gstin: newCust.gstin.trim(),
        entityType: newCust.entityType,
        // The address is a separate document in ERPNext. Sent at creation
        // so the quotation has something to print — without it the
        // address block on the PDF comes out blank.
        address: {
          line1: newCust.line1.trim(),
          city: newCust.city.trim(),
          state: newCust.state.trim(),
          pincode: newCust.pincode.trim(),
        },
      })
      setPicked({ name: r.erpName, customer_name: newCust.name.trim(), gstin: newCust.gstin.trim() || null })
      setAddingCust(false)
      setNewCust({ name: '', gstin: '', entityType: 'Company', line1: '', city: '', state: '', pincode: '' })
      setBanner(null)
      if (r.note) setCustNote(r.note)
    } catch (e: any) {
      // Three different failures, three different places. The customer
      // already belonging to another dealer is not something the top-of
      // -screen banner should swallow — it is the answer to the button.
      if (e?.code === 'customer_claimed') setCustBlocked(e.message)
      else if (e?.fields) setCustErrors(e.fields)
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

  /** Reset the form to "raising a new one". */
  const clearForm = () => {
    setLines([blankLine()])
    setPicked(null); setCustQuery(''); setCustHits([]); setEditCust(null)
    setTaxMode('auto'); setTermsEdited(false); setEditing(null)
  }

  /**
   * Load an existing draft back into this form.
   *
   * Rebuilt from the CRM's own record of what was ASKED for — the kVA,
   * how the discount was entered, the specification. ERPNext keeps the
   * outcome; it never knew the question.
   */
  const startEdit = async (erpName: string) => {
    setBanner(null); setMade(null)
    try {
      const d = await api.loadForEdit(erpName)
      if (!d.editable) { setBanner(d.reason ?? 'This quotation can no longer be edited.'); return }

      setLines(d.lines.length ? d.lines.map((l: any) => ({
        ...blankLine(),
        kva: String(l.kva ?? ''),
        qty: Number(l.qty ?? 1),
        discountMode: l.discountPct ? 'pct' : l.discountAmount ? 'amount' : 'pct',
        discountPct: l.discountPct ? String(l.discountPct) : '',
        discountAmt: l.discountAmount ? String(l.discountAmount) : '',
        amcYears: Number(l.amcYears ?? 0),
        spec: l.spec ?? {},
        showSpec: !!(l.spec && Object.keys(l.spec).length),
      })) : [blankLine()])

      setPicked({ name: d.customerErpName, customer_name: d.customerName })
      setTaxMode(d.taxMode ?? 'auto')
      if (showPartnerPicker) setOrgId(d.orgId ?? null)
      if (d.termsTemplate) setTermsName(d.termsTemplate)
      setTermsEdited(false)
      setEditing(erpName)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e: any) { setBanner(e.message) }
  }

  const create = async () => {
    if (!canCreate) return
    setBusy(true); setBanner(null); setMade(null)
    try {
      const body = {
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
        termsText: termsEdited && termsHtml.trim() ? termsHtml : null,
      }
      const r = editing
        ? await api.update(editing, body)
        : await api.create(body)
      setMade(r.data ?? r)
      clearForm()
      refresh()
    } catch (e: any) { setBanner(e.message) } finally { setBusy(false) }
  }

  /**
   * A PO has been raised. Show it, and file it against its quotation.
   *
   * The PDF opens straight away on purpose: the point of the button is to
   * produce the document, so making someone hunt for a second link to see
   * what they just created would be a worse version of doing nothing.
   *
   * Warnings from the server (no GST on the source quotation, a child
   * table that did not store) are shown rather than swallowed — the PO
   * exists either way and whoever raised it should know.
   */
  const poRaised = async (
    quotationErpName: string,
    po: { id: number; erp_name: string; warnings?: string[] },
  ) => {
    setPoFor(null)
    // Replace-or-prepend, keyed on id: this fires for an AMENDED PO as
    // well as a new one, and blindly prepending would list the same
    // document twice.
    setPosByQuote(prev => {
      const was = prev[quotationErpName] ?? []
      const row = po as PoRow
      return {
        ...prev,
        [quotationErpName]: was.some(p => p.id === row.id)
          ? was.map(p => (p.id === row.id ? row : p))
          : [row, ...was],
      }
    })
    if (po.warnings?.length) setBanner(po.warnings.join(' '))
    try { setPdfFor({ name: po.erp_name, url: await api.poPdfUrl(po.id) }) }
    catch (e: any) {
      // The document was created; only the render failed. Say which,
      // because "PO failed" would be false and would invite a retry that
      // raises a second one.
      setBanner(`${po.erp_name} was raised, but its PDF could not be rendered: ${e.message}`)
    }
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

      {poFor && (
        <PoDialog
          api={api}
          quotationErpName={poFor}
          specFields={specFields}
          onClose={() => setPoFor(null)}
          onRaised={po => poRaised(poFor, po)}
        />
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

      {editing && (
        <div style={{
          padding: '11px 13px', marginBottom: 13, borderRadius: 8,
          backgroundColor: '#DDE8F0', color: '#1F4E6B', fontSize: 12.5,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <FileText size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            Editing <strong>{editing}</strong> — saving rewrites that quotation
            rather than creating a new one.
          </span>
          <button type="button" onClick={clearForm} style={{
            background: 'none', border: '1px solid rgba(31,78,107,0.35)', borderRadius: 6,
            padding: '4px 10px', cursor: 'pointer', color: '#1F4E6B',
            fontSize: 12, fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>
            Cancel edit
          </button>
        </div>
      )}

      {banner && (
        <div style={{ padding: '10px 12px', marginBottom: 13, borderRadius: 8, backgroundColor: '#F3DAD5', color: DANGER, fontSize: 12.5 }}>
          {banner}
        </div>
      )}

      {made && (
        <div style={{ padding: '13px 15px', marginBottom: 13, borderRadius: 10, backgroundColor: '#DCEBE1', color: OK }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700 }}>
            <Check size={16} /> {made.erpName} {made.updated ? 'updated' : 'created'} in ERPNext
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
          {made.addressWarning && (
            <div style={{
              marginTop: 8, padding: '8px 10px', borderRadius: 6, fontSize: 11.5,
              backgroundColor: WARN_BG, color: WARN_FG,
              display: 'flex', alignItems: 'flex-start', gap: 5,
            }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span><strong>No address on this quotation.</strong> {made.addressWarning}</span>
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
            <>
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
                <button type="button"
                  onClick={async () => {
                    setCustErrors({}); setCustNote(null)
                    if (editCust) { setEditCust(null); return }
                    // Prefilled from ERPNext, so saving never blanks a
                    // field the user could not see.
                    const blank = {
                      gstin: picked.gstin ?? '', entityType: 'Company',
                      line1: '', city: '', state: '', pincode: '',
                    }
                    setEditCust(blank)
                    try {
                      const d = await api.customerDetail(picked.name)
                      setEditCust({
                        gstin: d.gstin ?? picked.gstin ?? '',
                        entityType: 'Company',
                        line1: d.address?.line1 ?? '',
                        city: d.address?.city ?? '',
                        state: d.address?.state ?? '',
                        pincode: d.address?.pincode ?? '',
                      })
                      if (!d.address) {
                        setCustNote('This customer has no address in ERPNext — quotations for them print a blank address block. Add it here.')
                      }
                    } catch { /* keep the blank form */ }
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 12, fontFamily: 'inherit' }}>
                  {editCust ? 'Cancel' : 'Fix details'}
                </button>
                <button type="button" onClick={() => { setPicked(null); setCustQuery(''); setEditCust(null) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 12, fontFamily: 'inherit' }}>
                  Change
                </button>
              </div>

              {/* Corrects the customer in ERPNext. The name is not editable
                  here — on most setups the Customer is named BY it, so a
                  change would rename the record and every document linked
                  to it. That is an ERPNext admin job, not a typo fix. */}
              {editCust && (
                <div style={{ marginBottom: 13, padding: 12, borderRadius: 8, border: `1px dashed ${LINE}`, backgroundColor: '#FCFBF7' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 10 }}>
                    Correct {picked.customer_name || picked.name}
                  </div>
                  <F label="GSTIN" value={editCust.gstin} placeholder="27AAECC3132G1Z1"
                     onChange={v => setEditCust(c => c && { ...c, gstin: v.toUpperCase() })} />
                  {custErrors.gstin && <div style={{ fontSize: 11.5, color: DANGER, marginTop: -8, marginBottom: 10 }}>{custErrors.gstin}</div>}

                  <div style={{ marginBottom: 13 }}>
                    <label style={labelStyle}>They are</label>
                    <select value={editCust.entityType}
                      onChange={e => setEditCust(c => c && { ...c, entityType: e.target.value })}
                      style={{ ...inputStyle(), appearance: 'auto' }}>
                      <option value="Company">A company or firm</option>
                      <option value="Individual">An individual</option>
                    </select>
                  </div>

                  <F label="Address" value={editCust.line1} placeholder="Plot / building, street, area"
                     onChange={v => setEditCust(c => c && { ...c, line1: v })} />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 2 }}>
                      <F label="City" value={editCust.city}
                         onChange={v => setEditCust(c => c && { ...c, city: v })} />
                    </div>
                    <div style={{ flex: 2 }}>
                      <F label="State" value={editCust.state}
                         onChange={v => setEditCust(c => c && { ...c, state: v })} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <F label="PIN" value={editCust.pincode}
                         onChange={v => setEditCust(c => c && { ...c, pincode: v })} />
                    </div>
                  </div>
                  {custErrors.pincode && <div style={{ fontSize: 11.5, color: DANGER, marginTop: -8, marginBottom: 10 }}>{custErrors.pincode}</div>}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button"
                      onClick={async () => {
                        if (!editCust || !picked) return
                        setCustErrors({}); setBanner(null); setCustNote(null)
                        try {
                          const r = await api.updateCustomer(picked.name, {
                            name: picked.customer_name || picked.name,
                            gstin: editCust.gstin.trim(),
                            entityType: editCust.entityType,
                            address: {
                              line1: editCust.line1.trim(),
                              city: editCust.city.trim(),
                              state: editCust.state.trim(),
                              pincode: editCust.pincode.trim(),
                            },
                          })
                          setPicked(p => p && { ...p, gstin: editCust.gstin.trim() || null })
                          setEditCust(null)
                          setCustNote(r.note ?? 'Customer updated.')
                        } catch (e: any) {
                          if (e?.fields) setCustErrors(e.fields)
                          else setBanner(e.message)
                        }
                      }}
                      style={{
                        padding: '8px 14px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                        border: 'none', borderRadius: 6, cursor: 'pointer', backgroundColor: INK, color: '#fff',
                      }}>Save to ERPNext</button>
                    <button type="button" onClick={() => { setEditCust(null); setCustErrors({}) }} style={{
                      padding: '8px 14px', fontSize: 12.5, fontFamily: 'inherit',
                      border: `1px solid ${LINE}`, borderRadius: 6, cursor: 'pointer',
                      background: '#fff', color: MUTED,
                    }}>Cancel</button>
                  </div>
                </div>
              )}

              {custNote && (
                <div style={{
                  marginBottom: 13, padding: '9px 11px', borderRadius: 7, fontSize: 11.5,
                  backgroundColor: WARN_BG, color: WARN_FG,
                  display: 'flex', alignItems: 'flex-start', gap: 5,
                }}>
                  <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{custNote}</span>
                </div>
              )}
            </>
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

              <F label="Address" value={newCust.line1} placeholder="Plot / building, street, area"
                 onChange={v => setNewCust(c => ({ ...c, line1: v }))} />
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 2 }}>
                  <F label="City" value={newCust.city} onChange={v => setNewCust(c => ({ ...c, city: v }))} />
                </div>
                <div style={{ flex: 2 }}>
                  <F label="State" value={newCust.state} onChange={v => setNewCust(c => ({ ...c, state: v }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <F label="PIN" value={newCust.pincode} onChange={v => setNewCust(c => ({ ...c, pincode: v }))} />
                </div>
              </div>
              {custErrors.state && <div style={{ fontSize: 11.5, color: DANGER, marginTop: -8, marginBottom: 10 }}>{custErrors.state}</div>}
              {custErrors.pincode && <div style={{ fontSize: 11.5, color: DANGER, marginTop: -8, marginBottom: 10 }}>{custErrors.pincode}</div>}
              <div style={{ fontSize: 11, color: FAINT, marginBottom: 10 }}>
                The address is saved to ERPNext as the customer's billing address
                and printed on the quotation — leave it blank and the address
                block comes out empty. Without a GSTIN, set the GST below by hand.
              </div>
              {custBlocked && (
                <div role="alert" style={{
                  display: 'flex', gap: 9, alignItems: 'flex-start',
                  padding: '10px 11px', marginBottom: 10, borderRadius: 6,
                  border: `1px solid ${DANGER}`, backgroundColor: '#FDF3F1',
                }}>
                  <span aria-hidden style={{ fontSize: 13, lineHeight: 1.4, color: DANGER }}>⊘</span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: DANGER, lineHeight: 1.45 }}>
                      {custBlocked}
                    </div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>
                      Nothing was saved. The customer stays with the dealer who registered them.
                    </div>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={addCustomer} style={{
                  padding: '8px 14px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                  border: 'none', borderRadius: 6, cursor: 'pointer', backgroundColor: INK, color: '#fff',
                }}>Add customer</button>
                <button type="button"
                  onClick={() => { setAddingCust(false); setCustErrors({}); setCustBlocked(null) }}
                  style={{
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
              <button type="button" onClick={() => {
                setAddingCust(true); setCustBlocked(null); setCustErrors({})
                setNewCust(c => ({ ...c, name: custQuery.trim() }))
              }}
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
                  {/* Plain text, like the covering note. One blank line
                      between clauses; the server rebuilds the numbered
                      list, and appends the closing rule and stamp. */}
                  <textarea
                    value={termsHtml}
                    onChange={e => { setTermsHtml(e.target.value); setTermsEdited(true) }}
                    rows={16}
                    spellCheck
                    style={{
                      ...inputStyle(), marginTop: 8,
                      fontSize: 13, lineHeight: 1.6, resize: 'vertical',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 5 }}>
                    <span style={{ fontSize: 11, color: FAINT }}>
                      One clause per paragraph — leave a blank line between them.
                      Numbering is added automatically, and <code>**text**</code> comes
                      out bold. Edits apply to this quotation only; the template is unchanged.
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
            ? (editing ? 'Saving to ERPNext…' : 'Creating in ERPNext…')
            : editing
              ? `Save changes to ${editing}`
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
                  {/* Only a draft can be rewritten. ERPNext freezes a
                      quotation on submission, and that boundary is not
                      ours to work around. */}
                  {String(q.status ?? '').toLowerCase() === 'draft' && (
                    <button type="button" onClick={() => startEdit(q.erp_name)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        color: MUTED, fontSize: 12, fontFamily: 'inherit',
                      }}>
                      <Pencil size={13} /> Edit
                    </button>
                  )}
                  {/* Raise the PO. Always offered, even once one exists —
                      a revised quotation legitimately needs a fresh PO,
                      and the ones already raised are listed below so
                      nobody does it by accident. */}
                  <button type="button" onClick={() => { setBanner(null); setPoFor(q.erp_name) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      color: MUTED, fontSize: 12, fontFamily: 'inherit',
                    }}>
                    <FilePlus size={13} /> Raise PO
                  </button>
                </div>

                {/* The POs already raised against this quotation. Shown
                    rather than collapsed into a count: the number is what
                    the dealer quotes back, so it has to be readable. */}
                {(posByQuote[q.erp_name] ?? []).length > 0 && (
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
                    marginTop: 7, paddingTop: 7, borderTop: `1px dashed ${LINE}`,
                  }}>
                    <span style={{ fontSize: 11, color: FAINT }}>
                      PO{(posByQuote[q.erp_name] ?? []).length > 1 ? 's' : ''}
                    </span>
                    {(posByQuote[q.erp_name] ?? []).map(po => (
                      <button key={po.id} type="button"
                        onClick={async () => {
                          setBanner(null)
                          try { setPdfFor({ name: po.erp_name, url: await api.poPdfUrl(po.id) }) }
                          catch (e: any) { setBanner(e.message) }
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                          fontSize: 12, fontFamily: 'inherit',
                          color: po.status === 'cancelled' ? FAINT : MUTED,
                          textDecoration: po.status === 'cancelled' ? 'line-through' : 'none',
                        }}>
                        <FileText size={13} /> {po.erp_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

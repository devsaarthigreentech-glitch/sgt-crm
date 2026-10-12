// DaaS (rental) quotations — GreenX DaaS and GreenDrive DaaS.
//
// The customer pays 30% of MRP upfront, then a monthly rent for 1, 2 or 3
// years: an EMI on the other 70% at 12% a year, plus AMC at 15% of MRP a
// year. SGT staff only — SGT owns the equipment and bills the rent.
//
// Every figure here is a PREVIEW. The server resolves the MRP itself and
// recomputes everything (domain/daas.ts); the only things it takes from
// this screen are the machines, quantities, tenure, lock-in, agreement
// date and any post-tenure amounts the user typed.
//
// The quotation prints like the owner's proforma SAL-QTN-2026-00021: an
// upfront line and a first-month rent line per machine, and DaaS terms
// with this quotation's figures written in.

import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Check, AlertCircle, FileText, Send } from 'lucide-react'
import { CustomerPicker } from '../quotes/CustomerPicker'
import { SendQuoteDialog, loadSendState, type SendState } from '../quotes/SendQuoteDialog'
import { PdfOverlay } from '../quotes/PdfOverlay'
import type { ErpCustomer, QuoteApi, Resolution } from '../quotes/QuoteScreen'
import {
  INK, MUTED, LINE, FAINT, DANGER, OK, PAPER, WARN_FG,
  rupees, inputStyle, labelStyle,
} from '../quotes/theme'
import { GD_MODELS, GD_GST_PCT, type GdModel } from '../greendrive/pricing'
import {
  daasFigures, DAAS_TENURES, DAAS_LOCK_IN_MONTHS, DAAS_DOWN_PCT, DAAS_RATE_PCT, DAAS_AMC_PCT,
} from './daasMath'

interface Line {
  id: number
  kva: string
  model: GdModel
  qty: string
  /** GreenX: what the kVA resolved to. */
  res: Resolution | null
  buyout: string
  postAmc: string
  continuation: string
}

let nextId = 1
const blank = (): Line => ({
  id: nextId++, kva: '', model: 'One', qty: '1', res: null, buyout: '', postAmc: '', continuation: '',
})

const card: React.CSSProperties = {
  backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 12,
  padding: 18, marginBottom: 16, maxWidth: 940,
}
const smallBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', fontSize: 12,
  fontFamily: 'inherit', background: '#fff', color: INK,
  border: `1px solid ${LINE}`, borderRadius: 6, cursor: 'pointer',
}
const h2: React.CSSProperties = { margin: '0 0 12px', fontSize: 15.5, fontWeight: 700, color: INK }

export default function DaasQuoteScreen({ api, productLine }: {
  api: QuoteApi
  productLine: 'GreenX' | 'GreenDrive'
}) {
  const gd = productLine === 'GreenDrive'

  const [years, setYears] = useState<number>(3)
  const [lockIn, setLockIn] = useState(String(DAAS_LOCK_IN_MONTHS))
  const [agreementDate, setAgreementDate] = useState('')
  const [lines, setLines] = useState<Line[]>([blank()])
  const [picked, setPicked] = useState<ErpCustomer | null>(null)
  const [taxMode, setTaxMode] = useState<'auto' | 'in_state' | 'out_state'>('auto')
  const [banner, setBanner] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<any>(null)
  const [list, setList] = useState<any[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [pdfFor, setPdfFor] = useState<{ name: string; url: string } | null>(null)
  const [sendFor, setSendFor] = useState<SendState | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  const refresh = () => {
    api.list(productLine, 'daas')
      .then(rows => { setList(rows); setListError(null) })
      .catch((e: any) => setListError(e.message))
  }
  useEffect(refresh, [])

  const patch = (id: number, p: Partial<Line>) =>
    setLines(ls => ls.map(l => (l.id === id ? { ...l, ...p } : l)))

  // GreenX: resolve each kVA to its model and MRP, debounced per line.
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  const setKva = (id: number, kva: string) => {
    patch(id, { kva, res: null })
    clearTimeout(timers.current[id])
    if (!kva.trim()) return
    timers.current[id] = setTimeout(() => {
      api.resolve(kva)
        .then(res => setLines(ls => ls.map(l => (l.id === id && l.kva === kva ? { ...l, res } : l))))
        .catch(e => setLines(ls => ls.map(l => (l.id === id ? { ...l, res: { resolved: false, message: e.message } } : l))))
    }, 400)
  }

  const mrpOf = (l: Line): number | null => {
    if (gd) return GD_MODELS.find(m => m.code === l.model)!.inr
    return l.res?.resolved && l.res.rate ? Number(l.res.rate) : null
  }
  const rows = lines.map(l => {
    const mrp = mrpOf(l)
    const qty = Math.max(0, Math.floor(Number(l.qty) || 0))
    return { l, qty, mrp, fig: mrp !== null ? daasFigures(mrp, years) : null }
  })
  const ready = rows.filter(r => r.fig && r.qty > 0)
  const upfront = ready.reduce((s, r) => s + r.fig!.upfront * r.qty, 0)
  const rent = ready.reduce((s, r) => s + r.fig!.rent * r.qty, 0)
  const dueNow = upfront + rent
  const gst = dueNow * GD_GST_PCT / 100
  const overTenure = upfront + rent * years * 12
  const unresolved = rows.some(r => (gd ? false : r.l.kva.trim() !== '' && !r.fig))

  const canCreate = !!picked && ready.length > 0 && !unresolved && !busy

  const num = (v: string): number | null => (v.trim() === '' ? null : Number(v))

  const create = async () => {
    if (!canCreate) return
    setBusy(true); setBanner(null); setMade(null); setSent(null)
    try {
      const r = await api.createDaas({
        productLine,
        tenureYears: years,
        lockInMonths: Math.max(0, Math.floor(Number(lockIn) || 0)),
        agreementDate: agreementDate.trim() || null,
        customerErpName: picked!.name,
        customerName: picked!.customer_name || null,
        taxMode,
        lines: ready.map(({ l, qty }) => ({
          ...(gd ? { model: l.model } : { kva: l.kva }),
          qty,
          buyout: num(l.buyout), postAmc: num(l.postAmc), continuationRent: num(l.continuation),
        })),
      })
      setMade(r.data ?? r)
      setLines([blank()]); setPicked(null); setTaxMode('auto'); setAgreementDate('')
      refresh()
    } catch (e: any) { setBanner(e.message) } finally { setBusy(false) }
  }

  const openPdf = async (erpName: string) => {
    setBanner(null)
    try { setPdfFor({ name: erpName, url: await api.pdfUrl(erpName) }) }
    catch (e: any) { setBanner(e.message) }
  }
  const openSend = async (erpName: string) => {
    setBanner(null)
    try { setSendFor(await loadSendState(api, erpName)) }
    catch (e: any) { setBanner(e.message) }
  }

  return (
    <div style={{ backgroundColor: PAPER, height: '100%', overflowY: 'auto', padding: '20px 18px 60px' }}>
      {pdfFor && <PdfOverlay pdf={pdfFor} onClose={() => { URL.revokeObjectURL(pdfFor.url); setPdfFor(null) }} />}
      {sendFor && (
        <SendQuoteDialog api={api} sendFor={sendFor} setSendFor={setSendFor}
          setBanner={setBanner} onSent={msg => { setSent(msg); setSendFor(null) }} />
      )}

      <h1 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: INK }}>{productLine} DaaS quotations</h1>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: MUTED, maxWidth: 940 }}>
        Rental: {DAAS_DOWN_PCT}% of MRP upfront, then a monthly rent — an instalment on the rest at {DAAS_RATE_PCT}% a
        year, plus AMC at {DAAS_AMC_PCT}% of MRP a year. The quotation bills the upfront and the first month's rent.
      </p>

      {sent && <Ok>{sent}</Ok>}
      {made && (
        <div style={{ maxWidth: 940, padding: '11px 13px', marginBottom: 13, borderRadius: 8, backgroundColor: '#DCEBE1', color: OK, fontSize: 12.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600 }}>
            <Check size={15} /> {made.erpName} created in ERPNext · {rupees(made.grandTotal)} due now, incl. GST
          </div>
          {[made.taxWarning, made.addressWarning, made.mirrored === false
            ? 'Saved in ERPNext, but not in the CRM list — the database migration may not have been run.' : null]
            .filter(Boolean).map((w: string) => (
              <div key={w} style={{ display: 'flex', gap: 5, marginTop: 6, color: WARN_FG }}>
                <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{w}</span>
              </div>
            ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
            <button style={smallBtn} onClick={() => openPdf(made.erpName)}><FileText size={13} /> Preview</button>
            <button style={smallBtn} onClick={() => openSend(made.erpName)}><Send size={13} /> Send</button>
          </div>
        </div>
      )}
      {banner && (
        <div style={{ maxWidth: 940, padding: '10px 12px', marginBottom: 14, borderRadius: 8, backgroundColor: '#F3DAD5', color: DANGER, fontSize: 12.5 }}>
          {banner}
        </div>
      )}

      {/* Rental terms */}
      <div style={card}>
        <h2 style={h2}>Rental</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle}>Tenure</label>
            <select value={years} onChange={e => setYears(Number(e.target.value))} style={{ ...inputStyle(), appearance: 'auto' }}>
              {DAAS_TENURES.map(y => <option key={y} value={y}>{y} year{y > 1 ? 's' : ''} ({y * 12} months)</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Lock-in (months)</label>
            <input type="number" min={0} value={lockIn} onChange={e => setLockIn(e.target.value)} style={inputStyle()} />
          </div>
          <div>
            <label style={labelStyle}>Rental agreement date</label>
            <input value={agreementDate} onChange={e => setAgreementDate(e.target.value)}
              placeholder="e.g. 12 May 2026 — optional" style={inputStyle()} />
          </div>
        </div>
      </div>

      {/* Machines */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ ...h2, margin: 0, flex: 1 }}>Machine</h2>
          <button onClick={() => setLines(ls => [...ls, blank()])} style={{ ...smallBtn, padding: '8px 13px', fontSize: 13 }}>
            <Plus size={15} /> Add machine
          </button>
        </div>

        {rows.map(({ l, fig }, i) => (
          <div key={l.id} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 16, marginBottom: 12, backgroundColor: '#FCFBF7' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ flex: 1, fontSize: 11.5, fontWeight: 700, color: FAINT, letterSpacing: '0.05em' }}>MACHINE {i + 1}</span>
              {lines.length > 1 && (
                <button title="Remove" onClick={() => setLines(ls => ls.filter(x => x.id !== l.id))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: FAINT, padding: 4, display: 'flex' }}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
              {gd ? (
                <div>
                  <label style={labelStyle}>Model</label>
                  <select value={l.model} onChange={e => patch(l.id, { model: e.target.value as GdModel })}
                    style={{ ...inputStyle(), appearance: 'auto' }}>
                    {GD_MODELS.map(g => <option key={g.code} value={g.code}>{g.label} — {rupees(g.inr)}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label style={labelStyle}>DG rating (kVA)</label>
                  <input value={l.kva} onChange={e => setKva(l.id, e.target.value)} placeholder="e.g. 70" style={inputStyle()} />
                  <div style={{ fontSize: 11, color: l.res && !l.res.resolved ? DANGER : FAINT, marginTop: 3 }}>
                    {l.res?.resolved ? `${l.res.modelCode} · MRP ${rupees(l.res.rate)}` : l.res?.message ?? ''}
                  </div>
                </div>
              )}
              <div>
                <label style={labelStyle}>Quantity</label>
                <input type="number" min={1} value={l.qty} onChange={e => patch(l.id, { qty: e.target.value })} style={inputStyle()} />
              </div>
            </div>

            {fig && (
              <div style={{ fontSize: 12, color: MUTED, marginTop: 10, lineHeight: 1.6 }}>
                Per machine: upfront <strong style={{ color: INK }}>{rupees(fig.upfront)}</strong> · rent{' '}
                <strong style={{ color: INK }}>{rupees(fig.rent)}</strong>/month ({rupees(fig.emi)} instalment on{' '}
                {rupees(fig.financed)} + {rupees(fig.amcMonthly)} AMC) for {fig.months} months
              </div>
            )}

            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 12.5, color: MUTED, cursor: 'pointer' }}>After the tenure (per machine)</summary>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginTop: 10 }}>
                <div>
                  <label style={labelStyle}>Buyout price</label>
                  <input type="number" min={0} value={l.buyout} onChange={e => patch(l.id, { buyout: e.target.value })}
                    placeholder={fig ? `${fig.buyoutDefault} (30% of MRP)` : '30% of MRP'} style={inputStyle()} />
                </div>
                <div>
                  <label style={labelStyle}>AMC per year after buyout</label>
                  <input type="number" min={0} value={l.postAmc} onChange={e => patch(l.id, { postAmc: e.target.value })}
                    placeholder={fig ? `${fig.postAmcDefault} (15% of MRP)` : '15% of MRP'} style={inputStyle()} />
                </div>
                <div>
                  <label style={labelStyle}>Rent if continued, per month</label>
                  <input type="number" min={0} value={l.continuation} onChange={e => patch(l.id, { continuation: e.target.value })}
                    placeholder="Leave blank to omit" style={inputStyle()} />
                </div>
              </div>
            </details>
          </div>
        ))}
      </div>

      {/* Customer */}
      <div style={card}>
        <h2 style={h2}>Customer</h2>
        <CustomerPicker api={api} picked={picked} setPicked={setPicked} setBanner={setBanner} />
        <label style={labelStyle}>GST</label>
        <select value={taxMode} onChange={e => setTaxMode(e.target.value as any)} style={{ ...inputStyle(), appearance: 'auto' }}>
          <option value="auto">Work it out from the customer's GSTIN</option>
          <option value="in_state">CGST + SGST — same state as SGT</option>
          <option value="out_state">IGST — another state</option>
        </select>
      </div>

      {/* Summary */}
      <div style={card}>
        <h2 style={h2}>Summary</h2>
        <Row k="Upfront (non-refundable)" v={rupees(upfront)} />
        <Row k="Monthly rent" v={`${rupees(rent)} × ${years * 12} months`} />
        <Row k="Due now — upfront + first month" v={rupees(dueNow)} strong />
        <Row k={`GST ${GD_GST_PCT}%`} v={rupees(gst)} />
        <div style={{ borderTop: `1px solid ${LINE}`, margin: '8px 0' }} />
        <Row k="Proforma total" v={rupees(dueNow + gst)} strong />
        <div style={{ fontSize: 11.5, color: FAINT, marginTop: 6 }}>
          Over the full tenure the customer pays {rupees(overTenure)} + GST. Estimate — ERPNext computes the binding figures.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <button onClick={create} disabled={!canCreate} style={{
            padding: '10px 16px', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit',
            backgroundColor: INK, color: '#fff', border: 'none', borderRadius: 7,
            opacity: canCreate ? 1 : 0.4, cursor: canCreate ? 'pointer' : 'not-allowed',
          }}>
            {busy ? 'Creating…' : 'Create DaaS quotation'}
          </button>
          <span style={{ fontSize: 12, color: FAINT }}>
            {!picked ? 'Pick or add a customer first.'
              : unresolved ? 'Every kVA must resolve to a model first.'
              : !ready.length ? 'Add a machine.'
              : `For ${picked.customer_name || picked.name}.`}
          </span>
        </div>
      </div>

      {/* Recent */}
      <div style={{ maxWidth: 940 }}>
        <h2 style={{ margin: '6px 0 10px', fontSize: 15, fontWeight: 700, color: INK }}>Recent</h2>
        {listError ? (
          <p style={{ fontSize: 12.5, color: DANGER }}>Could not load DaaS quotations: {listError}</p>
        ) : list.length === 0 ? (
          <p style={{ fontSize: 13, color: FAINT }}>No {productLine} DaaS quotations yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map(q => {
              const first = Array.isArray(q.lines) ? q.lines[0] : null
              return (
                <div key={q.erp_name} style={{
                  backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 9,
                  padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{q.customer_name || q.erp_customer}</div>
                    <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                      {q.erp_name} · {q.model_code} × {q.qty}
                      {q.line_count > 1 && ` +${q.line_count - 1} more`}
                      {first?.months && ` · ${first.months} months`}
                      {q.raised_by_name && ` · ${q.raised_by_name}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>
                    {rupees(q.grand_total)} <span style={{ fontSize: 11, fontWeight: 400, color: FAINT }}>due now</span>
                  </div>
                  <button style={smallBtn} onClick={() => openPdf(q.erp_name)}><FileText size={13} /> Preview</button>
                  <button style={smallBtn} onClick={() => openSend(q.erp_name)}><Send size={13} /> Send</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Ok({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 940, padding: '11px 13px', marginBottom: 13, borderRadius: 8, backgroundColor: '#DCEBE1', color: OK, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 7 }}>
      <Check size={15} /> {children}
    </div>
  )
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', fontSize: 13, padding: '3px 0', color: strong ? INK : MUTED, fontWeight: strong ? 700 : 400 }}>
      <span style={{ flex: 1 }}>{k}</span>
      <span>{v}</span>
    </div>
  )
}

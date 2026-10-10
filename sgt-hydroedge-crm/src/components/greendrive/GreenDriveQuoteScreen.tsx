// GreenDrive quotations.
//
// Differs from the GreenX screen in the ways the owner set:
//   - pick a model (One / Neo / Pro) instead of typing a DG kVA rating
//   - the price is FIXED: it already includes the dealer's 40% markup on
//     SGT's price, so there is neither a discount nor a markup to enter
//   - raised by SGT staff (SGT-direct, or under a GreenDrive partner they
//     pick) and by GreenDrive partners on the portal. A GreenX partner's
//     portal never shows this screen; the server refuses them anyway.
//   - export (USD) is shown but not yet quotable: ERPNext has no USD price
//     list or exchange rate set up.
//
// The customer card, the send dialog and the PDF preview are the GreenX
// screen's own components, so both product lines behave the same there.
// The price shown here is the catalogue figure; ERPNext's Item Price is
// what the quotation actually carries, and the result banner shows it.

import { useEffect, useState } from 'react'
import { Plus, Trash2, Info, Check, AlertCircle, FileText, Send } from 'lucide-react'
import { CustomerPicker } from '../quotes/CustomerPicker'
import { SendQuoteDialog, loadSendState, type SendState } from '../quotes/SendQuoteDialog'
import { PdfOverlay } from '../quotes/PdfOverlay'
import type { ErpCustomer, QuoteApi } from '../quotes/QuoteScreen'
import {
  INK, MUTED, LINE, FAINT, DANGER, OK, PAPER, WARN_BG, WARN_FG,
  rupees, inputStyle, labelStyle,
} from '../quotes/theme'
import {
  GD_MODELS, DEALER_MARKUP_PCT, GD_GST_PCT, USD_INR,
  money, listPrice, dealerShare, type GdModel, type GdCurrency,
} from './pricing'

interface Line { id: number; model: GdModel; qty: string }

let nextId = 1
const blank = (): Line => ({ id: nextId++, model: 'One', qty: '1' })

const card: React.CSSProperties = {
  backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 12,
  padding: 18, marginBottom: 16, maxWidth: 940,
}

const smallBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', fontSize: 12,
  fontFamily: 'inherit', background: '#fff', color: INK,
  border: `1px solid ${LINE}`, borderRadius: 6, cursor: 'pointer',
}

function maths(l: Line, cur: GdCurrency) {
  const qty = Math.max(0, Math.floor(Number(l.qty) || 0))
  const unit = listPrice(l.model, cur)
  return { qty, unit, lineTotal: unit * qty, dealerTotal: dealerShare(unit) * qty }
}

export default function GreenDriveQuoteScreen({ api, surface, canRaise = true }: {
  api: QuoteApi
  surface: 'staff' | 'portal'
  /** False makes this a price calculator: no Create, no list. */
  canRaise?: boolean
}) {
  const showPartnerPicker = surface === 'staff' && !!api.partners
  const [partners, setPartners] = useState<{ id: number; code: string; legal_name: string }[]>([])
  const [orgId, setOrgId] = useState<number | null>(null)

  const [currency, setCurrency] = useState<GdCurrency>('INR')
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
    if (!canRaise) return
    api.list('GreenDrive')
      .then(rows => { setList(rows); setListError(null) })
      .catch((e: any) => setListError(e.message))
  }
  useEffect(refresh, [])
  useEffect(() => {
    if (showPartnerPicker) api.partners!('GreenDrive').then(setPartners).catch(() => {})
  }, [])

  const patch = (id: number, p: Partial<Line>) =>
    setLines(ls => ls.map(l => (l.id === id ? { ...l, ...p } : l)))

  const rows = lines.map(l => ({ l, m: maths(l, currency) }))
  const net = rows.reduce((s, r) => s + r.m.lineTotal, 0)
  const dealerTotal = rows.reduce((s, r) => s + r.m.dealerTotal, 0)
  // Export is shown without GST — ASSUMED zero-rated under LUT, to confirm.
  const gst = currency === 'INR' ? net * GD_GST_PCT / 100 : 0
  const grand = net + gst

  const filled = rows.filter(r => r.m.qty > 0)
  const canCreate = canRaise && currency === 'INR' && !!picked && filled.length > 0 && !busy

  const create = async () => {
    if (!canCreate) return
    setBusy(true); setBanner(null); setMade(null); setSent(null)
    try {
      const r = await api.createGreenDrive({
        lines: filled.map(({ l, m }) => ({ model: l.model, qty: m.qty })),
        customerErpName: picked!.name,
        taxMode,
        ...(showPartnerPicker ? { orgId } : {}),
      })
      setMade(r.data ?? r)
      setLines([blank()]); setPicked(null); setTaxMode('auto')
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

  const createHint = !canRaise
    ? 'This account cannot raise GreenDrive quotations.'
    : currency === 'USD'
      ? 'Export quotations open once USD pricing is set up in ERPNext.'
      : !picked
        ? 'Pick or add a customer first.'
        : `For ${picked.customer_name || picked.name}.`

  return (
    <div style={{ backgroundColor: PAPER, height: '100%', overflowY: 'auto', padding: '20px 18px 60px' }}>
      {pdfFor && (
        <PdfOverlay pdf={pdfFor} onClose={() => { URL.revokeObjectURL(pdfFor.url); setPdfFor(null) }} />
      )}
      {sendFor && (
        <SendQuoteDialog api={api} sendFor={sendFor} setSendFor={setSendFor}
          setBanner={setBanner} onSent={msg => { setSent(msg); setSendFor(null) }} />
      )}

      <h1 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: INK }}>GreenDrive quotations</h1>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: MUTED }}>
        Pick the GreenDrive model and quantity. Prices are fixed and already include
        the dealer's {DEALER_MARKUP_PCT}% markup.
      </p>

      {!canRaise && (
        <Note>This account cannot raise GreenDrive quotations. Use this to work out a price.</Note>
      )}

      {sent && (
        <div style={{ maxWidth: 940, padding: '11px 13px', marginBottom: 13, borderRadius: 8, backgroundColor: '#DCEBE1', color: OK, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Check size={15} /> {sent}
        </div>
      )}

      {made && (
        <div style={{ maxWidth: 940, padding: '11px 13px', marginBottom: 13, borderRadius: 8, backgroundColor: '#DCEBE1', color: OK, fontSize: 12.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600 }}>
            <Check size={15} /> {made.erpName} created in ERPNext · {rupees(made.grandTotal)} incl. GST
          </div>
          {[made.taxWarning, made.termsWarning, made.addressWarning, made.mirrored === false
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

      {/* Market */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: INK, flex: 1 }}>Market</h2>
          {(['INR', 'USD'] as const).map(c => (
            <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: INK, cursor: 'pointer' }}>
              <input type="radio" checked={currency === c} onChange={() => setCurrency(c)} />
              {c === 'INR' ? 'India (₹)' : 'Export (USD)'}
            </label>
          ))}
        </div>
        {currency === 'USD' && (
          <div style={{ fontSize: 11.5, color: FAINT, marginTop: 6 }}>
            Export list prices are set in USD (reference rate ₹{USD_INR} = $1), not converted
            from the India price. Price check only for now.
          </div>
        )}
      </div>

      {/* Machines */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: INK, flex: 1 }}>Machine</h2>
          <button onClick={() => setLines(ls => [...ls, blank()])} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px', fontSize: 13,
            fontFamily: 'inherit', backgroundColor: '#fff', color: INK,
            border: `1px solid ${LINE}`, borderRadius: 7, cursor: 'pointer',
          }}>
            <Plus size={15} /> Add machine
          </button>
        </div>

        {rows.map(({ l, m }, i) => (
          <div key={l.id} style={{
            border: `1px solid ${LINE}`, borderRadius: 10, padding: 16, marginBottom: 12,
            backgroundColor: '#FCFBF7',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ flex: 1, fontSize: 11.5, fontWeight: 700, color: FAINT, letterSpacing: '0.05em' }}>
                MACHINE {i + 1}
              </span>
              {lines.length > 1 && (
                <button title="Remove" onClick={() => setLines(ls => ls.filter(x => x.id !== l.id))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: FAINT, padding: 4, display: 'flex' }}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
              <div>
                <label style={labelStyle}>Model</label>
                <select value={l.model} onChange={e => patch(l.id, { model: e.target.value as GdModel })} style={inputStyle()}>
                  {GD_MODELS.map(g => (
                    <option key={g.code} value={g.code}>{g.label} — {money(currency === 'USD' ? g.usd : g.inr, currency)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Quantity</label>
                <input type="number" min={1} value={l.qty} onChange={e => patch(l.id, { qty: e.target.value })} style={inputStyle()} />
              </div>
            </div>

            <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>
              {money(m.unit, currency)} per unit, ex-GST
              {m.qty > 1 && <> · line {money(m.lineTotal, currency)}</>}
            </div>
          </div>
        ))}
      </div>

      {showPartnerPicker && (
        <div style={card}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15.5, fontWeight: 700, color: INK }}>Raised through</h2>
          <label style={labelStyle}>GreenDrive partner</label>
          <select value={orgId ?? ''} onChange={e => setOrgId(e.target.value ? Number(e.target.value) : null)}
            style={{ ...inputStyle(), appearance: 'auto' }}>
            <option value="">SGT direct — no partner</option>
            {partners.map(o => <option key={o.id} value={o.id}>{o.legal_name} ({o.code})</option>)}
          </select>
          <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>
            {partners.length
              ? `The partner's logo and signature print on the quotation, and they earn the ${DEALER_MARKUP_PCT}% markup as commission.`
              : 'No GreenDrive partners yet — onboard one under Partner onboarding.'}
          </div>
        </div>
      )}

      {/* Customer */}
      <div style={card}>
        <h2 style={{ margin: '0 0 12px', fontSize: 15.5, fontWeight: 700, color: INK }}>Customer</h2>
        <CustomerPicker api={api} picked={picked} setPicked={setPicked} setBanner={setBanner} />
        {currency === 'INR' && (
          <div>
            <label style={labelStyle}>GST</label>
            <select value={taxMode} onChange={e => setTaxMode(e.target.value as any)}
              style={{ ...inputStyle(), appearance: 'auto' }}>
              <option value="auto">Work it out from the customer's GSTIN</option>
              <option value="in_state">CGST + SGST — same state as SGT</option>
              <option value="out_state">IGST — another state</option>
            </select>
          </div>
        )}
      </div>

      {/* Summary */}
      <div style={card}>
        <h2 style={{ margin: '0 0 12px', fontSize: 15.5, fontWeight: 700, color: INK }}>Summary</h2>
        <Row k="Net, before GST" v={money(net, currency)} strong />
        <Row k={currency === 'INR' ? `GST ${GD_GST_PCT}%` : 'GST (export, zero-rated)'} v={money(gst, currency)} />
        <div style={{ borderTop: `1px solid ${LINE}`, margin: '8px 0' }} />
        <Row k="Customer pays" v={money(grand, currency)} strong />
        <div style={{ fontSize: 10.5, color: FAINT, marginTop: 4 }}>
          Estimate — ERPNext computes the binding figures.
        </div>

        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, backgroundColor: PAPER }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: MUTED, marginBottom: 6 }}>
            {surface === 'portal' ? 'Your earning' : 'Partner earning'} — not shown to the customer
          </div>
          <Row k="SGT's price" v={money(net - dealerTotal, currency)} />
          <Row k={`Dealer markup (${DEALER_MARKUP_PCT}%, included in the price)`} v={money(dealerTotal, currency)} strong />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <button onClick={create} disabled={!canCreate} style={{
            padding: '10px 16px', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit',
            backgroundColor: INK, color: '#fff', border: 'none', borderRadius: 7,
            opacity: canCreate ? 1 : 0.4, cursor: canCreate ? 'pointer' : 'not-allowed',
          }}>
            {busy ? 'Creating…' : 'Create quotation'}
          </button>
          <span style={{ fontSize: 12, color: FAINT }}>{createHint}</span>
        </div>
      </div>

      {/* Recent */}
      {canRaise && (
        <div style={{ maxWidth: 940 }}>
          <h2 style={{ margin: '6px 0 10px', fontSize: 15, fontWeight: 700, color: INK }}>Recent</h2>
          {listError ? (
            <p style={{ fontSize: 12.5, color: DANGER }}>Could not load GreenDrive quotations: {listError}</p>
          ) : list.length === 0 ? (
            <p style={{ fontSize: 13, color: FAINT }}>No GreenDrive quotations yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {list.map(q => (
                <div key={q.erp_name} style={{
                  backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 9,
                  padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{q.customer_name || q.erp_customer}</div>
                    <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                      {q.erp_name} · {(q.model_code ?? '').replace('GreenDrive-', 'GreenDrive ')} × {q.qty}
                      {q.line_count > 1 && ` +${q.line_count - 1} more`}
                      {q.raised_by_name && ` · ${q.raised_by_name}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>
                    {rupees(q.grand_total)} <span style={{ fontSize: 11, fontWeight: 400, color: FAINT }}>incl. GST</span>
                  </div>
                  <button style={smallBtn} onClick={() => openPdf(q.erp_name)}><FileText size={13} /> Preview</button>
                  <button style={smallBtn} onClick={() => openSend(q.erp_name)}><Send size={13} /> Send</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      maxWidth: 940, padding: '11px 13px', marginBottom: 16, borderRadius: 8,
      backgroundColor: WARN_BG, color: WARN_FG, fontSize: 12.5,
      display: 'flex', gap: 8, alignItems: 'flex-start',
    }}>
      <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
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

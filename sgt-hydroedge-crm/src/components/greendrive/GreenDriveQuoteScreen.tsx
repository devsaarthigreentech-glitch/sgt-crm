// GreenDrive quotation — PREVIEW. Nothing is saved and no quotation is
// raised; the numbers come from the tentative rate card in pricing.ts.
//
// Differs from the GreenX screen in three ways the owner set on 2026-10-07:
//   - pick a model (One / Neo / Pro) instead of typing a DG kVA rating
//   - the partner MARKS UP, up to MRP + 40%, instead of discounting
//   - a quote can be priced in USD for export, from its own list prices

import { useState } from 'react'
import { Plus, Trash2, Info } from 'lucide-react'
import { INK, MUTED, LINE, FAINT, DANGER, PAPER, WARN_BG, WARN_FG, inputStyle, labelStyle } from '../quotes/theme'
import {
  GD_MODELS, MAX_MARKUP_PCT, BASE_MARGIN_PCT, GD_GST_PCT, USD_INR,
  money, listPrice, type GdModel, type GdCurrency,
} from './pricing'

interface Line { id: number; model: GdModel; qty: string; markup: string }

let nextId = 1
const blank = (): Line => ({ id: nextId++, model: 'One', qty: '1', markup: '0' })

const card: React.CSSProperties = {
  backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 12,
  padding: 18, marginBottom: 16, maxWidth: 940,
}

function maths(l: Line, cur: GdCurrency) {
  const qty = Math.max(0, Math.floor(Number(l.qty) || 0))
  const pct = Number(l.markup) || 0
  const mrp = listPrice(l.model, cur)
  const unit = mrp * (1 + pct / 100)
  return {
    qty, pct, mrp, unit,
    mrpTotal: mrp * qty,
    markupTotal: (unit - mrp) * qty,
    lineTotal: unit * qty,
    bad: pct < 0 || pct > MAX_MARKUP_PCT,
  }
}

export default function GreenDriveQuoteScreen({ surface }: { surface: 'staff' | 'portal' }) {
  const [currency, setCurrency] = useState<GdCurrency>('INR')
  const [lines, setLines] = useState<Line[]>([blank()])
  const [customer, setCustomer] = useState('')
  const [taxId, setTaxId] = useState('')

  const patch = (id: number, p: Partial<Line>) =>
    setLines(ls => ls.map(l => (l.id === id ? { ...l, ...p } : l)))

  const rows = lines.map(l => ({ l, m: maths(l, currency) }))
  const mrpTotal = rows.reduce((s, r) => s + r.m.mrpTotal, 0)
  const markupTotal = rows.reduce((s, r) => s + r.m.markupTotal, 0)
  const net = mrpTotal + markupTotal
  // Export is shown without GST — ASSUMED zero-rated under LUT, to confirm.
  const gst = currency === 'INR' ? net * GD_GST_PCT / 100 : 0
  const grand = net + gst
  const base = BASE_MARGIN_PCT === null ? null : mrpTotal * BASE_MARGIN_PCT / 100
  const anyBad = rows.some(r => r.m.bad)

  return (
    <div style={{ backgroundColor: PAPER, height: '100%', overflowY: 'auto', padding: '20px 18px 60px' }}>
      <h1 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: INK }}>GreenDrive quotations</h1>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: MUTED }}>
        Pick the GreenDrive model and quantity. The price starts at MRP; a partner who
        handles sales, installation and support may mark up to {MAX_MARKUP_PCT}%.
      </p>

      <div style={{
        maxWidth: 940, padding: '11px 13px', marginBottom: 16, borderRadius: 8,
        backgroundColor: WARN_BG, color: WARN_FG, fontSize: 12.5,
        display: 'flex', gap: 8, alignItems: 'flex-start',
      }}>
        <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>Preview.</strong> GreenDrive pricing is tentative and quotations can't be
          raised yet — nothing on this screen is saved.
        </span>
      </div>

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
            Export list prices are set in USD (reference rate ₹{USD_INR} = $1), not converted from the India MRP.
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
              <div>
                <label style={labelStyle}>Markup over MRP (%)</label>
                <input type="number" min={0} max={MAX_MARKUP_PCT} value={l.markup}
                  onChange={e => patch(l.id, { markup: e.target.value })} style={inputStyle(m.bad)} />
                <div style={{ fontSize: 11, color: m.bad ? DANGER : FAINT, marginTop: 3 }}>
                  {m.bad ? `Between 0 and ${MAX_MARKUP_PCT}%.` : `0–${MAX_MARKUP_PCT}%. Never below MRP.`}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>
              MRP {money(m.mrp, currency)} · quoted {money(m.unit, currency)} per unit, ex-GST
              {m.qty > 1 && <> · line {money(m.lineTotal, currency)}</>}
            </div>
          </div>
        ))}
      </div>

      {/* Customer */}
      <div style={card}>
        <h2 style={{ margin: '0 0 12px', fontSize: 15.5, fontWeight: 700, color: INK }}>Customer</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle}>Customer name</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Company name" style={inputStyle()} />
          </div>
          <div>
            <label style={labelStyle}>{currency === 'INR' ? 'GSTIN' : 'Country'}</label>
            <input value={taxId} onChange={e => setTaxId(e.target.value)}
              placeholder={currency === 'INR' ? 'Optional' : 'e.g. United Arab Emirates'} style={inputStyle()} />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div style={card}>
        <h2 style={{ margin: '0 0 12px', fontSize: 15.5, fontWeight: 700, color: INK }}>Summary</h2>
        <Row k="MRP" v={money(mrpTotal, currency)} />
        <Row k="Markup" v={money(markupTotal, currency)} />
        <Row k="Net, before GST" v={money(net, currency)} strong />
        <Row k={currency === 'INR' ? `GST ${GD_GST_PCT}%` : 'GST (export, zero-rated)'} v={money(gst, currency)} />
        <div style={{ borderTop: `1px solid ${LINE}`, margin: '8px 0' }} />
        <Row k="Customer pays" v={money(grand, currency)} strong />

        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, backgroundColor: PAPER }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: MUTED, marginBottom: 6 }}>
            {surface === 'portal' ? 'Your earning' : 'Partner earning'} — not shown to the customer
          </div>
          <Row k={`Base margin${BASE_MARGIN_PCT === null ? '' : ` ${BASE_MARGIN_PCT}% of MRP`}`}
               v={base === null ? 'to be confirmed' : money(base, currency)} />
          <Row k="Markup" v={money(markupTotal, currency)} />
          <Row k="Total" v={base === null ? `${money(markupTotal, currency)} + base` : money(base + markupTotal, currency)} strong />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <button disabled title="GreenDrive quotations are preview-only for now" style={{
            padding: '10px 16px', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit',
            backgroundColor: INK, color: '#fff', border: 'none', borderRadius: 7,
            opacity: 0.4, cursor: 'not-allowed',
          }}>
            Create quotation
          </button>
          <span style={{ fontSize: 12, color: anyBad ? DANGER : FAINT }}>
            {anyBad ? `Fix the markup — it must be between 0 and ${MAX_MARKUP_PCT}%.` : 'Preview only — available once GreenDrive pricing is confirmed.'}
          </span>
        </div>
      </div>
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

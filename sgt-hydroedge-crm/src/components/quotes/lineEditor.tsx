// =====================================================================
// components/quotes/lineEditor.tsx — one machine, as a form.
//
// Extracted from QuoteScreen when the dealer PO gained the ability to
// renegotiate prices. Both screens edit the same thing: a kVA rating,
// a quantity, a discount in either form, an AMC term and an optional
// specification. A second implementation on the PO side would have
// meant two places to fix a rounding rule and two ways to type a
// discount, which is exactly the drift the server side avoids by
// sharing performQuotation().
//
// Nothing here knows about quotations or POs. It resolves a kVA through
// whatever api it is handed and reports the line back.
// =====================================================================

import { useEffect, useRef } from 'react'
import { AlertCircle, X, Zap } from 'lucide-react'
import type { Resolution, SpecField, QuoteApi } from './QuoteScreen'
import {
  INK, MUTED, LINE, FAINT, DANGER, OK, WARN_BG, WARN_FG,
  rupees, inputStyle, labelStyle,
} from './theme'
import { F } from './Field'
// ---------------------------------------------------------------------
// One machine on the quotation.
// ---------------------------------------------------------------------

export interface LineState {
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
export const blankLine = (): LineState => ({
  id: nextLineId++,
  kva: '', qty: 1,
  discountMode: 'pct', discountPct: '', discountAmt: '',
  amcYears: 0, spec: {}, showSpec: false,
  res: null, resolving: false,
})

/** Machine value, discount and AMC for one line — one place, so the
 *  summary, the cap check and the payload can never disagree. */
export function lineMaths(l: LineState) {
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

export function MachineLine({
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

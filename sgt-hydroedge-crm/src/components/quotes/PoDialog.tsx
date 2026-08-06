// =====================================================================
// components/quotes/PoDialog.tsx — raise a PO, at a negotiated price.
//
// The quotation is the offer; this is where the deal actually lands. It
// opens prefilled with exactly what was quoted, so raising a PO at the
// quoted price is still one click, and anything the customer negotiated
// is typed over the top.
//
// It reuses MachineLine rather than growing its own line editor, so kVA
// resolution, the two ways of typing a discount, the AMC terms and the
// specification behave identically to the quote screen. That reuse is
// the whole reason lineEditor.tsx exists.
//
// ── The base price is the QUOTED one, not today's ────────────────────
// Each prefilled line sends back the list rate the QUOTATION carried, so
// a quotation raised three months ago prices at what the customer was
// offered rather than at whatever the price list says now. Newly added
// machines have no quoted price and take the current one. Change a
// line's kVA and it becomes a different machine, so its quoted base is
// dropped too.
// =====================================================================

import { useEffect, useState } from 'react'
import { AlertCircle, X } from 'lucide-react'
import {
  INK, MUTED, LINE, FAINT, DANGER, PAPER, WARN_BG, WARN_FG, rupees,
} from './theme'
import { MachineLine, blankLine, type LineState } from './lineEditor'
import type { QuoteApi, SpecField, PoResolve, PoRow, QuoteLinePayload } from './QuoteScreen'

/** Machine value, discount and AMC for one line, against a chosen base rate. */
function maths(l: LineState, base: number | null) {
  const rate = base ?? (Number(l.res?.rate) || 0)
  const machineAmt = rate * l.qty
  const amcOption = l.res?.amcOptions?.find(o => o.years === l.amcYears)
  const amcAmt = l.amcYears > 0 && amcOption?.rate ? Number(amcOption.rate) * l.qty : 0
  const discountValue = l.discountMode === 'pct'
    ? Math.round(machineAmt * (Number(l.discountPct) || 0) / 100)
    : Math.round(Number(l.discountAmt) || 0)
  const effectivePct = machineAmt > 0
    ? Math.round((discountValue / machineAmt) * 10000) / 100
    : 0
  return { rate, machineAmt, amcAmt, discountValue, effectivePct }
}

export function PoDialog({ api, quotationErpName, specFields, onClose, onRaised }: {
  api: QuoteApi
  quotationErpName: string
  specFields: SpecField[]
  onClose: () => void
  onRaised: (po: { id: number; erp_name: string; warnings?: string[] }) => void
}) {
  // Step one is a choice, not a form: raise a new PO, or amend one that
  // already exists for this customer. Skipped entirely when there are no
  // existing POs — offering to edit nothing is a dead end.
  const [step, setStep] = useState<'choose' | 'edit'>('choose')
  /** The PO being amended. Null means a new one against the quotation. */
  const [editing, setEditing] = useState<PoRow | null>(null)
  const [choices, setChoices] = useState<PoRow[] | null>(null)
  const [picked, setPicked] = useState<number | ''>('')

  const [plan, setPlan] = useState<PoResolve | null>(null)
  const [lines, setLines] = useState<LineState[]>([])
  /** Line id -> the list rate the quotation carried. Absent = price it today. */
  const [base, setBase] = useState<Record<number, number | null>>({})
  const [initial, setInitial] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Fill the editor from a resolve payload, whichever step produced it. */
  const load = (p: PoResolve) => {
    const built: LineState[] = []
    const bases: Record<number, number | null> = {}
    for (const l of p.lines) {
      const s = blankLine()
      s.kva = l.kva == null ? '' : String(l.kva)
      s.qty = l.qty || 1
      // Shown the way it was originally entered, so the figure on screen
      // is the figure whoever typed it actually typed.
      s.discountMode = l.discountAmount != null && l.discountPct == null ? 'amount' : 'pct'
      s.discountPct = l.discountPct != null ? String(l.discountPct) : ''
      s.discountAmt = l.discountAmount != null ? String(l.discountAmount) : ''
      s.amcYears = l.amcYears ?? 0
      s.spec = l.spec ?? {}
      s.showSpec = !!l.spec && Object.keys(l.spec).length > 0
      built.push(s)
      bases[s.id] = l.listRate == null ? null : Number(l.listRate)
    }
    if (!built.length) built.push(blankLine())
    setPlan(p)
    setLines(built)
    setBase(bases)
    setInitial(signature(built))
  }

  // The first fetch does double duty: it decides whether there is
  // anything to amend, and it is the payload the editor needs if the
  // answer is no.
  useEffect(() => {
    let dead = false
    api.resolvePo(quotationErpName)
      .then(p => {
        if (dead) return
        const existing = p.forCustomer ?? p.existing ?? []
        setChoices(existing)
        load(p)
        // Nothing to amend, so there is no choice to make.
        if (!existing.length) setStep('edit')
      })
      .catch(e => { if (!dead) setError(e.message) })
    return () => { dead = true }
  }, [quotationErpName])

  /** Move to the editor, either fresh or loaded from an existing PO. */
  const start = async (po: PoRow | null) => {
    setError(null)
    setEditing(po)
    if (!po) { setStep('edit'); return }
    setBusy(true)
    try {
      const p = await api.loadPoForEdit(po.id)
      load(p)
      setStep('edit')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  /** What the user has typed, flattened, so "did anything change" is cheap. */
  const signature = (ls: LineState[]) =>
    JSON.stringify(ls.map(l => [l.kva, l.qty, l.discountMode, l.discountPct, l.discountAmt,
                                l.amcYears, l.spec]))

  const patch = (id: number, p: Partial<LineState>) =>
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l
      // A different rating is a different machine, so the price it was
      // quoted at no longer applies to it.
      if (p.kva !== undefined && String(p.kva) !== l.kva) {
        setBase(b => ({ ...b, [id]: null }))
      }
      return { ...l, ...p }
    }))

  const filled = lines.filter(l => l.kva.trim() !== '')
  const changed = !!plan && signature(lines) !== initial
  const perLine = filled.map(l => maths(l, base[l.id] ?? null))
  const subTotal = perLine.reduce((s, m) => s + m.machineAmt - m.discountValue + m.amcAmt, 0)
  const taxTotal = (plan?.taxRules ?? [])
    .reduce((s, t) => s + subTotal * (Number(t.rate) || 0) / 100, 0)
  const maxPct = plan?.discount.maxPct ?? 0
  const overCap = perLine.some(m => m.effectivePct > maxPct)
  // The quoted base and today's catalogue price disagreeing is not an
  // error, but it must not be silent — the PO will use the quoted one.
  const stalePrice = filled.some(l => {
    const b = base[l.id]
    const now = Number(l.res?.rate) || 0
    return b != null && now > 0 && Math.abs(b - now) > 1
  })

  const raise = async () => {
    setError(null)
    setBusy(true)
    try {
      // On a NEW PO, untouched means untouched: no lines are sent and the
      // server copies the quotation's own figures rather than recomputing
      // them, which keeps the common case exact.
      //
      // On an EDIT the lines are always sent, even unchanged. Omitting
      // them tells the server to fall back to the quotation — which would
      // silently undo the negotiation on a PO somebody opened, looked at
      // and saved without touching.
      const payload: QuoteLinePayload[] | undefined = (editing || changed)
        ? filled.map(l => ({
            kva: l.kva,
            qty: l.qty,
            rate: base[l.id] ?? null,
            discountPct: l.discountMode === 'pct' && l.discountPct.trim()
              ? Number(l.discountPct) : null,
            discountAmount: l.discountMode === 'amount' && l.discountAmt.trim()
              ? Number(l.discountAmt) : null,
            amcYears: l.amcYears > 0 ? l.amcYears : null,
            spec: Object.keys(l.spec).length ? l.spec : null,
          }))
        : undefined
      onRaised(editing
        ? await api.updatePo(editing.id, payload)
        : await api.raisePo(quotationErpName, payload))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const blocked = !!plan?.taxBlocker

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(22,22,20,0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '28px 16px', overflowY: 'auto', zIndex: 60,
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: PAPER, borderRadius: 12, width: '100%', maxWidth: 760,
          padding: '18px 20px 20px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: INK, flex: 1 }}>
            {step === 'choose' ? 'Purchase order'
              : editing ? `Amend ${editing.erp_name}`
              : 'Raise purchase order'}
          </h3>
          <button type="button" onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: MUTED,
          }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>
          Against {quotationErpName}
          {plan?.summary.customerName ? ` · ${plan.summary.customerName}` : ''}
        </div>

        {error && (
          <div style={{
            display: 'flex', gap: 7, alignItems: 'flex-start', padding: '9px 11px',
            backgroundColor: '#FBEAE6', color: DANGER, borderRadius: 7,
            fontSize: 12.5, marginBottom: 12,
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {!plan && !error && (
          <p style={{ fontSize: 13, color: MUTED }}>Reading the quotation…</p>
        )}

        {/* ---- Step one: new, or amend one that already exists ---- */}
        {plan && step === 'choose' && (
          <>
            <button type="button" onClick={() => start(null)} disabled={busy}
              style={{
                width: '100%', textAlign: 'left', padding: '13px 14px', marginBottom: 10,
                border: `1px solid ${LINE}`, borderRadius: 9, backgroundColor: '#fff',
                cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
              }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>
                Create a new PO
              </div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>
                Against {quotationErpName}, prefilled with what was quoted.
              </div>
            </button>

            <div style={{
              border: `1px solid ${LINE}`, borderRadius: 9, backgroundColor: '#fff',
              padding: '13px 14px',
            }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>
                Edit an existing PO
              </div>
              <div style={{ fontSize: 12, color: MUTED, margin: '3px 0 9px' }}>
                Every PO for {plan.summary.customerName ?? 'this customer'}, whichever
                quotation it came from.
              </div>
              <select
                value={picked}
                onChange={e => setPicked(e.target.value === '' ? '' : Number(e.target.value))}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '9px 10px', fontSize: 13.5,
                  color: INK, backgroundColor: '#fff', border: `1px solid ${LINE}`,
                  borderRadius: 6, outline: 'none', fontFamily: 'inherit', marginBottom: 9,
                }}>
                <option value="">Choose a PO…</option>
                {(choices ?? []).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.erp_name}
                    {p.po_date ? ` · ${p.po_date}` : ''}
                    {p.grand_total ? ` · ${rupees(p.grand_total)}` : ''}
                    {p.status === 'cancelled' ? ' · cancelled' : ''}
                  </option>
                ))}
              </select>
              <button type="button"
                disabled={busy || picked === '' ||
                  (choices ?? []).find(p => p.id === picked)?.status === 'cancelled'}
                onClick={() => start((choices ?? []).find(p => p.id === picked) ?? null)}
                style={{
                  width: '100%', padding: '10px', fontSize: 13, fontWeight: 700,
                  fontFamily: 'inherit', border: 'none', borderRadius: 7,
                  cursor: picked === '' || busy ? 'not-allowed' : 'pointer',
                  backgroundColor: picked === '' || busy ? '#D8D3C4' : INK,
                  color: picked === '' || busy ? '#8C887E' : '#fff',
                }}>
                {busy ? 'Opening…' : 'Edit this PO'}
              </button>
              {picked !== '' &&
                (choices ?? []).find(p => p.id === picked)?.status === 'cancelled' && (
                <div style={{ fontSize: 11.5, color: WARN_FG, marginTop: 7 }}>
                  That PO was cancelled, so it can no longer be changed. Create a new one.
                </div>
              )}
            </div>
          </>
        )}

        {plan && step === 'edit' && (
          <>
            {(plan.warnings ?? []).map((w, i) => (
              <div key={i} style={{
                padding: '9px 11px', backgroundColor: WARN_BG, color: WARN_FG,
                borderRadius: 7, fontSize: 12.5, marginBottom: 8,
              }}>
                {w}
              </div>
            ))}

            {blocked ? (
              // Prices cannot be renegotiated without recomputing this
              // quotation's tax, and that is not something to guess at.
              // The PO can still be raised exactly as quoted.
              <div style={{
                padding: '10px 12px', backgroundColor: WARN_BG, color: WARN_FG,
                borderRadius: 7, fontSize: 12.5, marginBottom: 14, lineHeight: 1.5,
              }}>
                {plan.taxBlocker}
              </div>
            ) : (
              <>
                {stalePrice && (
                  <div style={{
                    padding: '9px 11px', backgroundColor: WARN_BG, color: WARN_FG,
                    borderRadius: 7, fontSize: 12.5, marginBottom: 8, lineHeight: 1.5,
                  }}>
                    The price list has moved since this quotation was raised. The PO will
                    use the price the customer was quoted, not the current one.
                  </div>
                )}

                {lines.map((l, i) => (
                  <MachineLine
                    key={l.id}
                    line={l}
                    index={i}
                    count={lines.length}
                    maxDiscount={maxPct}
                    specFields={specFields}
                    api={api}
                    onChange={p => patch(l.id, p)}
                    onRemove={() => setLines(prev => prev.filter(x => x.id !== l.id))}
                  />
                ))}

                <button type="button" onClick={() => setLines(prev => [...prev, blankLine()])}
                  style={{
                    background: 'none', border: `1px dashed ${LINE}`, borderRadius: 8,
                    padding: '9px 12px', width: '100%', cursor: 'pointer',
                    color: MUTED, fontSize: 12.5, fontFamily: 'inherit', marginBottom: 14,
                  }}>
                  + Add another machine
                </button>
              </>
            )}

            <div style={{
              backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 9,
              padding: '11px 13px', marginBottom: 14, fontSize: 13,
            }}>
              <Row label="Sub total" value={rupees(Math.round(subTotal))} />
              {(plan.taxRules ?? []).map((t, i) => (
                <Row key={i} label={t.description ?? 'Tax'}
                  value={rupees(Math.round(subTotal * (Number(t.rate) || 0) / 100))} />
              ))}
              <Row label="Grand total" value={rupees(Math.round(subTotal + taxTotal))} strong />
              {plan.summary.grandTotal != null && changed && (
                <Row label="Quoted" value={rupees(plan.summary.grandTotal)} faint />
              )}
            </div>

            <div style={{ display: 'flex', gap: 9 }}>
              <button type="button"
                onClick={() => (choices?.length ? setStep('choose') : onClose())}
                style={{
                  flex: '0 0 auto', padding: '11px 16px', fontSize: 13.5, fontFamily: 'inherit',
                  border: `1px solid ${LINE}`, borderRadius: 8, backgroundColor: 'transparent',
                  color: MUTED, cursor: 'pointer',
                }}>
                {choices?.length ? 'Back' : 'Cancel'}
              </button>
              <button type="button" onClick={raise} disabled={busy || overCap || !filled.length}
                style={{
                  flex: 1, padding: '11px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
                  border: 'none', borderRadius: 8,
                  cursor: busy || overCap || !filled.length ? 'not-allowed' : 'pointer',
                  backgroundColor: busy || overCap || !filled.length ? '#D8D3C4' : INK,
                  color: busy || overCap || !filled.length ? '#8C887E' : '#fff',
                }}>
                {busy ? (editing ? 'Saving to ERPNext…' : 'Raising in ERPNext…')
                  : overCap ? `Over the ${maxPct}% limit`
                  : editing ? `Save changes to ${editing.erp_name}`
                  : changed ? 'Raise PO at the agreed price'
                  : 'Raise PO as quoted'}
              </button>
            </div>
            {!blocked && (
              <div style={{ fontSize: 11, color: FAINT, marginTop: 8, lineHeight: 1.5 }}>
                Up to {maxPct}% off the list price on this PO. The rate card leaves{' '}
                {plan.discount.rateCardMarginPct}%, so a discount near that sells at cost.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, strong, faint }: {
  label: string; value: string; strong?: boolean; faint?: boolean
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: '3px 0',
      color: faint ? FAINT : INK,
      fontWeight: strong ? 700 : 400,
      textDecoration: faint ? 'line-through' : 'none',
    }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

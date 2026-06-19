/**
 * AccountsDashboard.tsx — role: accounts
 * Two panels:
 *   1. FinancialSnapshot   — Income / Expense / Margin from /erp/pnl (+ FY selector via /erp/fiscal-years)
 *   2. UpcomingOrdersPanel — Outstanding Sales Orders from /erp/orders/outstanding
 *
 * Uses the same API base + response shapes as the rest of the app.
 */

import { useEffect, useState, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL ?? '/api/v1'

// ─── palette ─────────────────────────────────────────────────────────────────
const C = {
  paper:  '#F4F0E5',
  navy:   '#1E3A6B',
  teal:   '#0E5550',
  tealLt: '#E7F0EE',
  gold:   '#A86A18',
  goldLt: '#FBF3E2',
  red:    '#A02B1F',
  redLt:  '#FBEDEB',
  ink:    '#161614',
  muted:  '#6A675F',
  faint:  '#A39F94',
  border: '#E8E3D2',
  line:   '#DDD7C6',
  white:  '#fff',
}

// ─── types — match the real backend shapes ───────────────────────────────────
interface FiscalYear { name: string; start?: string; end?: string }

// /erp/pnl returns { income, expense, ... }. We also read breakdown rows from
// /erp/pnl/income-breakdown and /erp/pnl/expense-children.
interface PnlData {
  income: number
  expense: number
  // some deployments name the net field differently; we compute it ourselves.
}

interface BreakdownRow { account: string; amount: number }

// /erp/orders/outstanding returns { orders: [...], outstandingValue, overdueCount, ... }
interface OutstandingOrder {
  id: string
  customer: string
  placedOn: string | null
  deliveryDate: string | null
  status: string
  total: number            // INR (company currency)
  currency: string         // original txn currency
  isForeign?: boolean
  origTotal?: number | null
  delivered: number        // % delivered
  overdue?: boolean
  overdueDays?: number | null
}

interface OutstandingResponse {
  orders: OutstandingOrder[]
  outstandingValue?: number
  overdueCount?: number
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const authFetch = (url: string, opts: RequestInit = {}) => {
  const token = localStorage.getItem('sgt_token')
  return fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
}

const inrFull = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
const inrShort = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1e7) return '₹' + (n / 1e7).toFixed(2).replace(/\.00$/, '') + ' Cr'
  if (a >= 1e5) return '₹' + (n / 1e5).toFixed(2).replace(/\.00$/, '') + ' L'
  if (a >= 1e3) return '₹' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'
  return '₹' + Math.round(n)
}

const dayLabel = (d: number) => (d === 1 ? '1 day' : `${d} days`)

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent, onClick }: {
  label: string; value: string; sub?: string; accent: string; onClick?: () => void
}) {
  return (
    <div onClick={onClick} style={{
      flex: '1 1 160px', minWidth: 0,
      backgroundColor: C.white, borderRadius: 9,
      border: `1px solid ${C.border}`, borderTop: `3px solid ${accent}`,
      padding: '14px 16px 12px', cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: accent, letterSpacing: '-0.02em', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.faint, marginTop: 5, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}

// ─── Breakdown drawer ─────────────────────────────────────────────────────────
function BreakdownDrawer({ title, rows, loading, onClose }: {
  title: string; rows: BreakdownRow[]; loading: boolean; onClose: () => void
}) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(20,20,18,0.45)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.white, borderRadius: 14, padding: '18px 20px',
        width: '100%', maxWidth: 460, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 16, color: C.teal }}>{title}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: C.faint }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', marginTop: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {loading && <p style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: 20 }}>Loading…</p>}
          {!loading && rows.length === 0 && <p style={{ color: C.faint, fontSize: 13, textAlign: 'center', padding: 20 }}>No entries</p>}
          {!loading && rows.map((r, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 4px', borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none',
            }}>
              <span style={{ fontSize: 13, color: C.ink, flex: 1, paddingRight: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.account}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{inrShort(r.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Financial Snapshot ───────────────────────────────────────────────────────
function FinancialSnapshot() {
  const [fyList, setFyList]       = useState<FiscalYear[]>([])
  const [fy, setFy]               = useState<string>('')       // '' = all-time
  const [range, setRange]         = useState<{ from?: string; to?: string }>({})
  const [pnl, setPnl]             = useState<PnlData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  const [drawer, setDrawer]       = useState<'income' | 'expense' | null>(null)
  const [drawerRows, setDrawerRows] = useState<BreakdownRow[]>([])
  const [drawerLoading, setDrawerLoading] = useState(false)

  // Load fiscal years
  useEffect(() => {
    authFetch(`${API}/erp/fiscal-years`)
      .then(r => r.json())
      .then(d => {
        const list: FiscalYear[] = Array.isArray(d) ? d : (d.fiscalYears ?? d.data ?? [])
        setFyList(list)
      })
      .catch(() => {})
  }, [])

  // When FY changes, resolve from/to. '' => all-time (no params).
  useEffect(() => {
    if (!fy) { setRange({}); return }
    const found = fyList.find(f => f.name === fy)
    if (found?.start && found?.end) setRange({ from: found.start, to: found.end })
    else setRange({})
  }, [fy, fyList])

  // Load P&L for the range
  useEffect(() => {
    setLoading(true)
    setError('')
    const qs = range.from && range.to ? `?from=${range.from}&to=${range.to}` : ''
    authFetch(`${API}/erp/pnl${qs}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        const income  = Number(d.income ?? d.totalIncome ?? 0)
        const expense = Number(d.expense ?? d.totalExpense ?? 0)
        setPnl({ income, expense })
        setLoading(false)
      })
      .catch(() => { setError('Failed to load financials'); setLoading(false) })
  }, [range.from, range.to])

  // Open a breakdown drawer — lazily fetch the rows
  const openDrawer = (kind: 'income' | 'expense') => {
    setDrawer(kind)
    setDrawerLoading(true)
    setDrawerRows([])
    const qs = range.from && range.to ? `?from=${range.from}&to=${range.to}` : ''
    const url = kind === 'income'
      ? `${API}/erp/pnl/income-breakdown${qs}`
      : `${API}/erp/pnl/expense-children${qs}`
    authFetch(`${url}`)
      .then(r => r.json())
      .then(d => {
        const raw: any[] = Array.isArray(d) ? d : (d.rows ?? d.data ?? d.children ?? d.breakdown ?? [])
        const rows: BreakdownRow[] = raw.map(x => ({
          account: x.account ?? x.name ?? x.party ?? x.label ?? '—',
          amount: Number(x.amount ?? x.total ?? x.value ?? 0),
        })).filter(r => r.amount > 0).sort((a, b) => b.amount - a.amount)
        setDrawerRows(rows)
        setDrawerLoading(false)
      })
      .catch(() => { setDrawerRows([]); setDrawerLoading(false) })
  }

  const income  = pnl?.income ?? 0
  const expense = pnl?.expense ?? 0
  const margin  = income - expense
  const marginPct = income > 0 ? (margin / income) * 100 : 0

  return (
    <section style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 18px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Financial Overview</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, marginTop: 2 }}>Income · Expense · Margin</div>
        </div>
        <select
          value={fy}
          onChange={e => setFy(e.target.value)}
          style={{ border: `1px solid ${C.line}`, borderRadius: 7, padding: '6px 12px', fontSize: 13, color: C.ink, background: C.paper, cursor: 'pointer', outline: 'none' }}
        >
          <option value="">All time</option>
          {fyList.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
        </select>
      </div>

      {/* Body */}
      <div style={{ padding: '18px' }}>
        {loading && <p style={{ color: C.muted, fontSize: 13, padding: '12px 0' }}>Loading financials…</p>}
        {error && !loading && <p style={{ color: C.red, fontSize: 13 }}>{error}</p>}

        {!loading && !error && pnl && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
              <StatCard label="Total Income"  value={inrShort(income)}  sub={`${inrFull(income)} · tap to break down`}  accent={C.teal} onClick={() => openDrawer('income')} />
              <StatCard label="Total Expense" value={inrShort(expense)} sub={`${inrFull(expense)} · tap to break down`} accent={C.red}  onClick={() => openDrawer('expense')} />
              <StatCard label="Net Margin"    value={inrShort(margin)}  sub={`${marginPct.toFixed(1)}% of income`}     accent={margin >= 0 ? '#3D6B1C' : C.red} />
            </div>

            {income > 0 && (
              <div>
                <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Expense vs Income</div>
                <div style={{ height: 8, background: C.paper, borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (expense / income) * 100).toFixed(1)}%`, background: expense > income ? C.red : C.teal, borderRadius: 99, transition: 'width .5s ease' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                  <span style={{ fontSize: 11, color: C.muted }}>Expense {((expense / income) * 100).toFixed(0)}% of income</span>
                  <span style={{ fontSize: 11, color: C.faint }}>Income {inrShort(income)}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {drawer === 'income'  && <BreakdownDrawer title="Income breakdown"  rows={drawerRows} loading={drawerLoading} onClose={() => setDrawer(null)} />}
      {drawer === 'expense' && <BreakdownDrawer title="Expense breakdown" rows={drawerRows} loading={drawerLoading} onClose={() => setDrawer(null)} />}
    </section>
  )
}

// ─── Outstanding Orders ───────────────────────────────────────────────────────
function UpcomingOrdersPanel() {
  const [orders, setOrders]   = useState<OutstandingOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter]   = useState<'all' | 'overdue' | 'ontrack'>('all')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    authFetch(`${API}/erp/orders/outstanding`)
      .then(r => r.json())
      .then((d: OutstandingResponse & { error?: string }) => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setOrders(d.orders ?? [])
        setLoading(false)
      })
      .catch(() => { setError('Failed to load orders'); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  const visible = orders.filter(o =>
    filter === 'overdue' ? o.overdue :
    filter === 'ontrack' ? !o.overdue :
    true
  )
  const overdueCnt = orders.filter(o => o.overdue).length
  const totalValue = orders.reduce((s, o) => s + o.total, 0)

  const statusColor = (o: OutstandingOrder) =>
    o.overdue ? C.red :
    o.status === 'To Deliver and Bill' ? C.gold : C.teal

  const statusLabel = (o: OutstandingOrder) =>
    o.overdue ? `Overdue ${dayLabel(o.overdueDays ?? 0)}` :
    o.status === 'To Deliver and Bill' ? 'To Deliver' : o.status

  const fmtDate = (s: string | null) =>
    s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  return (
    <section style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 18px 14px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Sales Pipeline</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, marginTop: 2 }}>Outstanding Orders</div>
          </div>
          <button onClick={load} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', color: C.ink }}>Refresh</button>
        </div>

        {!loading && !error && (
          <>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <div style={{ background: C.paper, borderRadius: 9, padding: '10px 14px', flex: '1 1 90px', minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Open</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: C.ink }}>{orders.length}</div>
              </div>
              <div style={{ background: overdueCnt > 0 ? C.redLt : C.paper, border: overdueCnt > 0 ? `1px solid #F0D5D0` : `1px solid ${C.border}`, borderRadius: 9, padding: '10px 14px', flex: '1 1 90px', minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Overdue</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: overdueCnt > 0 ? C.red : C.ink }}>{overdueCnt}</div>
              </div>
              <div style={{ background: C.goldLt, border: `1px solid #F3E2BE`, borderRadius: 9, padding: '10px 14px', flex: '1 1 120px', minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Value</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: C.gold }}>{inrShort(totalValue)}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              {([['all', `All (${orders.length})`], ['overdue', `Overdue (${overdueCnt})`], ['ontrack', `On Track (${orders.length - overdueCnt})`]] as const).map(([f, label]) => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: filter === f ? C.navy : C.paper, color: filter === f ? '#fff' : C.muted,
                }}>{label}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* List */}
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {loading && <p style={{ color: C.muted, fontSize: 13, padding: 20 }}>Loading orders…</p>}
        {error && <p style={{ color: C.red, fontSize: 13, padding: 20 }}>{error}</p>}
        {!loading && !error && visible.length === 0 && <p style={{ color: C.faint, fontSize: 13, padding: 24, textAlign: 'center' }}>No orders match this filter</p>}

        {!loading && !error && visible.map((o, i) => {
          const isOpen = expanded === o.id
          const sc = statusColor(o)
          return (
            <div key={o.id} style={{ borderBottom: i < visible.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div onClick={() => setExpanded(isOpen ? null : o.id)} style={{
                display: 'flex', alignItems: 'center', padding: '13px 18px', cursor: 'pointer', gap: 12,
                background: isOpen ? C.paper : 'transparent',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{o.customer}</span>
                    <span style={{ fontSize: 11, color: C.faint }}>{o.id}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: sc, background: sc + '18', padding: '2px 8px', borderRadius: 20 }}>{statusLabel(o)}</span>
                    {o.deliveryDate && !o.overdue && <span style={{ fontSize: 11, color: C.muted }}>Due {fmtDate(o.deliveryDate).replace(/ \d{4}$/, '')}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: C.ink }}>{inrShort(o.total)}</div>
                  {o.isForeign && o.currency !== 'INR' && <div style={{ fontSize: 10, color: C.faint }}>{o.currency}</div>}
                </div>
                <div style={{ color: C.faint, fontSize: 13, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▾</div>
              </div>

              {isOpen && (
                <div style={{ background: C.paper, padding: '14px 18px 18px 38px', borderTop: `1px solid ${C.border}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14 }}>
                    <Cell label="Order ID"      value={o.id} />
                    <Cell label="Placed"        value={fmtDate(o.placedOn)} />
                    <Cell label="Delivery Date" value={fmtDate(o.deliveryDate)} />
                    <Cell label="Value"         value={inrFull(o.total)} sub={o.isForeign && o.origTotal ? `${o.currency} ${o.origTotal.toLocaleString()}` : undefined} />
                    <Cell label="Delivered"     value={`${Math.round(o.delivered)}%`} accent={o.delivered >= 100 ? C.teal : undefined} />
                    <Cell label="Status"        value={o.status} />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 5 }}>Delivery progress</div>
                    <div style={{ height: 6, background: C.border, borderRadius: 99 }}>
                      <div style={{ height: '100%', width: `${Math.min(100, o.delivered)}%`, background: o.delivered >= 100 ? C.teal : C.gold, borderRadius: 99, transition: 'width .4s' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Cell({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: C.muted, textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: accent ?? C.ink }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.faint }}>{sub}</div>}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AccountsDashboard() {
  return (
    <div style={{ maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <FinancialSnapshot />
      <UpcomingOrdersPanel />
    </div>
  )
}
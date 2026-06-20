// src/components/customers/CustomerList.tsx
// Customer management dashboard — customers + billing + gross-margin profitability
// from ERPNext, with an All-time / fiscal-year toggle. Director and sales only.

import { useEffect, useMemo, useState } from 'react'
import { authFetch } from '../../lib/auth'

const C = {
  ink:     '#161614',
  forest:  '#1F4E2E',
  forest2: '#16391F',
  green2:  '#2D7A4F',
  gold:    '#C9A24E',
  off:     '#FAF8F2',
  ground:  '#F4F0E5',
  surface: '#FFFFFF',
  red:     '#C84A3A',
  muted:   '#6A675F',
  border:  '#DDD7C6',
}

const API = import.meta.env.VITE_API_URL ?? '/api/v1'
const inr      = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
const inrShort = (n: number) => {
  const a = Math.abs(n)
  const s = n < 0 ? '-' : ''
  if (a >= 1e7) return s + '₹' + (a / 1e7).toFixed(2).replace(/\.00$/, '') + ' Cr'
  if (a >= 1e5) return s + '₹' + (a / 1e5).toFixed(2).replace(/\.00$/, '') + ' L'
  if (a >= 1e3) return s + '₹' + (a / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'
  return s + '₹' + Math.round(a)
}

type CustomerRow = {
  name: string
  customer_name: string
  customer_group: string
  territory: string
  customer_type: string
  mobile_no: string | null
  email_id: string | null
  tax_id: string | null
  disabled: number
  billing_total: number
  cogs: number
  gross_profit: number
  margin_pct: number
  invoice_count: number
}

type MarginLineItem = { itemCode: string; itemName: string; qty: number; revenue: number; cost: number; margin: number; costMissing: boolean }
type MarginInvoice = { invoice: string; date: string; revenue: number; cost: number; margin: number; items: MarginLineItem[] }
type CustomerMargin = { customer: string; customerName: string; revenue: number; cost: number; grossProfit: number; margin: number; missingCostCount: number; invoices: MarginInvoice[] }

type FiscalYear = { name: string; from: string; to: string }
type SortKey = 'billing' | 'profit' | 'margin' | 'name' | 'customer_group'

const GROUP_PALETTE = ['#1F4E2E', '#2D6E8E', '#B5642A', '#6B4E8E', '#2D7A4F', '#9A7B1F', '#9E3B3B']
function groupColor(group: string): string {
  if (!group) return C.muted
  let h = 0
  for (let i = 0; i < group.length; i++) h = (h * 31 + group.charCodeAt(i)) >>> 0
  return GROUP_PALETTE[h % GROUP_PALETTE.length]
}
function marginColor(pct: number): string {
  if (pct >= 30) return '#2D7A4F'
  if (pct >= 15) return '#9A7B1F'
  if (pct > 0)   return '#B5642A'
  return '#C84A3A'
}

export default function CustomerList() {
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const [sort, setSort]           = useState<SortKey>('billing')
  const [groupFilter, setGroupFilter] = useState<string>('__all__')

  // margin breakdown slide-over
  const [openCustomer, setOpenCustomer] = useState<CustomerRow | null>(null)

  // fiscal-year period toggle
  const [years, setYears]   = useState<FiscalYear[]>([])
  const [period, setPeriod] = useState<string>('__all__')   // '__all__' or FY name

  // load fiscal years once
  useEffect(() => {
    let ignore = false
    fetch(`${API}/erp/fiscal-years`)
      .then(r => r.json())
      .then(d => { if (!ignore && Array.isArray(d)) setYears(d) })
      .catch(() => {})
    return () => { ignore = true }
  }, [])

  // (re)load customers whenever the period changes
  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError(null)
    let url = `${API}/erp/customers`
    if (period !== '__all__') {
      const y = years.find(y => y.name === period)
      if (y) url += `?from=${y.from}&to=${y.to}`
    }
    authFetch(url)
      .then(r => r.json())
      .then(d => {
        if (ignore) return
        if (Array.isArray(d)) setCustomers(d)
        else setError(d.error ?? 'Unknown error')
      })
      .catch(e => { if (!ignore) setError(String(e)) })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [period, years])

  const active = useMemo(() => customers.filter(c => !c.disabled), [customers])
  const groups = useMemo(
    () => ['__all__', ...Array.from(new Set(active.map(c => c.customer_group).filter(Boolean))).sort()],
    [active],
  )

  // ── summary metrics ──
  const totalRevenue = active.reduce((s, c) => s + (c.billing_total ?? 0), 0)
  const totalProfit  = active.reduce((s, c) => s + (c.gross_profit ?? 0), 0)
  const blendedMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
  const billingCount = active.filter(c => c.billing_total > 0).length
  const topCustomer  = active.reduce<CustomerRow | null>((top, c) => (!top || c.billing_total > top.billing_total ? c : top), null)
  const maxBilling   = topCustomer?.billing_total ?? 0

  const visible = useMemo(() => active
    .filter(c => groupFilter === '__all__' || c.customer_group === groupFilter)
    .filter(c => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        c.customer_name?.toLowerCase().includes(q) ||
        c.name?.toLowerCase().includes(q) ||
        c.territory?.toLowerCase().includes(q) ||
        c.tax_id?.toLowerCase().includes(q) ||
        (c.mobile_no ?? '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (sort === 'billing') return b.billing_total - a.billing_total
      if (sort === 'profit')  return b.gross_profit - a.gross_profit
      if (sort === 'margin')  return b.margin_pct - a.margin_pct
      if (sort === 'name')    return (a.customer_name ?? '').localeCompare(b.customer_name ?? '', 'en-IN')
      return (a.customer_group ?? '').localeCompare(b.customer_group ?? '', 'en-IN')
    }), [active, groupFilter, search, sort])

  const initials = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?'

  const periodLabel = period === '__all__' ? 'all time' : period

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.ground }}>

      {/* Hero */}
      <div style={{ background: `linear-gradient(135deg, ${C.forest} 0%, ${C.forest2} 100%)`, color: '#fff', padding: '22px 28px 20px', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: C.gold }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 25, fontWeight: 700, letterSpacing: '-0.03em' }}>Customers</h1>
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#BFE0C9' }}>
              {loading ? 'Loading from ERPNext…' : error ? 'Error loading' : `${active.length} active accounts · ${periodLabel}`}
            </p>
          </div>
          {/* Period toggle */}
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: C.forest, background: '#fff', border: 'none', cursor: 'pointer' }}
          >
            <option value="__all__">All time</option>
            {years.map(y => <option key={y.name} value={y.name}>{y.name}</option>)}
          </select>
        </div>
      </div>

      {/* Stat strip */}
      {!loading && !error && (
        <div style={{ display: 'grid', gap: 10, padding: '16px 28px 0', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <Stat label="Revenue" value={inrShort(totalRevenue)} sub={`${billingCount} billed accounts`} accent={C.green2} />
          <Stat label="Gross profit" value={inrShort(totalProfit)} sub="revenue − cost of goods" accent={marginColor(blendedMargin)} />
          <Stat label="Blended margin" value={`${blendedMargin.toFixed(1)}%`} sub="across all accounts" accent={marginColor(blendedMargin)} />
          <Stat label="Top account" value={inrShort(maxBilling)} sub={topCustomer?.customer_name ?? '—'} accent={C.gold} truncate />
        </div>
      )}

      {/* Controls */}
      <div style={{ padding: '16px 28px 0' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#aaa', fontSize: 14 }}>⌕</span>
            <input
              type="search"
              placeholder="Search name, territory, GSTIN, phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px 8px 30px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.off, outline: 'none' }}
            />
          </div>
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
            style={{ padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.off, color: C.forest, fontWeight: 600 }}>
            {groups.map(g => <option key={g} value={g}>{g === '__all__' ? 'All groups' : g}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
            style={{ padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.off, color: C.forest, fontWeight: 600 }}>
            <option value="billing">Revenue (high → low)</option>
            <option value="profit">Gross profit</option>
            <option value="margin">Margin %</option>
            <option value="name">Name (A → Z)</option>
            <option value="customer_group">Group</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div style={{ padding: '14px 28px 48px' }}>
        {loading && <div style={{ color: C.green2, fontSize: 13, padding: '24px 4px' }}>Loading customers from ERPNext…</div>}
        {error   && <div style={{ color: C.red,    fontSize: 13, padding: '24px 4px' }}>ERPNext: {error}</div>}

        {!loading && !error && visible.length === 0 && (
          <div style={{ color: C.muted, fontSize: 13, padding: '24px 4px' }}>
            {search || groupFilter !== '__all__'
              ? 'No customers match your filters.'
              : period !== '__all__' ? `No billing activity in ${period}.` : 'No customers found in ERPNext.'}
          </div>
        )}

        {!loading && !error && visible.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {/* column header */}
            <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 130px 130px 150px', gap: 12, alignItems: 'center', padding: '10px 16px', background: '#F3EFE4', borderBottom: `1.5px solid ${C.border}`, fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              <span>#</span>
              <span>Customer</span>
              <span>Group</span>
              <span style={{ textAlign: 'right' }}>Gross margin</span>
              <span style={{ textAlign: 'right' }}>Revenue</span>
            </div>

            {visible.map((c, i) => {
              const gc = groupColor(c.customer_group)
              const pct = maxBilling > 0 ? (c.billing_total / maxBilling) * 100 : 0
              const mc = marginColor(c.margin_pct)
              const hasRevenue = c.billing_total > 0
              return (
                <div key={c.name}
                  onClick={() => c.billing_total > 0 && setOpenCustomer(c)}
                  style={{ display: 'grid', gridTemplateColumns: '30px 1fr 130px 130px 150px', gap: 12, alignItems: 'center', padding: '11px 16px', borderBottom: i < visible.length - 1 ? `1px solid #F0ECE0` : 'none', cursor: c.billing_total > 0 ? 'pointer' : 'default' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#FBF9F3')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                  {/* rank */}
                  <span style={{ fontSize: 12, fontWeight: 700, color: (sort === 'billing' || sort === 'profit') && i < 3 ? C.gold : '#bbb', textAlign: 'center' }}>
                    {(sort === 'billing' || sort === 'profit' || sort === 'margin') ? i + 1 : '·'}
                  </span>

                  {/* name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: gc, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700 }}>
                      {initials(c.customer_name)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.customer_name}
                      </div>
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 1, display: 'flex', gap: 8 }}>
                        {c.territory && <span>{c.territory}</span>}
                        {c.invoice_count > 0 && <span>· {c.invoice_count} inv</span>}
                      </div>
                    </div>
                  </div>

                  {/* group chip */}
                  <div style={{ minWidth: 0 }}>
                    {c.customer_group && (
                      <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, color: gc, background: gc + '14', border: `1px solid ${gc}33`, borderRadius: 999, padding: '2px 8px', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.customer_group}
                      </span>
                    )}
                  </div>

                  {/* gross margin */}
                  <div style={{ textAlign: 'right' }}>
                    {hasRevenue ? (
                      <>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: mc }}>
                          {c.margin_pct.toFixed(1)}%
                        </div>
                        <div style={{ fontSize: 10.5, color: '#aaa', marginTop: 1 }}>{inrShort(c.gross_profit)} profit</div>
                      </>
                    ) : (
                      <span style={{ fontSize: 11.5, color: '#ccc' }}>—</span>
                    )}
                  </div>

                  {/* revenue + bar */}
                  <div style={{ textAlign: 'right' }}>
                    {hasRevenue ? (
                      <>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.green2 }}>{inr(c.billing_total)}</div>
                        <div style={{ height: 4, background: '#EFECE2', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: gc, borderRadius: 2 }} />
                        </div>
                      </>
                    ) : (
                      <span style={{ fontSize: 11.5, color: '#ccc' }}>no invoices</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && !error && visible.length > 0 && (
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 10, textAlign: 'right' }}>
            Showing {visible.length} of {active.length} · {periodLabel} · gross margin = revenue − cost of goods sold (not net profit)
          </div>
        )}
      </div>

      {openCustomer && (
        <MarginPanel
          customer={openCustomer}
          period={period}
          fromTo={period === '__all__' ? null : (() => { const y = years.find(y => y.name === period); return y ? { from: y.from, to: y.to } : null })()}
          onClose={() => setOpenCustomer(null)}
        />
      )}
    </div>
  )
}

function Stat({ label, value, sub, accent, truncate }: { label: string; value: string; sub: string; accent: string; truncate?: boolean }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 13px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: accent }}>{value}</div>
      <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 3 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2, whiteSpace: truncate ? 'nowrap' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Margin breakdown slide-over — explains how the % was calculated
// ─────────────────────────────────────────────

function MarginPanel({ customer, period, fromTo, onClose }: {
  customer: CustomerRow
  period: string
  fromTo: { from: string; to: string } | null
  onClose: () => void
}) {
  const [data, setData] = useState<CustomerMargin | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    setLoading(true); setError(null); setData(null)
    let url = `${API}/erp/customers/margin?customer=${encodeURIComponent(customer.name)}`
    if (fromTo) url += `&from=${fromTo.from}&to=${fromTo.to}`
    authFetch(url)
      .then(r => r.json())
      .then(d => { if (ignore) return; if (d.error) setError(d.error); else setData(d) })
      .catch(e => { if (!ignore) setError(String(e)) })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [customer.name, fromTo])

  const mc = marginColor(customer.margin_pct)

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,18,0.45)', display: 'flex', justifyContent: 'flex-end', zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(480px, 100%)', height: '100%', background: C.ground, boxShadow: '-12px 0 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>

        {/* header */}
        <div style={{ background: `linear-gradient(135deg, ${C.forest} 0%, ${C.forest2} 100%)`, color: '#fff', padding: '18px 22px 16px', position: 'relative', flexShrink: 0 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: C.gold }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {customer.customer_name}
              </div>
              <div style={{ fontSize: 11.5, color: '#BFE0C9', marginTop: 3 }}>
                {period === '__all__' ? 'All time' : period} · how the margin is calculated
              </div>
            </div>
            <button onClick={onClose} style={{ border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 15, borderRadius: 7, width: 28, height: 28, flexShrink: 0 }}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px 40px' }}>
          {loading && <div style={{ color: C.green2, fontSize: 13 }}>Loading breakdown…</div>}
          {error   && <div style={{ color: C.red, fontSize: 13 }}>ERPNext: {error}</div>}

          {data && (
            <>
              {/* summary equation */}
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
                <Line label="Revenue (net of tax)" value={inr(data.revenue)} color={C.ink} />
                <Line label="− Cost of goods sold" value={inr(data.cost)} color={C.muted} />
                <div style={{ height: 1, background: C.border, margin: '8px 0' }} />
                <Line label="Gross profit" value={inr(data.grossProfit)} color={C.green2} bold />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>Gross margin</span>
                  <span style={{ fontSize: 26, fontWeight: 800, color: mc, letterSpacing: '-0.02em' }}>{data.margin.toFixed(1)}%</span>
                </div>
              </div>

              {/* missing-cost warning — explains the 100% rows */}
              {data.missingCostCount > 0 && (
                <div style={{ marginTop: 12, background: '#FCF6EE', border: '1px solid #efe3cd', borderRadius: 10, padding: '10px 12px', fontSize: 11.5, color: '#7A4A0E', lineHeight: 1.5 }}>
                  <b>{data.missingCostCount} item{data.missingCostCount !== 1 ? 's have' : ' has'} no cost recorded</b> in ERPNext (valuation rate is zero — likely never received into stock). Those lines count as 100% margin, which inflates the figure above. Set a valuation/standard rate on those items for a true margin.
                </div>
              )}

              {/* per-invoice */}
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', margin: '18px 0 8px' }}>
                {data.invoices.length} invoice{data.invoices.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.invoices.map(inv => {
                  const open = expanded === inv.invoice
                  const imc = marginColor(inv.margin)
                  return (
                    <div key={inv.invoice} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                      <div onClick={() => setExpanded(open ? null : inv.invoice)} style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ color: imc, fontSize: 12, width: 12 }}>{open ? '▾' : '▸'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.forest }}>{inv.invoice}</div>
                          <div style={{ fontSize: 10.5, color: '#aaa', marginTop: 1 }}>
                            {inv.date ? new Date(inv.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : ''}
                            {' · '}rev {inrShort(inv.revenue)} · cost {inrShort(inv.cost)}
                          </div>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: imc }}>{inv.margin.toFixed(0)}%</span>
                      </div>

                      {open && (
                        <div style={{ borderTop: `1px solid ${C.border}`, padding: '4px 12px 8px' }}>
                          {inv.items.map((it, k) => {
                            const lmc = marginColor(it.margin)
                            return (
                              <div key={k} style={{ padding: '7px 0', borderBottom: k < inv.items.length - 1 ? '1px solid #F2EFE5' : 'none' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5 }}>
                                  <span style={{ color: C.ink, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.itemName}</span>
                                  <span style={{ color: lmc, fontWeight: 700, flexShrink: 0 }}>
                                    {it.costMissing ? <span style={{ color: '#B5642A' }}>no cost</span> : `${it.margin.toFixed(0)}%`}
                                  </span>
                                </div>
                                <div style={{ fontSize: 10.5, color: '#999', marginTop: 2 }}>
                                  qty {Number(it.qty.toFixed(2))} · sold {inr(it.revenue)} · cost {it.costMissing ? '—' : inr(it.cost)}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div style={{ fontSize: 10.5, color: '#aaa', marginTop: 16, lineHeight: 1.5 }}>
                Cost = ERPNext item valuation (or the invoice's stored gross profit where set). This is gross margin on goods — it excludes freight, overheads and sales effort.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Line({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0' }}>
      <span style={{ fontSize: 12.5, color: C.muted }}>{label}</span>
      <span style={{ fontSize: bold ? 15 : 13.5, fontWeight: bold ? 700 : 600, color }}>{value}</span>
    </div>
  )
}
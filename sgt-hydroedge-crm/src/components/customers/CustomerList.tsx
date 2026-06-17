// src/components/customers/CustomerList.tsx
// Customer management dashboard — pulls customers + lifetime billing from ERPNext.
// Director and sales roles only.

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
  softgreen:'#EAF3EC',
}

const API = import.meta.env.VITE_API_URL ?? '/api/v1'
const inr     = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
const inrShort = (n: number) => {
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2).replace(/\.00$/, '') + ' Cr'
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2).replace(/\.00$/, '') + ' L'
  if (n >= 1e3) return '₹' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'
  return '₹' + Math.round(n)
}

type ErpCustomer = {
  name:           string
  customer_name:  string
  customer_group: string
  territory:      string
  customer_type:  string
  mobile_no:      string | null
  email_id:       string | null
  tax_id:         string | null
  disabled:       number
  billing_total:  number
}

type SortKey = 'billing' | 'name' | 'customer_group' | 'territory'

// Deterministic accent colour per customer group, for the avatar ring + group chip
const GROUP_PALETTE = ['#1F4E2E', '#2D6E8E', '#B5642A', '#6B4E8E', '#2D7A4F', '#9A7B1F', '#9E3B3B']
function groupColor(group: string): string {
  if (!group) return C.muted
  let h = 0
  for (let i = 0; i < group.length; i++) h = (h * 31 + group.charCodeAt(i)) >>> 0
  return GROUP_PALETTE[h % GROUP_PALETTE.length]
}

export default function CustomerList() {
  const [customers, setCustomers] = useState<ErpCustomer[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const [sort, setSort]           = useState<SortKey>('billing')
  const [groupFilter, setGroupFilter] = useState<string>('__all__')

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError(null)
    authFetch(`${API}/erp/customers`)
      .then(r => r.json())
      .then(d => {
        if (ignore) return
        if (Array.isArray(d)) setCustomers(d)
        else setError(d.error ?? 'Unknown error')
      })
      .catch(e => { if (!ignore) setError(String(e)) })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [])

  const active = useMemo(() => customers.filter(c => !c.disabled), [customers])
  const groups = useMemo(
    () => ['__all__', ...Array.from(new Set(active.map(c => c.customer_group).filter(Boolean))).sort()],
    [active],
  )

  // ── summary metrics ──
  const totalBilling = active.reduce((s, c) => s + (c.billing_total ?? 0), 0)
  const billingCount = active.filter(c => c.billing_total > 0).length
  const avgBilling   = billingCount ? totalBilling / billingCount : 0
  const topCustomer  = active.reduce<ErpCustomer | null>((top, c) => (!top || c.billing_total > top.billing_total ? c : top), null)
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
      if (sort === 'billing')        return b.billing_total - a.billing_total
      if (sort === 'name')           return (a.customer_name ?? '').localeCompare(b.customer_name ?? '', 'en-IN')
      if (sort === 'customer_group') return (a.customer_group ?? '').localeCompare(b.customer_group ?? '', 'en-IN')
      return (a.territory ?? '').localeCompare(b.territory ?? '', 'en-IN')
    }), [active, groupFilter, search, sort])

  const initials = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?'

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.ground }}>

      {/* ── Hero ── */}
      <div style={{ background: `linear-gradient(135deg, ${C.forest} 0%, ${C.forest2} 100%)`, color: '#fff', padding: '22px 28px 20px', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: C.gold }} />
        <h1 style={{ margin: 0, fontSize: 25, fontWeight: 700, letterSpacing: '-0.03em' }}>Customers</h1>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#BFE0C9' }}>
          {loading ? 'Loading from ERPNext…' : error ? 'Error loading' : `${active.length} active accounts · synced from ERPNext`}
        </p>
      </div>

      {/* ── Stat strip ── */}
      {!loading && !error && (
        <div style={{ display: 'grid', gap: 10, padding: '16px 28px 0', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <Stat label="Total billed" value={inrShort(totalBilling)} sub={`${billingCount} billed accounts`} accent={C.green2} />
          <Stat label="Avg per account" value={inrShort(avgBilling)} sub="billed accounts only" accent={C.ink} />
          <Stat label="Top account" value={inrShort(maxBilling)} sub={topCustomer?.customer_name ?? '—'} accent={C.gold} truncate />
          <Stat label="Customer groups" value={String(groups.length - 1)} sub="distinct segments" accent={C.ink} />
        </div>
      )}

      {/* ── Controls ── */}
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
            <option value="billing">Billing (high → low)</option>
            <option value="name">Name (A → Z)</option>
            <option value="customer_group">Group</option>
            <option value="territory">Territory</option>
          </select>
        </div>
      </div>

      {/* ── List ── */}
      <div style={{ padding: '14px 28px 48px' }}>
        {loading && <div style={{ color: C.green2, fontSize: 13, padding: '24px 4px' }}>Loading customers from ERPNext…</div>}
        {error   && <div style={{ color: C.red,    fontSize: 13, padding: '24px 4px' }}>ERPNext: {error}</div>}

        {!loading && !error && visible.length === 0 && (
          <div style={{ color: C.muted, fontSize: 13, padding: '24px 4px' }}>
            {search || groupFilter !== '__all__' ? 'No customers match your filters.' : 'No customers found in ERPNext.'}
          </div>
        )}

        {!loading && !error && visible.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {/* column header */}
            <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr 150px 170px', gap: 14, alignItems: 'center', padding: '10px 16px', background: '#F3EFE4', borderBottom: `1.5px solid ${C.border}`, fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              <span>#</span>
              <span>Customer</span>
              <span>Group / Territory</span>
              <span style={{ textAlign: 'right' }}>Lifetime billing</span>
            </div>

            {visible.map((c, i) => {
              const gc = groupColor(c.customer_group)
              const pct = maxBilling > 0 ? (c.billing_total / maxBilling) * 100 : 0
              return (
                <div key={c.name}
                  style={{ display: 'grid', gridTemplateColumns: '34px 1fr 150px 170px', gap: 14, alignItems: 'center', padding: '11px 16px', borderBottom: i < visible.length - 1 ? `1px solid #F0ECE0` : 'none', transition: 'background 120ms' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#FBF9F3')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                  {/* rank */}
                  <span style={{ fontSize: 12, fontWeight: 700, color: sort === 'billing' && i < 3 ? C.gold : '#bbb', textAlign: 'center' }}>
                    {sort === 'billing' ? i + 1 : '·'}
                  </span>

                  {/* name + avatar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: gc, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700 }}>
                      {initials(c.customer_name)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.customer_name}
                      </div>
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 1, display: 'flex', gap: 8 }}>
                        {c.mobile_no && <span>{c.mobile_no}</span>}
                        {c.tax_id && <span style={{ fontFamily: 'monospace' }}>{c.tax_id}</span>}
                      </div>
                    </div>
                  </div>

                  {/* group / territory */}
                  <div style={{ minWidth: 0 }}>
                    {c.customer_group && (
                      <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, color: gc, background: gc + '14', border: `1px solid ${gc}33`, borderRadius: 999, padding: '2px 8px', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.customer_group}
                      </span>
                    )}
                    {c.territory && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{c.territory}</div>}
                  </div>

                  {/* billing + bar */}
                  <div style={{ textAlign: 'right' }}>
                    {c.billing_total > 0 ? (
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
            Showing {visible.length} of {active.length} · billing is lifetime submitted Sales Invoices
          </div>
        )}
      </div>
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
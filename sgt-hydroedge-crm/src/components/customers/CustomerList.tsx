// src/components/customers/CustomerList.tsx
// Pulls the customer list + lifetime billing total directly from ERPNext.
// Shown to director and sales roles only.

import { useEffect, useState } from 'react'
import { authFetch } from '../../lib/auth'

const C = {
  forest:  '#1F4E2E',
  green2:  '#2D7A4F',
  off:     '#FAFAF7',
  red:     '#C84A3A',
  muted:   '#6A675F',
  bg:      '#F4F0E5',
  border:  '#DDD7C6',
}

const API = import.meta.env.VITE_API_URL ?? '/api/v1'
const inr  = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')

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

type SortKey = 'name' | 'customer_group' | 'territory' | 'billing'

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

  const activeCustomers = customers.filter(c => !c.disabled)
  const groups = ['__all__', ...Array.from(new Set(activeCustomers.map(c => c.customer_group).filter(Boolean))).sort()]
  const totalBilling = activeCustomers.reduce((s, c) => s + (c.billing_total ?? 0), 0)

  const visible = activeCustomers
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
      if (sort === 'territory')      return (a.territory ?? '').localeCompare(b.territory ?? '', 'en-IN')
      return 0
    })

  const initials = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.bg }}>

      <header style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${C.border}`, background: C.bg, flexShrink: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', margin: 0, color: C.forest }}>Customers</h1>
        <p style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>
          {loading
            ? 'Loading…'
            : error
            ? 'Error loading'
            : `${visible.length} of ${activeCustomers.length} customers · total billed ${inr(totalBilling)}`}
        </p>
      </header>

      <div style={{ padding: '12px 24px', borderBottom: `1px solid ${C.border}`, background: '#fff', flexShrink: 0, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          placeholder="Search name, territory, GSTIN…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '7px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.off, outline: 'none' }}
        />
        <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
          style={{ padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.off, color: C.forest }}>
          {groups.map(g => <option key={g} value={g}>{g === '__all__' ? 'All groups' : g}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
          style={{ padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.off, color: C.forest }}>
          <option value="billing">Sort: Billing ↓</option>
          <option value="name">Sort: Name</option>
          <option value="customer_group">Sort: Group</option>
          <option value="territory">Sort: Territory</option>
        </select>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {loading && <div style={{ color: C.green2, fontSize: 13, paddingTop: 24 }}>Loading customers from ERPNext…</div>}
        {error   && <div style={{ color: C.red,    fontSize: 13, paddingTop: 24 }}>ERPNext: {error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: C.muted, fontSize: 13, paddingTop: 24 }}>
            {search || groupFilter !== '__all__' ? 'No customers match your filters.' : 'No customers found in ERPNext.'}
          </div>
        )}
        {!loading && !error && visible.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visible.map(c => (
              <div key={c.name} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: C.forest, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
                  {initials(c.customer_name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.forest, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.customer_name}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {c.customer_group && <span>{c.customer_group}</span>}
                    {c.territory      && <span style={{ color: '#aaa' }}>· {c.territory}</span>}
                    {c.mobile_no      && <span style={{ color: '#aaa' }}>· {c.mobile_no}</span>}
                  </div>
                  {c.tax_id && <div style={{ fontSize: 10.5, color: '#bbb', fontFamily: 'monospace', marginTop: 2 }}>{c.tax_id}</div>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {c.billing_total > 0 ? (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.green2 }}>{inr(c.billing_total)}</div>
                      <div style={{ fontSize: 10.5, color: '#aaa', marginTop: 1 }}>total billed</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: '#ccc' }}>no invoices</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
// src/components/dashboard/OutstandingOrders.tsx
// Single unified Orders view: open Sales Orders from ERPNext, each as one
// expandable row (placed date, expected delivery, value, currency, progress,
// and the line items sold). DaaS rentals are folded server-side into
// data.rentals. Service-only SOs (no deliverable stock line) are folded into
// data.serviceOrders and shown as "Expected income" — they have no delivery
// note so they must not read as overdue.
import { useEffect, useState } from 'react'
import { PackageOpen, Timer, Hourglass, Clock, Truck, AlertTriangle, ChevronRight, Repeat, Coins } from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? '/api/v1'
const C = { forest: '#1F4E2E', green2: '#2D7A4F', gold: '#C9A24E', red: '#C84A3A', healthy: '#3B9D6E', navy: '#1E3A6B' }

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
const inrShort = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1e7) return '₹' + (n / 1e7).toFixed(2).replace(/\.00$/, '') + 'Cr'
  if (a >= 1e5) return '₹' + (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L'
  return inr(n)
}
const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

type LineItem = {
  itemCode: string; itemName: string; qty: number; rate: number; amount: number
}

type Order = {
  id: string; customer: string; placedOn: string | null; deliveryDate: string | null
  status: string; total: number; delivered: number; ageDays: number | null
  currency?: string; isForeign?: boolean; origTotal?: number | null; conversionRate?: number | null
  overdue?: boolean; overdueDays?: number | null; daysToDelivery?: number | null
  billed?: number; items?: LineItem[]
}

// Service-only Sales Order (every line non-stock): billed directly, no delivery.
type ServiceOrder = {
  id: string; customer: string; placedOn: string | null; status: string
  total: number; currency?: string; isForeign?: boolean
  origTotal?: number | null; conversionRate?: number | null
  billed: number; items: LineItem[]
}

// DaaS rental engagement (built server-side from rentalModel.detectDaaSEngagements).
// Rent read literally: monthlyNet = rate (₹8,268), periods = qty (24 monthly invoices).
type Rental = {
  key: string; customer: string; machines: number | null
  monthlyNet: number | null; monthlyGross: number | null
  periods: number | null; recurringNet: number
  upfrontGross: number; tcvNet: number
  upfrontStatus: 'billed' | 'partial' | 'unbilled'
  nextInvoiceDate?: string | null; invoicesPaid?: number | null
}

type Data = {
  count: number; outstandingValue: number; orders: Order[]
  avgFulfilmentDays: number | null; fulfilmentSamples: number
  overdueCount?: number; lastOrder?: Order | null; nextDelivery?: Order | null
  rentals?: Rental[]; awaitingInstallationValue?: number
  serviceOrders?: ServiceOrder[]; serviceValue?: number
}

function deliveryLabel(o: Order): { text: string; color: string } {
  if (o.overdue && o.overdueDays != null) {
    return { text: `Overdue ${o.overdueDays}d`, color: C.red }
  }
  if (o.daysToDelivery != null) {
    const d = o.daysToDelivery
    if (d === 0) return { text: 'Due today', color: C.gold }
    if (d === 1) return { text: 'In 1 day', color: C.gold }
    if (d <= 3) return { text: `In ${d} days`, color: C.gold }
    return { text: `In ${d} days`, color: C.healthy }
  }
  return { text: '', color: '#6A675F' }
}

export default function OutstandingOrders() {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    fetch(`${API}/erp/orders/outstanding`)
      .then(r => r.json())
      .then(d => { if (ignore) return; if (d.error) setErr(d.error); else setData(d); setLoading(false) })
      .catch(e => { if (!ignore) { setErr(String(e)); setLoading(false) } })
    return () => { ignore = true }
  }, [])

  const rentals = data?.rentals ?? []
  const totalMRR = rentals.reduce((s, r) => s + (r.monthlyNet ?? 0), 0)
  const serviceOrders = data?.serviceOrders ?? []
  const serviceValue = data?.serviceValue ?? 0

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        paddingBottom: 8, borderBottom: '1.5px solid #161614', marginBottom: 12,
      }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#161614', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Orders
        </span>
        {data && (data.overdueCount ?? 0) > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 11, fontWeight: 700, color: '#fff', background: C.red,
            padding: '2px 9px', borderRadius: 20,
          }}>
            <AlertTriangle size={11} strokeWidth={2.5} />
            {data.overdueCount} overdue
          </span>
        )}
      </div>

      {loading ? (
        <Box>Loading orders…</Box>
      ) : err ? (
        <Box color={C.red}>ERPNext: {err}</Box>
      ) : !data ? (
        <Box>No data.</Box>
      ) : (
        <>
          {(data.lastOrder || data.nextDelivery) && (
            <div style={{ display: 'grid', gridTemplateColumns: data.lastOrder && data.nextDelivery ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 12 }}>
              {data.lastOrder && (
                <MiniCard icon={<Clock size={14} strokeWidth={2} />} accent={C.navy} label="Last order placed">
                  <b>{data.lastOrder.customer}</b> · {inrShort(data.lastOrder.total)}
                  <div style={{ fontSize: 11, color: '#6A675F' }}>{fmtDate(data.lastOrder.placedOn)} · {data.lastOrder.id}</div>
                </MiniCard>
              )}
              {data.nextDelivery && (
                <MiniCard icon={<Truck size={14} strokeWidth={2} />} accent={C.green2} label="Next delivery">
                  <b>{data.nextDelivery.customer}</b> · {fmtDate(data.nextDelivery.deliveryDate)}
                  <div style={{ fontSize: 11, color: deliveryLabel(data.nextDelivery).color }}>
                    {deliveryLabel(data.nextDelivery).text}
                  </div>
                </MiniCard>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
            <Tile icon={<PackageOpen size={15} strokeWidth={2} />} accent={C.gold}
              label="Open orders" value={String(data.count)}
              sub={(data.overdueCount ?? 0) > 0 ? `${data.overdueCount} overdue` : 'all on schedule'} />
            <Tile icon={<Hourglass size={15} strokeWidth={2} />} accent={C.green2}
              label="Outstanding value" value={inrShort(data.outstandingValue)}
              sub={data.awaitingInstallationValue ? `+${inrShort(data.awaitingInstallationValue)} awaiting install` : 'across open orders'} />
            <Tile icon={<Timer size={15} strokeWidth={2} />} accent={data.avgFulfilmentDays != null && data.avgFulfilmentDays > 7 ? C.red : C.healthy}
              label="Avg fulfilment" value={data.avgFulfilmentDays != null ? `${data.avgFulfilmentDays}d` : '—'}
              sub={data.fulfilmentSamples ? `target 7d · from ${data.fulfilmentSamples} delivered` : 'target 7d · no delivered orders'} />
          </div>

          {rentals.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, color: '#161614', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  <Repeat size={12} strokeWidth={2.2} style={{ color: C.gold }} /> Rentals · DaaS
                </span>
                <span style={{ fontSize: 11, color: '#6A675F' }}>
                  MRR <b style={{ fontFamily: 'monospace', color: '#161614' }}>{inr(totalMRR)}</b>/mo · {rentals.length} active
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {rentals.map(r => <RentalRow key={r.key} r={r} />)}
              </div>
            </div>
          )}

          {/* Service-only orders — direct-billed, no delivery. Shown as expected income. */}
          {serviceOrders.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, color: '#161614', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  <Coins size={12} strokeWidth={2.2} style={{ color: C.navy }} /> Expected income · Service
                </span>
                <span style={{ fontSize: 11, color: '#6A675F' }}>
                  <b style={{ fontFamily: 'monospace', color: '#161614' }}>{inrShort(serviceValue)}</b> · {serviceOrders.length} order{serviceOrders.length === 1 ? '' : 's'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {serviceOrders.map(s => {
                  const isOpen = openId === s.id
                  return (
                    <div key={s.id} style={{
                      backgroundColor: '#fff', borderRadius: 8, border: '1px solid #E8E3D2',
                      borderLeft: `3px solid ${C.navy}`, overflow: 'hidden',
                    }}>
                      <div
                        onClick={() => setOpenId(isOpen ? null : s.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', cursor: 'pointer' }}
                      >
                        <ChevronRight size={14} strokeWidth={2}
                          style={{ color: '#A39F94', flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#161614' }}>{s.customer}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: C.navy, background: '#E5EAF3', padding: '1px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Service</span>
                          </div>
                          <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 1 }}>
                            {s.id} · {s.status}
                            {s.billed > 0 ? ` · ${Math.round(s.billed)}% billed` : ' · not yet billed'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#161614' }}>
                            {inrShort(s.total)}
                          </div>
                          <div style={{ fontSize: 10.5, color: '#A39F94', marginTop: 2 }}>expected</div>
                        </div>
                      </div>

                      {isOpen && (
                        <div style={{
                          padding: '12px 14px 14px 38px', borderTop: '1px solid #F0EDE3',
                          backgroundColor: '#FCFBF6',
                        }}>
                          <ItemsTable items={s.items} />
                          <div style={{
                            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                            gap: 12, marginTop: s.items?.length ? 12 : 0,
                          }}>
                            <Detail label="Placed on" value={fmtDate(s.placedOn)} />
                            <Detail label="Order value (INR)" value={inr(s.total)}
                              sub={s.isForeign && s.origTotal != null ? `${s.currency} ${s.origTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}${s.conversionRate ? ` @ ${s.conversionRate}` : ''}` : undefined} />
                            <Detail label="Billed" value={`${Math.round(s.billed)}%`} sub={s.status} />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {data.orders.length === 0 ? (
            <Box>No outstanding orders — everything submitted has been delivered.</Box>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {data.orders.map(o => {
                const isOpen = openId === o.id
                const dl = deliveryLabel(o)
                const accent = o.overdue ? C.red : (o.ageDays != null && o.ageDays > 30 ? C.gold : C.green2)
                return (
                  <div key={o.id} style={{
                    backgroundColor: '#fff', borderRadius: 8, border: '1px solid #E8E3D2',
                    borderLeft: `3px solid ${accent}`, overflow: 'hidden',
                  }}>
                    <div
                      onClick={() => setOpenId(isOpen ? null : o.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', cursor: 'pointer' }}
                    >
                      <ChevronRight size={14} strokeWidth={2}
                        style={{ color: '#A39F94', flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#161614' }}>{o.customer}</span>
                          {o.overdue && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, color: '#fff', background: C.red,
                              padding: '1px 7px', borderRadius: 4,
                            }}>
                              OVERDUE
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 1 }}>
                          {o.id} · {o.status}
                          {o.delivered > 0 ? ` · ${Math.round(o.delivered)}% delivered` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#161614' }}>
                          {inrShort(o.total)}
                        </div>
                        {dl.text && (
                          <div style={{ fontSize: 10.5, fontWeight: 600, marginTop: 2, color: dl.color }}>
                            {dl.text}
                          </div>
                        )}
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{
                        padding: '12px 14px 14px 38px', borderTop: '1px solid #F0EDE3',
                        backgroundColor: '#FCFBF6',
                      }}>
                        <ItemsTable items={o.items} />
                        <div style={{
                          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                          gap: 12, marginTop: o.items?.length ? 12 : 0,
                        }}>
                          <Detail label="Placed on" value={fmtDate(o.placedOn)} sub={o.ageDays != null ? `open ${o.ageDays}d` : undefined} />
                          <Detail label="Expected delivery" value={fmtDate(o.deliveryDate)} sub={dl.text || undefined} subColor={dl.color} />
                          <Detail label="Order value (INR)" value={inr(o.total)}
                            sub={o.isForeign && o.origTotal != null ? `${o.currency} ${o.origTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}${o.conversionRate ? ` @ ${o.conversionRate}` : ''}` : undefined} />
                          <Detail label="Delivered" value={`${Math.round(o.delivered)}%`} sub={o.status} />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ItemsTable({ items }: { items?: LineItem[] }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#A39F94', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
        Items sold
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map((it, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12,
            alignItems: 'baseline', padding: '6px 10px',
            backgroundColor: '#fff', border: '1px solid #F0EDE3', borderRadius: 6,
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#161614', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {it.itemName}
            </span>
            <span style={{ fontSize: 11.5, color: '#6A675F', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
              {it.qty} × {inr(it.rate)}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#161614', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
              {inr(it.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RentalRow({ r }: { r: Rental }) {
  const periods = r.periods ?? 0
  const paid = r.invoicesPaid ?? null
  const schedule = paid != null
    ? `${paid}/${periods} paid`
    : `${periods} monthly invoice${periods === 1 ? '' : 's'}`
  const chip = r.upfrontStatus === 'billed'
    ? { bg: '#E7F1EA', fg: C.forest, t: 'Upfront billed' }
    : r.upfrontStatus === 'partial'
      ? { bg: '#FBF3E0', fg: '#8a6d1f', t: 'Upfront partial' }
      : { bg: '#F6E7E4', fg: C.red, t: 'Upfront unbilled' }
  return (
    <div style={{
      backgroundColor: '#fff', borderRadius: 8, border: '1px solid #E8E3D2',
      borderLeft: `3px solid ${C.gold}`, padding: '11px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#161614' }}>{r.customer}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.forest, background: '#E7F1EA', padding: '1px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>DaaS</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: chip.fg, background: chip.bg, padding: '1px 7px', borderRadius: 4 }}>{chip.t}</span>
        </div>
        <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 1 }}>
          {r.machines != null ? `${r.machines} machine${r.machines === 1 ? '' : 's'} · ` : ''}{schedule}
          {r.nextInvoiceDate ? ` · next ${fmtDate(r.nextInvoiceDate)}` : ''}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#161614' }}>
          {r.monthlyNet != null ? inr(r.monthlyNet) : '—'}
          <span style={{ fontSize: 10.5, color: '#6A675F', fontFamily: 'inherit' }}>/mo +GST</span>
        </div>
        <div style={{ fontSize: 10.5, color: '#A39F94', marginTop: 2 }}>TCV {inrShort(r.tcvNet)}</div>
      </div>
    </div>
  )
}

function MiniCard({ icon, accent, label, children }: {
  icon: React.ReactNode; accent: string; label: string; children: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 13px',
      backgroundColor: '#fff', borderRadius: 8, border: '1px solid #E8E3D2',
      borderLeft: `3px solid ${accent}`,
    }}>
      <span style={{ color: accent, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: '#6A675F', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>
          {label}
        </div>
        <div style={{ fontSize: 12.5, color: '#161614' }}>{children}</div>
      </div>
    </div>
  )
}

function Detail({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#A39F94', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#161614' }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: subColor ?? '#6A675F', marginTop: 1, fontFamily: subColor ? 'inherit' : 'monospace' }}>{sub}</div>}
    </div>
  )
}

function Tile({ icon, accent, label, value, sub }: {
  icon: React.ReactNode; accent: string; label: string; value: string; sub: string
}) {
  return (
    <div style={{
      backgroundColor: '#fff', borderRadius: 9, border: '1px solid #E8E3D2',
      borderTop: `3px solid ${accent}`, padding: '12px 13px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7,
        fontSize: 10, fontWeight: 700, color: '#6A675F', letterSpacing: '0.05em', textTransform: 'uppercase',
      }}>
        <span style={{ color: accent }}>{icon}</span>
        {label}
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#161614', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 10.5, color: '#A39F94', marginTop: 4 }}>{sub}</div>
    </div>
  )
}

function Box({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{
      padding: '20px', textAlign: 'center', fontSize: 12.5, color: color ?? '#A39F94',
      backgroundColor: '#fff', borderRadius: 8, border: '1px solid #E8E3D2',
    }}>
      {children}
    </div>
  )
}
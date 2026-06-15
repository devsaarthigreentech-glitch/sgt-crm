// // src/components/dashboard/OutstandingOrders.tsx
// // Open Sales Orders from ERPNext + average fulfilment time on delivered ones.
// import { useEffect, useState } from 'react'
// import { PackageOpen, Timer, Hourglass } from 'lucide-react'

// const API = import.meta.env.VITE_API_URL ?? '/api/v1'
// const C = { forest: '#1F4E2E', green2: '#2D7A4F', gold: '#C9A24E', red: '#C84A3A', healthy: '#3B9D6E' }

// const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
// const inrShort = (n: number) => {
//   const a = Math.abs(n)
//   if (a >= 1e7) return '₹' + (n / 1e7).toFixed(2).replace(/\.00$/, '') + 'Cr'
//   if (a >= 1e5) return '₹' + (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L'
//   return inr(n)
// }
// const fmtDate = (d: string | null) => {
//   if (!d) return '—'
//   const dt = new Date(d)
//   return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
// }

// type Order = {
//   id: string; customer: string; placedOn: string | null; deliveryDate: string | null
//   status: string; total: number; delivered: number; ageDays: number | null
//   currency?: string; isForeign?: boolean; origTotal?: number | null; conversionRate?: number | null
// }
// type Data = {
//   count: number; outstandingValue: number; orders: Order[]
//   avgFulfilmentDays: number | null; fulfilmentSamples: number
// }

// export default function OutstandingOrders() {
//   const [data, setData] = useState<Data | null>(null)
//   const [err, setErr] = useState<string | null>(null)
//   const [loading, setLoading] = useState(true)

//   useEffect(() => {
//     let ignore = false
//     fetch(`${API}/erp/orders/outstanding`)
//       .then(r => r.json())
//       .then(d => { if (ignore) return; if (d.error) setErr(d.error); else setData(d); setLoading(false) })
//       .catch(e => { if (!ignore) { setErr(String(e)); setLoading(false) } })
//     return () => { ignore = true }
//   }, [])

//   return (
//     <div>
//       <div style={{
//         display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
//         paddingBottom: 8, borderBottom: '1.5px solid #161614', marginBottom: 12,
//       }}>
//         <span style={{ fontSize: 10.5, fontWeight: 700, color: '#161614', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
//           Outstanding orders
//         </span>
//       </div>

//       {loading ? (
//         <Box>Loading orders…</Box>
//       ) : err ? (
//         <Box color={C.red}>ERPNext: {err}</Box>
//       ) : !data ? (
//         <Box>No data.</Box>
//       ) : (
//         <>
//           {/* Summary tiles */}
//           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
//             <Tile icon={<PackageOpen size={15} strokeWidth={2} />} accent={C.gold}
//               label="Open orders" value={String(data.count)} sub="not yet delivered" />
//             <Tile icon={<Hourglass size={15} strokeWidth={2} />} accent={C.green2}
//               label="Outstanding value" value={inrShort(data.outstandingValue)} sub="across open orders" />
//             <Tile icon={<Timer size={15} strokeWidth={2} />} accent={C.forest}
//               label="Avg fulfilment" value={data.avgFulfilmentDays != null ? `${data.avgFulfilmentDays}d` : '—'}
//               sub={data.fulfilmentSamples ? `from ${data.fulfilmentSamples} delivered` : 'no delivered orders'} />
//           </div>

//           {data.orders.length === 0 ? (
//             <Box>No outstanding orders — everything submitted has been delivered.</Box>
//           ) : (
//             <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
//               {data.orders.map(o => (
//                 <div key={o.id} style={{
//                   display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
//                   backgroundColor: '#fff', borderRadius: 7, border: '1px solid #E8E3D2',
//                   borderLeft: `3px solid ${o.ageDays != null && o.ageDays > 30 ? C.red : C.gold}`,
//                 }}>
//                   <div style={{ flex: 1, minWidth: 0 }}>
//                     <div style={{ fontSize: 13, fontWeight: 600, color: '#161614' }}>{o.customer}</div>
//                     <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 1 }}>
//                       {o.id} · {o.status}
//                       {o.delivered > 0 ? ` · ${Math.round(o.delivered)}% delivered` : ''}
//                       {o.placedOn ? ` · placed ${fmtDate(o.placedOn)}` : ''}
//                     </div>
//                   </div>
//                   <div style={{ textAlign: 'right', flexShrink: 0 }}>
//                     <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#161614' }}>
//                       {inrShort(o.total)}
//                     </div>
//                     {o.isForeign && o.origTotal != null && (
//                       <div style={{ fontSize: 10.5, color: '#6A675F', marginTop: 1, fontFamily: 'monospace' }}>
//                         {o.currency} {o.origTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
//                         {o.conversionRate ? ` @ ${o.conversionRate}` : ''}
//                       </div>
//                     )}
//                     {o.ageDays != null && (
//                       <div style={{
//                         fontSize: 10.5, fontWeight: 600, marginTop: 2,
//                         color: o.ageDays > 30 ? C.red : o.ageDays > 14 ? '#A86A18' : '#6A675F',
//                       }}>
//                         open {o.ageDays}d
//                       </div>
//                     )}
//                   </div>
//                 </div>
//               ))}
//             </div>
//           )}
//         </>
//       )}
//     </div>
//   )
// }

// function Tile({ icon, accent, label, value, sub }: {
//   icon: React.ReactNode; accent: string; label: string; value: string; sub: string
// }) {
//   return (
//     <div style={{
//       backgroundColor: '#fff', borderRadius: 9, border: '1px solid #E8E3D2',
//       borderTop: `3px solid ${accent}`, padding: '12px 13px',
//     }}>
//       <div style={{
//         display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7,
//         fontSize: 10, fontWeight: 700, color: '#6A675F', letterSpacing: '0.05em', textTransform: 'uppercase',
//       }}>
//         <span style={{ color: accent }}>{icon}</span>
//         {label}
//       </div>
//       <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#161614', lineHeight: 1 }}>
//         {value}
//       </div>
//       <div style={{ fontSize: 10.5, color: '#A39F94', marginTop: 4 }}>{sub}</div>
//     </div>
//   )
// }

// function Box({ children, color }: { children: React.ReactNode; color?: string }) {
//   return (
//     <div style={{
//       padding: '20px', textAlign: 'center', fontSize: 12.5, color: color ?? '#A39F94',
//       backgroundColor: '#fff', borderRadius: 8, border: '1px solid #E8E3D2',
//     }}>
//       {children}
//     </div>
//   )
// }
// src/components/dashboard/OutstandingOrders.tsx
// Single unified Orders view: open Sales Orders from ERPNext, each as one
// expandable row (placed date, expected delivery, value, currency, progress).
// Replaces the separate "Upcoming orders" block — no more seeing one order 3x.
import { useEffect, useState } from 'react'
import { PackageOpen, Timer, Hourglass, Clock, Truck, AlertTriangle, ChevronRight } from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? '/api/v1'
const C = { forest: '#1F4E2E', green2: '#2D7A4F', gold: '#C9A24E', red: '#C84A3A', healthy: '#3B9D6E', navy: '#1E3A6B' }

const inr = (n: number) => '\u20B9' + Math.round(n).toLocaleString('en-IN')
const inrShort = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1e7) return '\u20B9' + (n / 1e7).toFixed(2).replace(/\.00$/, '') + 'Cr'
  if (a >= 1e5) return '\u20B9' + (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L'
  return inr(n)
}
const fmtDate = (d: string | null) => {
  if (!d) return '\u2014'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Order = {
  id: string; customer: string; placedOn: string | null; deliveryDate: string | null
  status: string; total: number; delivered: number; ageDays: number | null
  currency?: string; isForeign?: boolean; origTotal?: number | null; conversionRate?: number | null
  overdue?: boolean; overdueDays?: number | null; daysToDelivery?: number | null
}
type Data = {
  count: number; outstandingValue: number; orders: Order[]
  avgFulfilmentDays: number | null; fulfilmentSamples: number
  overdueCount?: number; lastOrder?: Order | null; nextDelivery?: Order | null
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
        <Box>Loading orders\u2026</Box>
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
                  <b>{data.lastOrder.customer}</b> \u00B7 {inrShort(data.lastOrder.total)}
                  <div style={{ fontSize: 11, color: '#6A675F' }}>{fmtDate(data.lastOrder.placedOn)} \u00B7 {data.lastOrder.id}</div>
                </MiniCard>
              )}
              {data.nextDelivery && (
                <MiniCard icon={<Truck size={14} strokeWidth={2} />} accent={C.green2} label="Next delivery">
                  <b>{data.nextDelivery.customer}</b> \u00B7 {fmtDate(data.nextDelivery.deliveryDate)}
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
              label="Outstanding value" value={inrShort(data.outstandingValue)} sub="across open orders" />
            <Tile icon={<Timer size={15} strokeWidth={2} />} accent={C.forest}
              label="Avg fulfilment" value={data.avgFulfilmentDays != null ? `${data.avgFulfilmentDays}d` : '\u2014'}
              sub={data.fulfilmentSamples ? `from ${data.fulfilmentSamples} delivered` : 'no delivered orders'} />
          </div>

          {data.orders.length === 0 ? (
            <Box>No outstanding orders \u2014 everything submitted has been delivered.</Box>
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
                          {o.id} \u00B7 {o.status}
                          {o.delivered > 0 ? ` \u00B7 ${Math.round(o.delivered)}% delivered` : ''}
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
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12,
                      }}>
                        <Detail label="Placed on" value={fmtDate(o.placedOn)} sub={o.ageDays != null ? `open ${o.ageDays}d` : undefined} />
                        <Detail label="Expected delivery" value={fmtDate(o.deliveryDate)} sub={dl.text || undefined} subColor={dl.color} />
                        <Detail label="Order value (INR)" value={inr(o.total)}
                          sub={o.isForeign && o.origTotal != null ? `${o.currency} ${o.origTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}${o.conversionRate ? ` @ ${o.conversionRate}` : ''}` : undefined} />
                        <Detail label="Delivered" value={`${Math.round(o.delivered)}%`} sub={o.status} />
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
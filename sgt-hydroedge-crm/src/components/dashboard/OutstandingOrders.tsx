// src/components/dashboard/OutstandingOrders.tsx
// Open Sales Orders from ERPNext + average fulfilment time on delivered ones.
import { useEffect, useState } from 'react'
import { PackageOpen, Timer, Hourglass } from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? '/api/v1'
const C = { forest: '#1F4E2E', green2: '#2D7A4F', gold: '#C9A24E', red: '#C84A3A', healthy: '#3B9D6E' }

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
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

type Order = {
  id: string; customer: string; placedOn: string | null; deliveryDate: string | null
  status: string; total: number; delivered: number; ageDays: number | null
}
type Data = {
  count: number; outstandingValue: number; orders: Order[]
  avgFulfilmentDays: number | null; fulfilmentSamples: number
}

export default function OutstandingOrders() {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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
          Outstanding orders
        </span>
      </div>

      {loading ? (
        <Box>Loading orders…</Box>
      ) : err ? (
        <Box color={C.red}>ERPNext: {err}</Box>
      ) : !data ? (
        <Box>No data.</Box>
      ) : (
        <>
          {/* Summary tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
            <Tile icon={<PackageOpen size={15} strokeWidth={2} />} accent={C.gold}
              label="Open orders" value={String(data.count)} sub="not yet delivered" />
            <Tile icon={<Hourglass size={15} strokeWidth={2} />} accent={C.green2}
              label="Outstanding value" value={inrShort(data.outstandingValue)} sub="across open orders" />
            <Tile icon={<Timer size={15} strokeWidth={2} />} accent={C.forest}
              label="Avg fulfilment" value={data.avgFulfilmentDays != null ? `${data.avgFulfilmentDays}d` : '—'}
              sub={data.fulfilmentSamples ? `from ${data.fulfilmentSamples} delivered` : 'no delivered orders'} />
          </div>

          {data.orders.length === 0 ? (
            <Box>No outstanding orders — everything submitted has been delivered.</Box>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {data.orders.map(o => (
                <div key={o.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
                  backgroundColor: '#fff', borderRadius: 7, border: '1px solid #E8E3D2',
                  borderLeft: `3px solid ${o.ageDays != null && o.ageDays > 30 ? C.red : C.gold}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#161614' }}>{o.customer}</div>
                    <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 1 }}>
                      {o.id} · {o.status}
                      {o.delivered > 0 ? ` · ${Math.round(o.delivered)}% delivered` : ''}
                      {o.placedOn ? ` · placed ${fmtDate(o.placedOn)}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#161614' }}>
                      {inrShort(o.total)}
                    </div>
                    {o.ageDays != null && (
                      <div style={{
                        fontSize: 10.5, fontWeight: 600, marginTop: 2,
                        color: o.ageDays > 30 ? C.red : o.ageDays > 14 ? '#A86A18' : '#6A675F',
                      }}>
                        open {o.ageDays}d
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
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
// Distributor portal — the whole app, for an external partner login.
//
// This is a SEPARATE SHELL, not a page inside the CRM. App.tsx branches to
// it before the director layout is constructed, so the sidebar, pipeline,
// vault and dashboards are never mounted for this user at all.
//
// That is a UI convenience, not the security boundary. The real boundary
// is server-side: src/auth/policy.ts denies an external role everything
// outside /api/v1/portal. If this component were bypassed entirely, a
// distributor token would still reach nothing.

import { useEffect, useState } from 'react'
import { LogOut, Users, MapPin, RefreshCw, LayoutDashboard, Handshake, FileText, FileSignature } from 'lucide-react'
import { portalApi, type PortalMe, type PortalDealer } from './portalApi'
import DealerRegistration from './DealerRegistration'
import DealerEdit from './DealerEdit'
import QuoteScreen from '../quotes/QuoteScreen'
import { portalQuoteApi } from '../quotes/quotesApi'
import AgreementScreen from '../agreements/AgreementScreen'
import { portalAgreementApi } from '../agreements/agreementsApi'

type PortalPage = 'overview' | 'dealers' | 'quotes' | 'agreements'

// Nav for the partner shell. Kept flat and short on purpose: a distributor
// has a handful of jobs, not a CRM. Quotations and Leads slot in here as
// they land, rather than becoming a second side panel to maintain.
// Only a distributor appoints dealers. A dealer login gets the same shell
// without that tab — the server refuses dealer registration from a
// non-distributor anyway, so this just stops offering a dead end.
const PORTAL_NAV: { id: PortalPage; label: string; icon: typeof Users; distributorOnly?: boolean }[] = [
  { id: 'overview', label: 'My view', icon: LayoutDashboard },
  { id: 'dealers', label: 'My dealers', icon: Handshake, distributorOnly: true },
  { id: 'quotes', label: 'Quotations', icon: FileText },
  // Only a distributor appoints, so only a distributor raises the
  // appointment. A dealer login reaching /portal/agreements would see its
  // own agreement and nothing else anyway — visible_org_ids walks
  // downwards — but offering the tab would imply it can appoint someone.
  { id: 'agreements', label: 'Agreements', icon: FileSignature, distributorOnly: true },
]

const PAPER = '#ECE8DA'
const INK = '#161614'
const MUTED = '#6A675F'
const LINE = '#DDD7C6'
const FAINT = '#A39F94'
const DANGER = '#A6301C'

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map(p => p[0].toUpperCase()).join('') || '?'
}

export default function DistributorPortal({ onLogout }: { onLogout: () => void }) {
  const [me, setMe] = useState<PortalMe | null>(null)
  const [dealers, setDealers] = useState<PortalDealer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState<PortalPage>('overview')
  const [editDealerId, setEditDealerId] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    Promise.all([portalApi.me(), portalApi.dealers()])
      .then(([m, d]) => { setMe(m); setDealers(d); setError(null) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  if (loading && !me) {
    return (
      <div style={{ height: '100vh', backgroundColor: PAPER, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED }}>
        Loading…
      </div>
    )
  }

  if (error && !me) {
    return (
      <div style={{ height: '100vh', backgroundColor: PAPER, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
        <div style={{ padding: '12px 16px', borderRadius: 8, backgroundColor: '#F3DAD5', color: DANGER, fontSize: 13, maxWidth: 420, textAlign: 'center' }}>
          {error}
        </div>
        <button onClick={onLogout} style={{ padding: '9px 16px', fontSize: 13, fontFamily: 'inherit', border: `1px solid ${LINE}`, borderRadius: 7, background: '#fff', cursor: 'pointer', color: MUTED }}>
          Sign out
        </button>
      </div>
    )
  }

  const org = me!.org
  const activeDealers = dealers.filter(d => d.is_active)

  return (
    <div style={{ height: '100vh', backgroundColor: PAPER, overflowY: 'auto' }}>
      {/* Header */}
      <div style={{
        borderBottom: `1px solid ${LINE}`, padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: 12, backgroundColor: PAPER,
        position: 'sticky', top: 0, zIndex: 2,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, backgroundColor: '#1F4E3D', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, flexShrink: 0,
        }}>
          {initials(org.trade_name || org.legal_name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {org.trade_name || org.legal_name}
          </div>
          <div style={{ fontSize: 11, color: MUTED }}>
            {org.org_type === 'distributor' ? 'Distributor' : org.org_type} · {org.code}
          </div>
        </div>
        <button onClick={load} title="Refresh"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: FAINT, padding: 6, display: 'flex' }}>
          <RefreshCw size={16} />
        </button>
        <button onClick={onLogout} title="Sign out"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: FAINT, padding: 6, display: 'flex' }}>
          <LogOut size={16} />
        </button>
      </div>

      {/* Nav */}
      <div style={{
        display: 'flex', gap: 2, padding: '0 20px', borderBottom: `1px solid ${LINE}`,
        backgroundColor: PAPER, position: 'sticky', top: 62, zIndex: 1,
      }}>
        {PORTAL_NAV.filter(n => !n.distributorOnly || org.org_type === 'distributor').map(n => {
          const Icon = n.icon
          const on = page === n.id
          return (
            <button key={n.id} onClick={() => setPage(n.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
              background: 'none', border: 'none', marginBottom: -1,
              fontWeight: on ? 700 : 500, color: on ? INK : MUTED,
              borderBottom: `2px solid ${on ? INK : 'transparent'}`,
            }}>
              <Icon size={15} /> {n.label}
            </button>
          )
        })}
      </div>

      {editDealerId !== null ? (
        <DealerEdit dealerId={editDealerId} onBack={() => { setEditDealerId(null); load() }} />
      ) : page === 'quotes' ? <QuoteScreen api={portalQuoteApi} />
      : page === 'agreements' ? (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '70vh' }}>
          <AgreementScreen api={portalAgreementApi} />
        </div>
      )
      : page === 'dealers' ? <DealerRegistration /> : (
      <div style={{ padding: '20px 20px 60px', maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: INK }}>My view</h1>
        <p style={{ margin: '0 0 18px', fontSize: 12.5, color: MUTED }}>
          {me!.user.name ? `${me!.user.name} · ` : ''}{org.legal_name}
        </p>

        {error && (
          <div style={{ padding: '10px 12px', marginBottom: 14, borderRadius: 8, backgroundColor: '#F3DAD5', color: DANGER, fontSize: 12.5 }}>
            {error}
          </div>
        )}

        {/* Summary */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            ...(org.org_type === 'distributor'
              ? [{ label: 'Dealers', value: activeDealers.filter(d => d.org_type === 'dealer').length, icon: Users }]
              : []),
            { label: 'Referrals', value: activeDealers.filter(d => d.org_type === 'sub_dealer').length, icon: Users },
            { label: 'Territory', value: org.territory ?? '—', icon: MapPin, wide: true },
          ].map(s => (
            <div key={s.label} style={{
              flex: s.wide ? '2 1 200px' : '1 1 110px',
              backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: '12px 14px',
            }}>
              <div style={{ fontSize: 10.5, color: FAINT, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>
                {s.label}
              </div>
              <div style={{ fontSize: s.wide ? 13 : 22, fontWeight: s.wide ? 500 : 700, color: INK, lineHeight: 1.25 }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Dealers */}
        <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: INK }}>
          {org.org_type === 'distributor' ? 'Dealers I manage' : 'Referrals'}
        </h2>

        {dealers.length === 0 ? (
          <div style={{
            backgroundColor: '#fff', border: `1px dashed ${LINE}`, borderRadius: 10,
            padding: '26px 18px', textAlign: 'center',
          }}>
            <p style={{ margin: 0, fontSize: 13, color: MUTED }}>
              {org.org_type === 'distributor' ? 'No dealers yet.' : 'No referrals yet.'}
            </p>
            <p style={{ margin: '5px 0 0', fontSize: 11.5, color: FAINT }}>
              {org.org_type === 'distributor'
                ? 'Dealers appear here once SGT approves their registration and allots a code.'
                : 'Referrals are issued by SGT. They appear here once SGT sets one up — they cannot be added from this portal.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dealers.map(d => (
              <button key={d.id} onClick={() => setEditDealerId(d.id)} style={{
                backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 10,
                padding: '12px 14px', opacity: d.is_active ? 1 : 0.55,
                marginLeft: d.org_type === 'sub_dealer' ? 18 : 0,
                textAlign: 'left', width: '100%', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>
                      {d.trade_name || d.legal_name}
                    </div>
                    <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                      {d.org_type === 'dealer'
                        ? `Dealer${d.dealer_type === 'SS' ? ' · Sales & Service' : d.dealer_type === 'SM' ? ' · Sales & Marketing' : ''}`
                        : `Referral${d.parent_code ? ` · under ${d.parent_code}` : ''}`}
                      {d.territory ? ` · ${d.territory}` : ''}
                      {!d.is_active ? ' · inactive' : ''}
                    </div>
                  </div>
                  <span style={{
                    fontFamily: 'ui-monospace, monospace', fontSize: 11.5, fontWeight: 700,
                    padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap',
                    backgroundColor: '#EFEADC', color: INK,
                  }}>
                    {d.code}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        <p style={{ fontSize: 11, color: FAINT, textAlign: 'center', marginTop: 24 }}>
          SGT HydroEdge partner portal
        </p>
      </div>
      )}
    </div>
  )
}

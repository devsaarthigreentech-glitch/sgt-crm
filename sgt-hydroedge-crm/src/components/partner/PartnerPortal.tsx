// Partner Portal shell. Renders only the tabs the partner's archetype permits.
// Mount this where your existing partial portal lives (e.g. routed from Sidebar).
import { useState } from 'react'
import { partnerApi, useResource } from './partnerApi'
import { tabsForPartner, TAB_LABELS, ARCHETYPE_LABELS, type TabKey } from './permissions'
import {
  MyLeads, RegisterLead, MyCustomers, Scorecard,
  Statements, DocumentHub, Training, ServiceTickets,
} from './screens'
import { t } from '../../lib/tokens'

export default function PartnerPortal({ onExit }: { onExit?: () => void } = {}) {
  const { data: me, loading, error } = useResource(() => partnerApi.me())
  const [tab, setTab] = useState<TabKey>('leads')
  const [reloadKey, setReloadKey] = useState(0)

  if (loading) return <Center>Loading portal…</Center>
  if (error || !me) return <Center>{error ?? 'Could not load partner session'}</Center>

  const tabs = tabsForPartner(me)
  const active = tabs.includes(tab) ? tab : tabs[0]

  return (
    <div style={{ backgroundColor: t.ground, minHeight: '100vh' }}>
      {/* identity bar */}
      <div style={{
        backgroundColor: t.green, color: '#fff', padding: '16px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
      }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{me.name}</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {ARCHETYPE_LABELS[me.archetype] ?? me.archetype} · {me.portal === 'full' ? 'Full portal' : 'Channel portal'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.18)',
          }}>{me.id}</span>
          {onExit && (
            <button onClick={onExit} style={{
              fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.4)', backgroundColor: 'transparent',
              color: '#fff', cursor: 'pointer',
            }}>Exit</button>
          )}
        </div>
      </div>

      {/* tabs */}
      <div style={{
        display: 'flex', gap: 4, padding: '8px 12px', overflowX: 'auto',
        borderBottom: `1px solid ${t.border}`, backgroundColor: t.surface,
      }}>
        {tabs.map(k => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '8px 12px', borderRadius: 8, border: 'none', whiteSpace: 'nowrap',
            backgroundColor: active === k ? t.green : 'transparent',
            color: active === k ? '#fff' : t.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>{TAB_LABELS[k]}</button>
        ))}
      </div>

      {/* body */}
      <div style={{ padding: 20 }} key={`${active}-${reloadKey}`}>
        {active === 'leads' && <MyLeads />}
        {active === 'register' && <RegisterLead onDone={() => { setReloadKey(k => k + 1); setTab('leads') }} />}
        {active === 'customers' && <MyCustomers />}
        {active === 'scorecard' && <Scorecard />}
        {active === 'statements' && <Statements />}
        {active === 'documents' && <DocumentHub />}
        {active === 'training' && <Training />}
        {active === 'tickets' && <ServiceTickets />}
      </div>
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 40, textAlign: 'center', color: t.muted, fontSize: 14 }}>{children}</div>
}
import { useState } from 'react'
import type { Lead } from '../../types'
import KanbanBoard from './KanbanBoard'
import ClosedDeals from './ClosedDeals'

interface Props {
  leads: Lead[]
  onLeadClick: (lead: Lead) => void
  onMoved?: () => void
}

type Tab = 'active' | 'won' | 'lost'

export default function PipelineTabs({ leads, onLeadClick, onMoved }: Props) {
  const [tab, setTab] = useState<Tab>('active')

  const activeCount = leads.filter(l => !['Closed Won', 'Closed Lost'].includes(l.stage)).length
  const wonCount    = leads.filter(l => l.stage === 'Closed Won').length
  const lostCount   = leads.filter(l => l.stage === 'Closed Lost').length

  const tabs: { id: Tab; label: string; count: number; color: string }[] = [
    { id: 'active', label: 'Active',      count: activeCount, color: '#0E5550' },
    { id: 'won',    label: 'Closed won',  count: wonCount,    color: '#3D6B1C' },
    { id: 'lost',   label: 'Closed lost', count: lostCount,   color: '#A02B1F' },
  ]

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, padding: '0 24px 12px', flexShrink: 0 }}>
        {tabs.map(t => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                border: active ? `1.5px solid ${t.color}` : '1px solid #DDD7C6',
                background: active ? '#fff' : 'transparent',
                color: active ? '#161614' : '#6A675F',
                fontSize: 13, fontWeight: active ? 700 : 500,
              }}
            >
              {t.label}
              <span style={{
                fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                color: active ? '#fff' : t.color,
                background: active ? t.color : (t.color + '22'),
                borderRadius: 10, padding: '0 7px', minWidth: 18, textAlign: 'center',
              }}>
                {t.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Body */}
      {tab === 'active' ? (
        <KanbanBoard leads={leads} onLeadClick={onLeadClick} onMoved={onMoved} />
      ) : (
        <ClosedDeals leads={leads} outcome={tab === 'won' ? 'WON' : 'LOST'} onLeadClick={onLeadClick} />
      )}
    </div>
  )
}
import { Shield, Clock, AlertTriangle } from 'lucide-react'
import type { Lead } from '../../types'
import { formatINR, getVerticalColor } from '../../lib/utils'

interface Props {
  lead: Lead
  onClick: () => void
}

export default function LeadCard({ lead, onClick }: Props) {
  const accentColor = getVerticalColor(lead.vertical)

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: '#fff',
        border: '1px solid #DDD7C6',
        borderRadius: 7,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        transition: 'box-shadow 120ms ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(22,22,20,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* Vertical colour edge */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 4, backgroundColor: accentColor,
      }} />

      <div style={{ padding: '11px 12px 10px 16px' }}>
        {/* Company + ID */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#161614', lineHeight: 1.3 }}>
            {lead.company}
          </div>
          <div style={{ fontSize: 10.5, color: '#A39F94', marginTop: 2, fontFamily: 'monospace' }}>
          {(lead as any).displayId ?? lead.id}
          </div>
        </div>

        {/* Chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          <Chip color={accentColor} bg={accentColor + '22'}>{lead.vertical}</Chip>
          <Chip color="#363633" bg="#F4F0E5">{lead.model}</Chip>
        </div>

        {/* Value + badges */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#161614', fontFamily: 'monospace' }}>
              {formatINR(lead.value)}
            </div>
            <div style={{ fontSize: 10.5, color: '#6A675F', marginTop: 2 }}>
              {lead.daysInStage}d in stage
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            {lead.protection && lead.protection.daysLeft >= 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10.5, fontWeight: 600, padding: '2.5px 6px', borderRadius: 4,
                backgroundColor: lead.protection.daysLeft <= 14 ? '#F3E2BE' : '#D8E8E6',
                color: lead.protection.daysLeft <= 14 ? '#7A4A0E' : '#052927',
              }}>
                <Shield size={10} strokeWidth={2} />
                {lead.protection.daysLeft}d
              </span>
            )}
            {lead.protection && lead.protection.daysLeft < 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10.5, fontWeight: 600, padding: '2.5px 6px', borderRadius: 4,
                backgroundColor: '#E8E3D2', color: '#A39F94',
              }}>
                <Shield size={10} strokeWidth={2} />
                Expired
              </span>
            )}
            {lead.slaState === 'risk' && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10.5, fontWeight: 600, padding: '2.5px 6px', borderRadius: 4,
                backgroundColor: '#F3E2BE', color: '#7A4A0E',
              }}>
                <Clock size={10} strokeWidth={2} />
                SLA risk
              </span>
            )}
            {lead.slaState === 'breach' && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10.5, fontWeight: 600, padding: '2.5px 6px', borderRadius: 4,
                backgroundColor: '#F0D5D0', color: '#751A11',
              }}>
                <AlertTriangle size={10} strokeWidth={2} />
                SLA breach
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Chip({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, padding: '2.5px 7px', borderRadius: 4,
      color, backgroundColor: bg, display: 'inline-block', lineHeight: 1.4,
    }}>
      {children}
    </span>
  )
}
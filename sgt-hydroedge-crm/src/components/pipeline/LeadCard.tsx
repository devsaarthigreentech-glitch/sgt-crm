import { Shield, Clock, AlertTriangle, Trophy, XCircle, PauseCircle, Activity } from 'lucide-react'
import type { Lead } from '../../types'
import { formatINR, getVerticalColor } from '../../lib/utils'
import { dealVelocity, isTerminal } from '../../lib/pipeline'

interface Props {
  lead: Lead
  onClick: () => void
}

export default function LeadCard({ lead, onClick }: Props) {
  const accentColor = getVerticalColor(lead.vertical ?? '')
  const onHold = (lead as any).onHold === true
  const closed = isTerminal(lead.stage)
  const won = lead.stage === 'Closed Won'
  const vel = !onHold && !closed ? dealVelocity(lead.stage, lead.daysInStage) : null

  // On-hold cards recede into the paper background; otherwise plain white.
  const cardBg = onHold ? '#ECE8DA' : '#fff'
  const cardBorder = onHold ? '#DAD3BF' : '#DDD7C6'

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: cardBg,
        border: `1px solid ${cardBorder}`,
        borderRadius: 7,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        opacity: onHold ? 0.85 : 1,
        transition: 'box-shadow 120ms ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(22,22,20,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* Left colour edge — greyed when on hold */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 4, backgroundColor: onHold ? '#B8B19C' : accentColor,
      }} />

      <div style={{ padding: '11px 12px 10px 16px' }}>
        {/* Company + ID */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: onHold ? '#6A675F' : '#161614', lineHeight: 1.3 }}>
              {lead.company}
            </span>
            {onHold && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 9.5, fontWeight: 700, padding: '1.5px 6px', borderRadius: 4,
                backgroundColor: '#DAD3BF', color: '#6A675F', textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                <PauseCircle size={9} strokeWidth={2.5} />
                On hold
              </span>
            )}
            {closed && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 9.5, fontWeight: 700, padding: '1.5px 6px', borderRadius: 4,
                backgroundColor: won ? '#DDE9C9' : '#F0D5D0',
                color: won ? '#3D6B1C' : '#751A11',
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                {won ? <Trophy size={9} strokeWidth={2.5} /> : <XCircle size={9} strokeWidth={2.5} />}
                {won ? 'Won' : 'Lost'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10.5, color: '#A39F94', marginTop: 2, fontFamily: 'monospace' }}>
            {(lead as any).displayId ?? lead.id}
          </div>
        </div>

        {/* Chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          {lead.vertical && <Chip color={accentColor} bg={accentColor + '22'}>{lead.vertical}</Chip>}
          {lead.model && <Chip color="#363633" bg="#F4F0E5">{lead.model}</Chip>}
        </div>

        {/* Value + badges */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: onHold ? '#6A675F' : '#161614', fontFamily: 'monospace' }}>
              {formatINR(lead.value)}
            </div>
            <div style={{ fontSize: 10.5, color: '#6A675F', marginTop: 2 }}>
              {lead.daysInStage}d in stage
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            {/* Velocity — only for active, not-on-hold cards */}
            {vel && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10.5, fontWeight: 600, padding: '2.5px 6px', borderRadius: 4,
                backgroundColor: vel.color + '1E', color: vel.color,
              }}
                title={vel.daysOverdue > 0 ? `${vel.daysOverdue}d past the expected time in ${lead.stage}` : `Healthy pace for ${lead.stage}`}
              >
                <Activity size={10} strokeWidth={2} />
                {vel.label}{vel.daysOverdue > 0 ? ` +${vel.daysOverdue}d` : ''}
              </span>
            )}

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
            {/* SLA badges suppressed while on hold (the clock is paused conceptually) */}
            {!onHold && lead.slaState === 'risk' && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10.5, fontWeight: 600, padding: '2.5px 6px', borderRadius: 4,
                backgroundColor: '#F3E2BE', color: '#7A4A0E',
              }}>
                <Clock size={10} strokeWidth={2} />
                SLA risk
              </span>
            )}
            {!onHold && lead.slaState === 'breach' && (
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
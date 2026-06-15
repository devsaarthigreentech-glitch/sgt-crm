import { useMemo } from 'react'
import type { Lead } from '../../types'
import { formatINR } from '../../lib/utils'
import { Trophy, XCircle } from 'lucide-react'

interface Props {
  leads: Lead[]
  outcome: 'WON' | 'LOST'
  onLeadClick: (lead: Lead) => void
}

const fmtDate = (d?: string | null) => {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ClosedDeals({ leads, outcome, onLeadClick }: Props) {
  const isWon = outcome === 'WON'
  const targetStage = isWon ? 'Closed Won' : 'Closed Lost'

  const closed = useMemo(
    () => leads
      .filter(l => l.stage === targetStage)
      .sort((a, b) => ((a.closedAt ?? a.updatedAt ?? '') < (b.closedAt ?? b.updatedAt ?? '') ? 1 : -1)),
    [leads, targetStage]
  )

  const totalValue = closed.reduce((s, l) => s + (l.value || 0), 0)
  const accent = isWon ? '#3D6B1C' : '#A02B1F'
  const tint = isWon ? '#DDE9C9' : '#F0D5D0'

  // For lost deals, group counts by reason
  const reasonCounts = useMemo(() => {
    if (isWon) return []
    const m: Record<string, number> = {}
    for (const l of closed) {
      const r = l.closeReason || 'Unspecified'
      m[r] = (m[r] || 0) + 1
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [closed, isWon])

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 24px 40px' }}>
      {/* Summary */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{
          background: '#fff', border: '1px solid #E8E3D2', borderTop: `3px solid ${accent}`,
          borderRadius: 9, padding: '12px 16px', minWidth: 150,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, color: '#6A675F', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
            {isWon ? <Trophy size={13} strokeWidth={2.25} style={{ color: accent }} /> : <XCircle size={13} strokeWidth={2.25} style={{ color: accent }} />}
            {isWon ? 'Deals won' : 'Deals lost'}
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: accent, lineHeight: 1 }}>{closed.length}</div>
        </div>
        <div style={{
          background: '#fff', border: '1px solid #E8E3D2', borderTop: '3px solid #1F4E2E',
          borderRadius: 9, padding: '12px 16px', minWidth: 150,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6A675F', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
            {isWon ? 'Won value' : 'Lost value'}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: '#161614', lineHeight: 1 }}>
            {formatINR(totalValue)}
          </div>
        </div>
      </div>

      {/* Lost-reason breakdown */}
      {!isWon && reasonCounts.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6A675F', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Why deals were lost
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {reasonCounts.map(([reason, count]) => (
              <span key={reason} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#fff', border: '1px solid #E8E3D2', borderRadius: 20,
                padding: '5px 12px', fontSize: 12, color: '#363633',
              }}>
                {reason}
                <span style={{ fontWeight: 700, color: '#A02B1F', background: tint, borderRadius: 10, padding: '0 7px', fontSize: 11 }}>{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      {closed.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#A39F94' }}>
          No {isWon ? 'won' : 'lost'} deals yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {closed.map(lead => (
            <div
              key={lead.id}
              onClick={() => onLeadClick(lead)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                background: '#fff', border: '1px solid #E8E3D2', borderLeft: `3px solid ${accent}`,
                borderRadius: 8, cursor: 'pointer',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: '#161614' }}>{lead.company}</span>
                  {lead.vertical && (
                    <span style={{ fontSize: 10.5, color: '#6A675F', background: '#EDE7D8', borderRadius: 4, padding: '1px 7px' }}>
                      {lead.vertical}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 2 }}>
                  {lead.displayId ?? lead.id.slice(0, 8)}
                  {lead.owner ? ` · ${lead.owner}` : ''}
                  {' · closed '}{fmtDate(lead.closedAt)}
                  {!isWon && lead.closeReason ? ` · ${lead.closeReason}` : ''}
                  {!isWon && lead.competitorName ? ` (${lead.competitorName})` : ''}
                </div>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#161614', flexShrink: 0 }}>
                {formatINR(lead.value)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
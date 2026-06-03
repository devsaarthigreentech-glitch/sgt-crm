import { t } from '../../lib/tokens'

type SlaState = 'ok' | 'at_risk' | 'breached'

export default function SLABadge({ state, days }: { state?: SlaState; days?: number }) {
  if (!state || state === 'ok') {
    if (days == null) return null
    return <Pill bg={t.okBg} fg={t.green} text={`${days}d in stage`} />
  }
  if (state === 'at_risk') return <Pill bg={t.amberBg} fg={t.amber} text={`SLA at risk${days != null ? ` · ${days}d` : ''}`} />
  return <Pill bg={t.redBg} fg={t.lost} text={`SLA breached${days != null ? ` · ${days}d` : ''}`} />
}

function Pill({ bg, fg, text }: { bg: string; fg: string; text: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      backgroundColor: bg, color: fg, fontSize: 11, fontWeight: 600,
      padding: '3px 8px', borderRadius: 999, lineHeight: 1.4, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: fg }} />
      {text}
    </span>
  )
}
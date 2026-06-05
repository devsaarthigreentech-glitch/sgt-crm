import { useState, useEffect } from 'react'
import { ArrowLeft, MapPin, Lock, Shield, Mail, Plus, Phone } from 'lucide-react'
import type { Lead, Activity } from '../../types'
import { formatINR, getVerticalColor } from '../../lib/utils'
import { api } from '../../lib/api'
import BottomDrawer from './BottomDrawer'
import { useIsMobile } from '../../hooks/useIsMobile'

interface Props {
  lead: Lead
  onBack: () => void
}

export default function LeadDetail({ lead, onBack }: Props) {
  const isMobile = useIsMobile()
  const accentColor = getVerticalColor(lead.vertical ?? '')
  const [showDrawer, setShowDrawer] = useState(false)
  const [localActivities, setLocalActivities] = useState<Activity[]>([])
  const [apiActivities, setApiActivities] = useState<Activity[]>([])

  useEffect(() => {
    api.getActivities(lead.id).then(res => {
      setApiActivities(res.data.map((a: any) => ({
        type: a.type,
        who: a.who,
        when: new Date(a.when).toLocaleDateString('en-IN'),
        summary: a.summary,
        channel: a.channel ?? a.type,
        outcome: a.outcome,
        nextStep: a.nextStep,
      })))
    }).catch(() => { })
  }, [lead.id])

  const allActivities = [...localActivities, ...apiActivities]

  // Mobile action bar height — used to push content up
  const MOBILE_ACTION_BAR = 130 // action buttons + bottom nav

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Back bar */}
      <div style={{
        padding: isMobile ? '12px 16px' : '12px 24px',
        borderBottom: '1px solid #E8E3D2',
        backgroundColor: '#F4F0E5', flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: '#6A675F', fontWeight: 500, padding: 0,
          }}
        >
          <ArrowLeft size={13} strokeWidth={2} />
          Back to pipeline
        </button>
      </div>

      {/* Hero */}
      <div style={{
        padding: isMobile ? '14px 16px 12px' : '20px 24px 18px',
        borderBottom: '1px solid #DDD7C6',
        backgroundColor: '#F4F0E5',
        position: 'relative', flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: 4, backgroundColor: accentColor,
        }} />

        <div style={{
          display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* ID + anchor */}
            <div style={{
              display: 'flex', alignItems: 'center',
              gap: 8, marginBottom: 6, flexWrap: 'wrap',
            }}>
              <span style={{
                fontFamily: 'monospace', fontSize: 11, color: '#6A675F',
                fontWeight: 600, padding: '2px 7px',
                backgroundColor: '#EDE7D8', borderRadius: 3,
              }}>
                {(lead as any).displayId ?? lead.id}
              </span>
              {lead.reservedAccount && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11.5, fontWeight: 600,
                  color: '#052927', backgroundColor: '#D8E8E6',
                  padding: '2.5px 8px', borderRadius: 4,
                }}>
                  <Lock size={10} strokeWidth={2.25} />
                  Anchor
                </span>
              )}
            </div>

            {/* Company name */}
            <h1 style={{
              fontSize: isMobile ? 19 : 26, fontWeight: 600, color: '#161614',
              letterSpacing: '-0.03em', margin: 0, lineHeight: 1.1,
            }}>
              {lead.company}
            </h1>

            {/* Location + contact */}
            <div style={{
              marginTop: 6, fontSize: 12, color: '#6A675F',
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
              {lead.location && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MapPin size={11} strokeWidth={2} />
                  {lead.location}
                </span>
              )}
              {lead.contact && (
                <>
                  <span style={{ color: '#DDD7C6' }}>·</span>
                  <span>
                    <strong style={{ color: '#363633' }}>{lead.contact.name}</strong>
                    {lead.contact.role ? ` · ${lead.contact.role}` : ''}
                  </span>
                </>
              )}
            </div>

            {/* Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
              {lead.vertical && <Chip color="#fff" bg={accentColor}>{lead.vertical}</Chip>}
              {lead.model && <Chip color="#363633" bg="#fff" border>{lead.model}</Chip>}
              {lead.origin && <Chip color="#363633" bg="#fff" border>{lead.origin}</Chip>}
              {(lead as any).leadType && (lead as any).leadType !== 'Prospect' && (
                <Chip color="#363633" bg="#EDE7D8">{(lead as any).leadType}</Chip>
              )}
              {lead.protection && lead.protection.daysLeft >= 0 && (
                <Chip
                  color={lead.protection.daysLeft <= 14 ? '#7A4A0E' : '#052927'}
                  bg={lead.protection.daysLeft <= 14 ? '#F3E2BE' : '#D8E8E6'}
                >
                  <Shield size={10} strokeWidth={2} style={{ display: 'inline', marginRight: 2 }} />
                  {lead.protection.daysLeft}d protection
                </Chip>
              )}
            </div>
          </div>

          {/* Desktop actions */}
          {!isMobile && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => setShowDrawer(true)}
                style={{
                  padding: '8px 14px', backgroundColor: '#fff', color: '#161614',
                  border: '1px solid #DDD7C6', borderRadius: 6,
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <Plus size={13} strokeWidth={2.5} />
                Log activity
              </button>
              <button style={{
                padding: '8px 14px', backgroundColor: '#C45A1E', color: '#fff',
                border: 'none', borderRadius: 6,
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              }}>
                Advance stage →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: isMobile ? `16px 16px ${MOBILE_ACTION_BAR}px` : '24px',
        backgroundColor: '#F4F0E5',
      }}>
        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <FactsRail lead={lead} />
            <ActivitySection activities={allActivities} />
          </div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 300px',
            gap: 32, maxWidth: 1000,
          }}>
            <ActivitySection activities={allActivities} />
            <FactsRail lead={lead} />
          </div>
        )}
      </div>

      {/* Mobile bottom action bar — sits above bottom nav */}
      {isMobile && !showDrawer && (
        <div style={{
          position: 'fixed', bottom: 57, left: 0, right: 0,
          backgroundColor: '#fff',
          borderTop: '1px solid #DDD7C6',
          padding: '10px 16px 10px',
          display: 'flex', gap: 8,
          zIndex: 35,
        }}>
          <button
            onClick={() => setShowDrawer(true)}
            style={{
              flex: 1, padding: '11px 0',
              backgroundColor: '#fff', color: '#161614',
              border: '1px solid #DDD7C6', borderRadius: 7,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 6,
            }}
          >
            <Plus size={14} strokeWidth={2.5} />
            Log activity
          </button>
          <button style={{
            flex: 1, padding: '11px 0',
            backgroundColor: '#C45A1E', color: '#fff',
            border: 'none', borderRadius: 7,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            Advance stage →
          </button>
        </div>
      )}

      {/* Bottom drawer */}
      {showDrawer && (
        <BottomDrawer
          lead={lead}
          onClose={() => setShowDrawer(false)}
          onSubmit={async (activity) => {
            try {
              await api.logActivity(lead.id, {
                ...activity,
                actorName: 'Rohan Mehta',
              })
              setLocalActivities(prev => [{
                ...activity,
                who: 'Rohan Mehta',
                when: 'just now',
              }, ...prev])
            } catch (err) {
              console.error('Failed to log activity', err)
            }
          }}
        />
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FactsRail({ lead }: { lead: Lead }) {
  return (
    <div>
      <SectionHeader title="Facts" />
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Fact label="Stage" value={lead.stage} />
        <Fact label="Lead type" value={(lead as any).leadType ?? 'Prospect'} />
        <Fact label="Owner" value={lead.owner ?? 'Unassigned'} />
        <Fact label="Value" value={formatINR(lead.value)} mono />
        <Fact label="Est. close" value={lead.estClose ?? '—'} mono />
        <Fact label="Days in stage" value={`${lead.daysInStage}d`} />
      </div>

      {lead.contact && (
        <div style={{ marginTop: 24 }}>
          <SectionHeader title="Primary contact" />
          <div style={{
            marginTop: 12, padding: '12px 14px',
            backgroundColor: '#fff',
            border: '1px solid #DDD7C6', borderRadius: 8,
          }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{lead.contact.name}</div>
            <div style={{ fontSize: 12, color: '#6A675F', marginTop: 2 }}>{lead.contact.role}</div>
            {lead.contact.email && (
              <div style={{ marginTop: 8 }}>
                <span style={{
                  fontSize: 11.5, color: '#0E5550',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <Mail size={11} strokeWidth={2} />
                  {lead.contact.email}
                </span>
              </div>
            )}
            {(lead.contact as any).phone && (
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 11.5, color: '#0E5550', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Phone size={11} strokeWidth={2} />
                  {(lead.contact as any).phone}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ActivitySection({ activities }: { activities: Activity[] }) {
  return (
    <div>
      <SectionHeader title="Activity" meta={`${activities.length} entries`} />
      <div style={{ marginTop: 14 }}>
        {activities.length === 0 ? (
          <p style={{ fontSize: 13, color: '#A39F94' }}>No activity yet.</p>
        ) : (
          activities.map((a, i) => (
            <ActivityRow key={i} activity={a} isLast={i === activities.length - 1} />
          ))
        )}
      </div>
    </div>
  )
}

function Chip({ children, color, bg, border }: {
  children: React.ReactNode
  color: string
  bg: string
  border?: boolean
}) {
  return (
    <span style={{
      fontSize: 11.5, fontWeight: 600,
      padding: '3px 8px', borderRadius: 4,
      color, backgroundColor: bg,
      display: 'inline-flex', alignItems: 'center', gap: 3,
      border: border ? '1px solid #DDD7C6' : 'none',
    }}>
      {children}
    </span>
  )
}

function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingBottom: 7, borderBottom: '1.5px solid #161614',
    }}>
      <span style={{
        fontSize: 10.5, fontWeight: 700,
        letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>
        {title}
      </span>
      {meta && (
        <span style={{ fontSize: 11, color: '#6A675F', fontFamily: 'monospace' }}>
          {meta}
        </span>
      )}
    </div>
  )
}

function Fact({ label, value, mono }: {
  label: string; value: string; mono?: boolean
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      paddingBottom: 10, borderBottom: '1px solid #E8E3D2',
    }}>
      <span style={{ fontSize: 11.5, color: '#6A675F', fontWeight: 500 }}>{label}</span>
      <span style={{
        fontSize: mono ? 13 : 12.5, fontWeight: 600, color: '#161614',
        fontFamily: mono ? 'monospace' : 'inherit',
      }}>
        {value}
      </span>
    </div>
  )
}

function ActivityRow({ activity, isLast }: {
  activity: Activity; isLast: boolean
}) {
  const colorMap: Record<string, string> = {
    email: '#1E3A6B',
    meeting: '#0E5550',
    whatsapp: '#4A7920',
    call: '#B8541E',
    system: '#6A675F',
    document: '#5B3B6F',
  }
  const color = colorMap[activity.type] ?? '#6A675F'

  return (
    <div style={{ display: 'flex', gap: 12, position: 'relative' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          backgroundColor: '#fff', border: `1.5px solid ${color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color,
          position: 'relative', zIndex: 2,
        }}>
          {activity.type[0].toUpperCase()}
        </div>
        {!isLast && (
          <div style={{
            position: 'absolute', top: 28, left: 13,
            width: 1.5, height: 'calc(100% + 4px)',
            backgroundColor: '#DDD7C6',
          }} />
        )}
      </div>
      <div style={{ flex: 1, paddingBottom: 20 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginBottom: 4, flexWrap: 'wrap', gap: 4,
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{activity.who}</span>
          <span style={{ fontSize: 11, color: '#A39F94', fontFamily: 'monospace' }}>
            {activity.when}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: '#363633', lineHeight: 1.55 }}>
          {activity.summary}
        </div>
        <div style={{ marginTop: 5, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10.5, color: '#6A675F',
            padding: '2px 6px', backgroundColor: '#EDE7D8', borderRadius: 3,
          }}>
            {activity.channel}
          </span>
          {activity.outcome && (
            <span style={{
              fontSize: 10.5, fontWeight: 600,
              padding: '2px 6px', borderRadius: 3,
              color: activity.outcome === 'positive'
                ? '#3D6B1C' : activity.outcome === 'concern'
                  ? '#751A11' : '#7A4A0E',
              backgroundColor: activity.outcome === 'positive'
                ? '#DDE9C9' : activity.outcome === 'concern'
                  ? '#F0D5D0' : '#F3E2BE',
            }}>
              {activity.outcome}
            </span>
          )}
        </div>
        {activity.nextStep && (
          <div style={{
            marginTop: 8, padding: '6px 10px',
            backgroundColor: '#F5E0CC', borderRadius: 5,
            fontSize: 12, color: '#6F2F0E',
          }}>
            <strong>Next:</strong> {activity.nextStep.description}
            <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11 }}>
              {activity.nextStep.due}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
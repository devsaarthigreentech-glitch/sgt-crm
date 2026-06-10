import { useState, useEffect } from 'react'
import { ArrowLeft, MapPin, Lock, Shield, Mail, Plus, Phone, Trash2 } from 'lucide-react'
import type { Lead, Activity } from '../../types'
import { formatINR, getVerticalColor } from '../../lib/utils'
import { api } from '../../lib/api'
import BottomDrawer from './BottomDrawer'
import { useIsMobile } from '../../hooks/useIsMobile'

interface Props {
  lead: Lead
  onBack: () => void
  onDeleted?: () => void
}

export default function LeadDetail({ lead, onBack, onDeleted }: Props) {
  const isMobile = useIsMobile()
  const accentColor = getVerticalColor(lead.vertical ?? '')
  const [showDrawer, setShowDrawer] = useState(false)
  const [localActivities, setLocalActivities] = useState<Activity[]>([])
  const [apiActivities, setApiActivities] = useState<Activity[]>([])
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.deleteLead(lead.id, { actorName: 'Rohan Mehta' })
      onDeleted?.()
    } catch (err) {
      console.error('Failed to delete lead', err)
      alert('Could not delete this lead. Please try again.')
      setDeleting(false)
    }
  }

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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 32, maxWidth: 1000 }}>
            <ActivitySection activities={allActivities} />
            <FactsRail lead={lead} />
          </div>
        )}

        {/* Danger zone */}
        <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid #E8E3D2' }}>
          <button
            onClick={() => setShowDelete(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 600, color: '#A02B1F', padding: 0,
            }}
          >
            <Trash2 size={13} strokeWidth={2} />
            Delete lead
          </button>
        </div>
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
      {showDelete && (
        <div
          onClick={() => !deleting && setShowDelete(false)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(22,22,20,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 60, padding: 20,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: '#fff', borderRadius: 12, padding: 22,
            maxWidth: 380, width: '100%', boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', backgroundColor: '#F0D5D0',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Trash2 size={16} strokeWidth={2} style={{ color: '#A02B1F' }} />
              </div>
              <h3 style={{ fontSize: 15.5, fontWeight: 600, color: '#161614', margin: 0 }}>
                Delete this lead?
              </h3>
            </div>
            <p style={{ fontSize: 13, color: '#6A675F', lineHeight: 1.5, margin: '0 0 18px' }}>
              <strong style={{ color: '#363633' }}>{lead.company}</strong> will be removed from
              your pipeline. It's recoverable in the database but won't appear anywhere in the app.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDelete(false)}
                disabled={deleting}
                style={{
                  padding: '8px 14px', backgroundColor: '#fff', color: '#161614',
                  border: '1px solid #DDD7C6', borderRadius: 7,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  padding: '8px 14px', backgroundColor: '#A02B1F', color: '#fff',
                  border: 'none', borderRadius: 7,
                  fontSize: 13, fontWeight: 600, cursor: deleting ? 'default' : 'pointer',
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? 'Deleting…' : 'Delete lead'}
              </button>
            </div>
          </div>
        </div>
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
// import { useState, useEffect } from 'react'
// import { ArrowLeft, MapPin, Lock, Shield, Mail, Phone, Plus, Pencil, Check, X } from 'lucide-react'
// import type { Lead, Activity } from '../../types'
// import { formatINR, getVerticalColor } from '../../lib/utils'
// import { api } from '../../lib/api'
// import BottomDrawer from './BottomDrawer'
// import { useIsMobile } from '../../hooks/useIsMobile'

// const T = {
//   cream: '#F4F0E5', card: '#FFFFFF', ink: '#161614', muted: '#6A675F',
//   line: '#DDD7C6', line2: '#E8E3D2', chip: '#EDE7D8',
//   teal: '#0E5550', orange: '#C45A1E', anchorBg: '#D8E8E6', anchorInk: '#052927',
// }
// const LEAD_TYPES = ['Prospect', 'KOL/Strategic Contact', 'Partner/Distributor Prospect']
// const STAGES = ['New', 'Allocated', 'Qualifying', 'Discovery', 'Proposal', 'Negotiation']

// interface Props {
//   lead: Lead
//   onBack: () => void
//   onUpdated?: () => void
// }

// export default function LeadDetail({ lead, onBack, onUpdated }: Props) {
//   const isMobile = useIsMobile()
//   const [current, setCurrent] = useState<Lead>(lead)
//   const L = current as any
//   const accent = getVerticalColor(L.vertical ?? '')

//   const [showDrawer, setShowDrawer] = useState(false)
//   const [editing, setEditing] = useState(false)
//   const [saving, setSaving] = useState(false)
//   const [localActivities, setLocalActivities] = useState<Activity[]>([])
//   const [apiActivities, setApiActivities] = useState<Activity[]>([])

//   useEffect(() => { setCurrent(lead) }, [lead])

//   useEffect(() => {
//     api.getActivities(lead.id).then(res => {
//       setApiActivities(res.data.map((a: any) => ({
//         type: a.type, who: a.who, when: new Date(a.when).toLocaleDateString('en-IN'),
//         summary: a.summary, channel: a.channel ?? a.type, outcome: a.outcome, nextStep: a.nextStep,
//       })))
//     }).catch(() => {})
//   }, [lead.id])

//   const allActivities = [...localActivities, ...apiActivities]
//   const stageIdx = Math.max(0, STAGES.indexOf(current.stage))

//   // edit draft
//   const [draft, setDraft] = useState({
//     leadType: L.leadType ?? 'Prospect', owner: current.owner ?? '',
//     value: current.value ?? 0, estClose: current.estClose ?? '',
//     contactName: L.contact?.name ?? '', role: L.contact?.role ?? '',
//     email: L.contact?.email ?? '', phone: L.contact?.phone ?? '',
//   })
//   const beginEdit = () => {
//     setDraft({
//       leadType: L.leadType ?? 'Prospect', owner: current.owner ?? '',
//       value: current.value ?? 0, estClose: current.estClose ?? '',
//       contactName: L.contact?.name ?? '', role: L.contact?.role ?? '',
//       email: L.contact?.email ?? '', phone: L.contact?.phone ?? '',
//     })
//     setEditing(true)
//   }
//   const set = (k: string, v: unknown) => setDraft(d => ({ ...d, [k]: v }))

//   const save = async () => {
//     const patch: Record<string, unknown> = {}
//     if (draft.leadType !== (L.leadType ?? 'Prospect')) patch.leadType = draft.leadType
//     if (draft.owner !== (current.owner ?? '')) patch.owner = draft.owner || null
//     if (Number(draft.value) !== Number(current.value ?? 0)) patch.value = Number(draft.value)
//     if (draft.estClose !== (current.estClose ?? '')) patch.estClose = draft.estClose || null
//     if (draft.contactName !== (L.contact?.name ?? '')) patch.contactName = draft.contactName
//     if (draft.role !== (L.contact?.role ?? '')) patch.role = draft.role
//     if (draft.email !== (L.contact?.email ?? '')) patch.email = draft.email
//     if (draft.phone !== (L.contact?.phone ?? '')) patch.phone = draft.phone
//     if (!Object.keys(patch).length) { setEditing(false); return }
//     setSaving(true)
//     try {
//       const res = await fetch(`${import.meta.env.VITE_API_URL}/leads/${current.id}`, {
//         method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
//       })
//       if (!res.ok) throw new Error(await res.text())
//       setCurrent(c => {
//         const cc = c as any
//         return {
//           ...c,
//           leadType: patch.leadType ?? cc.leadType,
//           owner: patch.owner !== undefined ? (patch.owner as any) : c.owner,
//           value: patch.value !== undefined ? (patch.value as any) : c.value,
//           estClose: patch.estClose !== undefined ? (patch.estClose as any) : c.estClose,
//           contact: {
//             ...(cc.contact ?? {}),
//             name: patch.contactName ?? cc.contact?.name,
//             role: patch.role ?? cc.contact?.role,
//             email: patch.email ?? cc.contact?.email,
//             phone: patch.phone ?? cc.contact?.phone,
//           },
//         } as Lead
//       })
//       onUpdated?.()
//       setEditing(false)
//     } catch (e) {
//       alert('Save failed: ' + (e as Error).message)
//     } finally { setSaving(false) }
//   }

//   const MOBILE_BAR = 130

//   return (
//     <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.cream }}>
//       {/* back */}
//       <div style={{ padding: isMobile ? '12px 16px' : '12px 24px', borderBottom: `1px solid ${T.line2}`, flexShrink: 0 }}>
//         <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: T.muted, fontWeight: 500, padding: 0 }}>
//           <ArrowLeft size={13} strokeWidth={2} /> Back to pipeline
//         </button>
//       </div>

//       {/* hero */}
//       <div style={{ padding: isMobile ? '14px 16px' : '18px 24px', borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
//         <div style={{ background: T.card, border: `1px solid ${T.line2}`, borderRadius: 14, padding: isMobile ? 16 : 20, position: 'relative', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
//           <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: accent }} />
//           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
//             <div style={{ flex: 1, minWidth: 0 }}>
//               <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
//                 <span style={{ fontFamily: 'monospace', fontSize: 11, color: T.muted, fontWeight: 600, padding: '2px 7px', background: T.chip, borderRadius: 4 }}>
//                   {L.displayId ?? current.id}
//                 </span>
//                 {L.reservedAccount && (
//                   <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: T.anchorInk, background: T.anchorBg, padding: '2.5px 8px', borderRadius: 4 }}>
//                     <Lock size={10} strokeWidth={2.25} /> Anchor
//                   </span>
//                 )}
//               </div>
//               <h1 style={{ fontSize: isMobile ? 20 : 25, fontWeight: 650, color: T.ink, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }}>
//                 {current.company}
//               </h1>
//               <div style={{ marginTop: 6, fontSize: 12, color: T.muted, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
//                 {L.location && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} strokeWidth={2} />{L.location}</span>}
//                 {L.contact?.name && (<><span style={{ color: T.line }}>·</span><span><strong style={{ color: '#363633' }}>{L.contact.name}</strong>{L.contact.role ? ` · ${L.contact.role}` : ''}</span></>)}
//               </div>
//               <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12 }}>
//                 {L.vertical && <Chip color="#fff" bg={accent}>{L.vertical}</Chip>}
//                 {L.model && <Chip color="#363633" bg="#fff" border>{L.model}</Chip>}
//                 {L.origin && <Chip color="#363633" bg="#fff" border>{L.origin}</Chip>}
//                 {L.leadType && L.leadType !== 'Prospect' && <Chip color="#363633" bg={T.chip}>{L.leadType}</Chip>}
//                 {L.protection && L.protection.daysLeft >= 0 && (
//                   <Chip color={L.protection.daysLeft <= 14 ? '#7A4A0E' : T.anchorInk} bg={L.protection.daysLeft <= 14 ? '#F3E2BE' : T.anchorBg}>
//                     <Shield size={10} strokeWidth={2} style={{ display: 'inline', marginRight: 2 }} />{L.protection.daysLeft}d protection
//                   </Chip>
//                 )}
//               </div>
//             </div>
//             {!editing && (
//               <button onClick={beginEdit} title="Edit lead" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: '#fff', color: T.ink, border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
//                 <Pencil size={12} strokeWidth={2} /> Edit
//               </button>
//             )}
//           </div>

//           {/* stage stepper */}
//           <div style={{ marginTop: 16 }}>
//             <div style={{ display: 'flex', gap: 4 }}>
//               {STAGES.map((s, i) => <div key={s} title={s} style={{ flex: 1, height: 5, borderRadius: 3, background: i <= stageIdx ? T.teal : T.line2 }} />)}
//             </div>
//             <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>{STAGES[stageIdx]} · {stageIdx + 1} of {STAGES.length} · {current.daysInStage}d in stage</div>
//           </div>
//         </div>
//       </div>

//       {/* body */}
//       <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? `16px 16px ${MOBILE_BAR}px` : 24 }}>
//         <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: 24 } : { display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32, maxWidth: 1040 }}>
//           {!isMobile && <ActivitySection activities={allActivities} />}
//           <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
//             {/* facts */}
//             <div>
//               <SectionHeader title="Facts" />
//               <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
//                 <FactCard label="Lead type">
//                   {editing
//                     ? <select style={ipt} value={draft.leadType} onChange={e => set('leadType', e.target.value)}>{LEAD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
//                     : <Val>{L.leadType ?? 'Prospect'}</Val>}
//                 </FactCard>
//                 <FactCard label="Owner">
//                   {editing
//                     ? <input style={ipt} value={draft.owner} placeholder="Unassigned" onChange={e => set('owner', e.target.value)} />
//                     : <Val>{current.owner ?? 'Unassigned'}</Val>}
//                 </FactCard>
//                 <FactCard label="Value">
//                   {editing
//                     ? <input style={ipt} type="number" value={draft.value} onChange={e => set('value', e.target.value)} />
//                     : <Val mono>{formatINR(current.value)}</Val>}
//                 </FactCard>
//                 <FactCard label="Est. close">
//                   {editing
//                     ? <input style={ipt} type="date" value={draft.estClose ?? ''} onChange={e => set('estClose', e.target.value)} />
//                     : <Val mono>{current.estClose ?? '—'}</Val>}
//                 </FactCard>
//               </div>
//             </div>

//             {/* contact */}
//             <div>
//               <SectionHeader title="Primary contact" />
//               <div style={{ marginTop: 12, background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, padding: 14, display: 'flex', gap: 12 }}>
//                 <div style={{ width: 38, height: 38, borderRadius: '50%', background: accent + '22', color: accent, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
//                   {(L.contact?.name ?? current.company ?? '?').trim()[0]?.toUpperCase() ?? '?'}
//                 </div>
//                 <div style={{ flex: 1, minWidth: 0 }}>
//                   {editing ? (
//                     <div style={{ display: 'grid', gap: 6 }}>
//                       <input style={ipt} value={draft.contactName} placeholder="Name" onChange={e => set('contactName', e.target.value)} />
//                       <input style={ipt} value={draft.role} placeholder="Role" onChange={e => set('role', e.target.value)} />
//                       <input style={ipt} value={draft.email} placeholder="Email" onChange={e => set('email', e.target.value)} />
//                       <input style={ipt} value={draft.phone} placeholder="Phone" onChange={e => set('phone', e.target.value)} />
//                     </div>
//                   ) : L.contact?.name ? (
//                     <>
//                       <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{L.contact.name}</div>
//                       {L.contact.role && <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{L.contact.role}</div>}
//                       {L.contact.email && <a href={`mailto:${L.contact.email}`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: T.teal, marginTop: 8, textDecoration: 'none' }}><Mail size={11} strokeWidth={2} />{L.contact.email}</a>}
//                       {L.contact.phone && <a href={`tel:${L.contact.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: T.teal, marginTop: 6, textDecoration: 'none' }}><Phone size={11} strokeWidth={2} />{L.contact.phone}</a>}
//                     </>
//                   ) : <div style={{ fontSize: 12.5, color: '#A39F94' }}>No contact on file</div>}
//                 </div>
//               </div>
//             </div>
//           </div>
//           {isMobile && <ActivitySection activities={allActivities} />}
//         </div>
//       </div>

//       {/* actions */}
//       <ActionBar
//         isMobile={isMobile} editing={editing} saving={saving}
//         onLog={() => setShowDrawer(true)} onSave={save} onCancel={() => setEditing(false)}
//         hidden={showDrawer}
//       />

//       {showDrawer && (
//         <BottomDrawer
//           lead={current}
//           onClose={() => setShowDrawer(false)}
//           onSubmit={async (activity) => {
//             try {
//               await api.logActivity(current.id, { ...activity, actorName: 'Rohan Mehta' })
//               setLocalActivities(prev => [{ ...activity, who: 'Rohan Mehta', when: 'just now' }, ...prev])
//               onUpdated?.()
//             } catch (err) { console.error('Failed to log activity', err) }
//           }}
//         />
//       )}
//     </div>
//   )
// }

// const ipt: React.CSSProperties = { width: '100%', padding: '6px 8px', border: `1px solid ${T.line}`, borderRadius: 6, fontSize: 13, color: T.ink, background: '#fff', boxSizing: 'border-box' }

// function ActionBar({ isMobile, editing, saving, onLog, onSave, onCancel, hidden }: { isMobile: boolean; editing: boolean; saving: boolean; onLog: () => void; onSave: () => void; onCancel: () => void; hidden: boolean }) {
//   if (hidden) return null
//   const wrap: React.CSSProperties = isMobile
//     ? { position: 'fixed', bottom: 57, left: 0, right: 0, background: '#fff', borderTop: `1px solid ${T.line}`, padding: '10px 16px', display: 'flex', gap: 8, zIndex: 35 }
//     : { borderTop: `1px solid ${T.line}`, background: '#fff', padding: '12px 24px', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }
//   const base: React.CSSProperties = { padding: isMobile ? '11px 0' : '10px 18px', flex: isMobile ? 1 : undefined, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }
//   return (
//     <div style={wrap}>
//       {editing ? (
//         <>
//           <button onClick={onCancel} style={{ ...base, background: '#fff', color: T.ink, border: `1px solid ${T.line}` }}><X size={14} />Cancel</button>
//           <button onClick={onSave} disabled={saving} style={{ ...base, background: T.teal, color: '#fff', border: 'none' }}><Check size={14} />{saving ? 'Saving…' : 'Save changes'}</button>
//         </>
//       ) : (
//         <>
//           <button onClick={onLog} style={{ ...base, background: '#fff', color: T.ink, border: `1px solid ${T.line}` }}><Plus size={14} strokeWidth={2.5} />Log activity</button>
//           {/* TODO: wire to your stage-advance flow */}
//           <button style={{ ...base, background: T.orange, color: '#fff', border: 'none' }}>Advance stage →</button>
//         </>
//       )}
//     </div>
//   )
// }

// function ActivitySection({ activities }: { activities: Activity[] }) {
//   return (
//     <div>
//       <SectionHeader title="Activity" meta={`${activities.length} entries`} />
//       <div style={{ marginTop: 14 }}>
//         {activities.length === 0
//           ? <p style={{ fontSize: 13, color: '#A39F94' }}>No activity yet.</p>
//           : activities.map((a, i) => <ActivityRow key={i} activity={a} isLast={i === activities.length - 1} />)}
//       </div>
//     </div>
//   )
// }

// function Chip({ children, color, bg, border }: { children: React.ReactNode; color: string; bg: string; border?: boolean }) {
//   return <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 8px', borderRadius: 4, color, background: bg, display: 'inline-flex', alignItems: 'center', gap: 3, border: border ? `1px solid ${T.line}` : 'none' }}>{children}</span>
// }
// function SectionHeader({ title, meta }: { title: string; meta?: string }) {
//   return (
//     <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 7, borderBottom: `1.5px solid ${T.ink}` }}>
//       <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.ink }}>{title}</span>
//       {meta && <span style={{ fontSize: 11, color: T.muted, fontFamily: 'monospace' }}>{meta}</span>}
//     </div>
//   )
// }
// function FactCard({ label, children }: { label: string; children: React.ReactNode }) {
//   return (
//     <div style={{ background: T.card, border: `1px solid ${T.line2}`, borderRadius: 10, padding: 11 }}>
//       <div style={{ fontSize: 10.5, color: T.muted, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
//       {children}
//     </div>
//   )
// }
// function Val({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
//   return <div style={{ fontSize: mono ? 14 : 13.5, fontWeight: 600, color: T.ink, fontFamily: mono ? 'monospace' : 'inherit' }}>{children}</div>
// }
// function ActivityRow({ activity, isLast }: { activity: Activity; isLast: boolean }) {
//   const colorMap: Record<string, string> = { email: '#1E3A6B', meeting: '#0E5550', whatsapp: '#4A7920', call: '#B8541E', system: '#6A675F', document: '#5B3B6F' }
//   const color = colorMap[activity.type] ?? '#6A675F'
//   return (
//     <div style={{ display: 'flex', gap: 12, position: 'relative' }}>
//       <div style={{ position: 'relative', flexShrink: 0 }}>
//         <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#fff', border: `1.5px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color, zIndex: 2, position: 'relative' }}>
//           {activity.type[0].toUpperCase()}
//         </div>
//         {!isLast && <div style={{ position: 'absolute', top: 28, left: 13, width: 1.5, height: 'calc(100% + 4px)', background: T.line }} />}
//       </div>
//       <div style={{ flex: 1, paddingBottom: 20 }}>
//         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 4 }}>
//           <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{activity.who}</span>
//           <span style={{ fontSize: 11, color: '#A39F94', fontFamily: 'monospace' }}>{activity.when}</span>
//         </div>
//         <div style={{ fontSize: 12.5, color: '#363633', lineHeight: 1.55 }}>{activity.summary}</div>
//         <div style={{ marginTop: 5, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
//           <span style={{ fontSize: 10.5, color: T.muted, padding: '2px 6px', background: T.chip, borderRadius: 3 }}>{activity.channel}</span>
//           {activity.outcome && (
//             <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
//               color: activity.outcome === 'positive' ? '#3D6B1C' : activity.outcome === 'concern' ? '#751A11' : '#7A4A0E',
//               background: activity.outcome === 'positive' ? '#DDE9C9' : activity.outcome === 'concern' ? '#F0D5D0' : '#F3E2BE' }}>
//               {activity.outcome}
//             </span>
//           )}
//         </div>
//         {activity.nextStep && (
//           <div style={{ marginTop: 8, padding: '6px 10px', background: '#F5E0CC', borderRadius: 5, fontSize: 12, color: '#6F2F0E' }}>
//             <strong>Next:</strong> {activity.nextStep.description}
//             <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11 }}>{activity.nextStep.due}</span>
//           </div>
//         )}
//       </div>
//     </div>
//   )
// }
// // import { useState, useEffect } from 'react'
// // import { ArrowLeft, MapPin, Lock, Shield, Mail, Plus, Phone, Trash2 } from 'lucide-react'
// // import type { Lead, Activity } from '../../types'
// // import { formatINR, getVerticalColor } from '../../lib/utils'
// // import { api } from '../../lib/api'
// // import BottomDrawer from './BottomDrawer'
// // import { useIsMobile } from '../../hooks/useIsMobile'

// // interface Props {
// //   lead: Lead
// //   onBack: () => void
// //   onDeleted?: () => void
// // }

// // export default function LeadDetail({ lead, onBack, onDeleted }: Props) {
// //   const isMobile = useIsMobile()
// //   const accentColor = getVerticalColor(lead.vertical ?? '')
// //   const [showDrawer, setShowDrawer] = useState(false)
// //   const [localActivities, setLocalActivities] = useState<Activity[]>([])
// //   const [apiActivities, setApiActivities] = useState<Activity[]>([])
// //   const [showDelete, setShowDelete] = useState(false)
// //   const [deleting, setDeleting] = useState(false)

// //   const handleDelete = async () => {
// //     setDeleting(true)
// //     try {
// //       await api.deleteLead(lead.id, { actorName: 'Rohan Mehta' })
// //       onDeleted?.()
// //     } catch (err) {
// //       console.error('Failed to delete lead', err)
// //       alert('Could not delete this lead. Please try again.')
// //       setDeleting(false)
// //     }
// //   }

// //   useEffect(() => {
// //     api.getActivities(lead.id).then(res => {
// //       setApiActivities(res.data.map((a: any) => ({
// //         type: a.type,
// //         who: a.who,
// //         when: new Date(a.when).toLocaleDateString('en-IN'),
// //         summary: a.summary,
// //         channel: a.channel ?? a.type,
// //         outcome: a.outcome,
// //         nextStep: a.nextStep,
// //       })))
// //     }).catch(() => { })
// //   }, [lead.id])

// //   const allActivities = [...localActivities, ...apiActivities]

// //   // Mobile action bar height — used to push content up
// //   const MOBILE_ACTION_BAR = 130 // action buttons + bottom nav

// //   return (
// //     <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

// //       {/* Back bar */}
// //       <div style={{
// //         padding: isMobile ? '12px 16px' : '12px 24px',
// //         borderBottom: '1px solid #E8E3D2',
// //         backgroundColor: '#F4F0E5', flexShrink: 0,
// //       }}>
// //         <button
// //           onClick={onBack}
// //           style={{
// //             display: 'flex', alignItems: 'center', gap: 5,
// //             background: 'none', border: 'none', cursor: 'pointer',
// //             fontSize: 12, color: '#6A675F', fontWeight: 500, padding: 0,
// //           }}
// //         >
// //           <ArrowLeft size={13} strokeWidth={2} />
// //           Back to pipeline
// //         </button>
// //       </div>

// //       {/* Hero */}
// //       <div style={{
// //         padding: isMobile ? '14px 16px 12px' : '20px 24px 18px',
// //         borderBottom: '1px solid #DDD7C6',
// //         backgroundColor: '#F4F0E5',
// //         position: 'relative', flexShrink: 0,
// //       }}>
// //         <div style={{
// //           position: 'absolute', left: 0, top: 0, bottom: 0,
// //           width: 4, backgroundColor: accentColor,
// //         }} />

// //         <div style={{
// //           display: 'flex', alignItems: 'flex-start',
// //           justifyContent: 'space-between', gap: 12,
// //         }}>
// //           <div style={{ flex: 1, minWidth: 0 }}>
// //             {/* ID + anchor */}
// //             <div style={{
// //               display: 'flex', alignItems: 'center',
// //               gap: 8, marginBottom: 6, flexWrap: 'wrap',
// //             }}>
// //               <span style={{
// //                 fontFamily: 'monospace', fontSize: 11, color: '#6A675F',
// //                 fontWeight: 600, padding: '2px 7px',
// //                 backgroundColor: '#EDE7D8', borderRadius: 3,
// //               }}>
// //                 {(lead as any).displayId ?? lead.id}
// //               </span>
// //               {lead.reservedAccount && (
// //                 <span style={{
// //                   display: 'inline-flex', alignItems: 'center', gap: 4,
// //                   fontSize: 11.5, fontWeight: 600,
// //                   color: '#052927', backgroundColor: '#D8E8E6',
// //                   padding: '2.5px 8px', borderRadius: 4,
// //                 }}>
// //                   <Lock size={10} strokeWidth={2.25} />
// //                   Anchor
// //                 </span>
// //               )}
// //             </div>

// //             {/* Company name */}
// //             <h1 style={{
// //               fontSize: isMobile ? 19 : 26, fontWeight: 600, color: '#161614',
// //               letterSpacing: '-0.03em', margin: 0, lineHeight: 1.1,
// //             }}>
// //               {lead.company}
// //             </h1>

// //             {/* Location + contact */}
// //             <div style={{
// //               marginTop: 6, fontSize: 12, color: '#6A675F',
// //               display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
// //             }}>
// //               {lead.location && (
// //                 <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
// //                   <MapPin size={11} strokeWidth={2} />
// //                   {lead.location}
// //                 </span>
// //               )}
// //               {lead.contact && (
// //                 <>
// //                   <span style={{ color: '#DDD7C6' }}>·</span>
// //                   <span>
// //                     <strong style={{ color: '#363633' }}>{lead.contact.name}</strong>
// //                     {lead.contact.role ? ` · ${lead.contact.role}` : ''}
// //                   </span>
// //                 </>
// //               )}
// //             </div>

// //             {/* Chips */}
// //             <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
// //               {lead.vertical && <Chip color="#fff" bg={accentColor}>{lead.vertical}</Chip>}
// //               {lead.model && <Chip color="#363633" bg="#fff" border>{lead.model}</Chip>}
// //               {lead.origin && <Chip color="#363633" bg="#fff" border>{lead.origin}</Chip>}
// //               {(lead as any).leadType && (lead as any).leadType !== 'Prospect' && (
// //                 <Chip color="#363633" bg="#EDE7D8">{(lead as any).leadType}</Chip>
// //               )}
// //               {lead.protection && lead.protection.daysLeft >= 0 && (
// //                 <Chip
// //                   color={lead.protection.daysLeft <= 14 ? '#7A4A0E' : '#052927'}
// //                   bg={lead.protection.daysLeft <= 14 ? '#F3E2BE' : '#D8E8E6'}
// //                 >
// //                   <Shield size={10} strokeWidth={2} style={{ display: 'inline', marginRight: 2 }} />
// //                   {lead.protection.daysLeft}d protection
// //                 </Chip>
// //               )}
// //             </div>
// //           </div>

// //           {/* Desktop actions */}
// //           {!isMobile && (
// //             <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
// //               <button
// //                 onClick={() => setShowDrawer(true)}
// //                 style={{
// //                   padding: '8px 14px', backgroundColor: '#fff', color: '#161614',
// //                   border: '1px solid #DDD7C6', borderRadius: 6,
// //                   fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
// //                   display: 'flex', alignItems: 'center', gap: 6,
// //                 }}
// //               >
// //                 <Plus size={13} strokeWidth={2.5} />
// //                 Log activity
// //               </button>
// //               <button style={{
// //                 padding: '8px 14px', backgroundColor: '#C45A1E', color: '#fff',
// //                 border: 'none', borderRadius: 6,
// //                 fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
// //               }}>
// //                 Advance stage →
// //               </button>
// //             </div>
// //           )}
// //         </div>
// //       </div>

// //       {/* Body */}
// //       <div style={{
// //         flex: 1, overflowY: 'auto',
// //         padding: isMobile ? `16px 16px ${MOBILE_ACTION_BAR}px` : '24px',
// //         backgroundColor: '#F4F0E5',
// //       }}>
// //         {isMobile ? (
// //           <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
// //             <FactsRail lead={lead} />
// //             <ActivitySection activities={allActivities} />
// //           </div>
// //         ) : (
// //           <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 32, maxWidth: 1000 }}>
// //             <ActivitySection activities={allActivities} />
// //             <FactsRail lead={lead} />
// //           </div>
// //         )}

// //         {/* Danger zone */}
// //         <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid #E8E3D2' }}>
// //           <button
// //             onClick={() => setShowDelete(true)}
// //             style={{
// //               display: 'inline-flex', alignItems: 'center', gap: 6,
// //               background: 'none', border: 'none', cursor: 'pointer',
// //               fontSize: 12.5, fontWeight: 600, color: '#A02B1F', padding: 0,
// //             }}
// //           >
// //             <Trash2 size={13} strokeWidth={2} />
// //             Delete lead
// //           </button>
// //         </div>
// //       </div>

// //       {/* Mobile bottom action bar — sits above bottom nav */}
// //       {isMobile && !showDrawer && (
// //         <div style={{
// //           position: 'fixed', bottom: 57, left: 0, right: 0,
// //           backgroundColor: '#fff',
// //           borderTop: '1px solid #DDD7C6',
// //           padding: '10px 16px 10px',
// //           display: 'flex', gap: 8,
// //           zIndex: 35,
// //         }}>
// //           <button
// //             onClick={() => setShowDrawer(true)}
// //             style={{
// //               flex: 1, padding: '11px 0',
// //               backgroundColor: '#fff', color: '#161614',
// //               border: '1px solid #DDD7C6', borderRadius: 7,
// //               fontSize: 13, fontWeight: 600, cursor: 'pointer',
// //               display: 'flex', alignItems: 'center',
// //               justifyContent: 'center', gap: 6,
// //             }}
// //           >
// //             <Plus size={14} strokeWidth={2.5} />
// //             Log activity
// //           </button>
// //           <button style={{
// //             flex: 1, padding: '11px 0',
// //             backgroundColor: '#C45A1E', color: '#fff',
// //             border: 'none', borderRadius: 7,
// //             fontSize: 13, fontWeight: 600, cursor: 'pointer',
// //           }}>
// //             Advance stage →
// //           </button>
// //         </div>
// //       )}

// //       {/* Bottom drawer */}
// //       {showDrawer && (
// //         <BottomDrawer
// //           lead={lead}
// //           onClose={() => setShowDrawer(false)}
// //           onSubmit={async (activity) => {
// //             try {
// //               await api.logActivity(lead.id, {
// //                 ...activity,
// //                 actorName: 'Rohan Mehta',
// //               })
// //               setLocalActivities(prev => [{
// //                 ...activity,
// //                 who: 'Rohan Mehta',
// //                 when: 'just now',
// //               }, ...prev])
// //             } catch (err) {
// //               console.error('Failed to log activity', err)
// //             }
// //           }}
// //         />
// //       )}
// //       {showDelete && (
// //         <div
// //           onClick={() => !deleting && setShowDelete(false)}
// //           style={{
// //             position: 'fixed', inset: 0, backgroundColor: 'rgba(22,22,20,0.45)',
// //             display: 'flex', alignItems: 'center', justifyContent: 'center',
// //             zIndex: 60, padding: 20,
// //           }}
// //         >
// //           <div onClick={e => e.stopPropagation()} style={{
// //             backgroundColor: '#fff', borderRadius: 12, padding: 22,
// //             maxWidth: 380, width: '100%', boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
// //           }}>
// //             <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
// //               <div style={{
// //                 width: 34, height: 34, borderRadius: '50%', backgroundColor: '#F0D5D0',
// //                 display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
// //               }}>
// //                 <Trash2 size={16} strokeWidth={2} style={{ color: '#A02B1F' }} />
// //               </div>
// //               <h3 style={{ fontSize: 15.5, fontWeight: 600, color: '#161614', margin: 0 }}>
// //                 Delete this lead?
// //               </h3>
// //             </div>
// //             <p style={{ fontSize: 13, color: '#6A675F', lineHeight: 1.5, margin: '0 0 18px' }}>
// //               <strong style={{ color: '#363633' }}>{lead.company}</strong> will be removed from
// //               your pipeline. It's recoverable in the database but won't appear anywhere in the app.
// //             </p>
// //             <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
// //               <button
// //                 onClick={() => setShowDelete(false)}
// //                 disabled={deleting}
// //                 style={{
// //                   padding: '8px 14px', backgroundColor: '#fff', color: '#161614',
// //                   border: '1px solid #DDD7C6', borderRadius: 7,
// //                   fontSize: 13, fontWeight: 600, cursor: 'pointer',
// //                 }}
// //               >
// //                 Cancel
// //               </button>
// //               <button
// //                 onClick={handleDelete}
// //                 disabled={deleting}
// //                 style={{
// //                   padding: '8px 14px', backgroundColor: '#A02B1F', color: '#fff',
// //                   border: 'none', borderRadius: 7,
// //                   fontSize: 13, fontWeight: 600, cursor: deleting ? 'default' : 'pointer',
// //                   opacity: deleting ? 0.7 : 1,
// //                 }}
// //               >
// //                 {deleting ? 'Deleting…' : 'Delete lead'}
// //               </button>
// //             </div>
// //           </div>
// //         </div>
// //       )}
// //     </div>
// //   )
// // }

// // // ─── Sub-components ───────────────────────────────────────────────────────────

// // function FactsRail({ lead }: { lead: Lead }) {
// //   return (
// //     <div>
// //       <SectionHeader title="Facts" />
// //       <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
// //         <Fact label="Stage" value={lead.stage} />
// //         <Fact label="Lead type" value={(lead as any).leadType ?? 'Prospect'} />
// //         <Fact label="Owner" value={lead.owner ?? 'Unassigned'} />
// //         <Fact label="Value" value={formatINR(lead.value)} mono />
// //         <Fact label="Est. close" value={lead.estClose ?? '—'} mono />
// //         <Fact label="Days in stage" value={`${lead.daysInStage}d`} />
// //       </div>

// //       {lead.contact && (
// //         <div style={{ marginTop: 24 }}>
// //           <SectionHeader title="Primary contact" />
// //           <div style={{
// //             marginTop: 12, padding: '12px 14px',
// //             backgroundColor: '#fff',
// //             border: '1px solid #DDD7C6', borderRadius: 8,
// //           }}>
// //             <div style={{ fontSize: 13.5, fontWeight: 600 }}>{lead.contact.name}</div>
// //             <div style={{ fontSize: 12, color: '#6A675F', marginTop: 2 }}>{lead.contact.role}</div>
// //             {lead.contact.email && (
// //               <div style={{ marginTop: 8 }}>
// //                 <span style={{
// //                   fontSize: 11.5, color: '#0E5550',
// //                   display: 'flex', alignItems: 'center', gap: 5,
// //                 }}>
// //                   <Mail size={11} strokeWidth={2} />
// //                   {lead.contact.email}
// //                 </span>
// //               </div>
// //             )}
// //             {(lead.contact as any).phone && (
// //               <div style={{ marginTop: 6 }}>
// //                 <span style={{ fontSize: 11.5, color: '#0E5550', display: 'flex', alignItems: 'center', gap: 5 }}>
// //                   <Phone size={11} strokeWidth={2} />
// //                   {(lead.contact as any).phone}
// //                 </span>
// //               </div>
// //             )}
// //           </div>
// //         </div>
// //       )}
// //     </div>
// //   )
// // }

// // function ActivitySection({ activities }: { activities: Activity[] }) {
// //   return (
// //     <div>
// //       <SectionHeader title="Activity" meta={`${activities.length} entries`} />
// //       <div style={{ marginTop: 14 }}>
// //         {activities.length === 0 ? (
// //           <p style={{ fontSize: 13, color: '#A39F94' }}>No activity yet.</p>
// //         ) : (
// //           activities.map((a, i) => (
// //             <ActivityRow key={i} activity={a} isLast={i === activities.length - 1} />
// //           ))
// //         )}
// //       </div>
// //     </div>
// //   )
// // }

// // function Chip({ children, color, bg, border }: {
// //   children: React.ReactNode
// //   color: string
// //   bg: string
// //   border?: boolean
// // }) {
// //   return (
// //     <span style={{
// //       fontSize: 11.5, fontWeight: 600,
// //       padding: '3px 8px', borderRadius: 4,
// //       color, backgroundColor: bg,
// //       display: 'inline-flex', alignItems: 'center', gap: 3,
// //       border: border ? '1px solid #DDD7C6' : 'none',
// //     }}>
// //       {children}
// //     </span>
// //   )
// // }

// // function SectionHeader({ title, meta }: { title: string; meta?: string }) {
// //   return (
// //     <div style={{
// //       display: 'flex', alignItems: 'baseline',
// //       justifyContent: 'space-between',
// //       paddingBottom: 7, borderBottom: '1.5px solid #161614',
// //     }}>
// //       <span style={{
// //         fontSize: 10.5, fontWeight: 700,
// //         letterSpacing: '0.1em', textTransform: 'uppercase',
// //       }}>
// //         {title}
// //       </span>
// //       {meta && (
// //         <span style={{ fontSize: 11, color: '#6A675F', fontFamily: 'monospace' }}>
// //           {meta}
// //         </span>
// //       )}
// //     </div>
// //   )
// // }

// // function Fact({ label, value, mono }: {
// //   label: string; value: string; mono?: boolean
// // }) {
// //   return (
// //     <div style={{
// //       display: 'flex', justifyContent: 'space-between', alignItems: 'center',
// //       paddingBottom: 10, borderBottom: '1px solid #E8E3D2',
// //     }}>
// //       <span style={{ fontSize: 11.5, color: '#6A675F', fontWeight: 500 }}>{label}</span>
// //       <span style={{
// //         fontSize: mono ? 13 : 12.5, fontWeight: 600, color: '#161614',
// //         fontFamily: mono ? 'monospace' : 'inherit',
// //       }}>
// //         {value}
// //       </span>
// //     </div>
// //   )
// // }

// // function ActivityRow({ activity, isLast }: {
// //   activity: Activity; isLast: boolean
// // }) {
// //   const colorMap: Record<string, string> = {
// //     email: '#1E3A6B',
// //     meeting: '#0E5550',
// //     whatsapp: '#4A7920',
// //     call: '#B8541E',
// //     system: '#6A675F',
// //     document: '#5B3B6F',
// //   }
// //   const color = colorMap[activity.type] ?? '#6A675F'

// //   return (
// //     <div style={{ display: 'flex', gap: 12, position: 'relative' }}>
// //       <div style={{ position: 'relative', flexShrink: 0 }}>
// //         <div style={{
// //           width: 28, height: 28, borderRadius: '50%',
// //           backgroundColor: '#fff', border: `1.5px solid ${color}`,
// //           display: 'flex', alignItems: 'center', justifyContent: 'center',
// //           fontSize: 10, fontWeight: 700, color,
// //           position: 'relative', zIndex: 2,
// //         }}>
// //           {activity.type[0].toUpperCase()}
// //         </div>
// //         {!isLast && (
// //           <div style={{
// //             position: 'absolute', top: 28, left: 13,
// //             width: 1.5, height: 'calc(100% + 4px)',
// //             backgroundColor: '#DDD7C6',
// //           }} />
// //         )}
// //       </div>
// //       <div style={{ flex: 1, paddingBottom: 20 }}>
// //         <div style={{
// //           display: 'flex', justifyContent: 'space-between',
// //           marginBottom: 4, flexWrap: 'wrap', gap: 4,
// //         }}>
// //           <span style={{ fontSize: 12.5, fontWeight: 600 }}>{activity.who}</span>
// //           <span style={{ fontSize: 11, color: '#A39F94', fontFamily: 'monospace' }}>
// //             {activity.when}
// //           </span>
// //         </div>
// //         <div style={{ fontSize: 12.5, color: '#363633', lineHeight: 1.55 }}>
// //           {activity.summary}
// //         </div>
// //         <div style={{ marginTop: 5, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
// //           <span style={{
// //             fontSize: 10.5, color: '#6A675F',
// //             padding: '2px 6px', backgroundColor: '#EDE7D8', borderRadius: 3,
// //           }}>
// //             {activity.channel}
// //           </span>
// //           {activity.outcome && (
// //             <span style={{
// //               fontSize: 10.5, fontWeight: 600,
// //               padding: '2px 6px', borderRadius: 3,
// //               color: activity.outcome === 'positive'
// //                 ? '#3D6B1C' : activity.outcome === 'concern'
// //                   ? '#751A11' : '#7A4A0E',
// //               backgroundColor: activity.outcome === 'positive'
// //                 ? '#DDE9C9' : activity.outcome === 'concern'
// //                   ? '#F0D5D0' : '#F3E2BE',
// //             }}>
// //               {activity.outcome}
// //             </span>
// //           )}
// //         </div>
// //         {activity.nextStep && (
// //           <div style={{
// //             marginTop: 8, padding: '6px 10px',
// //             backgroundColor: '#F5E0CC', borderRadius: 5,
// //             fontSize: 12, color: '#6F2F0E',
// //           }}>
// //             <strong>Next:</strong> {activity.nextStep.description}
// //             <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11 }}>
// //               {activity.nextStep.due}
// //             </span>
// //           </div>
// //         )}
// //       </div>
// //     </div>
// //   )
// // }
// import { useState, useEffect } from 'react'
// import { ArrowLeft, MapPin, Lock, Shield, Mail, Plus, Phone, Trash2, ArrowRight, Trophy, XCircle } from 'lucide-react'
// import type { Lead, Activity } from '../../types'
// import { formatINR, getVerticalColor } from '../../lib/utils'
// import { api } from '../../lib/api'
// import { nextStage, isTerminal } from '../../lib/pipeline'
// import BottomDrawer from './BottomDrawer'
// import { useIsMobile } from '../../hooks/useIsMobile'

// interface Props {
//   lead: Lead
//   onBack: () => void
//   onDeleted?: () => void
//   /** Called after a stage change so the parent can reload leads. */
//   onChanged?: () => void
//   /** Logged-in user's display name — used as actor on activities/deletes. */
//   currentUser?: string
// }

// export default function LeadDetail({ lead, onBack, onDeleted, onChanged, currentUser }: Props) {
//   const isMobile = useIsMobile()
//   const accentColor = getVerticalColor(lead.vertical ?? '')
//   const [showDrawer, setShowDrawer] = useState(false)
//   const [localActivities, setLocalActivities] = useState<Activity[]>([])
//   const [apiActivities, setApiActivities] = useState<Activity[]>([])
//   const [showDelete, setShowDelete] = useState(false)
//   const [deleting, setDeleting] = useState(false)

//   const actor = currentUser ?? 'Unknown'

//   // Stage is kept locally so the UI updates instantly after an advance/close.
//   const [stage, setStage] = useState(lead.stage)
//   useEffect(() => { setStage(lead.stage) }, [lead.id, lead.stage])

//   // Advance / close modals
//   const [showAdvance, setShowAdvance] = useState(false)
//   const [showClose, setShowClose] = useState(false)
//   const [transitioning, setTransitioning] = useState(false)
//   const [transitionError, setTransitionError] = useState<string | null>(null)

//   const next = nextStage(stage)
//   const atNegotiation = stage === 'Negotiation'
//   const closedOut = isTerminal(stage)

//   const handleDelete = async () => {
//     setDeleting(true)
//     try {
//       await api.deleteLead(lead.id, { actorName: actor })
//       onDeleted?.()
//     } catch (err) {
//       console.error('Failed to delete lead', err)
//       alert('Could not delete this lead. Please try again.')
//       setDeleting(false)
//     }
//   }

//   const handleAdvance = async () => {
//     if (!next) return
//     setTransitioning(true)
//     setTransitionError(null)
//     try {
//       await api.advanceStage(lead.id, { toStage: next })
//       setStage(next)
//       setShowAdvance(false)
//       setLocalActivities(prev => [{
//         type: 'system', who: actor, when: 'just now',
//         summary: `Stage advanced to ${next}`, channel: 'System',
//       }, ...prev])
//       onChanged?.()
//     } catch (err) {
//       setTransitionError(err instanceof Error ? err.message : 'Advance failed')
//     } finally {
//       setTransitioning(false)
//     }
//   }

//   const handleClose = async (outcome: 'WON' | 'LOST', reason: string, competitorName?: string) => {
//     setTransitioning(true)
//     setTransitionError(null)
//     try {
//       await api.closeLead(lead.id, {
//         outcome,
//         reason: reason || undefined,
//         competitorName: competitorName || undefined,
//       })
//       const newStage = outcome === 'WON' ? 'Closed Won' : 'Closed Lost'
//       setStage(newStage)
//       setShowClose(false)
//       setLocalActivities(prev => [{
//         type: 'system', who: actor, when: 'just now',
//         summary: `Lead closed — ${outcome === 'WON' ? 'Won 🎉' : 'Lost'}${reason ? ` · ${reason}` : ''}`,
//         channel: 'System',
//       }, ...prev])
//       onChanged?.()
//     } catch (err) {
//       setTransitionError(err instanceof Error ? err.message : 'Close failed')
//     } finally {
//       setTransitioning(false)
//     }
//   }

//   useEffect(() => {
//     api.getActivities(lead.id).then(res => {
//       setApiActivities(res.data.map((a: any) => ({
//         type: a.type,
//         who: a.who,
//         when: new Date(a.when).toLocaleDateString('en-IN'),
//         summary: a.summary,
//         channel: a.channel ?? a.type,
//         outcome: a.outcome,
//         nextStep: a.nextStep,
//       })))
//     }).catch(() => { })
//   }, [lead.id])

//   const allActivities = [...localActivities, ...apiActivities]

//   // Mobile action bar height — used to push content up
//   const MOBILE_ACTION_BAR = 130 // action buttons + bottom nav

//   // Primary action label
//   const primaryLabel = closedOut
//     ? stage
//     : atNegotiation
//       ? 'Close lead'
//       : next
//         ? `Advance stage →`
//         : 'Advance stage →'

//   const onPrimaryAction = () => {
//     if (closedOut) return
//     if (atNegotiation) setShowClose(true)
//     else if (next) setShowAdvance(true)
//   }

//   return (
//     <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

//       {/* Back bar */}
//       <div style={{
//         padding: isMobile ? '12px 16px' : '12px 24px',
//         borderBottom: '1px solid #E8E3D2',
//         backgroundColor: '#F4F0E5', flexShrink: 0,
//       }}>
//         <button
//           onClick={onBack}
//           style={{
//             display: 'flex', alignItems: 'center', gap: 5,
//             background: 'none', border: 'none', cursor: 'pointer',
//             fontSize: 12, color: '#6A675F', fontWeight: 500, padding: 0,
//           }}
//         >
//           <ArrowLeft size={13} strokeWidth={2} />
//           Back to pipeline
//         </button>
//       </div>

//       {/* Hero */}
//       <div style={{
//         padding: isMobile ? '14px 16px 12px' : '20px 24px 18px',
//         borderBottom: '1px solid #DDD7C6',
//         backgroundColor: '#F4F0E5',
//         position: 'relative', flexShrink: 0,
//       }}>
//         <div style={{
//           position: 'absolute', left: 0, top: 0, bottom: 0,
//           width: 4, backgroundColor: accentColor,
//         }} />

//         <div style={{
//           display: 'flex', alignItems: 'flex-start',
//           justifyContent: 'space-between', gap: 12,
//         }}>
//           <div style={{ flex: 1, minWidth: 0 }}>
//             {/* ID + anchor */}
//             <div style={{
//               display: 'flex', alignItems: 'center',
//               gap: 8, marginBottom: 6, flexWrap: 'wrap',
//             }}>
//               <span style={{
//                 fontFamily: 'monospace', fontSize: 11, color: '#6A675F',
//                 fontWeight: 600, padding: '2px 7px',
//                 backgroundColor: '#EDE7D8', borderRadius: 3,
//               }}>
//                 {(lead as any).displayId ?? lead.id}
//               </span>
//               {lead.reservedAccount && (
//                 <span style={{
//                   display: 'inline-flex', alignItems: 'center', gap: 4,
//                   fontSize: 11.5, fontWeight: 600,
//                   color: '#052927', backgroundColor: '#D8E8E6',
//                   padding: '2.5px 8px', borderRadius: 4,
//                 }}>
//                   <Lock size={10} strokeWidth={2.25} />
//                   Anchor
//                 </span>
//               )}
//               {closedOut && (
//                 <span style={{
//                   display: 'inline-flex', alignItems: 'center', gap: 4,
//                   fontSize: 11.5, fontWeight: 700,
//                   color: stage === 'Closed Won' ? '#3D6B1C' : '#751A11',
//                   backgroundColor: stage === 'Closed Won' ? '#DDE9C9' : '#F0D5D0',
//                   padding: '2.5px 8px', borderRadius: 4,
//                 }}>
//                   {stage === 'Closed Won' ? <Trophy size={10} strokeWidth={2.25} /> : <XCircle size={10} strokeWidth={2.25} />}
//                   {stage}
//                 </span>
//               )}
//             </div>

//             {/* Company name */}
//             <h1 style={{
//               fontSize: isMobile ? 19 : 24, fontWeight: 600,
//               letterSpacing: '-0.02em', margin: 0, lineHeight: 1.15,
//             }}>
//               {lead.company}
//             </h1>

//             {/* Location + contact */}
//             <div style={{
//               marginTop: 6, fontSize: 12, color: '#6A675F',
//               display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
//             }}>
//               {lead.location && (
//                 <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
//                   <MapPin size={11} strokeWidth={2} />
//                   {lead.location}
//                 </span>
//               )}
//               {lead.contact?.name && (
//                 <>
//                   <span style={{ color: '#DDD7C6' }}>·</span>
//                   <span>
//                     <strong style={{ color: '#363633' }}>{lead.contact.name}</strong>
//                     {lead.contact.role ? ` · ${lead.contact.role}` : ''}
//                   </span>
//                 </>
//               )}
//             </div>

//             {/* Chips */}
//             <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
//               {lead.vertical && <Chip color="#fff" bg={accentColor}>{lead.vertical}</Chip>}
//               {lead.model && <Chip color="#363633" bg="#fff" border>{lead.model}</Chip>}
//               {lead.origin && <Chip color="#363633" bg="#fff" border>{lead.origin}</Chip>}
//               {(lead as any).leadType && (lead as any).leadType !== 'Prospect' && (
//                 <Chip color="#363633" bg="#EDE7D8">{(lead as any).leadType}</Chip>
//               )}
//               {lead.protection && lead.protection.daysLeft >= 0 && (
//                 <Chip
//                   color={lead.protection.daysLeft <= 14 ? '#7A4A0E' : '#052927'}
//                   bg={lead.protection.daysLeft <= 14 ? '#F3E2BE' : '#D8E8E6'}
//                 >
//                   <Shield size={10} strokeWidth={2} style={{ display: 'inline', marginRight: 2 }} />
//                   {lead.protection.daysLeft}d protection
//                 </Chip>
//               )}
//             </div>
//           </div>

//           {/* Desktop actions */}
//           {!isMobile && (
//             <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
//               <button
//                 onClick={() => setShowDrawer(true)}
//                 style={{
//                   padding: '8px 14px', backgroundColor: '#fff', color: '#161614',
//                   border: '1px solid #DDD7C6', borderRadius: 6,
//                   fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
//                   display: 'flex', alignItems: 'center', gap: 6,
//                 }}
//               >
//                 <Plus size={13} strokeWidth={2.5} />
//                 Log activity
//               </button>
//               <button
//                 onClick={onPrimaryAction}
//                 disabled={closedOut}
//                 style={{
//                   padding: '8px 14px',
//                   backgroundColor: closedOut ? '#C9C2AC' : atNegotiation ? '#0E5550' : '#C45A1E',
//                   color: '#fff',
//                   border: 'none', borderRadius: 6,
//                   fontSize: 12.5, fontWeight: 600,
//                   cursor: closedOut ? 'default' : 'pointer',
//                 }}
//               >
//                 {primaryLabel}
//               </button>
//             </div>
//           )}
//         </div>
//       </div>

//       {/* Body */}
//       <div style={{
//         flex: 1, overflowY: 'auto',
//         padding: isMobile ? `16px 16px ${MOBILE_ACTION_BAR}px` : '24px',
//         backgroundColor: '#F4F0E5',
//       }}>
//         {isMobile ? (
//           <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
//             <FactsRail lead={lead} stage={stage} />
//             <ActivitySection activities={allActivities} />
//           </div>
//         ) : (
//           <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 32, maxWidth: 1000 }}>
//             <ActivitySection activities={allActivities} />
//             <FactsRail lead={lead} stage={stage} />
//           </div>
//         )}

//         {/* Danger zone */}
//         <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid #E8E3D2' }}>
//           <button
//             onClick={() => setShowDelete(true)}
//             style={{
//               display: 'inline-flex', alignItems: 'center', gap: 6,
//               background: 'none', border: 'none', cursor: 'pointer',
//               fontSize: 12.5, fontWeight: 600, color: '#A02B1F', padding: 0,
//             }}
//           >
//             <Trash2 size={13} strokeWidth={2} />
//             Delete lead
//           </button>
//         </div>
//       </div>

//       {/* Mobile bottom action bar — sits above bottom nav */}
//       {isMobile && !showDrawer && (
//         <div style={{
//           position: 'fixed', bottom: 57, left: 0, right: 0,
//           backgroundColor: '#fff',
//           borderTop: '1px solid #DDD7C6',
//           padding: '10px 16px 10px',
//           display: 'flex', gap: 8,
//           zIndex: 35,
//         }}>
//           <button
//             onClick={() => setShowDrawer(true)}
//             style={{
//               flex: 1, padding: '11px 0',
//               backgroundColor: '#fff', color: '#161614',
//               border: '1px solid #DDD7C6', borderRadius: 7,
//               fontSize: 13, fontWeight: 600, cursor: 'pointer',
//               display: 'flex', alignItems: 'center',
//               justifyContent: 'center', gap: 6,
//             }}
//           >
//             <Plus size={14} strokeWidth={2.5} />
//             Log activity
//           </button>
//           <button
//             onClick={onPrimaryAction}
//             disabled={closedOut}
//             style={{
//               flex: 1, padding: '11px 0',
//               backgroundColor: closedOut ? '#C9C2AC' : atNegotiation ? '#0E5550' : '#C45A1E',
//               color: '#fff',
//               border: 'none', borderRadius: 7,
//               fontSize: 13, fontWeight: 600,
//               cursor: closedOut ? 'default' : 'pointer',
//             }}
//           >
//             {primaryLabel}
//           </button>
//         </div>
//       )}

//       {/* Bottom drawer */}
//       {showDrawer && (
//         <BottomDrawer
//           lead={lead}
//           onClose={() => setShowDrawer(false)}
//           onSubmit={async (activity) => {
//             try {
//               await api.logActivity(lead.id, {
//                 ...activity,
//                 actorName: actor,
//               })
//               setLocalActivities(prev => [{
//                 ...activity,
//                 who: actor,
//                 when: 'just now',
//               }, ...prev])
//             } catch (err) {
//               console.error('Failed to log activity', err)
//             }
//           }}
//         />
//       )}

//       {/* Advance stage modal */}
//       {showAdvance && next && (
//         <Modal onDismiss={() => !transitioning && setShowAdvance(false)}>
//           <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
//             <div style={{
//               width: 34, height: 34, borderRadius: '50%', backgroundColor: '#F5E0CC',
//               display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
//             }}>
//               <ArrowRight size={16} strokeWidth={2} style={{ color: '#C45A1E' }} />
//             </div>
//             <h3 style={{ fontSize: 15.5, fontWeight: 600, color: '#161614', margin: 0 }}>
//               Advance stage?
//             </h3>
//           </div>
//           <p style={{ fontSize: 13, color: '#6A675F', lineHeight: 1.5, margin: '0 0 6px' }}>
//             <strong style={{ color: '#363633' }}>{lead.company}</strong> will move
//           </p>
//           <div style={{
//             display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
//             fontSize: 13.5, fontWeight: 600,
//           }}>
//             <span style={{ padding: '3px 10px', backgroundColor: '#EDE7D8', borderRadius: 5 }}>{stage}</span>
//             <ArrowRight size={14} strokeWidth={2} style={{ color: '#6A675F' }} />
//             <span style={{ padding: '3px 10px', backgroundColor: '#F5E0CC', color: '#6F2F0E', borderRadius: 5 }}>{next}</span>
//           </div>
//           {transitionError && (
//             <p style={{ fontSize: 12.5, color: '#A02B1F', margin: '0 0 12px' }}>{transitionError}</p>
//           )}
//           <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
//             <button
//               onClick={() => setShowAdvance(false)}
//               disabled={transitioning}
//               style={{
//                 padding: '8px 14px', backgroundColor: '#fff', color: '#161614',
//                 border: '1px solid #DDD7C6', borderRadius: 7,
//                 fontSize: 13, fontWeight: 600, cursor: 'pointer',
//               }}
//             >
//               Cancel
//             </button>
//             <button
//               onClick={handleAdvance}
//               disabled={transitioning}
//               style={{
//                 padding: '8px 14px', backgroundColor: '#C45A1E', color: '#fff',
//                 border: 'none', borderRadius: 7,
//                 fontSize: 13, fontWeight: 600,
//                 cursor: transitioning ? 'default' : 'pointer',
//                 opacity: transitioning ? 0.7 : 1,
//               }}
//             >
//               {transitioning ? 'Moving…' : `Move to ${next}`}
//             </button>
//           </div>
//         </Modal>
//       )}

//       {/* Close lead modal (Negotiation → Closed Won / Closed Lost) */}
//       {showClose && (
//         <CloseLeadModal
//           company={lead.company}
//           busy={transitioning}
//           error={transitionError}
//           onDismiss={() => !transitioning && setShowClose(false)}
//           onConfirm={handleClose}
//         />
//       )}

//       {showDelete && (
//         <Modal onDismiss={() => !deleting && setShowDelete(false)}>
//           <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
//             <div style={{
//               width: 34, height: 34, borderRadius: '50%', backgroundColor: '#F0D5D0',
//               display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
//             }}>
//               <Trash2 size={16} strokeWidth={2} style={{ color: '#A02B1F' }} />
//             </div>
//             <h3 style={{ fontSize: 15.5, fontWeight: 600, color: '#161614', margin: 0 }}>
//               Delete this lead?
//             </h3>
//           </div>
//           <p style={{ fontSize: 13, color: '#6A675F', lineHeight: 1.5, margin: '0 0 18px' }}>
//             <strong style={{ color: '#363633' }}>{lead.company}</strong> will be removed from
//             your pipeline. It's recoverable in the database but won't appear anywhere in the app.
//           </p>
//           <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
//             <button
//               onClick={() => setShowDelete(false)}
//               disabled={deleting}
//               style={{
//                 padding: '8px 14px', backgroundColor: '#fff', color: '#161614',
//                 border: '1px solid #DDD7C6', borderRadius: 7,
//                 fontSize: 13, fontWeight: 600, cursor: 'pointer',
//               }}
//             >
//               Cancel
//             </button>
//             <button
//               onClick={handleDelete}
//               disabled={deleting}
//               style={{
//                 padding: '8px 14px', backgroundColor: '#A02B1F', color: '#fff',
//                 border: 'none', borderRadius: 7,
//                 fontSize: 13, fontWeight: 600, cursor: deleting ? 'default' : 'pointer',
//                 opacity: deleting ? 0.7 : 1,
//               }}
//             >
//               {deleting ? 'Deleting…' : 'Delete lead'}
//             </button>
//           </div>
//         </Modal>
//       )}
//     </div>
//   )
// }

// // ── Close-lead modal ───────────────────────────────────────────────────────────

// function CloseLeadModal({ company, busy, error, onDismiss, onConfirm }: {
//   company: string
//   busy: boolean
//   error: string | null
//   onDismiss: () => void
//   onConfirm: (outcome: 'WON' | 'LOST', reason: string, competitorName?: string) => void
// }) {
//   const [outcome, setOutcome] = useState<'WON' | 'LOST' | null>(null)
//   const [reason, setReason] = useState('')
//   const [competitor, setCompetitor] = useState('')

//   const canConfirm = outcome === 'WON' || (outcome === 'LOST' && reason.trim().length > 0)

//   return (
//     <Modal onDismiss={onDismiss}>
//       <h3 style={{ fontSize: 15.5, fontWeight: 600, color: '#161614', margin: '0 0 6px' }}>
//         Close lead
//       </h3>
//       <p style={{ fontSize: 13, color: '#6A675F', lineHeight: 1.5, margin: '0 0 14px' }}>
//         How did <strong style={{ color: '#363633' }}>{company}</strong> end?
//       </p>

//       <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
//         <button
//           onClick={() => setOutcome('WON')}
//           style={{
//             flex: 1, padding: '12px 0', borderRadius: 8, cursor: 'pointer',
//             border: outcome === 'WON' ? '2px solid #3D6B1C' : '1px solid #DDD7C6',
//             backgroundColor: outcome === 'WON' ? '#DDE9C9' : '#fff',
//             color: '#3D6B1C', fontSize: 13.5, fontWeight: 700,
//             display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
//           }}
//         >
//           <Trophy size={14} strokeWidth={2.25} />
//           Won
//         </button>
//         <button
//           onClick={() => setOutcome('LOST')}
//           style={{
//             flex: 1, padding: '12px 0', borderRadius: 8, cursor: 'pointer',
//             border: outcome === 'LOST' ? '2px solid #751A11' : '1px solid #DDD7C6',
//             backgroundColor: outcome === 'LOST' ? '#F0D5D0' : '#fff',
//             color: '#751A11', fontSize: 13.5, fontWeight: 700,
//             display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
//           }}
//         >
//           <XCircle size={14} strokeWidth={2.25} />
//           Lost
//         </button>
//       </div>

//       {outcome === 'LOST' && (
//         <>
//           <label style={labelStyle}>Loss reason *</label>
//           <select value={reason} onChange={e => setReason(e.target.value)} style={inputStyle}>
//             <option value="">Select reason…</option>
//             <option value="Price">Price</option>
//             <option value="Timing / no longer active">Timing / no longer active</option>
//             <option value="Lost to competitor">Lost to competitor</option>
//             <option value="No budget">No budget</option>
//             <option value="Disqualified / poor fit">Disqualified / poor fit</option>
//             <option value="No response">No response</option>
//           </select>
//           {reason === 'Lost to competitor' && (
//             <>
//               <label style={labelStyle}>Competitor</label>
//               <input
//                 value={competitor}
//                 onChange={e => setCompetitor(e.target.value)}
//                 placeholder="Competitor name"
//                 style={inputStyle}
//               />
//             </>
//           )}
//         </>
//       )}

//       {outcome === 'WON' && (
//         <>
//           <label style={labelStyle}>Order / PO reference (optional)</label>
//           <input
//             value={reason}
//             onChange={e => setReason(e.target.value)}
//             placeholder="e.g. PO-2026-041"
//             style={inputStyle}
//           />
//         </>
//       )}

//       {error && <p style={{ fontSize: 12.5, color: '#A02B1F', margin: '4px 0 8px' }}>{error}</p>}

//       <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
//         <button
//           onClick={onDismiss}
//           disabled={busy}
//           style={{
//             padding: '8px 14px', backgroundColor: '#fff', color: '#161614',
//             border: '1px solid #DDD7C6', borderRadius: 7,
//             fontSize: 13, fontWeight: 600, cursor: 'pointer',
//           }}
//         >
//           Cancel
//         </button>
//         <button
//           onClick={() => outcome && onConfirm(outcome, reason.trim(), competitor.trim() || undefined)}
//           disabled={!canConfirm || busy}
//           style={{
//             padding: '8px 14px',
//             backgroundColor: !canConfirm ? '#C9C2AC' : outcome === 'WON' ? '#3D6B1C' : '#A02B1F',
//             color: '#fff', border: 'none', borderRadius: 7,
//             fontSize: 13, fontWeight: 600,
//             cursor: canConfirm && !busy ? 'pointer' : 'default',
//             opacity: busy ? 0.7 : 1,
//           }}
//         >
//           {busy ? 'Closing…' : outcome === 'WON' ? 'Close as Won' : 'Close as Lost'}
//         </button>
//       </div>
//     </Modal>
//   )
// }

// const labelStyle: React.CSSProperties = {
//   display: 'block', fontSize: 11, fontWeight: 700, color: '#6A675F',
//   letterSpacing: '0.05em', textTransform: 'uppercase', margin: '4px 0 5px',
// }
// const inputStyle: React.CSSProperties = {
//   width: '100%', padding: '8px 10px', marginBottom: 10,
//   backgroundColor: '#fff', border: '1px solid #DDD7C6',
//   borderRadius: 6, fontSize: 13, color: '#161614', outline: 'none',
// }

// function Modal({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
//   return (
//     <div
//       onClick={onDismiss}
//       style={{
//         position: 'fixed', inset: 0, backgroundColor: 'rgba(22,22,20,0.45)',
//         display: 'flex', alignItems: 'center', justifyContent: 'center',
//         zIndex: 60, padding: 20,
//       }}
//     >
//       <div onClick={e => e.stopPropagation()} style={{
//         backgroundColor: '#fff', borderRadius: 12, padding: 22,
//         maxWidth: 400, width: '100%', boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
//       }}>
//         {children}
//       </div>
//     </div>
//   )
// }

// // ── Facts rail ─────────────────────────────────────────────────────────────────

// function FactsRail({ lead, stage }: { lead: Lead; stage: string }) {
//   const L = lead as any
//   return (
//     <div>
//       <SectionHeader title="Facts" />
//       <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
//         <Fact label="Stage" value={stage} />
//         <Fact label="Lead type" value={L.leadType ?? 'Prospect'} />
//         <Fact label="Owner" value={lead.owner ?? 'Unassigned'} />
//         <Fact label="Value" value={formatINR(lead.value)} mono />
//         <Fact label="Est. close" value={lead.estClose ?? '—'} mono />
//         <Fact label="Days in stage" value={`${lead.daysInStage}d`} />
//         {L.captureSource && <Fact label="Source" value={L.captureSource} />}
//         {L.referredBy && <Fact label="Referred by" value={L.referredBy} />}
//       </div>

//       {/* Capture notes — entered at quick capture / triage */}
//       {L.initialNotes && (
//         <div style={{ marginTop: 24 }}>
//           <SectionHeader title="Capture notes" />
//           <div style={{
//             marginTop: 12, padding: '12px 14px',
//             backgroundColor: '#FBF8EF',
//             border: '1px solid #E8E3D2', borderLeft: '3px solid #C9A24E',
//             borderRadius: 8,
//             fontSize: 12.5, color: '#363633', lineHeight: 1.6,
//             whiteSpace: 'pre-wrap',
//           }}>
//             {L.initialNotes}
//           </div>
//         </div>
//       )}

//       {lead.contact && (
//         <div style={{ marginTop: 24 }}>
//           <SectionHeader title="Primary contact" />
//           <div style={{
//             marginTop: 12, padding: '12px 14px',
//             backgroundColor: '#fff',
//             border: '1px solid #DDD7C6', borderRadius: 8,
//           }}>
//             <div style={{ fontSize: 13.5, fontWeight: 600 }}>{lead.contact.name}</div>
//             <div style={{ fontSize: 12, color: '#6A675F', marginTop: 2 }}>{lead.contact.role}</div>
//             {lead.contact.email && (
//               <div style={{ marginTop: 8 }}>
//                 <span style={{
//                   fontSize: 11.5, color: '#0E5550',
//                   display: 'flex', alignItems: 'center', gap: 5,
//                 }}>
//                   <Mail size={11} strokeWidth={2} />
//                   {lead.contact.email}
//                 </span>
//               </div>
//             )}
//             {(lead.contact as any).phone && (
//               <div style={{ marginTop: 6 }}>
//                 <span style={{ fontSize: 11.5, color: '#0E5550', display: 'flex', alignItems: 'center', gap: 5 }}>
//                   <Phone size={11} strokeWidth={2} />
//                   {(lead.contact as any).phone}
//                 </span>
//               </div>
//             )}
//           </div>
//         </div>
//       )}
//     </div>
//   )
// }

// function ActivitySection({ activities }: { activities: Activity[] }) {
//   return (
//     <div>
//       <SectionHeader title="Activity" meta={`${activities.length} entries`} />
//       <div style={{ marginTop: 14 }}>
//         {activities.length === 0 ? (
//           <p style={{ fontSize: 13, color: '#A39F94' }}>No activity yet.</p>
//         ) : (
//           activities.map((a, i) => (
//             <ActivityRow key={i} activity={a} isLast={i === activities.length - 1} />
//           ))
//         )}
//       </div>
//     </div>
//   )
// }

// function Chip({ children, color, bg, border }: {
//   children: React.ReactNode
//   color: string
//   bg: string
//   border?: boolean
// }) {
//   return (
//     <span style={{
//       fontSize: 11.5, fontWeight: 600,
//       padding: '3px 8px', borderRadius: 4,
//       color, backgroundColor: bg,
//       display: 'inline-flex', alignItems: 'center', gap: 3,
//       border: border ? '1px solid #DDD7C6' : 'none',
//     }}>
//       {children}
//     </span>
//   )
// }

// function SectionHeader({ title, meta }: { title: string; meta?: string }) {
//   return (
//     <div style={{
//       display: 'flex', alignItems: 'baseline',
//       justifyContent: 'space-between',
//       paddingBottom: 7, borderBottom: '1.5px solid #161614',
//     }}>
//       <span style={{
//         fontSize: 10.5, fontWeight: 700,
//         letterSpacing: '0.1em', textTransform: 'uppercase',
//       }}>
//         {title}
//       </span>
//       {meta && (
//         <span style={{ fontSize: 11, color: '#6A675F', fontFamily: 'monospace' }}>
//           {meta}
//         </span>
//       )}
//     </div>
//   )
// }

// function Fact({ label, value, mono }: {
//   label: string; value: string; mono?: boolean
// }) {
//   return (
//     <div style={{
//       display: 'flex', justifyContent: 'space-between', alignItems: 'center',
//       paddingBottom: 10, borderBottom: '1px solid #E8E3D2',
//     }}>
//       <span style={{ fontSize: 11.5, color: '#6A675F', fontWeight: 500 }}>{label}</span>
//       <span style={{
//         fontSize: mono ? 13 : 12.5, fontWeight: 600, color: '#161614',
//         fontFamily: mono ? 'monospace' : 'inherit',
//       }}>
//         {value}
//       </span>
//     </div>
//   )
// }

// function ActivityRow({ activity, isLast }: {
//   activity: Activity; isLast: boolean
// }) {
//   const colorMap: Record<string, string> = {
//     email: '#1E3A6B',
//     meeting: '#0E5550',
//     whatsapp: '#4A7920',
//     call: '#B8541E',
//     system: '#6A675F',
//     document: '#5B3B6F',
//   }
//   const color = colorMap[activity.type] ?? '#6A675F'

//   return (
//     <div style={{ display: 'flex', gap: 12, position: 'relative' }}>
//       <div style={{ position: 'relative', flexShrink: 0 }}>
//         <div style={{
//           width: 28, height: 28, borderRadius: '50%',
//           backgroundColor: '#fff', border: `1.5px solid ${color}`,
//           display: 'flex', alignItems: 'center', justifyContent: 'center',
//           fontSize: 10, fontWeight: 700, color,
//           position: 'relative', zIndex: 2,
//         }}>
//           {activity.type[0].toUpperCase()}
//         </div>
//         {!isLast && (
//           <div style={{
//             position: 'absolute', top: 28, left: 13,
//             width: 1.5, height: 'calc(100% + 4px)',
//             backgroundColor: '#DDD7C6',
//           }} />
//         )}
//       </div>
//       <div style={{ flex: 1, paddingBottom: 20 }}>
//         <div style={{
//           display: 'flex', justifyContent: 'space-between',
//           marginBottom: 4, flexWrap: 'wrap', gap: 4,
//         }}>
//           <span style={{ fontSize: 12.5, fontWeight: 600 }}>{activity.who}</span>
//           <span style={{ fontSize: 11, color: '#A39F94', fontFamily: 'monospace' }}>
//             {activity.when}
//           </span>
//         </div>
//         <div style={{ fontSize: 12.5, color: '#363633', lineHeight: 1.55 }}>
//           {activity.summary}
//         </div>
//         <div style={{ marginTop: 5, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
//           <span style={{
//             fontSize: 10.5, color: '#6A675F',
//             padding: '2px 6px', backgroundColor: '#EDE7D8', borderRadius: 3,
//           }}>
//             {activity.channel}
//           </span>
//           {activity.outcome && (
//             <span style={{
//               fontSize: 10.5, fontWeight: 600,
//               padding: '2px 6px', borderRadius: 3,
//               color: activity.outcome === 'positive'
//                 ? '#3D6B1C' : activity.outcome === 'concern'
//                   ? '#751A11' : '#7A4A0E',
//               backgroundColor: activity.outcome === 'positive'
//                 ? '#DDE9C9' : activity.outcome === 'concern'
//                   ? '#F0D5D0' : '#F3E2BE',
//             }}>
//               {activity.outcome}
//             </span>
//           )}
//         </div>
//         {activity.nextStep && (
//           <div style={{
//             marginTop: 8, padding: '6px 10px',
//             backgroundColor: '#F5E0CC', borderRadius: 5,
//             fontSize: 12, color: '#6F2F0E',
//           }}>
//             <strong>Next:</strong> {activity.nextStep.description}
//             <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11 }}>
//               {activity.nextStep.due}
//             </span>
//           </div>
//         )}
//       </div>
//     </div>
//   )
// }
import { useState, useEffect } from 'react'
import { ArrowLeft, MapPin, Lock, Shield, Mail, Plus, Phone, Trash2, ArrowRight, Trophy, XCircle, Pencil } from 'lucide-react'
import type { Lead, Activity } from '../../types'
import { formatINR, getVerticalColor } from '../../lib/utils'
import { api } from '../../lib/api'
import { PIPELINE_STAGES, canTransition, nextStage, isTerminal } from '../../lib/pipeline'
import BottomDrawer from './BottomDrawer'
import { useIsMobile } from '../../hooks/useIsMobile'

interface Props {
  lead: Lead
  onBack: () => void
  onDeleted?: () => void
  /** Called after a stage change or edit so the parent can reload leads. */
  onChanged?: () => void
  /** Logged-in user's display name — used as actor on activities/deletes. */
  currentUser?: string
}

export default function LeadDetail({ lead, onBack, onDeleted, onChanged, currentUser }: Props) {
  const isMobile = useIsMobile()
  const accentColor = getVerticalColor(lead.vertical ?? '')
  const [showDrawer, setShowDrawer] = useState(false)
  const [localActivities, setLocalActivities] = useState<Activity[]>([])
  const [apiActivities, setApiActivities] = useState<Activity[]>([])
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const actor = currentUser ?? 'Unknown'

  // Stage is kept locally so the UI updates instantly after a move/close.
  const [stage, setStage] = useState(lead.stage)
  useEffect(() => { setStage(lead.stage) }, [lead.id, lead.stage])

  // Move / close / edit modals
  const [showMove, setShowMove] = useState(false)
  const [moveTarget, setMoveTarget] = useState<string>('')
  const [showClose, setShowClose] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [transitionError, setTransitionError] = useState<string | null>(null)

  const atNegotiation = stage === 'Negotiation'
  const closedOut = isTerminal(stage)

  // All stages this lead can legally move to (forwards AND backwards)
  const moveTargets = (PIPELINE_STAGES as readonly string[]).filter(s => canTransition(stage, s))

  const openMove = () => {
    setMoveTarget(nextStage(stage) ?? moveTargets[0] ?? '')
    setTransitionError(null)
    setShowMove(true)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.deleteLead(lead.id, { actorName: actor })
      onDeleted?.()
    } catch (err) {
      console.error('Failed to delete lead', err)
      alert('Could not delete this lead. Please try again.')
      setDeleting(false)
    }
  }

  const handleMove = async () => {
    if (!moveTarget || moveTarget === stage) return
    setTransitioning(true)
    setTransitionError(null)
    try {
      await api.advanceStage(lead.id, { toStage: moveTarget })
      const backwards = (PIPELINE_STAGES as readonly string[]).indexOf(moveTarget)
        < (PIPELINE_STAGES as readonly string[]).indexOf(stage)
      setLocalActivities(prev => [{
        type: 'system', who: actor, when: 'just now',
        summary: backwards ? `Stage moved back to ${moveTarget}` : `Stage advanced to ${moveTarget}`,
        channel: 'System',
      }, ...prev])
      setStage(moveTarget)
      setShowMove(false)
      onChanged?.()
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : 'Move failed')
    } finally {
      setTransitioning(false)
    }
  }

  const handleClose = async (outcome: 'WON' | 'LOST', reason: string, competitorName?: string) => {
    setTransitioning(true)
    setTransitionError(null)
    try {
      await api.closeLead(lead.id, {
        outcome,
        reason: reason || undefined,
        competitorName: competitorName || undefined,
      })
      const newStage = outcome === 'WON' ? 'Closed Won' : 'Closed Lost'
      setStage(newStage)
      setShowClose(false)
      setLocalActivities(prev => [{
        type: 'system', who: actor, when: 'just now',
        summary: `Lead closed — ${outcome === 'WON' ? 'Won 🎉' : 'Lost'}${reason ? ` · ${reason}` : ''}`,
        channel: 'System',
      }, ...prev])
      onChanged?.()
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : 'Close failed')
    } finally {
      setTransitioning(false)
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

  const primaryLabel = closedOut ? stage : atNegotiation ? 'Close lead' : 'Move stage →'

  const onPrimaryAction = () => {
    if (closedOut) return
    if (atNegotiation) { setTransitionError(null); setShowClose(true) }
    else openMove()
  }

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
              {closedOut && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11.5, fontWeight: 700,
                  color: stage === 'Closed Won' ? '#3D6B1C' : '#751A11',
                  backgroundColor: stage === 'Closed Won' ? '#DDE9C9' : '#F0D5D0',
                  padding: '2.5px 8px', borderRadius: 4,
                }}>
                  {stage === 'Closed Won' ? <Trophy size={10} strokeWidth={2.25} /> : <XCircle size={10} strokeWidth={2.25} />}
                  {stage}
                </span>
              )}
            </div>

            {/* Company name */}
            <h1 style={{
              fontSize: isMobile ? 19 : 24, fontWeight: 600,
              letterSpacing: '-0.02em', margin: 0, lineHeight: 1.15,
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
              {lead.contact?.name && (
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
              <button
                onClick={onPrimaryAction}
                disabled={closedOut}
                style={{
                  padding: '8px 14px',
                  backgroundColor: closedOut ? '#C9C2AC' : atNegotiation ? '#0E5550' : '#C45A1E',
                  color: '#fff',
                  border: 'none', borderRadius: 6,
                  fontSize: 12.5, fontWeight: 600,
                  cursor: closedOut ? 'default' : 'pointer',
                }}
              >
                {primaryLabel}
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
            <FactsRail lead={lead} stage={stage} onEdit={() => setShowEdit(true)} />
            <ActivitySection activities={allActivities} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 32, maxWidth: 1000 }}>
            <ActivitySection activities={allActivities} />
            <FactsRail lead={lead} stage={stage} onEdit={() => setShowEdit(true)} />
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
          <button
            onClick={onPrimaryAction}
            disabled={closedOut}
            style={{
              flex: 1, padding: '11px 0',
              backgroundColor: closedOut ? '#C9C2AC' : atNegotiation ? '#0E5550' : '#C45A1E',
              color: '#fff',
              border: 'none', borderRadius: 7,
              fontSize: 13, fontWeight: 600,
              cursor: closedOut ? 'default' : 'pointer',
            }}
          >
            {primaryLabel}
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
                actorName: actor,
              })
              setLocalActivities(prev => [{
                ...activity,
                who: actor,
                when: 'just now',
              }, ...prev])
            } catch (err) {
              console.error('Failed to log activity', err)
            }
          }}
        />
      )}

      {/* Move stage modal — forward OR backward */}
      {showMove && (
        <Modal onDismiss={() => !transitioning && setShowMove(false)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', backgroundColor: '#F5E0CC',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <ArrowRight size={16} strokeWidth={2} style={{ color: '#C45A1E' }} />
            </div>
            <h3 style={{ fontSize: 15.5, fontWeight: 600, color: '#161614', margin: 0 }}>
              Move stage
            </h3>
          </div>
          <p style={{ fontSize: 13, color: '#6A675F', lineHeight: 1.5, margin: '0 0 10px' }}>
            <strong style={{ color: '#363633' }}>{lead.company}</strong> is currently in{' '}
            <strong style={{ color: '#363633' }}>{stage}</strong>. Move it to:
          </p>
          <select
            value={moveTarget}
            onChange={e => setMoveTarget(e.target.value)}
            style={{ ...inputStyle, marginBottom: 14 }}
          >
            {moveTargets.map(s => (
              <option key={s} value={s}>
                {s}{s === nextStage(stage) ? '  (next)' : ''}
              </option>
            ))}
          </select>
          {moveTarget && (PIPELINE_STAGES as readonly string[]).indexOf(moveTarget) < (PIPELINE_STAGES as readonly string[]).indexOf(stage) && (
            <p style={{ fontSize: 12, color: '#7A4A0E', backgroundColor: '#F3E2BE', padding: '6px 10px', borderRadius: 5, margin: '0 0 12px' }}>
              Moving backwards — the SLA clock and days-in-stage reset.
            </p>
          )}
          {transitionError && (
            <p style={{ fontSize: 12.5, color: '#A02B1F', margin: '0 0 12px' }}>{transitionError}</p>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowMove(false)}
              disabled={transitioning}
              style={{
                padding: '8px 14px', backgroundColor: '#fff', color: '#161614',
                border: '1px solid #DDD7C6', borderRadius: 7,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleMove}
              disabled={transitioning || !moveTarget}
              style={{
                padding: '8px 14px', backgroundColor: '#C45A1E', color: '#fff',
                border: 'none', borderRadius: 7,
                fontSize: 13, fontWeight: 600,
                cursor: transitioning ? 'default' : 'pointer',
                opacity: transitioning ? 0.7 : 1,
              }}
            >
              {transitioning ? 'Moving…' : `Move to ${moveTarget}`}
            </button>
          </div>
        </Modal>
      )}

      {/* Close lead modal (Negotiation → Closed Won / Closed Lost) */}
      {showClose && (
        <CloseLeadModal
          company={lead.company}
          busy={transitioning}
          error={transitionError}
          onDismiss={() => !transitioning && setShowClose(false)}
          onConfirm={handleClose}
          onMoveInstead={() => { setShowClose(false); openMove() }}
        />
      )}

      {/* Edit facts modal — value & est. close */}
      {showEdit && (
        <EditFactsModal
          lead={lead}
          onDismiss={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); onChanged?.() }}
        />
      )}

      {showDelete && (
        <Modal onDismiss={() => !deleting && setShowDelete(false)}>
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
        </Modal>
      )}
    </div>
  )
}

// ── Edit facts modal (value + est. close) ─────────────────────────────────────

function EditFactsModal({ lead, onDismiss, onSaved }: {
  lead: Lead
  onDismiss: () => void
  onSaved: () => void
}) {
  const [value, setValue] = useState<string>(lead.value ? String(lead.value) : '')
  const [estClose, setEstClose] = useState<string>(
    lead.estClose ? String(lead.estClose).slice(0, 10) : ''
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    setSaving(true); setErr(null)
    try {
      await api.updateLead(lead.id, {
        value: value === '' ? null : Number(value),
        estClose: estClose || null,
      })
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
      setSaving(false)
    }
  }

  return (
    <Modal onDismiss={() => !saving && onDismiss()}>
      <h3 style={{ fontSize: 15.5, fontWeight: 600, color: '#161614', margin: '0 0 4px' }}>
        Edit deal facts
      </h3>
      <p style={{ fontSize: 12.5, color: '#6A675F', margin: '0 0 16px' }}>
        {lead.company}
      </p>

      <label style={labelStyle}>Estimated value (₹)</label>
      <input
        type="number" min={0} step={1000}
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="e.g. 5000000 for ₹50L"
        style={inputStyle}
      />
      {value !== '' && Number(value) > 0 && (
        <p style={{ fontSize: 11.5, color: '#0E5550', margin: '-4px 0 10px', fontFamily: 'monospace' }}>
          = {formatINR(Number(value))}
        </p>
      )}

      <label style={labelStyle}>Estimated close date</label>
      <input
        type="date"
        value={estClose}
        onChange={e => setEstClose(e.target.value)}
        style={inputStyle}
      />

      {err && <p style={{ fontSize: 12.5, color: '#A02B1F', margin: '4px 0 8px' }}>{err}</p>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button
          onClick={onDismiss}
          disabled={saving}
          style={{
            padding: '8px 14px', backgroundColor: '#fff', color: '#161614',
            border: '1px solid #DDD7C6', borderRadius: 7,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: '8px 14px', backgroundColor: '#0E5550', color: '#fff',
            border: 'none', borderRadius: 7,
            fontSize: 13, fontWeight: 600,
            cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </Modal>
  )
}

// ── Close-lead modal ───────────────────────────────────────────────────────────

function CloseLeadModal({ company, busy, error, onDismiss, onConfirm, onMoveInstead }: {
  company: string
  busy: boolean
  error: string | null
  onDismiss: () => void
  onConfirm: (outcome: 'WON' | 'LOST', reason: string, competitorName?: string) => void
  onMoveInstead: () => void
}) {
  const [outcome, setOutcome] = useState<'WON' | 'LOST' | null>(null)
  const [reason, setReason] = useState('')
  const [competitor, setCompetitor] = useState('')

  const canConfirm = outcome === 'WON' || (outcome === 'LOST' && reason.trim().length > 0)

  return (
    <Modal onDismiss={onDismiss}>
      <h3 style={{ fontSize: 15.5, fontWeight: 600, color: '#161614', margin: '0 0 6px' }}>
        Close lead
      </h3>
      <p style={{ fontSize: 13, color: '#6A675F', lineHeight: 1.5, margin: '0 0 14px' }}>
        How did <strong style={{ color: '#363633' }}>{company}</strong> end?
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button
          onClick={() => setOutcome('WON')}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 8, cursor: 'pointer',
            border: outcome === 'WON' ? '2px solid #3D6B1C' : '1px solid #DDD7C6',
            backgroundColor: outcome === 'WON' ? '#DDE9C9' : '#fff',
            color: '#3D6B1C', fontSize: 13.5, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Trophy size={14} strokeWidth={2.25} />
          Won
        </button>
        <button
          onClick={() => setOutcome('LOST')}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 8, cursor: 'pointer',
            border: outcome === 'LOST' ? '2px solid #751A11' : '1px solid #DDD7C6',
            backgroundColor: outcome === 'LOST' ? '#F0D5D0' : '#fff',
            color: '#751A11', fontSize: 13.5, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <XCircle size={14} strokeWidth={2.25} />
          Lost
        </button>
      </div>

      {outcome === 'LOST' && (
        <>
          <label style={labelStyle}>Loss reason *</label>
          <select value={reason} onChange={e => setReason(e.target.value)} style={inputStyle}>
            <option value="">Select reason…</option>
            <option value="Price">Price</option>
            <option value="Timing / no longer active">Timing / no longer active</option>
            <option value="Lost to competitor">Lost to competitor</option>
            <option value="No budget">No budget</option>
            <option value="Disqualified / poor fit">Disqualified / poor fit</option>
            <option value="No response">No response</option>
          </select>
          {reason === 'Lost to competitor' && (
            <>
              <label style={labelStyle}>Competitor</label>
              <input
                value={competitor}
                onChange={e => setCompetitor(e.target.value)}
                placeholder="Competitor name"
                style={inputStyle}
              />
            </>
          )}
        </>
      )}

      {outcome === 'WON' && (
        <>
          <label style={labelStyle}>Order / PO reference (optional)</label>
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. PO-2026-041"
            style={inputStyle}
          />
        </>
      )}

      {error && <p style={{ fontSize: 12.5, color: '#A02B1F', margin: '4px 0 8px' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <button
          onClick={onMoveInstead}
          disabled={busy}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: '#0E5550', fontWeight: 600, padding: 0,
            textDecoration: 'underline',
          }}
        >
          Move to a different stage instead
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onDismiss}
            disabled={busy}
            style={{
              padding: '8px 14px', backgroundColor: '#fff', color: '#161614',
              border: '1px solid #DDD7C6', borderRadius: 7,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => outcome && onConfirm(outcome, reason.trim(), competitor.trim() || undefined)}
            disabled={!canConfirm || busy}
            style={{
              padding: '8px 14px',
              backgroundColor: !canConfirm ? '#C9C2AC' : outcome === 'WON' ? '#3D6B1C' : '#A02B1F',
              color: '#fff', border: 'none', borderRadius: 7,
              fontSize: 13, fontWeight: 600,
              cursor: canConfirm && !busy ? 'pointer' : 'default',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Closing…' : outcome === 'WON' ? 'Close as Won' : 'Close as Lost'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#6A675F',
  letterSpacing: '0.05em', textTransform: 'uppercase', margin: '4px 0 5px',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', marginBottom: 10,
  backgroundColor: '#fff', border: '1px solid #DDD7C6',
  borderRadius: 6, fontSize: 13, color: '#161614', outline: 'none',
}

function Modal({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(22,22,20,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 60, padding: 20,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor: '#fff', borderRadius: 12, padding: 22,
        maxWidth: 400, width: '100%', boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
      }}>
        {children}
      </div>
    </div>
  )
}

// ── Facts rail ─────────────────────────────────────────────────────────────────

function FactsRail({ lead, stage, onEdit }: { lead: Lead; stage: string; onEdit: () => void }) {
  const L = lead as any
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingBottom: 7, borderBottom: '1.5px solid #161614',
      }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Facts
        </span>
        <button
          onClick={onEdit}
          title="Edit value & est. close"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 600, color: '#0E5550', padding: 0,
          }}
        >
          <Pencil size={11} strokeWidth={2} />
          Edit
        </button>
      </div>
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Fact label="Stage" value={stage} />
        <Fact label="Lead type" value={L.leadType ?? 'Prospect'} />
        <Fact label="Owner" value={lead.owner ?? 'Unassigned'} />
        <Fact label="Value" value={formatINR(lead.value)} mono />
        <Fact
          label="Est. close"
          value={lead.estClose ? new Date(lead.estClose).toLocaleDateString('en-IN') : '—'}
          mono
        />
        <Fact label="Days in stage" value={`${lead.daysInStage}d`} />
        {L.captureSource && <Fact label="Source" value={L.captureSource} />}
        {L.referredBy && <Fact label="Referred by" value={L.referredBy} />}
      </div>

      {/* Capture notes — entered at quick capture / triage */}
      {L.initialNotes && (
        <div style={{ marginTop: 24 }}>
          <SectionHeader title="Capture notes" />
          <div style={{
            marginTop: 12, padding: '12px 14px',
            backgroundColor: '#FBF8EF',
            border: '1px solid #E8E3D2', borderLeft: '3px solid #C9A24E',
            borderRadius: 8,
            fontSize: 12.5, color: '#363633', lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}>
            {L.initialNotes}
          </div>
        </div>
      )}

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
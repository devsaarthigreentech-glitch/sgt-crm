// import { useState, useEffect } from 'react'
// import {
//   TrendingUp, AlertTriangle, Clock, Users,
//   CheckCircle, Package, ArrowRight, Plus,
//   LayoutGrid, Activity, ChevronRight, Truck
// } from 'lucide-react'
// import type { Lead } from '../../types'
// import { formatINR, getVerticalColor } from '../../lib/utils'
// import { useIsMobile } from '../../hooks/useIsMobile'
// import ErpInsights from './ErpInsights'

// interface Props {
//   leads: Lead[]
//   view: 'director' | 'sales'
//   userName?: string
//   onLeadClick: (lead: Lead) => void
//   navigate: (page: any) => void
// }

// const DIRECTOR_NAME = 'Aryan'
// const SALES_REP_NAME = 'Rohan Mehta'

// const STAGES = ['New', 'Allocated', 'Qualifying', 'Discovery', 'Proposal', 'Negotiation']
// const STAGE_COLORS: Record<string, string> = {
//   New: '#6A675F', Allocated: '#1E3A6B', Qualifying: '#A86A18',
//   Discovery: '#0E5550', Proposal: '#C45A1E', Negotiation: '#5B3B6F',
// }
// const VERTICALS = ['Industry', 'Marine', 'Vehicles', 'Small DG', 'Cross-vertical']

// function getGreeting(): string {
//   const h = new Date().getHours()
//   if (h < 12) return 'Good morning'
//   if (h < 17) return 'Good afternoon'
//   return 'Good evening'
// }

// function formatDate(): string {
//   return new Date().toLocaleDateString('en-IN', {
//     weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
//   })
// }

// // export default function HomeDashboard({ leads, onLeadClick, navigate }: Props) {
// //   const isMobile = useIsMobile()
// //   const [tab, setTab] = useState<'director' | 'sales'>('director')

// //   const activeLeads = leads.filter(l =>
// //     !['Closed Won', 'Closed Lost'].includes(l.stage)
// //   )

// //   return (
// //     <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

// //       {/* Header */}
// //       <header style={{
// //         padding: isMobile ? '14px 16px 12px' : '20px 28px 16px',
// //         borderBottom: '1px solid #DDD7C6',
// //         backgroundColor: '#F4F0E5', flexShrink: 0,
// //       }}>
// //         <div style={{ marginBottom: 14 }}>
// //           <h1 style={{
// //             fontSize: isMobile ? 19 : 23, fontWeight: 600,
// //             color: '#161614', letterSpacing: '-0.03em', margin: 0,
// //           }}>
// //             {getGreeting()},{' '}
// //             <span style={{ color: '#0E5550' }}>
// //               {tab === 'director' ? DIRECTOR_NAME : SALES_REP_NAME.split(' ')[0]}
// //             </span>
// //           </h1>
// //           <p style={{ fontSize: 12.5, color: '#6A675F', marginTop: 4 }}>
// //             {formatDate()} · Here's where things stand
// //           </p>
// //         </div>

// //         {/* Tab switcher */}
// //         <div style={{
// //           display: 'inline-flex', backgroundColor: '#EDE7D8',
// //           borderRadius: 8, padding: 3, gap: 2,
// //         }}>
// //           {([
// //             { id: 'director', label: 'Director view' },
// //             { id: 'sales',    label: 'My dashboard'  },
// //           ] as const).map(t => (
// //             <button
// //               key={t.id}
// //               onClick={() => setTab(t.id)}
// //               style={{
// //                 padding: '6px 14px', borderRadius: 6, border: 'none',
// //                 fontFamily: 'inherit', fontSize: 12.5, fontWeight: tab === t.id ? 700 : 500,
// //                 backgroundColor: tab === t.id ? '#fff' : 'transparent',
// //                 color: tab === t.id ? '#161614' : '#6A675F',
// //                 cursor: 'pointer',
// //                 boxShadow: tab === t.id ? '0 1px 3px rgba(22,22,20,0.08)' : 'none',
// //               }}
// //             >
// //               {t.label}
// //             </button>
// //           ))}
// //         </div>
// //       </header>

// //       {/* Content */}
// //       <div style={{
// //         flex: 1, overflowY: 'auto',
// //         padding: isMobile ? '16px 16px 80px' : '24px 28px 40px',
// //         backgroundColor: '#F4F0E5',
// //       }}>
// //         {tab === 'director'
// //           ? <DirectorDashboard leads={leads} activeLeads={activeLeads} isMobile={isMobile} onLeadClick={onLeadClick} navigate={navigate} />
// //           : <SalesRepDashboard leads={leads} activeLeads={activeLeads} isMobile={isMobile} onLeadClick={onLeadClick} navigate={navigate} />
// //         }
// //       </div>
// //     </div>
// //   )
// // }

// // ─────────────────────────────────────────────
// // Director Dashboard
// // ─────────────────────────────────────────────

// export default function HomeDashboard({ leads, view, userName, onLeadClick, navigate }: Props) {
//   const isMobile = useIsMobile()

//   const activeLeads = leads.filter(l =>
//     !['Closed Won', 'Closed Lost'].includes(l.stage)
//   )

//   const name = (userName ?? (view === 'director' ? DIRECTOR_NAME : SALES_REP_NAME)).split(' ')[0]

//   return (
//     <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

//       {/* Header */}
//       <header style={{
//         padding: isMobile ? '14px 16px 12px' : '20px 28px 16px',
//         borderBottom: '1px solid #DDD7C6',
//         backgroundColor: '#F4F0E5', flexShrink: 0,
//       }}>
//         <h1 style={{
//           fontSize: isMobile ? 19 : 23, fontWeight: 600,
//           color: '#161614', letterSpacing: '-0.03em', margin: 0,
//         }}>
//           {getGreeting()},{' '}
//           <span style={{ color: '#0E5550' }}>{name}</span>
//         </h1>
//         <p style={{ fontSize: 12.5, color: '#6A675F', marginTop: 4 }}>
//           {formatDate()} · {view === 'director' ? "Here's where things stand" : 'Your leads and tasks'}
//         </p>
//       </header>

//       {/* Content */}
//       <div style={{
//         flex: 1, overflowY: 'auto',
//         padding: isMobile ? '16px 16px 80px' : '24px 28px 40px',
//         backgroundColor: '#F4F0E5',
//       }}>
//         {view === 'director'
//           ? <DirectorDashboard leads={leads} activeLeads={activeLeads} isMobile={isMobile} onLeadClick={onLeadClick} navigate={navigate} />
//           : <SalesRepDashboard leads={leads} activeLeads={activeLeads} isMobile={isMobile} onLeadClick={onLeadClick} navigate={navigate} repName={userName ?? SALES_REP_NAME} />
//         }
//       </div>
//     </div>
//   )
// }

// function DirectorDashboard({ leads, activeLeads, isMobile, onLeadClick, navigate }: {
//   leads: Lead[], activeLeads: Lead[], isMobile: boolean,
//   onLeadClick: (l: Lead) => void, navigate: (p: any) => void,
// }) {
//   const totalPipeline = activeLeads.reduce((s, l) => s + l.value, 0)
//   const closedWon     = leads.filter(l => l.stage === 'Closed Won')
//   const closedWonValue = closedWon.reduce((s, l) => s + l.value, 0)
//   const slaBreaches   = activeLeads.filter(l => l.slaState === 'breach')
//   const slaRisk       = activeLeads.filter(l => l.slaState === 'risk')
//   const triageLeads   = activeLeads.filter(l => !l.owner || l.owner === 'Unassigned')

//   const alerts = [
//     ...slaBreaches.map(l => ({ type: 'breach' as const, lead: l,
//       message: `SLA breach · ${l.daysInStage}d in ${l.stage}` })),
//     ...slaRisk.map(l => ({ type: 'risk' as const, lead: l,
//       message: `SLA risk · ${l.daysInStage}d in ${l.stage}` })),
//     ...(triageLeads.length > 0 ? [{
//       type: 'triage' as const, lead: null,
//       message: `${triageLeads.length} lead${triageLeads.length > 1 ? 's' : ''} in triage queue — unclassified`,
//     }] : []),
//   ]

//   return (
//     <div style={{ maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 24 }}>

//       {/* Key numbers */}
//       <div style={{
//         display: 'grid',
//         gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr',
//         gap: 10,
//       }}>
//         <StatCard
//           label="Active pipeline"
//           value={formatINR(totalPipeline)}
//           sub={`${activeLeads.length} leads`}
//           accent="#0E5550"
//           icon={<TrendingUp size={16} strokeWidth={2} />}
//         />
//         <StatCard
//           label="Closed won"
//           value={formatINR(closedWonValue)}
//           sub={`${closedWon.length} deal${closedWon.length !== 1 ? 's' : ''}`}
//           accent="#3D6B1C"
//           icon={<CheckCircle size={16} strokeWidth={2} />}
//         />
//         <StatCard
//           label="SLA issues"
//           value={String(slaBreaches.length + slaRisk.length)}
//           sub={`${slaBreaches.length} breach · ${slaRisk.length} at risk`}
//           accent={slaBreaches.length > 0 ? '#A02B1F' : '#A86A18'}
//           icon={<AlertTriangle size={16} strokeWidth={2} />}
//         />
//         <StatCard
//           label="Stock value"
//           value="—"
//           sub="Connects to inventory · Phase 2"
//           accent="#5B3B6F"
//           icon={<Package size={16} strokeWidth={2} />}
//           muted
//         />
//       </div>

//       <ErpInsights />

//       <UpcomingOrders />

//       {/* Alerts */}
//       {alerts.length > 0 && (
//         <Section title="Needs attention">
//           <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
//             {alerts.map((alert, i) => (
//               <div
//                 key={i}
//                 onClick={() => alert.lead && onLeadClick(alert.lead)}
//                 style={{
//                   display: 'flex', alignItems: 'center', gap: 12,
//                   padding: '11px 14px',
//                   backgroundColor: '#fff',
//                   border: `1px solid ${alert.type === 'breach' ? '#F0D5D0' : '#F3E2BE'}`,
//                   borderLeft: `3px solid ${alert.type === 'breach' ? '#A02B1F' : alert.type === 'risk' ? '#A86A18' : '#1E3A6B'}`,
//                   borderRadius: 7,
//                   cursor: alert.lead ? 'pointer' : 'default',
//                 }}
//               >
//                 <div style={{ color: alert.type === 'breach' ? '#A02B1F' : alert.type === 'risk' ? '#A86A18' : '#1E3A6B' }}>
//                   {alert.type === 'triage'
//                     ? <Users size={15} strokeWidth={2} />
//                     : <AlertTriangle size={15} strokeWidth={2} />}
//                 </div>
//                 <div style={{ flex: 1 }}>
//                   {alert.lead && (
//                     <div style={{ fontSize: 13, fontWeight: 600, color: '#161614' }}>
//                       {alert.lead.company}
//                     </div>
//                   )}
//                   <div style={{ fontSize: 12, color: '#6A675F', marginTop: alert.lead ? 1 : 0 }}>
//                     {alert.message}
//                   </div>
//                 </div>
//                 {alert.type === 'triage' ? (
//                   <button
//                     onClick={e => { e.stopPropagation(); navigate('triage') }}
//                     style={{
//                       padding: '5px 10px', backgroundColor: '#EDE7D8',
//                       border: 'none', borderRadius: 5,
//                       fontSize: 11.5, fontWeight: 600, cursor: 'pointer', color: '#363633',
//                     }}
//                   >
//                     Review
//                   </button>
//                 ) : (
//                   <ChevronRight size={14} strokeWidth={2} style={{ color: '#A39F94' }} />
//                 )}
//               </div>
//             ))}
//           </div>
//         </Section>
//       )}

//       {/* Pipeline by stage */}
//       <Section title="Pipeline by stage">
//         <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
//           {STAGES.map(stage => {
//             const stageLeads = activeLeads.filter(l => l.stage === stage)
//             const stageValue = stageLeads.reduce((s, l) => s + l.value, 0)
//             const maxValue = Math.max(...STAGES.map(s =>
//               activeLeads.filter(l => l.stage === s).reduce((sum, l) => sum + l.value, 0)
//             ), 1)
//             const pct = (stageValue / maxValue) * 100

//             return (
//               <div key={stage} style={{
//                 display: 'flex', alignItems: 'center', gap: 12,
//                 padding: '9px 12px', backgroundColor: '#fff',
//                 borderRadius: 7, border: '1px solid #E8E3D2',
//               }}>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: isMobile ? 80 : 100, flexShrink: 0 }}>
//                   <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: STAGE_COLORS[stage] }} />
//                   <span style={{ fontSize: 12, fontWeight: 600, color: '#363633' }}>{stage}</span>
//                 </div>
//                 <div style={{ flex: 1, height: 6, backgroundColor: '#F4F0E5', borderRadius: 3, overflow: 'hidden' }}>
//                   <div style={{
//                     height: '100%', borderRadius: 3,
//                     backgroundColor: STAGE_COLORS[stage],
//                     width: `${pct}%`,
//                     transition: 'width 400ms ease',
//                   }} />
//                 </div>
//                 <div style={{ display: 'flex', gap: 12, flexShrink: 0, alignItems: 'center' }}>
//                   <span style={{
//                     fontFamily: 'monospace', fontSize: 12,
//                     fontWeight: 600, color: '#161614', minWidth: 60, textAlign: 'right',
//                   }}>
//                     {formatINR(stageValue)}
//                   </span>
//                   <span style={{
//                     fontSize: 11, color: '#A39F94', fontFamily: 'monospace',
//                     backgroundColor: '#EDE7D8', padding: '1px 6px', borderRadius: 3,
//                     minWidth: 24, textAlign: 'center',
//                   }}>
//                     {stageLeads.length}
//                   </span>
//                 </div>
//               </div>
//             )
//           })}
//         </div>
//       </Section>

//       {/* Pipeline by vertical */}
//       <Section title="Pipeline by vertical">
//         <div style={{
//           display: 'grid',
//           gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr',
//           gap: 8,
//         }}>
//           {VERTICALS.map(v => {
//             const vLeads = activeLeads.filter(l => l.vertical === v)
//             const vValue = vLeads.reduce((s, l) => s + l.value, 0)
//             const color = getVerticalColor(v)
//             if (vLeads.length === 0) return null
//             return (
//               <div key={v} style={{
//                 padding: '12px 14px', backgroundColor: '#fff',
//                 borderRadius: 8, border: '1px solid #E8E3D2',
//                 borderTop: `3px solid ${color}`,
//               }}>
//                 <div style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
//                   {v}
//                 </div>
//                 <div style={{ fontFamily: 'monospace', fontSize: 17, fontWeight: 700, color: '#161614', marginTop: 6, letterSpacing: '-0.02em' }}>
//                   {formatINR(vValue)}
//                 </div>
//                 <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 2 }}>
//                   {vLeads.length} lead{vLeads.length !== 1 ? 's' : ''}
//                 </div>
//               </div>
//             )
//           })}
//         </div>
//       </Section>

//       {/* Recent activity */}
//       <Section title="Recent activity" action={
//         <button
//           onClick={() => navigate('pipeline')}
//           style={{
//             fontSize: 11.5, color: '#0E5550', fontWeight: 600,
//             background: 'none', border: 'none', cursor: 'pointer',
//             display: 'flex', alignItems: 'center', gap: 3,
//           }}
//         >
//           View pipeline <ArrowRight size={11} strokeWidth={2.5} />
//         </button>
//       }>
//         <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
//           {activeLeads.slice(0, 5).map(lead => (
//             <div
//               key={lead.id}
//               onClick={() => onLeadClick(lead)}
//               style={{
//                 display: 'flex', alignItems: 'center', gap: 12,
//                 padding: '10px 12px', backgroundColor: '#fff',
//                 borderRadius: 7, border: '1px solid #E8E3D2',
//                 cursor: 'pointer',
//               }}
//               onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FAF7EE'}
//               onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
//             >
//               <div style={{
//                 width: 4, height: 32, borderRadius: 2,
//                 backgroundColor: getVerticalColor(lead.vertical ?? ''),
//                 flexShrink: 0,
//               }} />
//               <div style={{ flex: 1, minWidth: 0 }}>
//                 <div style={{ fontSize: 13, fontWeight: 600, color: '#161614' }}>{lead.company}</div>
//                 <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 1 }}>
//                   {lead.owner ?? 'Unassigned'} · {lead.stage}
//                 </div>
//               </div>
//               <div style={{ textAlign: 'right', flexShrink: 0 }}>
//                 <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#161614' }}>
//                   {formatINR(lead.value)}
//                 </div>
//                 {lead.slaState !== 'ok' && (
//                   <div style={{
//                     fontSize: 10.5, fontWeight: 600, marginTop: 2,
//                     color: lead.slaState === 'breach' ? '#A02B1F' : '#A86A18',
//                   }}>
//                     {lead.slaState === 'breach' ? '⚠ Breach' : '⚠ At risk'}
//                   </div>
//                 )}
//               </div>
//               <ChevronRight size={13} strokeWidth={2} style={{ color: '#A39F94' }} />
//             </div>
//           ))}
//         </div>
//       </Section>

//     </div>
//   )
// }

// // ─────────────────────────────────────────────
// // Sales Rep Dashboard
// // ─────────────────────────────────────────────

// function SalesRepDashboard({ leads, activeLeads, isMobile, onLeadClick, navigate, repName }: {
//   leads: Lead[], activeLeads: Lead[], isMobile: boolean,
//   onLeadClick: (l: Lead) => void, navigate: (p: any) => void, repName: string,
// }) {
//   const myLeads = activeLeads.filter(l => l.owner === repName)
//   const myPipeline = myLeads.reduce((s, l) => s + l.value, 0)
//   const myBreaches = myLeads.filter(l => l.slaState === 'breach')
//   const myRisk     = myLeads.filter(l => l.slaState === 'risk')

//   const needsAttention = [
//     ...myBreaches.map(l => ({
//       type: 'breach' as const, lead: l,
//       reason: `SLA breach · ${l.daysInStage}d in ${l.stage} · Log activity or advance`,
//     })),
//     ...myRisk.map(l => ({
//       type: 'risk' as const, lead: l,
//       reason: `SLA risk · ${l.daysInStage}d in ${l.stage}`,
//     })),
//   ]

//   return (
//     <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 24 }}>

//       {/* My numbers */}
//       <div style={{
//         display: 'grid',
//         gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr',
//         gap: 10,
//       }}>
//         <StatCard
//           label="My pipeline"
//           value={formatINR(myPipeline)}
//           sub={`${myLeads.length} leads`}
//           accent="#0E5550"
//           icon={<TrendingUp size={16} strokeWidth={2} />}
//         />
//         <StatCard
//           label="SLA issues"
//           value={String(myBreaches.length + myRisk.length)}
//           sub={`${myBreaches.length} breach · ${myRisk.length} at risk`}
//           accent={myBreaches.length > 0 ? '#A02B1F' : '#A86A18'}
//           icon={<Clock size={16} strokeWidth={2} />}
//         />
//         <StatCard
//           label="Closed won"
//           value={String(leads.filter(l => l.stage === 'Closed Won' && l.owner === repName).length)}
//           sub="deals this month"
//           accent="#3D6B1C"
//           icon={<CheckCircle size={16} strokeWidth={2} />}
//         />
//         <StatCard
//           label="Total leads"
//           value={String(myLeads.length)}
//           sub="active in pipeline"
//           accent="#1E3A6B"
//           icon={<Activity size={16} strokeWidth={2} />}
//         />
//       </div>

//       {/* Needs attention */}
//       {needsAttention.length > 0 && (
//         <Section title="Needs attention">
//           <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
//             {needsAttention.map((item, i) => (
//               <div
//                 key={i}
//                 onClick={() => onLeadClick(item.lead)}
//                 style={{
//                   display: 'flex', alignItems: 'center', gap: 12,
//                   padding: '12px 14px', backgroundColor: '#fff',
//                   border: `1px solid ${item.type === 'breach' ? '#F0D5D0' : '#F3E2BE'}`,
//                   borderLeft: `3px solid ${item.type === 'breach' ? '#A02B1F' : '#A86A18'}`,
//                   borderRadius: 7, cursor: 'pointer',
//                 }}
//               >
//                 <AlertTriangle
//                   size={15} strokeWidth={2}
//                   style={{ color: item.type === 'breach' ? '#A02B1F' : '#A86A18', flexShrink: 0 }}
//                 />
//                 <div style={{ flex: 1 }}>
//                   <div style={{ fontSize: 13, fontWeight: 600, color: '#161614' }}>
//                     {item.lead.company}
//                   </div>
//                   <div style={{ fontSize: 12, color: '#6A675F', marginTop: 1 }}>
//                     {item.reason}
//                   </div>
//                 </div>
//                 <ChevronRight size={13} strokeWidth={2} style={{ color: '#A39F94' }} />
//               </div>
//             ))}
//           </div>
//         </Section>
//       )}

//       {/* My leads */}
//       <Section title="My leads" action={
//         <button
//           onClick={() => navigate('pipeline')}
//           style={{
//             fontSize: 11.5, color: '#0E5550', fontWeight: 600,
//             background: 'none', border: 'none', cursor: 'pointer',
//             display: 'flex', alignItems: 'center', gap: 3,
//           }}
//         >
//           View all <ArrowRight size={11} strokeWidth={2.5} />
//         </button>
//       }>
//         {myLeads.length === 0 ? (
//           <div style={{
//             padding: '28px 20px', textAlign: 'center',
//             fontSize: 13, color: '#A39F94',
//             backgroundColor: '#fff', borderRadius: 8,
//             border: '1px solid #E8E3D2',
//           }}>
//             No leads assigned to you yet
//           </div>
//         ) : (
//           <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
//             {myLeads.map(lead => (
//               <div
//                 key={lead.id}
//                 onClick={() => onLeadClick(lead)}
//                 style={{
//                   display: 'flex', alignItems: 'center', gap: 12,
//                   padding: '11px 14px', backgroundColor: '#fff',
//                   borderRadius: 7, border: '1px solid #E8E3D2',
//                   cursor: 'pointer',
//                 }}
//                 onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FAF7EE'}
//                 onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
//               >
//                 <div style={{
//                   width: 4, height: 34, borderRadius: 2,
//                   backgroundColor: getVerticalColor(lead.vertical ?? ''),
//                   flexShrink: 0,
//                 }} />
//                 <div style={{ flex: 1, minWidth: 0 }}>
//                   <div style={{ fontSize: 13, fontWeight: 600, color: '#161614' }}>
//                     {lead.company}
//                   </div>
//                   <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 1 }}>
//                     {lead.stage} · {lead.daysInStage}d
//                   </div>
//                 </div>
//                 <div style={{ textAlign: 'right', flexShrink: 0 }}>
//                   <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#161614' }}>
//                     {formatINR(lead.value)}
//                   </div>
//                   {lead.slaState !== 'ok' && (
//                     <div style={{
//                       fontSize: 10.5, fontWeight: 600, marginTop: 2,
//                       color: lead.slaState === 'breach' ? '#A02B1F' : '#A86A18',
//                     }}>
//                       {lead.slaState === 'breach' ? '⚠ Breach' : '⚠ Risk'}
//                     </div>
//                   )}
//                 </div>
//                 <ChevronRight size={13} strokeWidth={2} style={{ color: '#A39F94' }} />
//               </div>
//             ))}
//           </div>
//         )}
//       </Section>

//       {/* Quick actions */}
//       <Section title="Quick actions">
//         <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
//           <QuickAction
//             label="Capture lead"
//             icon={<Plus size={15} strokeWidth={2.5} />}
//             color="#C45A1E"
//             onClick={() => navigate('capture')}
//           />
//           <QuickAction
//             label="View pipeline"
//             icon={<LayoutGrid size={15} strokeWidth={2} />}
//             color="#0E5550"
//             onClick={() => navigate('pipeline')}
//           />
//           <QuickAction
//             label="Triage queue"
//             icon={<Users size={15} strokeWidth={2} />}
//             color="#1E3A6B"
//             onClick={() => navigate('triage')}
//           />
//         </div>
//       </Section>

      

//     </div>
//   )
// }

// // ─────────────────────────────────────────────
// // Upcoming orders (ERPNext Sales Orders)
// // ─────────────────────────────────────────────

// const ORDERS_API = import.meta.env.VITE_API_URL ?? '/api/v1'

// type UpcomingOrder = {
//   id: string; customer: string; placedOn: string | null
//   deliveryDate: string | null; status: string; total: number; delivered: number
// }
// type OrdersData = { lastOrder: UpcomingOrder | null; upcoming: UpcomingOrder[] }

// function fmtOrderDate(d: string | null): string {
//   if (!d) return '—'
//   const dt = new Date(d)
//   if (isNaN(dt.getTime())) return d
//   return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
// }

// function daysFromToday(d: string | null): number | null {
//   if (!d) return null
//   const dt = new Date(d)
//   if (isNaN(dt.getTime())) return null
//   return Math.round((dt.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
// }

// function UpcomingOrders() {
//   const [data, setData] = useState<OrdersData | null>(null)
//   const [err, setErr] = useState<string | null>(null)
//   const [loading, setLoading] = useState(true)

//   useEffect(() => {
//     let ignore = false
//     fetch(`${ORDERS_API}/erp/orders/upcoming`)
//       .then(r => r.json())
//       .then(d => { if (ignore) return; if (d.error) setErr(d.error); else setData(d); setLoading(false) })
//       .catch(e => { if (!ignore) { setErr(String(e)); setLoading(false) } })
//     return () => { ignore = true }
//   }, [])

//   return (
//     <Section title="Upcoming orders">
//       {loading ? (
//         <div style={ordersEmptyBox}>Loading orders…</div>
//       ) : err ? (
//         <div style={{ ...ordersEmptyBox, color: '#A02B1F' }}>ERPNext: {err}</div>
//       ) : !data || (!data.lastOrder && data.upcoming.length === 0) ? (
//         <div style={ordersEmptyBox}>No orders yet — syncs from ERPNext once Sales Orders are created.</div>
//       ) : (
//         <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
//           {data.lastOrder && (
//             <div style={{
//               display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
//               backgroundColor: '#fff', borderRadius: 7, border: '1px solid #E8E3D2',
//               borderLeft: '3px solid #1E3A6B',
//             }}>
//               <Clock size={15} strokeWidth={2} style={{ color: '#1E3A6B', flexShrink: 0 }} />
//               <div style={{ flex: 1, minWidth: 0 }}>
//                 <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6A675F', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
//                   Last order placed
//                 </div>
//                 <div style={{ fontSize: 13, fontWeight: 600, color: '#161614', marginTop: 2 }}>
//                   {data.lastOrder.customer}
//                 </div>
//                 <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 1 }}>
//                   {fmtOrderDate(data.lastOrder.placedOn)} · {data.lastOrder.id} · {data.lastOrder.status}
//                 </div>
//               </div>
//               <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#161614', flexShrink: 0 }}>
//                 {formatINR(data.lastOrder.total)}
//               </div>
//             </div>
//           )}

//           {data.upcoming.length > 0 && (
//             <>
//               <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6A675F', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>
//                 Expected deliveries
//               </div>
//               {data.upcoming.map(o => {
//                 const dleft = daysFromToday(o.deliveryDate)
//                 return (
//                   <div key={o.id} style={{
//                     display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
//                     backgroundColor: '#fff', borderRadius: 7, border: '1px solid #E8E3D2',
//                     borderLeft: '3px solid #0E5550',
//                   }}>
//                     <Truck size={15} strokeWidth={2} style={{ color: '#0E5550', flexShrink: 0 }} />
//                     <div style={{ flex: 1, minWidth: 0 }}>
//                       <div style={{ fontSize: 13, fontWeight: 600, color: '#161614' }}>{o.customer}</div>
//                       <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 1 }}>
//                         {o.id} · {o.status}{o.delivered > 0 ? ` · ${Math.round(o.delivered)}% delivered` : ''}
//                       </div>
//                     </div>
//                     <div style={{ textAlign: 'right', flexShrink: 0 }}>
//                       <div style={{ fontSize: 12.5, fontWeight: 600, color: '#161614' }}>{fmtOrderDate(o.deliveryDate)}</div>
//                       {dleft !== null && (
//                         <div style={{
//                           fontSize: 10.5, fontWeight: 600, marginTop: 2,
//                           color: dleft <= 3 ? '#A86A18' : '#3B9D6E',
//                         }}>
//                           {dleft === 0 ? 'Due today' : dleft === 1 ? 'In 1 day' : `In ${dleft} days`}
//                         </div>
//                       )}
//                     </div>
//                   </div>
//                 )
//               })}
//             </>
//           )}
//         </div>
//       )}
//     </Section>
//   )
// }

// const ordersEmptyBox = {
//   padding: '20px', textAlign: 'center', fontSize: 12.5, color: '#A39F94',
//   backgroundColor: '#fff', borderRadius: 8, border: '1px solid #E8E3D2',
// } as const

// // ─────────────────────────────────────────────
// // Shared atoms
// // ─────────────────────────────────────────────

// function StatCard({ label, value, sub, accent, icon, muted }: {
//   label: string; value: string; sub: string
//   accent: string; icon: React.ReactNode; muted?: boolean
// }) {
//   return (
//     <div style={{
//       backgroundColor: '#fff', borderRadius: 9,
//       border: '1px solid #E8E3D2',
//       borderTop: `3px solid ${accent}`,
//       padding: '14px 14px 12px',
//     }}>
//       <div style={{
//         display: 'flex', alignItems: 'center', gap: 6,
//         fontSize: 10.5, fontWeight: 700, color: muted ? '#A39F94' : '#6A675F',
//         letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8,
//       }}>
//         <span style={{ color: muted ? '#A39F94' : accent }}>{icon}</span>
//         {label}
//       </div>
//       <div style={{
//         fontFamily: 'monospace', fontSize: 20, fontWeight: 700,
//         color: muted ? '#A39F94' : '#161614',
//         letterSpacing: '-0.02em', lineHeight: 1,
//       }}>
//         {value}
//       </div>
//       <div style={{ fontSize: 11, color: '#A39F94', marginTop: 5, lineHeight: 1.4 }}>
//         {sub}
//       </div>
//     </div>
//   )
// }

// function Section({ title, children, action }: {
//   title: string; children: React.ReactNode; action?: React.ReactNode
// }) {
//   return (
//     <div>
//       <div style={{
//         display: 'flex', alignItems: 'baseline',
//         justifyContent: 'space-between',
//         paddingBottom: 8, borderBottom: '1.5px solid #161614',
//         marginBottom: 12,
//       }}>
//         <span style={{
//           fontSize: 10.5, fontWeight: 700, color: '#161614',
//           letterSpacing: '0.1em', textTransform: 'uppercase',
//         }}>
//           {title}
//         </span>
//         {action}
//       </div>
//       {children}
//     </div>
//   )
// }

// function QuickAction({ label, icon, color, onClick }: {
//   label: string; icon: React.ReactNode; color: string; onClick: () => void
// }) {
//   return (
//     <button
//       onClick={onClick}
//       style={{
//         display: 'flex', alignItems: 'center', gap: 8,
//         padding: '10px 16px', backgroundColor: color,
//         border: 'none', borderRadius: 7, color: '#fff',
//         fontSize: 13, fontWeight: 600, cursor: 'pointer',
//       }}
//     >
//       {icon}{label}
//     </button>
//   )
// }
import { useState, useEffect } from 'react'
import {
  TrendingUp, AlertTriangle, Clock, Users,
  CheckCircle, Package, ArrowRight, Plus,
  LayoutGrid, Activity, ChevronRight, Truck
} from 'lucide-react'
import type { Lead } from '../../types'
import { formatINR, getVerticalColor } from '../../lib/utils'
import { useIsMobile } from '../../hooks/useIsMobile'
import ErpInsights from './ErpInsights'
import IncomeTarget from './IncomeTarget'
import OutstandingOrders from './OutstandingOrders'

interface Props {
  leads: Lead[]
  view: 'director' | 'sales'
  userName?: string
  role?: string
  onLeadClick: (lead: Lead) => void
  navigate: (page: any) => void
}

const DIRECTOR_NAME = 'Aryan'
const SALES_REP_NAME = 'Rohan Mehta'

const STAGES = ['New', 'Allocated', 'Qualifying', 'Discovery', 'Proposal', 'Negotiation']
const STAGE_COLORS: Record<string, string> = {
  New: '#6A675F', Allocated: '#1E3A6B', Qualifying: '#A86A18',
  Discovery: '#0E5550', Proposal: '#C45A1E', Negotiation: '#5B3B6F',
}
const VERTICALS = ['Industry', 'Marine', 'Vehicles', 'Small DG', 'Cross-vertical']

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// export default function HomeDashboard({ leads, onLeadClick, navigate }: Props) {
//   const isMobile = useIsMobile()
//   const [tab, setTab] = useState<'director' | 'sales'>('director')

//   const activeLeads = leads.filter(l =>
//     !['Closed Won', 'Closed Lost'].includes(l.stage)
//   )

//   return (
//     <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

//       {/* Header */}
//       <header style={{
//         padding: isMobile ? '14px 16px 12px' : '20px 28px 16px',
//         borderBottom: '1px solid #DDD7C6',
//         backgroundColor: '#F4F0E5', flexShrink: 0,
//       }}>
//         <div style={{ marginBottom: 14 }}>
//           <h1 style={{
//             fontSize: isMobile ? 19 : 23, fontWeight: 600,
//             color: '#161614', letterSpacing: '-0.03em', margin: 0,
//           }}>
//             {getGreeting()},{' '}
//             <span style={{ color: '#0E5550' }}>
//               {tab === 'director' ? DIRECTOR_NAME : SALES_REP_NAME.split(' ')[0]}
//             </span>
//           </h1>
//           <p style={{ fontSize: 12.5, color: '#6A675F', marginTop: 4 }}>
//             {formatDate()} · Here's where things stand
//           </p>
//         </div>

//         {/* Tab switcher */}
//         <div style={{
//           display: 'inline-flex', backgroundColor: '#EDE7D8',
//           borderRadius: 8, padding: 3, gap: 2,
//         }}>
//           {([
//             { id: 'director', label: 'Director view' },
//             { id: 'sales',    label: 'My dashboard'  },
//           ] as const).map(t => (
//             <button
//               key={t.id}
//               onClick={() => setTab(t.id)}
//               style={{
//                 padding: '6px 14px', borderRadius: 6, border: 'none',
//                 fontFamily: 'inherit', fontSize: 12.5, fontWeight: tab === t.id ? 700 : 500,
//                 backgroundColor: tab === t.id ? '#fff' : 'transparent',
//                 color: tab === t.id ? '#161614' : '#6A675F',
//                 cursor: 'pointer',
//                 boxShadow: tab === t.id ? '0 1px 3px rgba(22,22,20,0.08)' : 'none',
//               }}
//             >
//               {t.label}
//             </button>
//           ))}
//         </div>
//       </header>

//       {/* Content */}
//       <div style={{
//         flex: 1, overflowY: 'auto',
//         padding: isMobile ? '16px 16px 80px' : '24px 28px 40px',
//         backgroundColor: '#F4F0E5',
//       }}>
//         {tab === 'director'
//           ? <DirectorDashboard leads={leads} activeLeads={activeLeads} isMobile={isMobile} role={role ?? 'director'} onLeadClick={onLeadClick} navigate={navigate} />
//           : <SalesRepDashboard leads={leads} activeLeads={activeLeads} isMobile={isMobile} onLeadClick={onLeadClick} navigate={navigate} />
//         }
//       </div>
//     </div>
//   )
// }

// ─────────────────────────────────────────────
// Director Dashboard
// ─────────────────────────────────────────────

export default function HomeDashboard({ leads, view, userName, role, onLeadClick, navigate }: Props) {
  const isMobile = useIsMobile()

  const activeLeads = leads.filter(l =>
    !['Closed Won', 'Closed Lost'].includes(l.stage)
  )

  const name = (userName ?? (view === 'director' ? DIRECTOR_NAME : SALES_REP_NAME)).split(' ')[0]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <header style={{
        padding: isMobile ? '14px 16px 12px' : '20px 28px 16px',
        borderBottom: '1px solid #DDD7C6',
        backgroundColor: '#F4F0E5', flexShrink: 0,
      }}>
        <h1 style={{
          fontSize: isMobile ? 19 : 23, fontWeight: 600,
          color: '#161614', letterSpacing: '-0.03em', margin: 0,
        }}>
          {getGreeting()},{' '}
          <span style={{ color: '#0E5550' }}>{name}</span>
        </h1>
        <p style={{ fontSize: 12.5, color: '#6A675F', marginTop: 4 }}>
          {formatDate()} · {view === 'director' ? "Here's where things stand" : 'Your leads and tasks'}
        </p>
      </header>

      {/* Content */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: isMobile ? '16px 16px 80px' : '24px 28px 40px',
        backgroundColor: '#F4F0E5',
      }}>
        {view === 'director'
          ? <DirectorDashboard leads={leads} activeLeads={activeLeads} isMobile={isMobile} role={role ?? 'director'} onLeadClick={onLeadClick} navigate={navigate} />
          : <SalesRepDashboard leads={leads} activeLeads={activeLeads} isMobile={isMobile} onLeadClick={onLeadClick} navigate={navigate} repName={userName ?? SALES_REP_NAME} />
        }
      </div>
    </div>
  )
}

function DirectorDashboard({ leads, activeLeads, isMobile, role, onLeadClick, navigate }: {
  leads: Lead[], activeLeads: Lead[], isMobile: boolean, role: string,
  onLeadClick: (l: Lead) => void, navigate: (p: any) => void,
}) {
  const totalPipeline = activeLeads.reduce((s, l) => s + l.value, 0)
  const closedWon     = leads.filter(l => l.stage === 'Closed Won')
  const closedWonValue = closedWon.reduce((s, l) => s + l.value, 0)
  const slaBreaches   = activeLeads.filter(l => l.slaState === 'breach')
  const slaRisk       = activeLeads.filter(l => l.slaState === 'risk')
  const triageLeads   = activeLeads.filter(l => !l.owner || l.owner === 'Unassigned')

  const alerts = [
    ...slaBreaches.map(l => ({ type: 'breach' as const, lead: l,
      message: `SLA breach · ${l.daysInStage}d in ${l.stage}` })),
    ...slaRisk.map(l => ({ type: 'risk' as const, lead: l,
      message: `SLA risk · ${l.daysInStage}d in ${l.stage}` })),
    ...(triageLeads.length > 0 ? [{
      type: 'triage' as const, lead: null,
      message: `${triageLeads.length} lead${triageLeads.length > 1 ? 's' : ''} in triage queue — unclassified`,
    }] : []),
  ]

  return (
    <div style={{ maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Key numbers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr',
        gap: 10,
      }}>
        <StatCard
          label="Active pipeline"
          value={formatINR(totalPipeline)}
          sub={`${activeLeads.length} leads`}
          accent="#0E5550"
          icon={<TrendingUp size={16} strokeWidth={2} />}
        />
        <StatCard
          label="Closed won"
          value={formatINR(closedWonValue)}
          sub={`${closedWon.length} deal${closedWon.length !== 1 ? 's' : ''}`}
          accent="#3D6B1C"
          icon={<CheckCircle size={16} strokeWidth={2} />}
        />
        <StatCard
          label="SLA issues"
          value={String(slaBreaches.length + slaRisk.length)}
          sub={`${slaBreaches.length} breach · ${slaRisk.length} at risk`}
          accent={slaBreaches.length > 0 ? '#A02B1F' : '#A86A18'}
          icon={<AlertTriangle size={16} strokeWidth={2} />}
        />
        <StatCard
          label="Stock value"
          value="—"
          sub="Connects to inventory · Phase 2"
          accent="#5B3B6F"
          icon={<Package size={16} strokeWidth={2} />}
          muted
        />
      </div>

      <IncomeTarget role={role} />

      <ErpInsights />

      <UpcomingOrders />

      <OutstandingOrders />

      {/* Alerts */}
      {alerts.length > 0 && (
        <Section title="Needs attention">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.map((alert, i) => (
              <div
                key={i}
                onClick={() => alert.lead && onLeadClick(alert.lead)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 14px',
                  backgroundColor: '#fff',
                  border: `1px solid ${alert.type === 'breach' ? '#F0D5D0' : '#F3E2BE'}`,
                  borderLeft: `3px solid ${alert.type === 'breach' ? '#A02B1F' : alert.type === 'risk' ? '#A86A18' : '#1E3A6B'}`,
                  borderRadius: 7,
                  cursor: alert.lead ? 'pointer' : 'default',
                }}
              >
                <div style={{ color: alert.type === 'breach' ? '#A02B1F' : alert.type === 'risk' ? '#A86A18' : '#1E3A6B' }}>
                  {alert.type === 'triage'
                    ? <Users size={15} strokeWidth={2} />
                    : <AlertTriangle size={15} strokeWidth={2} />}
                </div>
                <div style={{ flex: 1 }}>
                  {alert.lead && (
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#161614' }}>
                      {alert.lead.company}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: '#6A675F', marginTop: alert.lead ? 1 : 0 }}>
                    {alert.message}
                  </div>
                </div>
                {alert.type === 'triage' ? (
                  <button
                    onClick={e => { e.stopPropagation(); navigate('triage') }}
                    style={{
                      padding: '5px 10px', backgroundColor: '#EDE7D8',
                      border: 'none', borderRadius: 5,
                      fontSize: 11.5, fontWeight: 600, cursor: 'pointer', color: '#363633',
                    }}
                  >
                    Review
                  </button>
                ) : (
                  <ChevronRight size={14} strokeWidth={2} style={{ color: '#A39F94' }} />
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Pipeline by stage */}
      <Section title="Pipeline by stage">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {STAGES.map(stage => {
            const stageLeads = activeLeads.filter(l => l.stage === stage)
            const stageValue = stageLeads.reduce((s, l) => s + l.value, 0)
            const maxValue = Math.max(...STAGES.map(s =>
              activeLeads.filter(l => l.stage === s).reduce((sum, l) => sum + l.value, 0)
            ), 1)
            const pct = (stageValue / maxValue) * 100

            return (
              <div key={stage} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '9px 12px', backgroundColor: '#fff',
                borderRadius: 7, border: '1px solid #E8E3D2',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: isMobile ? 80 : 100, flexShrink: 0 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: STAGE_COLORS[stage] }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#363633' }}>{stage}</span>
                </div>
                <div style={{ flex: 1, height: 6, backgroundColor: '#F4F0E5', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    backgroundColor: STAGE_COLORS[stage],
                    width: `${pct}%`,
                    transition: 'width 400ms ease',
                  }} />
                </div>
                <div style={{ display: 'flex', gap: 12, flexShrink: 0, alignItems: 'center' }}>
                  <span style={{
                    fontFamily: 'monospace', fontSize: 12,
                    fontWeight: 600, color: '#161614', minWidth: 60, textAlign: 'right',
                  }}>
                    {formatINR(stageValue)}
                  </span>
                  <span style={{
                    fontSize: 11, color: '#A39F94', fontFamily: 'monospace',
                    backgroundColor: '#EDE7D8', padding: '1px 6px', borderRadius: 3,
                    minWidth: 24, textAlign: 'center',
                  }}>
                    {stageLeads.length}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* Pipeline by vertical */}
      <Section title="Pipeline by vertical">
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr',
          gap: 8,
        }}>
          {VERTICALS.map(v => {
            const vLeads = activeLeads.filter(l => l.vertical === v)
            const vValue = vLeads.reduce((s, l) => s + l.value, 0)
            const color = getVerticalColor(v)
            if (vLeads.length === 0) return null
            return (
              <div key={v} style={{
                padding: '12px 14px', backgroundColor: '#fff',
                borderRadius: 8, border: '1px solid #E8E3D2',
                borderTop: `3px solid ${color}`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  {v}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 17, fontWeight: 700, color: '#161614', marginTop: 6, letterSpacing: '-0.02em' }}>
                  {formatINR(vValue)}
                </div>
                <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 2 }}>
                  {vLeads.length} lead{vLeads.length !== 1 ? 's' : ''}
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* Recent activity */}
      <Section title="Recent activity" action={
        <button
          onClick={() => navigate('pipeline')}
          style={{
            fontSize: 11.5, color: '#0E5550', fontWeight: 600,
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 3,
          }}
        >
          View pipeline <ArrowRight size={11} strokeWidth={2.5} />
        </button>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {activeLeads.slice(0, 5).map(lead => (
            <div
              key={lead.id}
              onClick={() => onLeadClick(lead)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', backgroundColor: '#fff',
                borderRadius: 7, border: '1px solid #E8E3D2',
                cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FAF7EE'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
            >
              <div style={{
                width: 4, height: 32, borderRadius: 2,
                backgroundColor: getVerticalColor(lead.vertical ?? ''),
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#161614' }}>{lead.company}</div>
                <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 1 }}>
                  {lead.owner ?? 'Unassigned'} · {lead.stage}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#161614' }}>
                  {formatINR(lead.value)}
                </div>
                {lead.slaState !== 'ok' && (
                  <div style={{
                    fontSize: 10.5, fontWeight: 600, marginTop: 2,
                    color: lead.slaState === 'breach' ? '#A02B1F' : '#A86A18',
                  }}>
                    {lead.slaState === 'breach' ? '⚠ Breach' : '⚠ At risk'}
                  </div>
                )}
              </div>
              <ChevronRight size={13} strokeWidth={2} style={{ color: '#A39F94' }} />
            </div>
          ))}
        </div>
      </Section>

    </div>
  )
}

// ─────────────────────────────────────────────
// Sales Rep Dashboard
// ─────────────────────────────────────────────

function SalesRepDashboard({ leads, activeLeads, isMobile, onLeadClick, navigate, repName }: {
  leads: Lead[], activeLeads: Lead[], isMobile: boolean,
  onLeadClick: (l: Lead) => void, navigate: (p: any) => void, repName: string,
}) {
  const myLeads = activeLeads.filter(l => l.owner === repName)
  const myPipeline = myLeads.reduce((s, l) => s + l.value, 0)
  const myBreaches = myLeads.filter(l => l.slaState === 'breach')
  const myRisk     = myLeads.filter(l => l.slaState === 'risk')

  const needsAttention = [
    ...myBreaches.map(l => ({
      type: 'breach' as const, lead: l,
      reason: `SLA breach · ${l.daysInStage}d in ${l.stage} · Log activity or advance`,
    })),
    ...myRisk.map(l => ({
      type: 'risk' as const, lead: l,
      reason: `SLA risk · ${l.daysInStage}d in ${l.stage}`,
    })),
  ]

  return (
    <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* My numbers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr',
        gap: 10,
      }}>
        <StatCard
          label="My pipeline"
          value={formatINR(myPipeline)}
          sub={`${myLeads.length} leads`}
          accent="#0E5550"
          icon={<TrendingUp size={16} strokeWidth={2} />}
        />
        <StatCard
          label="SLA issues"
          value={String(myBreaches.length + myRisk.length)}
          sub={`${myBreaches.length} breach · ${myRisk.length} at risk`}
          accent={myBreaches.length > 0 ? '#A02B1F' : '#A86A18'}
          icon={<Clock size={16} strokeWidth={2} />}
        />
        <StatCard
          label="Closed won"
          value={String(leads.filter(l => l.stage === 'Closed Won' && l.owner === repName).length)}
          sub="deals this month"
          accent="#3D6B1C"
          icon={<CheckCircle size={16} strokeWidth={2} />}
        />
        <StatCard
          label="Total leads"
          value={String(myLeads.length)}
          sub="active in pipeline"
          accent="#1E3A6B"
          icon={<Activity size={16} strokeWidth={2} />}
        />
      </div>

      {/* Needs attention */}
      {needsAttention.length > 0 && (
        <Section title="Needs attention">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {needsAttention.map((item, i) => (
              <div
                key={i}
                onClick={() => onLeadClick(item.lead)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', backgroundColor: '#fff',
                  border: `1px solid ${item.type === 'breach' ? '#F0D5D0' : '#F3E2BE'}`,
                  borderLeft: `3px solid ${item.type === 'breach' ? '#A02B1F' : '#A86A18'}`,
                  borderRadius: 7, cursor: 'pointer',
                }}
              >
                <AlertTriangle
                  size={15} strokeWidth={2}
                  style={{ color: item.type === 'breach' ? '#A02B1F' : '#A86A18', flexShrink: 0 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#161614' }}>
                    {item.lead.company}
                  </div>
                  <div style={{ fontSize: 12, color: '#6A675F', marginTop: 1 }}>
                    {item.reason}
                  </div>
                </div>
                <ChevronRight size={13} strokeWidth={2} style={{ color: '#A39F94' }} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* My leads */}
      <Section title="My leads" action={
        <button
          onClick={() => navigate('pipeline')}
          style={{
            fontSize: 11.5, color: '#0E5550', fontWeight: 600,
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 3,
          }}
        >
          View all <ArrowRight size={11} strokeWidth={2.5} />
        </button>
      }>
        {myLeads.length === 0 ? (
          <div style={{
            padding: '28px 20px', textAlign: 'center',
            fontSize: 13, color: '#A39F94',
            backgroundColor: '#fff', borderRadius: 8,
            border: '1px solid #E8E3D2',
          }}>
            No leads assigned to you yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {myLeads.map(lead => (
              <div
                key={lead.id}
                onClick={() => onLeadClick(lead)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 14px', backgroundColor: '#fff',
                  borderRadius: 7, border: '1px solid #E8E3D2',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FAF7EE'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
              >
                <div style={{
                  width: 4, height: 34, borderRadius: 2,
                  backgroundColor: getVerticalColor(lead.vertical ?? ''),
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#161614' }}>
                    {lead.company}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 1 }}>
                    {lead.stage} · {lead.daysInStage}d
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#161614' }}>
                    {formatINR(lead.value)}
                  </div>
                  {lead.slaState !== 'ok' && (
                    <div style={{
                      fontSize: 10.5, fontWeight: 600, marginTop: 2,
                      color: lead.slaState === 'breach' ? '#A02B1F' : '#A86A18',
                    }}>
                      {lead.slaState === 'breach' ? '⚠ Breach' : '⚠ Risk'}
                    </div>
                  )}
                </div>
                <ChevronRight size={13} strokeWidth={2} style={{ color: '#A39F94' }} />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Quick actions */}
      <Section title="Quick actions">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <QuickAction
            label="Capture lead"
            icon={<Plus size={15} strokeWidth={2.5} />}
            color="#C45A1E"
            onClick={() => navigate('capture')}
          />
          <QuickAction
            label="View pipeline"
            icon={<LayoutGrid size={15} strokeWidth={2} />}
            color="#0E5550"
            onClick={() => navigate('pipeline')}
          />
          <QuickAction
            label="Triage queue"
            icon={<Users size={15} strokeWidth={2} />}
            color="#1E3A6B"
            onClick={() => navigate('triage')}
          />
        </div>
      </Section>

      

    </div>
  )
}

// ─────────────────────────────────────────────
// Upcoming orders (ERPNext Sales Orders)
// ─────────────────────────────────────────────

const ORDERS_API = import.meta.env.VITE_API_URL ?? '/api/v1'

type UpcomingOrder = {
  id: string; customer: string; placedOn: string | null
  deliveryDate: string | null; status: string; total: number; delivered: number
}
type OrdersData = { lastOrder: UpcomingOrder | null; upcoming: UpcomingOrder[] }

function fmtOrderDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysFromToday(d: string | null): number | null {
  if (!d) return null
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return null
  return Math.round((dt.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
}

function UpcomingOrders() {
  const [data, setData] = useState<OrdersData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    fetch(`${ORDERS_API}/erp/orders/upcoming`)
      .then(r => r.json())
      .then(d => { if (ignore) return; if (d.error) setErr(d.error); else setData(d); setLoading(false) })
      .catch(e => { if (!ignore) { setErr(String(e)); setLoading(false) } })
    return () => { ignore = true }
  }, [])

  return (
    <Section title="Upcoming orders">
      {loading ? (
        <div style={ordersEmptyBox}>Loading orders…</div>
      ) : err ? (
        <div style={{ ...ordersEmptyBox, color: '#A02B1F' }}>ERPNext: {err}</div>
      ) : !data || (!data.lastOrder && data.upcoming.length === 0) ? (
        <div style={ordersEmptyBox}>No orders yet — syncs from ERPNext once Sales Orders are created.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.lastOrder && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
              backgroundColor: '#fff', borderRadius: 7, border: '1px solid #E8E3D2',
              borderLeft: '3px solid #1E3A6B',
            }}>
              <Clock size={15} strokeWidth={2} style={{ color: '#1E3A6B', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6A675F', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Last order placed
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#161614', marginTop: 2 }}>
                  {data.lastOrder.customer}
                </div>
                <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 1 }}>
                  {fmtOrderDate(data.lastOrder.placedOn)} · {data.lastOrder.id} · {data.lastOrder.status}
                </div>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#161614', flexShrink: 0 }}>
                {formatINR(data.lastOrder.total)}
              </div>
            </div>
          )}

          {data.upcoming.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6A675F', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>
                Expected deliveries
              </div>
              {data.upcoming.map(o => {
                const dleft = daysFromToday(o.deliveryDate)
                return (
                  <div key={o.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
                    backgroundColor: '#fff', borderRadius: 7, border: '1px solid #E8E3D2',
                    borderLeft: '3px solid #0E5550',
                  }}>
                    <Truck size={15} strokeWidth={2} style={{ color: '#0E5550', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#161614' }}>{o.customer}</div>
                      <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 1 }}>
                        {o.id} · {o.status}{o.delivered > 0 ? ` · ${Math.round(o.delivered)}% delivered` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#161614' }}>{fmtOrderDate(o.deliveryDate)}</div>
                      {dleft !== null && (
                        <div style={{
                          fontSize: 10.5, fontWeight: 600, marginTop: 2,
                          color: dleft <= 3 ? '#A86A18' : '#3B9D6E',
                        }}>
                          {dleft === 0 ? 'Due today' : dleft === 1 ? 'In 1 day' : `In ${dleft} days`}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </Section>
  )
}

const ordersEmptyBox = {
  padding: '20px', textAlign: 'center', fontSize: 12.5, color: '#A39F94',
  backgroundColor: '#fff', borderRadius: 8, border: '1px solid #E8E3D2',
} as const

// ─────────────────────────────────────────────
// Shared atoms
// ─────────────────────────────────────────────

function StatCard({ label, value, sub, accent, icon, muted }: {
  label: string; value: string; sub: string
  accent: string; icon: React.ReactNode; muted?: boolean
}) {
  return (
    <div style={{
      backgroundColor: '#fff', borderRadius: 9,
      border: '1px solid #E8E3D2',
      borderTop: `3px solid ${accent}`,
      padding: '14px 14px 12px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10.5, fontWeight: 700, color: muted ? '#A39F94' : '#6A675F',
        letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8,
      }}>
        <span style={{ color: muted ? '#A39F94' : accent }}>{icon}</span>
        {label}
      </div>
      <div style={{
        fontFamily: 'monospace', fontSize: 20, fontWeight: 700,
        color: muted ? '#A39F94' : '#161614',
        letterSpacing: '-0.02em', lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: '#A39F94', marginTop: 5, lineHeight: 1.4 }}>
        {sub}
      </div>
    </div>
  )
}

function Section({ title, children, action }: {
  title: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingBottom: 8, borderBottom: '1.5px solid #161614',
        marginBottom: 12,
      }}>
        <span style={{
          fontSize: 10.5, fontWeight: 700, color: '#161614',
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          {title}
        </span>
        {action}
      </div>
      {children}
    </div>
  )
}

function QuickAction({ label, icon, color, onClick }: {
  label: string; icon: React.ReactNode; color: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px', backgroundColor: color,
        border: 'none', borderRadius: 7, color: '#fff',
        fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}
    >
      {icon}{label}
    </button>
  )
}
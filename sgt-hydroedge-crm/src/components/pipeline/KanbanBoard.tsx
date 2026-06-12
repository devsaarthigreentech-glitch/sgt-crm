// import { useState } from 'react'
// import type { Lead, LeadStage } from '../../types'
// import LeadCard from './LeadCard'
// import { useIsMobile } from '../../hooks/useIsMobile'

// interface Props {
//   leads: Lead[]
//   onLeadClick: (lead: Lead) => void
// }

// const STAGES: { id: LeadStage; color: string }[] = [
//   { id: 'New',         color: '#6A675F' },
//   { id: 'Allocated',   color: '#1E3A6B' },
//   { id: 'Qualifying',  color: '#A86A18' },
//   { id: 'Discovery',   color: '#0E5550' },
//   { id: 'Proposal',    color: '#C45A1E' },
//   { id: 'Negotiation', color: '#5B3B6F' },
// ]

// export default function KanbanBoard({ leads, onLeadClick }: Props) {
//   const isMobile = useIsMobile()
//   const [activeStage, setActiveStage] = useState<LeadStage>('New')

//   // ── Mobile: stage tabs on top, one scrolling card list below ──
//   if (isMobile) {
//     const stageLeads = leads.filter(l => l.stage === activeStage)

//     return (
//       <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

//         {/* Stage tabs — horizontal scroll, fixed height */}
//         <div style={{
//           display: 'flex', overflowX: 'auto',
//           borderBottom: '1px solid #DDD7C6',
//           backgroundColor: '#F4F0E5',
//           flexShrink: 0,
//         }}>
//           {STAGES.map(stage => {
//             const count = leads.filter(l => l.stage === stage.id).length
//             const active = activeStage === stage.id
//             return (
//               <button
//                 key={stage.id}
//                 onClick={() => setActiveStage(stage.id)}
//                 style={{
//                   flexShrink: 0, padding: '10px 14px 8px',
//                   border: 'none', background: 'transparent',
//                   cursor: 'pointer', position: 'relative',
//                   display: 'flex', flexDirection: 'column',
//                   alignItems: 'center', gap: 3,
//                 }}
//               >
//                 <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
//                   <div style={{
//                     width: 6, height: 6, borderRadius: '50%',
//                     backgroundColor: active ? stage.color : '#C9C2AC',
//                   }} />
//                   <span style={{
//                     fontSize: 12, fontWeight: active ? 700 : 500,
//                     color: active ? '#161614' : '#6A675F',
//                     whiteSpace: 'nowrap',
//                   }}>
//                     {stage.id}
//                   </span>
//                   <span style={{
//                     fontFamily: 'monospace', fontSize: 10.5,
//                     color: active ? stage.color : '#A39F94',
//                     fontWeight: 600,
//                   }}>
//                     {count}
//                   </span>
//                 </div>
//                 {active && (
//                   <div style={{
//                     position: 'absolute', bottom: 0, left: 8, right: 8,
//                     height: 2, backgroundColor: stage.color,
//                     borderRadius: '2px 2px 0 0',
//                   }} />
//                 )}
//               </button>
//             )
//           })}
//         </div>

//         {/* Cards list — scrolls */}
//         <div style={{
//           flex: 1, minHeight: 0, overflowY: 'auto',
//           padding: '12px 16px 80px',
//           display: 'flex', flexDirection: 'column', gap: 8,
//         }}>
//           {stageLeads.length === 0 ? (
//             <div style={{
//               flex: 1, display: 'flex', alignItems: 'center',
//               justifyContent: 'center', paddingTop: 40,
//             }}>
//               <p style={{ fontSize: 13, color: '#A39F94' }}>
//                 No leads at {activeStage} stage
//               </p>
//             </div>
//           ) : (
//             stageLeads.map(lead => (
//               <div key={lead.id} style={{ flexShrink: 0 }}>
//                 <LeadCard lead={lead} onClick={() => onLeadClick(lead)} />
//               </div>
//             ))
//           )}
//         </div>
//       </div>
//     )
//   }

//   // ── Desktop: columns side by side, each scrolls independently ──
//   return (
//     <div style={{
//       flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden',
//       display: 'flex', gap: 12,
//       padding: '0 24px 24px',
//       alignItems: 'stretch',
//     }}>
//       {STAGES.map(stage => {
//         const stageLeads = leads.filter(l => l.stage === stage.id)
//         const total = stageLeads.reduce((sum, l) => sum + l.value, 0)

//         return (
//           <div
//             key={stage.id}
//             style={{ width: 268, minWidth: 268, display: 'flex', flexDirection: 'column', minHeight: 0 }}
//           >
//             {/* Column header — fixed */}
//             <div style={{ padding: '0 4px 8px', flexShrink: 0 }}>
//               <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
//                 <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: stage.color }} />
//                 <span style={{ fontSize: 11.5, fontWeight: 700, color: '#161614', letterSpacing: '0.01em', textTransform: 'uppercase' }}>
//                   {stage.id}
//                 </span>
//                 <span style={{
//                   marginLeft: 'auto', fontFamily: 'monospace', fontSize: 11,
//                   color: '#6A675F', fontWeight: 600,
//                   padding: '1.5px 5px', backgroundColor: '#EDE7D8', borderRadius: 3,
//                 }}>
//                   {stageLeads.length}
//                 </span>
//               </div>
//               <div style={{ fontSize: 10.5, color: '#A39F94', paddingLeft: 13 }}>
//                 {stageLeads.length > 0 ? `₹${(total / 1_00_000).toFixed(1)}L` : '—'}
//               </div>
//             </div>
//             <div style={{ height: 2.5, backgroundColor: stage.color, borderRadius: 2, marginBottom: 10, flexShrink: 0 }} />

//             {/* Cards — scrolls */}
//             <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', paddingBottom: 20 }}>
//               {stageLeads.length === 0 ? (
//                 <div style={{
//                   padding: '20px 12px', textAlign: 'center',
//                   fontSize: 11.5, color: '#A39F94',
//                   border: '1px dashed #DDD7C6', borderRadius: 7,
//                 }}>
//                   No leads
//                 </div>
//               ) : (
//                 stageLeads.map(lead => (
//                   <div key={lead.id} style={{ flexShrink: 0 }}>
//                     <LeadCard lead={lead} onClick={() => onLeadClick(lead)} />
//                   </div>
//                 ))
//               )}
//             </div>
//           </div>
//         )
//       })}
//     </div>
//   )
// }
import { useState } from 'react'
import type { Lead, LeadStage } from '../../types'
import LeadCard from './LeadCard'
import { useIsMobile } from '../../hooks/useIsMobile'
import { api } from '../../lib/api'
import { canTransition } from '../../lib/pipeline'

interface Props {
  leads: Lead[]
  onLeadClick: (lead: Lead) => void
  /** Called after a successful drag-and-drop stage move, so the parent reloads leads. */
  onMoved?: () => void
}

const STAGES: { id: LeadStage; color: string }[] = [
  { id: 'New',         color: '#6A675F' },
  { id: 'Allocated',   color: '#1E3A6B' },
  { id: 'Qualifying',  color: '#A86A18' },
  { id: 'Discovery',   color: '#0E5550' },
  { id: 'Proposal',    color: '#C45A1E' },
  { id: 'Negotiation', color: '#5B3B6F' },
]

export default function KanbanBoard({ leads, onLeadClick, onMoved }: Props) {
  const isMobile = useIsMobile()
  const [activeStage, setActiveStage] = useState<LeadStage>('New')

  // Drag state
  const [dragging, setDragging] = useState<Lead | null>(null)
  const [overStage, setOverStage] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)

  const handleDrop = async (toStage: string) => {
    const lead = dragging
    setOverStage(null)
    setDragging(null)
    if (!lead || lead.stage === toStage) return
    if (!canTransition(lead.stage, toStage)) return

    setMovingId(lead.id)
    setMoveError(null)
    try {
      await api.advanceStage(lead.id, { toStage, reason: 'kanban_drag' })
      onMoved?.()
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : 'Move failed')
    } finally {
      setMovingId(null)
    }
  }

  // ── Mobile: stage tabs on top, one scrolling card list below (no DnD) ──
  if (isMobile) {
    const stageLeads = leads.filter(l => l.stage === activeStage)

    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Stage tabs — horizontal scroll, fixed height */}
        <div style={{
          display: 'flex', overflowX: 'auto',
          borderBottom: '1px solid #DDD7C6',
          backgroundColor: '#F4F0E5',
          flexShrink: 0,
        }}>
          {STAGES.map(stage => {
            const count = leads.filter(l => l.stage === stage.id).length
            const active = activeStage === stage.id
            return (
              <button
                key={stage.id}
                onClick={() => setActiveStage(stage.id)}
                style={{
                  flexShrink: 0, padding: '10px 14px 8px',
                  border: 'none', background: 'transparent',
                  cursor: 'pointer', position: 'relative',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 3,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    backgroundColor: active ? stage.color : '#C9C2AC',
                  }} />
                  <span style={{
                    fontSize: 12, fontWeight: active ? 700 : 500,
                    color: active ? '#161614' : '#6A675F',
                    whiteSpace: 'nowrap',
                  }}>
                    {stage.id}
                  </span>
                  <span style={{
                    fontFamily: 'monospace', fontSize: 10.5,
                    color: active ? stage.color : '#A39F94',
                    fontWeight: 600,
                  }}>
                    {count}
                  </span>
                </div>
                {active && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 8, right: 8,
                    height: 2, backgroundColor: stage.color,
                    borderRadius: '2px 2px 0 0',
                  }} />
                )}
              </button>
            )
          })}
        </div>

        {/* Cards list — scrolls */}
        <div style={{
          flex: 1, minHeight: 0, overflowY: 'auto',
          padding: '12px 16px 80px',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {stageLeads.length === 0 ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center',
              justifyContent: 'center', paddingTop: 40,
            }}>
              <p style={{ fontSize: 13, color: '#A39F94' }}>
                No leads at {activeStage} stage
              </p>
            </div>
          ) : (
            stageLeads.map(lead => (
              <div key={lead.id} style={{ flexShrink: 0 }}>
                <LeadCard lead={lead} onClick={() => onLeadClick(lead)} />
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  // ── Desktop: columns side by side, each scrolls independently, drag & drop ──
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {moveError && (
        <div style={{
          margin: '0 24px 10px', padding: '8px 12px',
          backgroundColor: '#F0D5D0', color: '#751A11',
          borderRadius: 6, fontSize: 12.5, fontWeight: 600,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <span>Couldn't move lead: {moveError}</span>
          <button
            onClick={() => setMoveError(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#751A11', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      <div style={{
        flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden',
        display: 'flex', gap: 12,
        padding: '0 24px 24px',
        alignItems: 'stretch',
      }}>
        {STAGES.map(stage => {
          const stageLeads = leads.filter(l => l.stage === stage.id)
          const total = stageLeads.reduce((sum, l) => sum + l.value, 0)

          const isLegalTarget = dragging
            ? canTransition(dragging.stage, stage.id)
            : false
          const isOver = overStage === stage.id && isLegalTarget

          return (
            <div
              key={stage.id}
              onDragOver={e => {
                if (isLegalTarget) {
                  e.preventDefault()             // allow drop
                  e.dataTransfer.dropEffect = 'move'
                  if (overStage !== stage.id) setOverStage(stage.id)
                }
              }}
              onDragLeave={() => {
                if (overStage === stage.id) setOverStage(null)
              }}
              onDrop={e => {
                e.preventDefault()
                handleDrop(stage.id)
              }}
              style={{
                width: 268, minWidth: 268, display: 'flex', flexDirection: 'column', minHeight: 0,
                borderRadius: 8,
                outline: isOver
                  ? `2px solid ${stage.color}`
                  : dragging && isLegalTarget
                    ? `2px dashed ${stage.color}66`
                    : 'none',
                outlineOffset: 2,
                backgroundColor: isOver ? stage.color + '0D' : 'transparent',
                opacity: dragging && !isLegalTarget && dragging.stage !== stage.id ? 0.45 : 1,
                transition: 'opacity 120ms ease, background-color 120ms ease',
              }}
            >
              {/* Column header — fixed */}
              <div style={{ padding: '0 4px 8px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: stage.color }} />
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#161614', letterSpacing: '0.01em', textTransform: 'uppercase' }}>
                    {stage.id}
                  </span>
                  <span style={{
                    marginLeft: 'auto', fontFamily: 'monospace', fontSize: 11,
                    color: '#6A675F', fontWeight: 600,
                    padding: '1.5px 5px', backgroundColor: '#EDE7D8', borderRadius: 3,
                  }}>
                    {stageLeads.length}
                  </span>
                </div>
                <div style={{ fontSize: 10.5, color: '#A39F94', paddingLeft: 13 }}>
                  {stageLeads.length > 0 ? `₹${(total / 1_00_000).toFixed(1)}L` : '—'}
                </div>
              </div>
              <div style={{ height: 2.5, backgroundColor: stage.color, borderRadius: 2, marginBottom: 10, flexShrink: 0 }} />

              {/* Cards — scrolls */}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', paddingBottom: 20 }}>
                {stageLeads.length === 0 ? (
                  <div style={{
                    padding: '20px 12px', textAlign: 'center',
                    fontSize: 11.5, color: '#A39F94',
                    border: '1px dashed #DDD7C6', borderRadius: 7,
                  }}>
                    {isOver ? 'Drop here' : 'No leads'}
                  </div>
                ) : (
                  stageLeads.map(lead => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', lead.id)
                        setDragging(lead)
                      }}
                      onDragEnd={() => { setDragging(null); setOverStage(null) }}
                      style={{
                        flexShrink: 0,
                        cursor: 'grab',
                        opacity: movingId === lead.id ? 0.4 : dragging?.id === lead.id ? 0.5 : 1,
                        transition: 'opacity 120ms ease',
                      }}
                    >
                      <LeadCard lead={lead} onClick={() => onLeadClick(lead)} />
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
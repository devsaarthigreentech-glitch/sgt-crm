// import { useState } from 'react'
// import { AlertTriangle, Check, ChevronDown, User, Tag } from 'lucide-react'
// import type { Lead, LeadType, Vertical } from '../../types'
// import { getVerticalColor } from '../../lib/utils'
// import { useIsMobile } from '../../hooks/useIsMobile'
// import { api } from '../../lib/api'

// interface Props {
//   leads: Lead[]
//   onLeadClick: (lead: Lead) => void
//   onRefresh: () => void
// }

// const LEAD_TYPES: LeadType[] = [
//   'Prospect', 'KOL', 'Partner Prospect',
//   'Distributor Prospect', 'Strategic Contact',
// ]

// const VERTICALS: Vertical[] = [
//   'Industry', 'Marine', 'Vehicles', 'Small DG', 'Cross-vertical',
// ]

// const OWNERS = [
//   'Rohan Mehta', 'Priya Sharma', 'Vikram Iyer',
//   'Anjali Desai', 'Karthik Reddy',
// ]

// const LEAD_TYPE_COLORS: Record<string, string> = {
//   'Prospect':             '#0E5550',
//   'KOL':                  '#1E3A6B',
//   'Partner Prospect':     '#C45A1E',
//   'Distributor Prospect': '#4A7920',
//   'Strategic Contact':    '#5B3B6F',
// }

// interface TriageState {
//   leadType: LeadType | ''
//   vertical: Vertical | ''
//   owner: string
// }

// export default function TriageQueue({ leads, onLeadClick, onRefresh }: Props) {
//   const isMobile = useIsMobile()

//   // Unclassified = no owner assigned
//   const triageLeads = leads.filter(l => !l.owner || l.owner === 'Unassigned')

//   return (
//     <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

//       {/* Header */}
//       <header style={{
//         padding: isMobile ? '14px 16px 12px' : '18px 24px 14px',
//         borderBottom: '1px solid #DDD7C6',
//         backgroundColor: '#F4F0E5', flexShrink: 0,
//       }}>
//         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
//           <div>
//             <h1 style={{
//               fontSize: isMobile ? 19 : 22, fontWeight: 600,
//               letterSpacing: '-0.03em', margin: 0,
//             }}>
//               Triage queue
//             </h1>
//             <p style={{ fontSize: 12.5, color: '#6A675F', marginTop: 4 }}>
//               {triageLeads.length} leads need classification · resolve within 4 business hours
//             </p>
//           </div>
//           {triageLeads.length > 0 && (
//             <div style={{
//               display: 'flex', alignItems: 'center', gap: 6,
//               padding: '6px 12px', backgroundColor: '#F3E2BE',
//               borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#7A4A0E',
//             }}>
//               <AlertTriangle size={13} strokeWidth={2.5} />
//               {triageLeads.length} pending
//             </div>
//           )}
//         </div>
//       </header>

//       {/* Content */}
//       <div style={{
//         flex: 1, overflowY: 'auto',
//         padding: isMobile ? '14px 16px 80px' : '20px 24px 40px',
//       }}>
//         {triageLeads.length === 0 ? (
//           <div style={{
//             display: 'flex', flexDirection: 'column',
//             alignItems: 'center', justifyContent: 'center',
//             paddingTop: 60, gap: 12,
//           }}>
//             <div style={{
//               width: 56, height: 56, borderRadius: '50%',
//               backgroundColor: '#D8E8E6', color: '#0E5550',
//               display: 'flex', alignItems: 'center', justifyContent: 'center',
//               fontSize: 24,
//             }}>
//               ✓
//             </div>
//             <div style={{ fontSize: 15, fontWeight: 600, color: '#161614' }}>
//               Queue is clear
//             </div>
//             <div style={{ fontSize: 13, color: '#6A675F' }}>
//               All leads have been classified and assigned
//             </div>
//           </div>
//         ) : (
//           <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 860 }}>
//             {triageLeads.map(lead => (
//               <TriageCard
//                 key={lead.id}
//                 lead={lead}
//                 isMobile={isMobile}
//                 onLeadClick={onLeadClick}
//                 onAssigned={onRefresh}
//               />
//             ))}
//           </div>
//         )}
//       </div>
//     </div>
//   )
// }

// function TriageCard({ lead, isMobile, onLeadClick, onAssigned }: {
//   lead: Lead
//   isMobile: boolean
//   onLeadClick: (lead: Lead) => void
//   onAssigned: () => void
// }) {
//   const [expanded, setExpanded] = useState(false)
//   const [saving, setSaving]     = useState(false)
//   const [triage, setTriage]     = useState<TriageState>({
//     leadType: '',
//     vertical: '',
//     owner:    '',
//   })

//   const canSave = triage.leadType && triage.owner

//   const handleSave = async () => {
//     if (!canSave) return
//     setSaving(true)
//     try {
//       await api.triageLead(lead.id, {
//         leadType: triage.leadType as LeadType,
//         vertical: triage.vertical || undefined,
//         ownerName: triage.owner,
//       })
//       onAssigned()
//     } catch (err) {
//       console.error('Triage failed', err)
//     } finally {
//       setSaving(false)
//     }
//   }

//   const isProspect = triage.leadType === 'Prospect'

//   return (
//     <div style={{
//       backgroundColor: '#fff', borderRadius: 8,
//       border: '1px solid #DDD7C6',
//       overflow: 'hidden',
//     }}>
//       {/* Card header */}
//       <div style={{
//         padding: isMobile ? '14px 16px' : '16px 20px',
//         display: 'flex', alignItems: 'flex-start',
//         justifyContent: 'space-between', gap: 12,
//       }}>
//         <div
//           style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
//           onClick={() => onLeadClick(lead)}
//         >
//           <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
//             <span style={{
//               fontFamily: 'monospace', fontSize: 11,
//               color: '#A39F94', fontWeight: 600,
//             }}>
//               {(lead as any).displayId ?? lead.id.slice(0, 8)}
//             </span>
//             <span style={{
//               fontSize: 10.5, fontWeight: 600,
//               padding: '2px 7px', borderRadius: 4,
//               backgroundColor: '#F3E2BE', color: '#7A4A0E',
//             }}>
//               Unclassified
//             </span>
//           </div>
//           <div style={{
//             fontSize: isMobile ? 14 : 16,
//             fontWeight: 600, color: '#161614',
//           }}>
//             {lead.company}
//           </div>
//           {lead.contact && (
//             <div style={{ fontSize: 12, color: '#6A675F', marginTop: 3 }}>
//               {lead.contact.name}
//               {lead.contact.role ? ` · ${lead.contact.role}` : ''}
//             </div>
//           )}
//           {lead.location && (
//             <div style={{ fontSize: 12, color: '#A39F94', marginTop: 2 }}>
//               {lead.location}
//             </div>
//           )}
//           {(lead as any).initialNotes && (
//             <div style={{
//               marginTop: 8, fontSize: 12.5, color: '#363633',
//               lineHeight: 1.55, padding: '8px 10px',
//               backgroundColor: '#F4F0E5', borderRadius: 6,
//             }}>
//               {(lead as any).initialNotes}
//             </div>
//           )}
//         </div>

//         {/* Triage toggle */}
//         <button
//           onClick={() => setExpanded(!expanded)}
//           style={{
//             display: 'flex', alignItems: 'center', gap: 5,
//             padding: '7px 12px',
//             backgroundColor: expanded ? '#0E5550' : '#EDE7D8',
//             color: expanded ? '#fff' : '#363633',
//             border: 'none', borderRadius: 6,
//             fontSize: 12, fontWeight: 600, cursor: 'pointer',
//             flexShrink: 0,
//           }}
//         >
//           <Tag size={12} strokeWidth={2.25} />
//           {expanded ? 'Close' : 'Classify'}
//           <ChevronDown
//             size={12} strokeWidth={2.25}
//             style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: '150ms' }}
//           />
//         </button>
//       </div>

//       {/* Triage panel */}
//       {expanded && (
//         <div style={{
//           padding: isMobile ? '14px 16px 16px' : '16px 20px 18px',
//           borderTop: '1px solid #E8E3D2',
//           backgroundColor: '#FAF7EE',
//         }}>
//           <div style={{
//             display: 'grid',
//             gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr',
//             gap: 12, marginBottom: 14,
//           }}>

//             {/* Lead type */}
//             <TriageField label="Lead type" required>
//               <select
//                 value={triage.leadType}
//                 onChange={e => setTriage(t => ({ ...t, leadType: e.target.value as LeadType }))}
//                 style={selectStyle}
//               >
//                 <option value="">Select type…</option>
//                 {LEAD_TYPES.map(t => (
//                   <option key={t} value={t}>{t}</option>
//                 ))}
//               </select>
//             </TriageField>

//             {/* Vertical — only for Prospect */}
//             {isProspect ? (
//               <TriageField label="Vertical">
//                 <select
//                   value={triage.vertical}
//                   onChange={e => setTriage(t => ({ ...t, vertical: e.target.value as Vertical }))}
//                   style={selectStyle}
//                 >
//                   <option value="">Select vertical…</option>
//                   {VERTICALS.map(v => (
//                     <option key={v} value={v}>{v}</option>
//                   ))}
//                 </select>
//               </TriageField>
//             ) : (
//               <div /> // spacer
//             )}

//             {/* Owner */}
//             <TriageField label="Assign to" required>
//               <select
//                 value={triage.owner}
//                 onChange={e => setTriage(t => ({ ...t, owner: e.target.value }))}
//                 style={selectStyle}
//               >
//                 <option value="">Select owner…</option>
//                 {OWNERS.map(o => (
//                   <option key={o} value={o}>{o}</option>
//                 ))}
//               </select>
//             </TriageField>
//           </div>

//           {/* Lead type visual indicator */}
//           {triage.leadType && (
//             <div style={{
//               display: 'flex', alignItems: 'center', gap: 8,
//               padding: '8px 12px', borderRadius: 6, marginBottom: 12,
//               backgroundColor: (LEAD_TYPE_COLORS[triage.leadType] ?? '#0E5550') + '15',
//               border: `1px solid ${LEAD_TYPE_COLORS[triage.leadType] ?? '#0E5550'}`,
//             }}>
//               <div style={{
//                 width: 8, height: 8, borderRadius: '50%',
//                 backgroundColor: LEAD_TYPE_COLORS[triage.leadType] ?? '#0E5550',
//               }} />
//               <span style={{
//                 fontSize: 12.5, fontWeight: 600,
//                 color: LEAD_TYPE_COLORS[triage.leadType] ?? '#0E5550',
//               }}>
//                 {triage.leadType}
//               </span>
//               {triage.vertical && isProspect && (
//                 <>
//                   <span style={{ color: '#DDD7C6' }}>·</span>
//                   <span style={{
//                     fontSize: 12.5, fontWeight: 600,
//                     color: getVerticalColor(triage.vertical),
//                   }}>
//                     {triage.vertical}
//                   </span>
//                 </>
//               )}
//               {triage.owner && (
//                 <>
//                   <span style={{ color: '#DDD7C6' }}>·</span>
//                   <User size={11} strokeWidth={2} style={{ color: '#6A675F' }} />
//                   <span style={{ fontSize: 12, color: '#6A675F' }}>{triage.owner}</span>
//                 </>
//               )}
//             </div>
//           )}

//           <div style={{ display: 'flex', gap: 8 }}>
//             <button
//               onClick={() => setExpanded(false)}
//               style={{
//                 padding: '8px 16px', backgroundColor: 'transparent',
//                 border: '1px solid #DDD7C6', borderRadius: 6,
//                 fontSize: 12.5, fontWeight: 600,
//                 cursor: 'pointer', color: '#6A675F',
//               }}
//             >
//               Cancel
//             </button>
//             <button
//               onClick={handleSave}
//               disabled={!canSave || saving}
//               style={{
//                 flex: 1, padding: '8px 0',
//                 backgroundColor: canSave ? '#0E5550' : '#C9C2AC',
//                 color: '#fff', border: 'none', borderRadius: 6,
//                 fontSize: 12.5, fontWeight: 700,
//                 cursor: canSave ? 'pointer' : 'not-allowed',
//                 display: 'flex', alignItems: 'center',
//                 justifyContent: 'center', gap: 6,
//                 opacity: saving ? 0.7 : 1,
//               }}
//             >
//               <Check size={13} strokeWidth={2.75} />
//               {saving ? 'Saving…' : 'Classify & assign'}
//             </button>
//           </div>
//         </div>
//       )}
//     </div>
//   )
// }

// function TriageField({ label, required, children }: {
//   label: string; required?: boolean; children: React.ReactNode
// }) {
//   return (
//     <div>
//       <label style={{
//         display: 'block', fontSize: 11, fontWeight: 700,
//         color: '#6A675F', letterSpacing: '0.05em',
//         textTransform: 'uppercase', marginBottom: 5,
//       }}>
//         {label}
//         {required && <span style={{ color: '#A02B1F', marginLeft: 3 }}>*</span>}
//       </label>
//       {children}
//     </div>
//   )
// }

// const selectStyle: React.CSSProperties = {
//   width: '100%', padding: '8px 10px',
//   backgroundColor: '#fff', border: '1px solid #DDD7C6',
//   borderRadius: 6, fontSize: 12.5, color: '#161614',
//   outline: 'none', cursor: 'pointer',
// }
import { useState, useEffect } from 'react'
import { AlertTriangle, Check, ChevronDown, User, Tag } from 'lucide-react'
import type { Lead, LeadType, Vertical } from '../../types'
import { getVerticalColor } from '../../lib/utils'
import { useIsMobile } from '../../hooks/useIsMobile'
import { api } from '../../lib/api'

interface Props {
  leads: Lead[]
  onLeadClick: (lead: Lead) => void
  onRefresh: () => void
}

const LEAD_TYPES: LeadType[] = [
  'Prospect', 'KOL', 'Partner Prospect',
  'Distributor Prospect', 'Strategic Contact',
]

const VERTICALS: Vertical[] = [
  'Industry', 'Marine', 'Vehicles', 'Small DG', 'Cross-vertical',
]

const LEAD_TYPE_COLORS: Record<string, string> = {
  'Prospect':             '#0E5550',
  'KOL':                  '#1E3A6B',
  'Partner Prospect':     '#C45A1E',
  'Distributor Prospect': '#4A7920',
  'Strategic Contact':    '#5B3B6F',
}

interface TriageState {
  leadType: LeadType | ''
  vertical: Vertical | ''
  owner: string
}

export default function TriageQueue({ leads, onLeadClick, onRefresh }: Props) {
  const isMobile = useIsMobile()

  // Real employees from lead_service.app_user
  const [owners, setOwners] = useState<string[]>([])
  const [ownersError, setOwnersError] = useState(false)

  useEffect(() => {
    api.getUsers()
      .then(res => setOwners(res.data.map(u => u.name)))
      .catch(err => {
        console.error('Failed to load users', err)
        setOwnersError(true)
      })
  }, [])

  // Unclassified = no owner assigned
  const triageLeads = leads.filter(l => !l.owner || l.owner === 'Unassigned')

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <header style={{
        padding: isMobile ? '14px 16px 12px' : '18px 24px 14px',
        borderBottom: '1px solid #DDD7C6',
        backgroundColor: '#F4F0E5', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{
              fontSize: isMobile ? 19 : 22, fontWeight: 600,
              letterSpacing: '-0.03em', margin: 0,
            }}>
              Triage queue
            </h1>
            <p style={{ fontSize: 12.5, color: '#6A675F', marginTop: 4 }}>
              {triageLeads.length} leads need classification · resolve within 4 business hours
            </p>
          </div>
          {triageLeads.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', backgroundColor: '#F3E2BE',
              borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#7A4A0E',
            }}>
              <AlertTriangle size={13} strokeWidth={2.5} />
              {triageLeads.length} pending
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: isMobile ? '14px 16px 80px' : '20px 24px 40px',
      }}>
        {ownersError && (
          <div style={{
            marginBottom: 12, padding: '8px 12px', maxWidth: 860,
            backgroundColor: '#F3E2BE', color: '#7A4A0E',
            borderRadius: 6, fontSize: 12.5, fontWeight: 600,
          }}>
            Couldn't load the employee list — assignment is disabled. Check that GET /users is reachable.
          </div>
        )}

        {triageLeads.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            paddingTop: 60, gap: 12,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              backgroundColor: '#D8E8E6', color: '#0E5550',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24,
            }}>
              ✓
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#161614' }}>
              Queue is clear
            </div>
            <div style={{ fontSize: 13, color: '#6A675F' }}>
              All leads have been classified and assigned
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 860 }}>
            {triageLeads.map(lead => (
              <TriageCard
                key={lead.id}
                lead={lead}
                owners={owners}
                isMobile={isMobile}
                onLeadClick={onLeadClick}
                onAssigned={onRefresh}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TriageCard({ lead, owners, isMobile, onLeadClick, onAssigned }: {
  lead: Lead
  owners: string[]
  isMobile: boolean
  onLeadClick: (lead: Lead) => void
  onAssigned: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [triage, setTriage]     = useState<TriageState>({
    leadType: '',
    vertical: '',
    owner:    '',
  })

  const canSave = triage.leadType && triage.owner

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await api.triageLead(lead.id, {
        leadType: triage.leadType as LeadType,
        vertical: triage.vertical || undefined,
        ownerName: triage.owner,
      })
      onAssigned()
    } catch (err) {
      console.error('Triage failed', err)
    } finally {
      setSaving(false)
    }
  }

  const isProspect = triage.leadType === 'Prospect'

  return (
    <div style={{
      backgroundColor: '#fff', borderRadius: 8,
      border: '1px solid #DDD7C6',
      overflow: 'hidden',
    }}>
      {/* Card header */}
      <div style={{
        padding: isMobile ? '14px 16px' : '16px 20px',
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 12,
      }}>
        <div
          style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
          onClick={() => onLeadClick(lead)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontFamily: 'monospace', fontSize: 11,
              color: '#A39F94', fontWeight: 600,
            }}>
              {(lead as any).displayId ?? lead.id.slice(0, 8)}
            </span>
            <span style={{
              fontSize: 10.5, fontWeight: 600,
              padding: '2px 7px', borderRadius: 4,
              backgroundColor: '#F3E2BE', color: '#7A4A0E',
            }}>
              Unclassified
            </span>
          </div>
          <div style={{
            fontSize: isMobile ? 14 : 16,
            fontWeight: 600, color: '#161614',
          }}>
            {lead.company}
          </div>
          {lead.contact && (
            <div style={{ fontSize: 12, color: '#6A675F', marginTop: 3 }}>
              {lead.contact.name}
              {lead.contact.role ? ` · ${lead.contact.role}` : ''}
            </div>
          )}
          {lead.location && (
            <div style={{ fontSize: 12, color: '#A39F94', marginTop: 2 }}>
              {lead.location}
            </div>
          )}
          {(lead as any).initialNotes && (
            <div style={{
              marginTop: 8, fontSize: 12.5, color: '#363633',
              lineHeight: 1.55, padding: '8px 10px',
              backgroundColor: '#F4F0E5', borderRadius: 6,
            }}>
              {(lead as any).initialNotes}
            </div>
          )}
        </div>

        {/* Triage toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '7px 12px',
            backgroundColor: expanded ? '#0E5550' : '#EDE7D8',
            color: expanded ? '#fff' : '#363633',
            border: 'none', borderRadius: 6,
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Tag size={12} strokeWidth={2.25} />
          {expanded ? 'Close' : 'Classify'}
          <ChevronDown
            size={12} strokeWidth={2.25}
            style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: '150ms' }}
          />
        </button>
      </div>

      {/* Triage panel */}
      {expanded && (
        <div style={{
          padding: isMobile ? '14px 16px 16px' : '16px 20px 18px',
          borderTop: '1px solid #E8E3D2',
          backgroundColor: '#FAF7EE',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr',
            gap: 12, marginBottom: 14,
          }}>

            {/* Lead type */}
            <TriageField label="Lead type" required>
              <select
                value={triage.leadType}
                onChange={e => setTriage(t => ({ ...t, leadType: e.target.value as LeadType }))}
                style={selectStyle}
              >
                <option value="">Select type…</option>
                {LEAD_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </TriageField>

            {/* Vertical — only for Prospect */}
            {isProspect ? (
              <TriageField label="Vertical">
                <select
                  value={triage.vertical}
                  onChange={e => setTriage(t => ({ ...t, vertical: e.target.value as Vertical }))}
                  style={selectStyle}
                >
                  <option value="">Select vertical…</option>
                  {VERTICALS.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </TriageField>
            ) : (
              <div /> // spacer
            )}

            {/* Owner — real employees from app_user */}
            <TriageField label="Assign to" required>
              <select
                value={triage.owner}
                onChange={e => setTriage(t => ({ ...t, owner: e.target.value }))}
                style={selectStyle}
                disabled={owners.length === 0}
              >
                <option value="">
                  {owners.length === 0 ? 'No employees found…' : 'Select owner…'}
                </option>
                {owners.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </TriageField>
          </div>

          {/* Lead type visual indicator */}
          {triage.leadType && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 6, marginBottom: 12,
              backgroundColor: (LEAD_TYPE_COLORS[triage.leadType] ?? '#0E5550') + '15',
              border: `1px solid ${LEAD_TYPE_COLORS[triage.leadType] ?? '#0E5550'}`,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                backgroundColor: LEAD_TYPE_COLORS[triage.leadType] ?? '#0E5550',
              }} />
              <span style={{
                fontSize: 12.5, fontWeight: 600,
                color: LEAD_TYPE_COLORS[triage.leadType] ?? '#0E5550',
              }}>
                {triage.leadType}
              </span>
              {triage.vertical && isProspect && (
                <>
                  <span style={{ color: '#DDD7C6' }}>·</span>
                  <span style={{
                    fontSize: 12.5, fontWeight: 600,
                    color: getVerticalColor(triage.vertical),
                  }}>
                    {triage.vertical}
                  </span>
                </>
              )}
              {triage.owner && (
                <>
                  <span style={{ color: '#DDD7C6' }}>·</span>
                  <User size={11} strokeWidth={2} style={{ color: '#6A675F' }} />
                  <span style={{ fontSize: 12, color: '#6A675F' }}>{triage.owner}</span>
                </>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setExpanded(false)}
              style={{
                padding: '8px 16px', backgroundColor: 'transparent',
                border: '1px solid #DDD7C6', borderRadius: 6,
                fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer', color: '#6A675F',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              style={{
                flex: 1, padding: '8px 0',
                backgroundColor: canSave ? '#0E5550' : '#C9C2AC',
                color: '#fff', border: 'none', borderRadius: 6,
                fontSize: 12.5, fontWeight: 700,
                cursor: canSave ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 6,
                opacity: saving ? 0.7 : 1,
              }}
            >
              <Check size={13} strokeWidth={2.75} />
              {saving ? 'Saving…' : 'Classify & assign'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TriageField({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 700,
        color: '#6A675F', letterSpacing: '0.05em',
        textTransform: 'uppercase', marginBottom: 5,
      }}>
        {label}
        {required && <span style={{ color: '#A02B1F', marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  backgroundColor: '#fff', border: '1px solid #DDD7C6',
  borderRadius: 6, fontSize: 12.5, color: '#161614',
  outline: 'none', cursor: 'pointer',
}
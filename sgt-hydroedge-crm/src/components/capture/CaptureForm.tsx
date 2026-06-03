// import { useState } from 'react'
// import { Camera } from 'lucide-react'
// import CardScanner from './CardScanner'
// import type { ExtractedCard } from '../../lib/gemini'
// import type { LeadType, Vertical, CommercialModel } from '../../types'
// import { getVerticalColor } from '../../lib/utils'
// import { useIsMobile } from '../../hooks/useIsMobile'

// const LEAD_TYPES: { id: LeadType; label: string; desc: string; color: string }[] = [
//   { id: 'Prospect',             label: 'Prospect',             desc: 'Potential customer',                    color: '#0E5550' },
//   { id: 'KOL',                  label: 'KOL',                  desc: 'Key Opinion Leader / Influencer',       color: '#1E3A6B' },
//   { id: 'Partner Prospect',     label: 'Partner Prospect',     desc: 'Potential sales or channel partner',    color: '#C45A1E' },
//   { id: 'Distributor Prospect', label: 'Distributor Prospect', desc: 'Can distribute through their network',  color: '#4A7920' },
//   { id: 'Strategic Contact',    label: 'Strategic Contact',    desc: 'Events, synergy, no direct business yet', color: '#5B3B6F' },
// ]

// const VERTICALS: Vertical[] = ['Industry', 'Marine', 'Vehicles', 'Small DG', 'Cross-vertical']
// const MODELS: CommercialModel[] = ['DaaS', 'OEM', 'CapEx', 'Consulting']
// const ORIGINS = ['Inbound', 'Outbound', 'Partner-originated']
// const SOURCES = ['Web form', 'Email', 'WhatsApp', 'Mobile capture', 'Partner Portal', 'Bulk import', 'LinkedIn']

// const PARTNER_ARCHETYPES = ['DaaS L1', 'DaaS L2', 'OEM Tier 1', 'OEM Tier 2', 'OEM Tier 3', 'Channel Partner']
// const KOL_TYPES = ['Fleet Aggregator', 'Industry Association', 'Government Body', 'Consultant', 'Other']
// const DISTRIBUTOR_TYPES = ['Regional Distributor', 'National Distributor', 'Sector Specialist', 'Other']
// const STRATEGIC_TYPES = ['Event Partner', 'Media', 'Government', 'Industry Body', 'Research Institution', 'Other']

// const PROSPECT_STAGES = ['New', 'Allocated', 'Qualifying', 'Discovery', 'Proposal', 'Negotiation']
// const KOL_STAGES = ['New', 'Engaged', 'Active', 'Converted']
// const PARTNER_STAGES = ['New', 'Intro Done', 'NDA Signed', 'Commercial Discussion', 'Agreement Signed', 'Active']

// interface FormData {
//   leadType: LeadType
//   companyName: string
//   location: string
//   contactName: string
//   contactRole: string
//   contactEmail: string
//   contactPhone: string
//   vertical: Vertical | ''
//   model: CommercialModel | ''
//   origin: string
//   captureSource: string
//   estimatedValue: string
//   estimatedCloseDate: string
//   notes: string
//   referredBy: string
//   // Type-specific
//   partnerArchetype: string
//   kolType: string
//   distributorType: string
//   strategicType: string
//   networkSize: string
//   territory: string
// }

// const EMPTY: FormData = {
//   leadType: 'Prospect',
//   companyName: '', location: '',
//   contactName: '', contactRole: '', contactEmail: '', contactPhone: '',
//   vertical: '', model: '', origin: '', captureSource: '',
//   estimatedValue: '', estimatedCloseDate: '', notes: '',
//   referredBy: '',
//   partnerArchetype: '', kolType: '', distributorType: '',
//   strategicType: '', networkSize: '', territory: '',
// }

// interface Props {
//   onCancel: () => void
//   onSubmit: (data: FormData) => void
// }

// export default function CaptureForm({ onCancel, onSubmit }: Props) {
//   const isMobile = useIsMobile()
//   const [form, setForm]           = useState<FormData>(EMPTY)
//   const [showScanner, setShowScanner] = useState(false)
//   const [submitted, setSubmitted] = useState(false)

//   const set = (key: keyof FormData, value: string) =>
//     setForm(f => ({ ...f, [key]: value }))

//   const handleCardExtracted = (card: ExtractedCard) => {
//     setForm(f => ({
//       ...f,
//       companyName:  card.companyName || f.companyName,
//       location:     card.location    || f.location,
//       contactName:  card.contactName || f.contactName,
//       contactRole:  card.role        || f.contactRole,
//       contactEmail: card.email       || f.contactEmail,
//       contactPhone: card.phone       || f.contactPhone,
//     }))
//     setShowScanner(false)
//   }

//   const canSubmit = form.companyName.trim() && form.contactName.trim()

//   const handleSubmit = () => {
//     if (!canSubmit) return
//     setSubmitted(true)
//     setTimeout(() => onSubmit(form), 1200)
//   }

//   if (submitted) {
//     return (
//       <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F0E5' }}>
//         <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
//           <div style={{
//             width: 56, height: 56, borderRadius: '50%',
//             backgroundColor: '#D8E8E6',
//             display: 'flex', alignItems: 'center', justifyContent: 'center',
//             margin: '0 auto 16px', fontSize: 24,
//           }}>✓</div>
//           <div style={{ fontSize: 20, fontWeight: 700, color: '#161614', letterSpacing: '-0.025em' }}>
//             {form.leadType} added
//           </div>
//           <div style={{ fontSize: 13, color: '#6A675F', marginTop: 8, lineHeight: 1.6 }}>
//             {form.companyName} has been added to your pipeline.
//           </div>
//         </div>
//       </div>
//     )
//   }

//   const selectedType = LEAD_TYPES.find(t => t.id === form.leadType)

//   return (
//     <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

//       {/* Header */}
//       <header style={{
//         padding: isMobile ? '14px 16px 12px' : '18px 24px 14px',
//         borderBottom: '1px solid #DDD7C6',
//         backgroundColor: '#F4F0E5', flexShrink: 0,
//         display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
//       }}>
//         <div>
//           <h1 style={{ fontSize: isMobile ? 19 : 22, fontWeight: 600, letterSpacing: '-0.03em', margin: 0 }}>
//             Capture lead
//           </h1>
//           <p style={{ fontSize: 12.5, color: '#6A675F', marginTop: 4 }}>
//             Web form · WhatsApp · Email · Mobile · Partner Portal
//           </p>
//         </div>
//         <button
//           onClick={() => setShowScanner(true)}
//           style={{
//             display: 'flex', alignItems: 'center', gap: 7,
//             padding: '8px 14px', backgroundColor: '#0E5550', color: '#fff',
//             border: 'none', borderRadius: 7,
//             fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
//           }}
//         >
//           <Camera size={14} strokeWidth={2.25} />
//           Scan card
//         </button>
//       </header>

//       {/* Form */}
//       <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 16px 80px' : '24px 24px 40px' }}>
//         <div style={{ maxWidth: 640 }}>

//           {/* Step 1 — Lead type */}
//           <Section title="What kind of relationship is this?">
//             <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
//               {LEAD_TYPES.map(t => (
//                 <button
//                   key={t.id}
//                   onClick={() => set('leadType', t.id)}
//                   style={{
//                     display: 'flex', alignItems: 'center', gap: 14,
//                     padding: '12px 14px', borderRadius: 8,
//                     border: `1.5px solid ${form.leadType === t.id ? t.color : '#DDD7C6'}`,
//                     backgroundColor: form.leadType === t.id ? t.color + '15' : '#fff',
//                     cursor: 'pointer', textAlign: 'left', width: '100%',
//                   }}
//                 >
//                   <div style={{
//                     width: 10, height: 10, borderRadius: '50%',
//                     backgroundColor: form.leadType === t.id ? t.color : '#C9C2AC',
//                     flexShrink: 0,
//                   }} />
//                   <div>
//                     <div style={{
//                       fontSize: 13, fontWeight: form.leadType === t.id ? 700 : 500,
//                       color: form.leadType === t.id ? t.color : '#161614',
//                     }}>
//                       {t.label}
//                     </div>
//                     <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 1 }}>
//                       {t.desc}
//                     </div>
//                   </div>
//                   {form.leadType === t.id && (
//                     <div style={{ marginLeft: 'auto', fontSize: 16, color: t.color }}>✓</div>
//                   )}
//                 </button>
//               ))}
//             </div>
//           </Section>

//           {/* Account */}
//           <Section title="Account">
//             <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
//               <Field label="Company name" required>
//                 <input
//                   value={form.companyName}
//                   onChange={e => set('companyName', e.target.value)}
//                   placeholder="e.g. Reliance Industries"
//                   style={inputStyle}
//                 />
//               </Field>
//               <Field label="Location">
//                 <input
//                   value={form.location}
//                   onChange={e => set('location', e.target.value)}
//                   placeholder="City, State"
//                   style={inputStyle}
//                 />
//               </Field>
//             </div>
//           </Section>

//           {/* Primary contact */}
//           <Section title="Primary contact">
//             <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
//               <Field label="Name" required>
//                 <input value={form.contactName} onChange={e => set('contactName', e.target.value)} style={inputStyle} />
//               </Field>
//               <Field label="Role / designation">
//                 <input value={form.contactRole} onChange={e => set('contactRole', e.target.value)} placeholder="e.g. GM Operations" style={inputStyle} />
//               </Field>
//               <Field label="Email">
//                 <input type="email" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} style={inputStyle} />
//               </Field>
//               <Field label="Phone / WhatsApp">
//                 <input value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} placeholder="+91 …" style={inputStyle} />
//               </Field>
//             </div>
//           </Section>

//           {/* Prospect-specific fields */}
//           {form.leadType === 'Prospect' && (
//             <Section title="Opportunity details">
//               <Field label="Vertical" required>
//                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
//                   {VERTICALS.map(v => {
//                     const selected = form.vertical === v
//                     return (
//                       <button
//                         key={v}
//                         onClick={() => set('vertical', v)}
//                         style={{
//                           padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
//                           fontSize: 12.5, fontWeight: selected ? 700 : 500,
//                           backgroundColor: selected ? getVerticalColor(v) : '#fff',
//                           color: selected ? '#fff' : '#363633',
//                           border: `1.5px solid ${selected ? getVerticalColor(v) : '#DDD7C6'}`,
//                         }}
//                       >
//                         {v}
//                       </button>
//                     )
//                   })}
//                 </div>
//               </Field>
//               <Field label="Commercial model" required>
//                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
//                   {MODELS.map(m => (
//                     <button
//                       key={m}
//                       onClick={() => set('model', m)}
//                       style={{
//                         padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
//                         fontSize: 12.5, fontWeight: form.model === m ? 700 : 500,
//                         backgroundColor: form.model === m ? '#0E5550' : '#fff',
//                         color: form.model === m ? '#fff' : '#363633',
//                         border: `1.5px solid ${form.model === m ? '#0E5550' : '#DDD7C6'}`,
//                       }}
//                     >
//                       {m}
//                     </button>
//                   ))}
//                 </div>
//               </Field>
//               <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
//                 <Field label="Origin">
//                   <select value={form.origin} onChange={e => set('origin', e.target.value)} style={inputStyle}>
//                     <option value="">Select…</option>
//                     {ORIGINS.map(o => <option key={o}>{o}</option>)}
//                   </select>
//                 </Field>
//                 <Field label="Capture source">
//                   <select value={form.captureSource} onChange={e => set('captureSource', e.target.value)} style={inputStyle}>
//                     <option value="">Select…</option>
//                     {SOURCES.map(s => <option key={s}>{s}</option>)}
//                   </select>
//                 </Field>
//               </div>
//               <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
//                 <Field label="Estimated value (₹)">
//                   <input
//                     type="number"
//                     value={form.estimatedValue}
//                     onChange={e => set('estimatedValue', e.target.value)}
//                     placeholder="2500000"
//                     style={{ ...inputStyle, fontFamily: 'monospace' }}
//                   />
//                 </Field>
//                 <Field label="Estimated close date">
//                   <input type="date" value={form.estimatedCloseDate} onChange={e => set('estimatedCloseDate', e.target.value)} style={inputStyle} />
//                 </Field>
//               </div>
//             </Section>
//           )}

//           {/* KOL-specific */}
//           {form.leadType === 'KOL' && (
//             <Section title="KOL details">
//               <Field label="KOL type">
//                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
//                   {KOL_TYPES.map(t => (
//                     <button key={t} onClick={() => set('kolType', t)} style={{
//                       padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
//                       fontSize: 12.5, fontWeight: form.kolType === t ? 700 : 500,
//                       backgroundColor: form.kolType === t ? '#1E3A6B' : '#fff',
//                       color: form.kolType === t ? '#fff' : '#363633',
//                       border: `1.5px solid ${form.kolType === t ? '#1E3A6B' : '#DDD7C6'}`,
//                     }}>{t}</button>
//                   ))}
//                 </div>
//               </Field>
//               <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
//                 <Field label="Estimated reach (fleet operators)">
//                   <input
//                     type="number"
//                     value={form.networkSize}
//                     onChange={e => set('networkSize', e.target.value)}
//                     placeholder="e.g. 500"
//                     style={inputStyle}
//                   />
//                 </Field>
//                 <Field label="Territory / geography">
//                   <input value={form.territory} onChange={e => set('territory', e.target.value)} placeholder="e.g. Maharashtra, Gujarat" style={inputStyle} />
//                 </Field>
//               </div>
//             </Section>
//           )}

//           {/* Partner Prospect-specific */}
//           {form.leadType === 'Partner Prospect' && (
//             <Section title="Partnership details">
//               <Field label="Partner archetype">
//                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
//                   {PARTNER_ARCHETYPES.map(a => (
//                     <button key={a} onClick={() => set('partnerArchetype', a)} style={{
//                       padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
//                       fontSize: 12.5, fontWeight: form.partnerArchetype === a ? 700 : 500,
//                       backgroundColor: form.partnerArchetype === a ? '#C45A1E' : '#fff',
//                       color: form.partnerArchetype === a ? '#fff' : '#363633',
//                       border: `1.5px solid ${form.partnerArchetype === a ? '#C45A1E' : '#DDD7C6'}`,
//                     }}>{a}</button>
//                   ))}
//                 </div>
//               </Field>
//               <Field label="Territory / geography covered">
//                 <input value={form.territory} onChange={e => set('territory', e.target.value)} placeholder="e.g. South India" style={inputStyle} />
//               </Field>
//             </Section>
//           )}

//           {/* Distributor Prospect-specific */}
//           {form.leadType === 'Distributor Prospect' && (
//             <Section title="Distributor details">
//               <Field label="Distributor type">
//                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
//                   {DISTRIBUTOR_TYPES.map(t => (
//                     <button key={t} onClick={() => set('distributorType', t)} style={{
//                       padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
//                       fontSize: 12.5, fontWeight: form.distributorType === t ? 700 : 500,
//                       backgroundColor: form.distributorType === t ? '#4A7920' : '#fff',
//                       color: form.distributorType === t ? '#fff' : '#363633',
//                       border: `1.5px solid ${form.distributorType === t ? '#4A7920' : '#DDD7C6'}`,
//                     }}>{t}</button>
//                   ))}
//                 </div>
//               </Field>
//               <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
//                 <Field label="Network size (operators)">
//                   <input type="number" value={form.networkSize} onChange={e => set('networkSize', e.target.value)} placeholder="e.g. 200" style={inputStyle} />
//                 </Field>
//                 <Field label="Territory covered">
//                   <input value={form.territory} onChange={e => set('territory', e.target.value)} placeholder="e.g. North India" style={inputStyle} />
//                 </Field>
//               </div>
//             </Section>
//           )}

//           {/* Strategic Contact-specific */}
//           {form.leadType === 'Strategic Contact' && (
//             <Section title="Relationship details">
//               <Field label="Relationship type">
//                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
//                   {STRATEGIC_TYPES.map(t => (
//                     <button key={t} onClick={() => set('strategicType', t)} style={{
//                       padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
//                       fontSize: 12.5, fontWeight: form.strategicType === t ? 700 : 500,
//                       backgroundColor: form.strategicType === t ? '#5B3B6F' : '#fff',
//                       color: form.strategicType === t ? '#fff' : '#363633',
//                       border: `1.5px solid ${form.strategicType === t ? '#5B3B6F' : '#DDD7C6'}`,
//                     }}>{t}</button>
//                   ))}
//                 </div>
//               </Field>
//             </Section>
//           )}

//           {/* Referred by — show for all types except Prospect */}
//           {form.leadType !== 'Prospect' && (
//             <Section title="Attribution">
//               <Field label="Referred by / source contact">
//                 <input
//                   value={form.referredBy}
//                   onChange={e => set('referredBy', e.target.value)}
//                   placeholder="Name or company who introduced this contact"
//                   style={inputStyle}
//                 />
//               </Field>
//             </Section>
//           )}

//           {/* Notes — all types */}
//           <Section title="Notes">
//             <Field label="Context">
//               <textarea
//                 value={form.notes}
//                 onChange={e => set('notes', e.target.value)}
//                 placeholder="Any relevant context — how you met, what was discussed, what makes this relationship worth tracking."
//                 rows={3}
//                 style={{ ...inputStyle, resize: 'vertical', minHeight: 78 }}
//               />
//             </Field>
//           </Section>

//           {/* Actions */}
//           <div style={{
//             display: 'flex', gap: 10, paddingTop: 16,
//             borderTop: '1px solid #DDD7C6',
//           }}>
//             <button
//               onClick={onCancel}
//               style={{
//                 padding: '10px 20px', backgroundColor: '#EDE7D8',
//                 border: '1px solid #DDD7C6', borderRadius: 7,
//                 fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#363633',
//               }}
//             >
//               Cancel
//             </button>
//             <button
//               onClick={handleSubmit}
//               disabled={!canSubmit}
//               style={{
//                 marginLeft: 'auto', padding: '10px 24px',
//                 backgroundColor: canSubmit ? (selectedType?.color ?? '#0E5550') : '#C9C2AC',
//                 color: '#fff', border: 'none', borderRadius: 7,
//                 fontSize: 13, fontWeight: 700,
//                 cursor: canSubmit ? 'pointer' : 'not-allowed',
//               }}
//             >
//               Add {form.leadType}
//             </button>
//           </div>

//         </div>
//       </div>

//       {showScanner && (
//         <CardScanner
//           onExtracted={handleCardExtracted}
//           onClose={() => setShowScanner(false)}
//         />
//       )}
//     </div>
//   )
// }

// function Section({ title, children }: { title: string; children: React.ReactNode }) {
//   return (
//     <div style={{ marginBottom: 28 }}>
//       <div style={{
//         fontSize: 10.5, fontWeight: 700, color: '#161614',
//         letterSpacing: '0.1em', textTransform: 'uppercase',
//         paddingBottom: 8, borderBottom: '1.5px solid #161614', marginBottom: 14,
//       }}>
//         {title}
//       </div>
//       <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//         {children}
//       </div>
//     </div>
//   )
// }

// function Field({ label, required, children }: {
//   label: string; required?: boolean; children: React.ReactNode
// }) {
//   return (
//     <div>
//       <label style={{
//         display: 'block', fontSize: 11.5, color: '#6A675F',
//         marginBottom: 6, fontWeight: 600,
//       }}>
//         {label}{required && <span style={{ color: '#A02B1F', marginLeft: 3 }}>*</span>}
//       </label>
//       {children}
//     </div>
//   )
// }

// const inputStyle: React.CSSProperties = {
//   width: '100%', padding: '9px 11px',
//   backgroundColor: '#fff', border: '1px solid #DDD7C6',
//   borderRadius: 6, fontSize: 13, color: '#161614', outline: 'none',
// }
import { useState } from 'react'
import { Camera, Send } from 'lucide-react'
import CardScanner from './CardScanner'
import type { ExtractedCard } from '../../lib/gemini'
import { useIsMobile } from '../../hooks/useIsMobile'

interface FormData {
  companyName: string
  contactName: string
  phone: string
  email: string
  location: string
  notes: string
}

const EMPTY: FormData = {
  companyName: '',
  contactName: '',
  phone: '',
  email: '',
  location: '',
  notes: '',
}

interface Props {
  onCancel: () => void
  onSubmit: (data: FormData) => void
}

export default function CaptureForm({ onCancel, onSubmit }: Props) {
  const isMobile = useIsMobile()
  const [form, setForm]               = useState<FormData>(EMPTY)
  const [showScanner, setShowScanner] = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [done, setDone]               = useState(false)

  const set = (key: keyof FormData, value: string) =>
    setForm(f => ({ ...f, [key]: value }))

  const handleCardExtracted = (card: ExtractedCard) => {
    setForm(f => ({
      ...f,
      companyName: card.companyName || f.companyName,
      contactName: card.contactName || f.contactName,
      phone:       card.phone       || f.phone,
      email:       card.email       || f.email,
      location:    card.location    || f.location,
    }))
    setShowScanner(false)
  }

  const canSubmit = form.companyName.trim() && form.contactName.trim()

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    await onSubmit(form)
    setDone(true)
    setSubmitting(false)
  }

  if (done) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center',
        justifyContent: 'center', backgroundColor: '#F4F0E5',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 360, padding: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            backgroundColor: '#D8E8E6', color: '#0E5550',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', fontSize: 28,
          }}>
            ✓
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#161614', letterSpacing: '-0.025em' }}>
            Lead captured
          </div>
          <div style={{ fontSize: 13, color: '#6A675F', marginTop: 8, lineHeight: 1.6 }}>
            <strong style={{ color: '#161614' }}>{form.companyName}</strong> added to triage queue.
            Sales Ops will classify and assign it shortly.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'center' }}>
            <button
              onClick={() => { setForm(EMPTY); setDone(false) }}
              style={{
                padding: '10px 20px', backgroundColor: '#0E5550', color: '#fff',
                border: 'none', borderRadius: 7,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Capture another
            </button>
            <button
              onClick={onCancel}
              style={{
                padding: '10px 20px', backgroundColor: '#EDE7D8',
                border: '1px solid #DDD7C6', borderRadius: 7,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#363633',
              }}
            >
              Go to pipeline
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <header style={{
        padding: isMobile ? '14px 16px 12px' : '18px 24px 14px',
        borderBottom: '1px solid #DDD7C6',
        backgroundColor: '#F4F0E5', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{
            fontSize: isMobile ? 19 : 22, fontWeight: 600,
            letterSpacing: '-0.03em', margin: 0,
          }}>
            Quick capture
          </h1>
          <p style={{ fontSize: 12, color: '#6A675F', marginTop: 4 }}>
            Capture now · classify later · goes to triage queue
          </p>
        </div>
        <button
          onClick={() => setShowScanner(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 14px', backgroundColor: '#0E5550', color: '#fff',
            border: 'none', borderRadius: 7,
            fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Camera size={14} strokeWidth={2.25} />
          {isMobile ? 'Scan' : 'Scan card'}
        </button>
      </header>

      {/* Form */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: isMobile ? '20px 16px 80px' : '32px 24px 40px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{ width: '100%', maxWidth: 480 }}>

          {/* Triage notice */}
          <div style={{
            padding: '10px 14px', backgroundColor: '#EDE7D8',
            borderRadius: 8, marginBottom: 24,
            fontSize: 12, color: '#6A675F', lineHeight: 1.6,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <span style={{ fontSize: 16 }}>💡</span>
            <span>
              Just capture the basics. Lead type, vertical, value and owner
              are set in the <strong style={{ color: '#363633' }}>triage queue</strong> — no need to know everything now.
            </span>
          </div>

          {/* Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <Field label="Company name" required>
              <input
                value={form.companyName}
                onChange={e => set('companyName', e.target.value)}
                placeholder="e.g. Reliance Industries Hazira"
                style={inputStyle}
                autoFocus
              />
            </Field>

            <Field label="Contact name" required>
              <input
                value={form.contactName}
                onChange={e => set('contactName', e.target.value)}
                placeholder="Full name of the person you spoke to"
                style={inputStyle}
              />
            </Field>

            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
              gap: 12,
            }}>
              <Field label="Phone / WhatsApp">
                <input
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="+91 …"
                  style={inputStyle}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="their@email.com"
                  style={inputStyle}
                />
              </Field>
            </div>

            <Field label="Location">
              <input
                value={form.location}
                onChange={e => set('location', e.target.value)}
                placeholder="City, State"
                style={inputStyle}
              />
            </Field>

            <Field label="Quick notes">
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="How you met, what they do, why they're worth tracking — anything relevant."
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
              />
            </Field>

          </div>

          {/* Actions */}
          <div style={{
            display: 'flex', gap: 10, marginTop: 28,
            paddingTop: 20, borderTop: '1px solid #DDD7C6',
          }}>
            <button
              onClick={onCancel}
              style={{
                padding: '11px 20px', backgroundColor: '#EDE7D8',
                border: '1px solid #DDD7C6', borderRadius: 7,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#363633',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              style={{
                flex: 1, padding: '11px 0',
                backgroundColor: canSubmit ? '#C45A1E' : '#C9C2AC',
                color: '#fff', border: 'none', borderRadius: 7,
                fontSize: 13, fontWeight: 700,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 7,
                opacity: submitting ? 0.7 : 1,
              }}
            >
              <Send size={14} strokeWidth={2.5} />
              {submitting ? 'Saving…' : 'Capture lead'}
            </button>
          </div>

        </div>
      </div>

      {showScanner && (
        <CardScanner
          onExtracted={handleCardExtracted}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  )
}

function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 11.5, color: '#6A675F',
        marginBottom: 6, fontWeight: 600,
      }}>
        {label}
        {required && <span style={{ color: '#A02B1F', marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  backgroundColor: '#fff', border: '1px solid #DDD7C6',
  borderRadius: 7, fontSize: 13, color: '#161614', outline: 'none',
}
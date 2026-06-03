// import { useState, useEffect } from 'react'
// import { Shield, Plus, LogOut, Search, Check, AlertTriangle, Lock, X } from 'lucide-react'
// import { PARTNER, PARTNER_LEADS, CONFLICT_ACCOUNTS, RESERVED_ACCOUNTS } from '../../data/partnerData'
// import { formatINR, getVerticalColor } from '../../lib/utils'
// import type { Lead } from '../../types'

// type PartnerScreen = 'home' | 'register'
// type ConflictState = 'idle' | 'checking' | 'clear' | 'conflict' | 'reserved'

// interface Props {
//   onExit: () => void
// }

// export default function PartnerPortal({ onExit }: Props) {
//   const [screen, setScreen] = useState<PartnerScreen>('home')
//   const [submitted, setSubmitted] = useState(false)
//   const [registeredCompany, setRegisteredCompany] = useState('')

//   if (submitted) {
//     return <SuccessScreen company={registeredCompany} onBack={() => { setSubmitted(false); setScreen('home') }} onRegisterAnother={() => { setSubmitted(false); setScreen('register') }} />
//   }

//   return (
//     <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

//       {/* Partner top bar */}
//       <div style={{
//         padding: '14px 24px',
//         borderBottom: '1px solid #DDD7C6',
//         backgroundColor: '#F5E0CC',
//         display: 'flex', alignItems: 'center', justifyContent: 'space-between',
//         flexShrink: 0,
//       }}>
//         <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
//           <div style={{
//             width: 36, height: 36, borderRadius: 8,
//             backgroundColor: '#C45A1E', color: '#fff',
//             display: 'flex', alignItems: 'center', justifyContent: 'center',
//             fontSize: 12, fontWeight: 700,
//           }}>
//             {PARTNER.initials}
//           </div>
//           <div>
//             <div style={{ fontSize: 13.5, fontWeight: 700, color: '#161614' }}>{PARTNER.name}</div>
//             <div style={{ fontSize: 10.5, color: '#6F2F0E', fontWeight: 600 }}>
//               {PARTNER.archetype} · {PARTNER.tier} partner
//             </div>
//           </div>
//         </div>
//         <button
//           onClick={onExit}
//           style={{
//             display: 'flex', alignItems: 'center', gap: 6,
//             padding: '6px 12px', backgroundColor: 'transparent',
//             border: '1px solid #DDD7C6', borderRadius: 6,
//             fontSize: 12, fontWeight: 600, color: '#363633', cursor: 'pointer',
//           }}
//         >
//           <LogOut size={13} strokeWidth={2} />
//           Exit portal
//         </button>
//       </div>

//       {/* Tabs */}
//       <div style={{
//         display: 'flex', borderBottom: '1px solid #DDD7C6',
//         backgroundColor: '#fff', flexShrink: 0,
//       }}>
//         {([['home', 'My leads'], ['register', 'Register lead']] as const).map(([id, label]) => (
//           <button
//             key={id}
//             onClick={() => setScreen(id)}
//             style={{
//               padding: '10px 20px', border: 'none', background: 'transparent',
//               fontSize: 13, fontWeight: screen === id ? 700 : 500,
//               color: screen === id ? '#161614' : '#6A675F',
//               cursor: 'pointer', position: 'relative',
//             }}
//           >
//             {label}
//             {screen === id && (
//               <div style={{
//                 position: 'absolute', bottom: 0, left: 8, right: 8,
//                 height: 2, backgroundColor: '#C45A1E', borderRadius: '2px 2px 0 0',
//               }} />
//             )}
//           </button>
//         ))}
//       </div>

//       {/* Content */}
//       <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#F4F0E5' }}>
//         {screen === 'home'
//           ? <PartnerHome />
//           : <RegisterLead
//               onSubmit={(company) => { setRegisteredCompany(company); setSubmitted(true) }}
//             />
//         }
//       </div>
//     </div>
//   )
// }

// // ── Partner Home ─────────────────────────────────────────────────────────────

// function PartnerHome() {
//   const totalValue = PARTNER_LEADS.reduce((s, l) => s + l.value, 0)
//   const avgDays = Math.round(
//     PARTNER_LEADS.reduce((s, l) => s + (l.protection?.daysLeft ?? 0), 0) / PARTNER_LEADS.length
//   )

//   return (
//     <div style={{ padding: '22px 24px 40px', maxWidth: 800 }}>

//       {/* Stats strip */}
//       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
//         {[
//           { label: 'Active registrations', value: String(PARTNER_LEADS.length), accent: '#C45A1E', mono: false },
//           { label: 'Avg. protection left',  value: `${avgDays}d`,               accent: '#0E5550', mono: true  },
//           { label: 'Pipeline value',        value: formatINR(totalValue),        accent: '#1E3A6B', mono: true  },
//         ].map(s => (
//           <div key={s.label} style={{
//             backgroundColor: '#fff', borderRadius: 8,
//             border: '1px solid #DDD7C6', padding: '12px 14px',
//             borderTop: `3px solid ${s.accent}`,
//           }}>
//             <div style={{ fontSize: 10, color: '#6A675F', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
//               {s.label}
//             </div>
//             <div style={{
//               marginTop: 6, fontSize: 22, fontWeight: 700, color: '#161614',
//               letterSpacing: '-0.02em', fontFamily: s.mono ? 'monospace' : 'inherit',
//             }}>
//               {s.value}
//             </div>
//           </div>
//         ))}
//       </div>

//       {/* Lead list */}
//       <div style={{
//         fontSize: 10.5, fontWeight: 700, color: '#161614',
//         letterSpacing: '0.1em', textTransform: 'uppercase',
//         paddingBottom: 8, borderBottom: '1.5px solid #161614', marginBottom: 14,
//       }}>
//         Your registered leads
//       </div>

//       <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
//         {PARTNER_LEADS.map(lead => (
//           <PartnerLeadRow key={lead.id} lead={lead} />
//         ))}
//       </div>
//     </div>
//   )
// }

// function PartnerLeadRow({ lead }: { lead: Lead }) {
//   const accentColor = getVerticalColor(lead.vertical)
//   const daysLeft = lead.protection?.daysLeft ?? 0

//   return (
//     <div style={{
//       backgroundColor: '#fff', borderRadius: 8,
//       border: '1px solid #DDD7C6', padding: '14px 16px 14px 20px',
//       position: 'relative', overflow: 'hidden',
//       display: 'flex', alignItems: 'center', gap: 16,
//     }}>
//       <div style={{
//         position: 'absolute', left: 0, top: 0, bottom: 0,
//         width: 4, backgroundColor: accentColor,
//       }} />
//       <div style={{ flex: 1, minWidth: 0 }}>
//         <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
//           <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#A39F94', fontWeight: 600 }}>
//             {lead.id}
//           </span>
//           <span style={{
//             fontSize: 10.5, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
//             backgroundColor: accentColor + '22', color: accentColor,
//           }}>
//             {lead.vertical}
//           </span>
//         </div>
//         <div style={{ fontSize: 14, fontWeight: 600, color: '#161614' }}>{lead.company}</div>
//         <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 2 }}>
//           Stage: <strong style={{ color: '#161614' }}>{lead.stage}</strong>
//         </div>
//       </div>
//       <div style={{ textAlign: 'right', flexShrink: 0 }}>
//         <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#161614' }}>
//           {formatINR(lead.value)}
//         </div>
//         <div style={{ marginTop: 6 }}>
//           <span style={{
//             display: 'inline-flex', alignItems: 'center', gap: 4,
//             fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
//             backgroundColor: daysLeft <= 14 ? '#F3E2BE' : '#D8E8E6',
//             color: daysLeft <= 14 ? '#7A4A0E' : '#052927',
//           }}>
//             <Shield size={10} strokeWidth={2} />
//             {daysLeft}d protection
//           </span>
//         </div>
//       </div>
//     </div>
//   )
// }

// // ── Register Lead ─────────────────────────────────────────────────────────────

// function RegisterLead({ onSubmit }: { onSubmit: (company: string) => void }) {
//   const [company, setCompany]           = useState('')
//   const [location, setLocation]         = useState('')
//   const [contactName, setContactName]   = useState('')
//   const [contactRole, setContactRole]   = useState('')
//   const [contactEmail, setContactEmail] = useState('')
//   const [vertical, setVertical]         = useState('')
//   const [model, setModel]               = useState('')
//   const [conflictState, setConflictState] = useState<ConflictState>('idle')

//   // Live conflict check
//   useEffect(() => {
//     if (!company || company.length < 3) {
//       setConflictState('idle')
//       return
//     }
//     setConflictState('checking')
//     const timer = setTimeout(() => {
//       const lower = company.toLowerCase()
//       if (CONFLICT_ACCOUNTS.some(c => lower.includes(c))) {
//         setConflictState('conflict')
//       } else if (RESERVED_ACCOUNTS.some(r => lower.includes(r))) {
//         setConflictState('reserved')
//       } else {
//         setConflictState('clear')
//       }
//     }, 600)
//     return () => clearTimeout(timer)
//   }, [company])

//   const canSubmit =
//     conflictState === 'clear' &&
//     company.trim() &&
//     contactName.trim() &&
//     contactEmail.trim() &&
//     vertical &&
//     model

//   return (
//     <div style={{ padding: '22px 24px 40px', maxWidth: 640 }}>

//       {/* Conflict banner */}
//       <ConflictBanner state={conflictState} company={company} />

//       {/* Account */}
//       <FormSection title="Account">
//         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
//           <FormField label="Company name" required>
//             <input
//               value={company}
//               onChange={e => setCompany(e.target.value)}
//               placeholder='Try "Cochin Shipyard" or "Adani Ports"'
//               style={inputStyle}
//               autoFocus
//             />
//           </FormField>
//           <FormField label="Location">
//             <input value={location} onChange={e => setLocation(e.target.value)} placeholder="City, State" style={inputStyle} />
//           </FormField>
//         </div>
//       </FormSection>

//       {/* Contact */}
//       <FormSection title="Primary contact">
//         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
//           <FormField label="Name" required>
//             <input value={contactName} onChange={e => setContactName(e.target.value)} style={inputStyle} />
//           </FormField>
//           <FormField label="Role">
//             <input value={contactRole} onChange={e => setContactRole(e.target.value)} placeholder="e.g. GM Operations" style={inputStyle} />
//           </FormField>
//           <FormField label="Email" required>
//             <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} style={inputStyle} />
//           </FormField>
//           <FormField label="Phone / WhatsApp">
//             <input placeholder="+91 …" style={inputStyle} />
//           </FormField>
//         </div>
//       </FormSection>

//       {/* Opportunity */}
//       <FormSection title="Opportunity">
//         <FormField label="Vertical" required>
//           <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
//             {(['Industry', 'Marine', 'Vehicles', 'Small DG', 'Cross-vertical'] as const).map(v => (
//               <button
//                 key={v}
//                 onClick={() => setVertical(v)}
//                 style={{
//                   padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
//                   fontSize: 12.5, fontWeight: vertical === v ? 700 : 500,
//                   backgroundColor: vertical === v ? getVerticalColor(v) : '#fff',
//                   color: vertical === v ? '#fff' : '#363633',
//                   border: `1.5px solid ${vertical === v ? getVerticalColor(v) : '#DDD7C6'}`,
//                 }}
//               >
//                 {v}
//               </button>
//             ))}
//           </div>
//         </FormField>
//         <FormField label="Commercial model" required>
//           <div style={{ display: 'flex', gap: 8 }}>
//             {(['DaaS', 'OEM', 'CapEx', 'Consulting'] as const).map(m => (
//               <button
//                 key={m}
//                 onClick={() => setModel(m)}
//                 style={{
//                   padding: '7px 16px', borderRadius: 6, cursor: 'pointer',
//                   fontSize: 12.5, fontWeight: model === m ? 700 : 500,
//                   backgroundColor: model === m ? '#0E5550' : '#fff',
//                   color: model === m ? '#fff' : '#363633',
//                   border: `1.5px solid ${model === m ? '#0E5550' : '#DDD7C6'}`,
//                 }}
//               >
//                 {m}
//               </button>
//             ))}
//           </div>
//         </FormField>
//         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
//           <FormField label="Estimated value (₹)">
//             <input type="number" placeholder="2500000" style={{ ...inputStyle, fontFamily: 'monospace' }} />
//           </FormField>
//           <FormField label="Expected timeline">
//             <input placeholder="e.g. Q2 FY27" style={inputStyle} />
//           </FormField>
//         </div>
//         <FormField label="Context — why you, why now">
//           <textarea
//             placeholder="Briefly: what they're asking for, who you've spoken to, what makes this real."
//             rows={3}
//             style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
//           />
//         </FormField>
//       </FormSection>

//       {/* Disclaimer */}
//       <div style={{
//         padding: '12px 14px', backgroundColor: '#FAF7EE',
//         borderRadius: 7, border: '1px solid #E8E3D2',
//         fontSize: 11.5, color: '#6A675F', lineHeight: 1.6, marginBottom: 20,
//       }}>
//         <strong style={{ color: '#363633' }}>By submitting, you confirm</strong> that you have made verifiable
//         contact with this account in the last 30 days and that the contact above is real and reachable.
//       </div>

//       {/* Submit */}
//       <button
//         onClick={() => canSubmit && onSubmit(company)}
//         disabled={!canSubmit}
//         style={{
//           width: '100%', padding: '11px 0',
//           backgroundColor: canSubmit ? '#C45A1E' : '#C9C2AC',
//           color: '#fff', border: 'none', borderRadius: 7,
//           fontSize: 13, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
//           display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
//         }}
//       >
//         <Shield size={14} strokeWidth={2.5} />
//         Register &amp; start 90-day protection
//       </button>
//     </div>
//   )
// }

// // ── Conflict Banner ───────────────────────────────────────────────────────────

// function ConflictBanner({ state, company }: { state: ConflictState; company: string }) {
//   if (state === 'idle') return (
//     <div style={{
//       padding: '12px 16px', backgroundColor: '#FAF7EE',
//       border: '1px dashed #C9C2AC', borderRadius: 8, marginBottom: 20,
//       display: 'flex', alignItems: 'center', gap: 10,
//     }}>
//       <Search size={15} strokeWidth={2} style={{ color: '#A39F94' }} />
//       <span style={{ fontSize: 12.5, color: '#6A675F' }}>
//         Start typing the company name — conflict check runs live.
//       </span>
//     </div>
//   )

//   if (state === 'checking') return (
//     <div style={{
//       padding: '12px 16px', backgroundColor: '#EDE7D8',
//       border: '1px solid #DDD7C6', borderRadius: 8, marginBottom: 20,
//       display: 'flex', alignItems: 'center', gap: 10,
//     }}>
//       <div style={{
//         width: 14, height: 14, borderRadius: '50%',
//         border: '2px solid #C9C2AC', borderTopColor: '#0E5550',
//         animation: 'spin 0.7s linear infinite',
//       }} />
//       <span style={{ fontSize: 13, color: '#363633' }}>
//         Checking <strong>{company}</strong>…
//       </span>
//       <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
//     </div>
//   )

//   if (state === 'clear') return (
//     <div style={{
//       padding: '14px 16px 12px 20px', backgroundColor: '#D8E8E6',
//       border: '1.5px solid #0E5550', borderRadius: 8, marginBottom: 20,
//       position: 'relative', overflow: 'hidden',
//     }}>
//       <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: '#0E5550' }} />
//       <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
//         <div style={{
//           width: 22, height: 22, borderRadius: '50%', backgroundColor: '#0E5550',
//           color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
//         }}>
//           <Check size={13} strokeWidth={3} />
//         </div>
//         <div>
//           <div style={{ fontSize: 13, fontWeight: 700, color: '#052927' }}>
//             All clear — no conflict detected
//           </div>
//           <div style={{ fontSize: 12, color: '#052927', marginTop: 3, opacity: 0.85 }}>
//             <strong>{company}</strong> has no active registrations. On submission you'll receive a{' '}
//             <strong>90-day protection window</strong> starting immediately.
//           </div>
//         </div>
//       </div>
//     </div>
//   )

//   if (state === 'conflict') return (
//     <div style={{
//       padding: '14px 16px 12px 20px', backgroundColor: '#F3E2BE',
//       border: '1.5px solid #A86A18', borderRadius: 8, marginBottom: 20,
//       position: 'relative', overflow: 'hidden',
//     }}>
//       <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: '#A86A18' }} />
//       <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
//         <div style={{
//           width: 22, height: 22, borderRadius: '50%', backgroundColor: '#A86A18',
//           color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
//         }}>
//           <AlertTriangle size={12} strokeWidth={2.75} />
//         </div>
//         <div>
//           <div style={{ fontSize: 13, fontWeight: 700, color: '#7A4A0E' }}>
//             Existing registration — your request will be queued
//           </div>
//           <div style={{ fontSize: 12, color: '#7A4A0E', marginTop: 3, opacity: 0.9, lineHeight: 1.6 }}>
//             Another partner holds an active registration on <strong>{company}</strong>.
//             If their protection window lapses (90 days inactivity, deal loss, or expiry),
//             your queued request activates automatically.
//           </div>
//         </div>
//       </div>
//     </div>
//   )

//   if (state === 'reserved') return (
//     <div style={{
//       padding: '14px 16px 12px 20px', backgroundColor: '#F0D5D0',
//       border: '1.5px solid #A02B1F', borderRadius: 8, marginBottom: 20,
//       position: 'relative', overflow: 'hidden',
//     }}>
//       <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: '#A02B1F' }} />
//       <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
//         <div style={{
//           width: 22, height: 22, borderRadius: '50%', backgroundColor: '#A02B1F',
//           color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
//         }}>
//           <Lock size={11} strokeWidth={2.75} />
//         </div>
//         <div>
//           <div style={{ fontSize: 13, fontWeight: 700, color: '#751A11' }}>
//             Reserved anchor account — partners cannot register
//           </div>
//           <div style={{ fontSize: 12, color: '#751A11', marginTop: 3, opacity: 0.9, lineHeight: 1.6 }}>
//             <strong>{company}</strong> is an SGT anchor account pursued by our direct sales team.
//             Per Partner Handbook §4.2, anchor accounts are not available for partner registration.
//             Contact your Programme Lead for a co-pursuit conversation.
//           </div>
//         </div>
//       </div>
//     </div>
//   )

//   return null
// }

// // ── Success Screen ────────────────────────────────────────────────────────────

// function SuccessScreen({ company, onBack, onRegisterAnother }: {
//   company: string
//   onBack: () => void
//   onRegisterAnother: () => void
// }) {
//   const expiryDate = new Date()
//   expiryDate.setDate(expiryDate.getDate() + 90)
//   const expiryStr = expiryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

//   return (
//     <div style={{
//       flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
//       backgroundColor: '#F4F0E5', padding: 24,
//     }}>
//       <div style={{
//         backgroundColor: '#fff', borderRadius: 12, padding: '32px 28px',
//         maxWidth: 440, width: '100%',
//         border: '1.5px solid #0E5550',
//         position: 'relative', overflow: 'hidden',
//       }}>
//         <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: '#0E5550' }} />

//         <div style={{
//           width: 56, height: 56, borderRadius: '50%', backgroundColor: '#D8E8E6',
//           display: 'flex', alignItems: 'center', justifyContent: 'center',
//           margin: '0 auto 16px',
//         }}>
//           <Shield size={28} style={{ color: '#0E5550' }} />
//         </div>

//         <div style={{ textAlign: 'center' }}>
//           <div style={{ fontSize: 20, fontWeight: 700, color: '#161614', letterSpacing: '-0.025em' }}>
//             Lead registered. Protection active.
//           </div>
//           <div style={{ fontSize: 13, color: '#6A675F', marginTop: 8, lineHeight: 1.6 }}>
//             <strong style={{ color: '#161614' }}>{company}</strong> is now protected for your account
//             for the next 90 days. SGT will assign a shadow contact to support your pursuit.
//           </div>
//         </div>

//         {/* Protection countdown */}
//         <div style={{
//           backgroundColor: '#D8E8E6', borderRadius: 8, padding: '16px 20px',
//           margin: '20px 0', display: 'flex', justifyContent: 'space-around', alignItems: 'center',
//         }}>
//           <div style={{ textAlign: 'center' }}>
//             <div style={{ fontSize: 10, fontWeight: 700, color: '#052927', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
//               Protected until
//             </div>
//             <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600, color: '#052927', marginTop: 4 }}>
//               {expiryStr}
//             </div>
//           </div>
//           <div style={{ width: 1, height: 36, backgroundColor: '#0E5550', opacity: 0.3 }} />
//           <div style={{ textAlign: 'center' }}>
//             <div style={{ fontSize: 10, fontWeight: 700, color: '#052927', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
//               Days remaining
//             </div>
//             <div style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 700, color: '#052927', marginTop: 2, letterSpacing: '-0.02em' }}>
//               90
//             </div>
//           </div>
//         </div>

//         <div style={{ display: 'flex', gap: 10 }}>
//           <button
//             onClick={onBack}
//             style={{
//               flex: 1, padding: '10px 0', backgroundColor: '#EDE7D8',
//               border: '1px solid #DDD7C6', borderRadius: 7,
//               fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#363633',
//             }}
//           >
//             My leads
//           </button>
//           <button
//             onClick={onRegisterAnother}
//             style={{
//               flex: 1, padding: '10px 0', backgroundColor: '#C45A1E',
//               border: 'none', borderRadius: 7,
//               fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#fff',
//             }}
//           >
//             Register another
//           </button>
//         </div>
//       </div>
//     </div>
//   )
// }

// // ── Shared atoms ──────────────────────────────────────────────────────────────

// function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
//   return (
//     <div style={{ marginBottom: 28 }}>
//       <div style={{
//         fontSize: 10.5, fontWeight: 700, color: '#161614',
//         letterSpacing: '0.1em', textTransform: 'uppercase',
//         paddingBottom: 8, borderBottom: '1.5px solid #161614', marginBottom: 14,
//       }}>
//         {title}
//       </div>
//       <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
//         {children}
//       </div>
//     </div>
//   )
// }

// function FormField({ label, required, children }: {
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
// Partner Portal shell. Renders only the tabs the partner's archetype permits.
// Mount this where your existing partial portal lives (e.g. routed from Sidebar).
import { useState } from 'react'
import { partnerApi, useResource } from './partnerApi'
import { tabsForPartner, TAB_LABELS, ARCHETYPE_LABELS, type TabKey } from './permissions'
import {
  MyLeads, RegisterLead, MyCustomers, Scorecard,
  Statements, DocumentHub, Training, ServiceTickets,
} from './screens'
import { t } from '../../lib/tokens'

export default function PartnerPortal() {
  const { data: me, loading, error } = useResource(() => partnerApi.me())
  const [tab, setTab] = useState<TabKey>('leads')
  const [reloadKey, setReloadKey] = useState(0)

  if (loading) return <Center>Loading portal…</Center>
  if (error || !me) return <Center>{error ?? 'Could not load partner session'}</Center>

  const tabs = tabsForPartner(me)
  const active = tabs.includes(tab) ? tab : tabs[0]

  return (
    <div style={{ backgroundColor: t.ground, minHeight: '100vh' }}>
      {/* identity bar */}
      <div style={{
        backgroundColor: t.green, color: '#fff', padding: '16px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
      }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{me.name}</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {ARCHETYPE_LABELS[me.archetype] ?? me.archetype} · {me.portal === 'full' ? 'Full portal' : 'Channel portal'}
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
          backgroundColor: 'rgba(255,255,255,0.18)',
        }}>{me.id}</span>
      </div>

      {/* tabs */}
      <div style={{
        display: 'flex', gap: 4, padding: '8px 12px', overflowX: 'auto',
        borderBottom: `1px solid ${t.border}`, backgroundColor: t.surface,
      }}>
        {tabs.map(k => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '8px 12px', borderRadius: 8, border: 'none', whiteSpace: 'nowrap',
            backgroundColor: active === k ? t.green : 'transparent',
            color: active === k ? '#fff' : t.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>{TAB_LABELS[k]}</button>
        ))}
      </div>

      {/* body */}
      <div style={{ padding: 20 }} key={`${active}-${reloadKey}`}>
        {active === 'leads' && <MyLeads />}
        {active === 'register' && <RegisterLead onDone={() => { setReloadKey(k => k + 1); setTab('leads') }} />}
        {active === 'customers' && <MyCustomers />}
        {active === 'scorecard' && <Scorecard />}
        {active === 'statements' && <Statements />}
        {active === 'documents' && <DocumentHub />}
        {active === 'training' && <Training />}
        {active === 'tickets' && <ServiceTickets />}
      </div>
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 40, textAlign: 'center', color: t.muted, fontSize: 14 }}>{children}</div>
}
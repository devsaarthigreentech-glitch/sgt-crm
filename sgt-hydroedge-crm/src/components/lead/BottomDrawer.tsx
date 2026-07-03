import { useState, useEffect } from 'react'
import { X, Sparkles, Target, Calendar, Send } from 'lucide-react'
import type { Lead, ActivityType, ActivityOutcome } from '../../types'

interface Props {
  lead: Lead
  onClose: () => void
  onSubmit: (activity: {
    type: ActivityType
    channel: string
    summary: string
    outcome?: ActivityOutcome
    nextStep?: { description: string; due: string }
  }) => void
}

const TYPES: { id: ActivityType; label: string }[] = [
  { id: 'meeting',      label: 'Meeting'       },
  { id: 'call',         label: 'Call'          },
  { id: 'email',        label: 'Email'         },
  { id: 'whatsapp',     label: 'WhatsApp'      },
  { id: 'document',     label: 'Document'      },
  { id: 'installation', label: 'Installation'  },
  { id: 'service',      label: 'Service Visit' },
]

const AI_DRAFTS: Record<string, string> = {
  meeting:      'Met with the team for approx 60 minutes. Covered scope of existing infrastructure and key pain points. Budget confirmed for this quarter. Next: send revised proposal.',
  call:         'Outbound call (~20 min). Qualified on budget and timeline. Key concern raised around SLA terms. Requested a site visit. Next: confirm date by EOW.',
  email:        'Sent follow-up email with the case study as requested on last call. Asked for a call this week to walk through their baseline numbers.',
  whatsapp:     'WhatsApp thread active. Shared brochure and one-pager. Contact responsive, confirmed decision timeline of Q2 FY27.',
  document:     'Submitted revised proposal via email. Key changes: updated pricing, added monsoon SLA clause, corrected fuel baseline.',
  installation: 'Unit powered up and handed over to the site team. Verified safe shutdown/restart, captured baseline readings, and walked the operator through daily checks. No open issues at handover.',
  service:      'Ran full diagnostic, cleaned and inspected the core assembly, verified sensor calibration. Unit returned to normal operation and site team briefed on next preventive window.',
}

export default function BottomDrawer({ lead, onClose, onSubmit }: Props) {
  const [type, setType]       = useState<ActivityType | null>(null)
  const [summary, setSummary] = useState('')
  const [outcome, setOutcome] = useState<ActivityOutcome | null>(null)
  const [nextStep, setNextStep] = useState({ description: '', due: '' })
  const [drafting, setDrafting] = useState(false)
  const [backdate, setBackdate] = useState(false)
  const [meetingFormat, setMeetingFormat] = useState('In-person')
  const [callDir, setCallDir] = useState('Outbound')
  const [duration, setDuration] = useState('')

  // Installation meta
  const [instSite, setInstSite]         = useState('')
  const [instDate, setInstDate]         = useState('')
  const [instModel, setInstModel]       = useState('')
  const [instSerial, setInstSerial]     = useState('')
  const [instQty, setInstQty]           = useState('')
  const [instEngineer, setInstEngineer] = useState('')
  const [instBaseline, setInstBaseline] = useState('')
  const [instStatus, setInstStatus]     = useState('Commissioned')

  // Service meta
  const [svcType, setSvcType]             = useState('Preventive')
  const [svcModel, setSvcModel]           = useState('')
  const [svcSerial, setSvcSerial]         = useState('')
  const [svcIssue, setSvcIssue]           = useState('')
  const [svcParts, setSvcParts]           = useState('')
  const [svcNextDue, setSvcNextDue]       = useState('')
  const [svcResolution, setSvcResolution] = useState('Resolved')

  // Close on ESC
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const aiDraft = () => {
    if (!type) return
    setDrafting(true)
    setTimeout(() => {
      setSummary(AI_DRAFTS[type] ?? '')
      setDrafting(false)
    }, 900)
  }

  // ── Structured summary composers ─────────────────────────────
  const composeInstall = (): string => {
    const facts: string[] = []
    const head: string[] = []
    if (instQty)   head.push(`${instQty}×`)
    if (instModel) head.push(instModel)
    let line = head.join(' ')
    if (instSerial) line += ` (SN ${instSerial})`
    if (instSite)   line += ` at ${instSite}`
    if (line.trim()) facts.push(`Installed ${line.trim()}.`)
    if (instDate)     facts.push(`Commissioned ${instDate}.`)
    if (instEngineer) facts.push(`Engineer: ${instEngineer}.`)
    if (instBaseline) facts.push(`Baseline: ${instBaseline}.`)
    if (instStatus)   facts.push(`Status: ${instStatus}.`)
    const head2 = facts.join(' ')
    return summary.trim() ? `${head2}\n${summary.trim()}` : head2
  }

  const composeService = (): string => {
    const facts: string[] = []
    let head = `${svcType} service`
    if (svcModel)  head += ` — ${svcModel}`
    if (svcSerial) head += ` (SN ${svcSerial})`
    facts.push(head + '.')
    if (svcIssue)       facts.push(`Issue: ${svcIssue}.`)
    if (summary.trim()) facts.push(`Work: ${summary.trim()}.`)
    if (svcParts)       facts.push(`Parts: ${svcParts}.`)
    if (svcResolution)  facts.push(`Outcome: ${svcResolution}.`)
    if (svcNextDue)     facts.push(`Next service due ${svcNextDue}.`)
    return facts.join(' ')
  }

  const submit = () => {
    if (!type || !canSubmit) return

    let finalSummary = summary
    let channel: string = type
    let step = nextStep.description ? nextStep : undefined

    if (type === 'meeting') {
      channel = meetingFormat
    } else if (type === 'installation') {
      finalSummary = composeInstall()
      channel = instStatus || 'Installation'
    } else if (type === 'service') {
      finalSummary = composeService()
      channel = svcType || 'Service'
      if (!step && svcNextDue) step = { description: 'Next service visit', due: svcNextDue }
    }

    onSubmit({
      type,
      channel,
      summary: finalSummary,
      outcome: outcome ?? undefined,
      nextStep: step,
    })
    onClose()
  }

  const baseText = summary.trim().length >= 5
  const canSubmit = !!type && (
    type === 'installation' ? (instSite.trim().length > 0 || instModel.trim().length > 0)
    : type === 'service'    ? (svcIssue.trim().length > 0 || baseText)
    : baseText
  )

  const summaryPlaceholder =
    type === 'installation' ? 'Handover notes, operator training, anything to flag…'
    : type === 'service'    ? 'Work performed on site, diagnostics, observations…'
    : `What happened in this ${type}?`

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(22,22,20,0.35)', zIndex: 50,
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 51,
        backgroundColor: '#fff',
        borderRadius: '14px 14px 0 0',
        boxShadow: '0 -8px 40px rgba(22,22,20,0.12)',
        maxHeight: '82vh',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#C9C2AC' }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 20px 14px',
          borderBottom: '1px solid #E8E3D2',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>Log activity</div>
            <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 2 }}>
            {lead.company} · {(lead as any).displayId ?? lead.id}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              backgroundColor: '#EDE7D8', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#6A675F',
            }}
          >
            <X size={15} strokeWidth={2.25} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 8px' }}>

          {/* Type chips */}
          <Label>Activity type</Label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {TYPES.map(t => (
              <button
                key={t.id}
                onClick={() => { setType(t.id); setSummary('') }}
                style={{
                  padding: '7px 14px', borderRadius: 7,
                  border: `1.5px solid ${type === t.id ? '#0E5550' : '#DDD7C6'}`,
                  backgroundColor: type === t.id ? '#0E5550' : '#EDE7D8',
                  color: type === t.id ? '#fff' : '#363633',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {type && (
            <>
              {/* Meeting meta */}
              {type === 'meeting' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div>
                    <Label>Format</Label>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {['In-person', 'Video', 'Phone'].map(f => (
                        <button
                          key={f}
                          onClick={() => setMeetingFormat(f)}
                          style={{
                            flex: 1, padding: '6px 0', fontSize: 11.5, fontWeight: 600,
                            backgroundColor: meetingFormat === f ? '#0E5550' : '#fff',
                            color: meetingFormat === f ? '#fff' : '#363633',
                            border: `1px solid ${meetingFormat === f ? '#0E5550' : '#DDD7C6'}`,
                            borderRadius: 5, cursor: 'pointer',
                          }}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Duration (min)</Label>
                    <input
                      type="number"
                      value={duration}
                      onChange={e => setDuration(e.target.value)}
                      placeholder="60"
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}

              {/* Call meta */}
              {type === 'call' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div>
                    <Label>Direction</Label>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {['Inbound', 'Outbound'].map(d => (
                        <button
                          key={d}
                          onClick={() => setCallDir(d)}
                          style={{
                            flex: 1, padding: '7px 0', fontSize: 11.5, fontWeight: 600,
                            backgroundColor: callDir === d ? '#0E5550' : '#fff',
                            color: callDir === d ? '#fff' : '#363633',
                            border: `1px solid ${callDir === d ? '#0E5550' : '#DDD7C6'}`,
                            borderRadius: 5, cursor: 'pointer',
                          }}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Duration (min)</Label>
                    <input
                      type="number"
                      value={duration}
                      onChange={e => setDuration(e.target.value)}
                      placeholder="20"
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}

              {/* Email subject */}
              {type === 'email' && (
                <div style={{ marginBottom: 14 }}>
                  <Label>Subject</Label>
                  <input placeholder="e.g. Revised proposal v2" style={inputStyle} />
                </div>
              )}

              {/* Installation meta */}
              {type === 'installation' && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <Label>Site / location</Label>
                      <input value={instSite} onChange={e => setInstSite(e.target.value)} placeholder="e.g. Chakan plant" style={inputStyle} />
                    </div>
                    <div>
                      <Label>Commissioning date</Label>
                      <input type="date" value={instDate} onChange={e => setInstDate(e.target.value)} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11.5 }} />
                    </div>
                    <div>
                      <Label>Product / model</Label>
                      <input value={instModel} onChange={e => setInstModel(e.target.value)} placeholder="e.g. GreenDrive H2-50" style={inputStyle} />
                    </div>
                    <div>
                      <Label>Serial no.</Label>
                      <input value={instSerial} onChange={e => setInstSerial(e.target.value)} placeholder="SN…" style={inputStyle} />
                    </div>
                    <div>
                      <Label>Quantity</Label>
                      <input type="number" value={instQty} onChange={e => setInstQty(e.target.value)} placeholder="1" style={inputStyle} />
                    </div>
                    <div>
                      <Label>Engineer</Label>
                      <input value={instEngineer} onChange={e => setInstEngineer(e.target.value)} placeholder="Technician name" style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <Label>Baseline reading</Label>
                    <input value={instBaseline} onChange={e => setInstBaseline(e.target.value)} placeholder="e.g. diesel baseline 42 L/day, meter 10432" style={inputStyle} />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <ChipRow options={['Installed', 'Commissioned', 'Handover done', 'Issue open']} value={instStatus} onChange={setInstStatus} />
                  </div>
                </div>
              )}

              {/* Service meta */}
              {type === 'service' && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ marginBottom: 10 }}>
                    <Label>Visit type</Label>
                    <ChipRow options={['Preventive', 'Corrective', 'Breakdown']} value={svcType} onChange={setSvcType} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <Label>Product / model</Label>
                      <input value={svcModel} onChange={e => setSvcModel(e.target.value)} placeholder="e.g. GreenDrive H2-50" style={inputStyle} />
                    </div>
                    <div>
                      <Label>Serial no.</Label>
                      <input value={svcSerial} onChange={e => setSvcSerial(e.target.value)} placeholder="SN…" style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <Label>Issue reported</Label>
                    <input value={svcIssue} onChange={e => setSvcIssue(e.target.value)} placeholder="What was the fault / reason for the visit?" style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <Label>Parts replaced</Label>
                      <input value={svcParts} onChange={e => setSvcParts(e.target.value)} placeholder="e.g. filter, sensor" style={inputStyle} />
                    </div>
                    <div>
                      <Label>Next service due</Label>
                      <input type="date" value={svcNextDue} onChange={e => setSvcNextDue(e.target.value)} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11.5 }} />
                    </div>
                  </div>
                  <div>
                    <Label>Resolution</Label>
                    <ChipRow options={['Resolved', 'Pending parts', 'Escalated']} value={svcResolution} onChange={setSvcResolution} />
                  </div>
                </div>
              )}

              {/* Summary */}
              <div style={{ marginBottom: 14 }}>
                <Label>{type === 'installation' || type === 'service' ? 'Work notes' : 'Summary'}</Label>
                <div style={{ position: 'relative' }}>
                  <textarea
                    value={summary}
                    onChange={e => setSummary(e.target.value)}
                    placeholder={summaryPlaceholder}
                    rows={4}
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 88, paddingRight: 44 }}
                  />
                  <button
                    onClick={aiDraft}
                    disabled={drafting}
                    title="AI draft"
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 28, height: 28,
                      backgroundColor: '#F5E0CC',
                      border: '1px solid #DDD7C6',
                      borderRadius: 5, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#6F2F0E',
                    }}
                  >
                    {drafting
                      ? <div style={{
                          width: 11, height: 11, borderRadius: '50%',
                          border: '2px solid #DDD7C6',
                          borderTopColor: '#C45A1E',
                          animation: 'spin 0.7s linear infinite',
                        }} />
                      : <Sparkles size={13} strokeWidth={2} />
                    }
                  </button>
                </div>
              </div>

              {/* Outcome */}
              <div style={{ marginBottom: 14 }}>
                <Label>Outcome</Label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([
                    ['positive', 'Positive', '#3D6B1C', '#DDE9C9'],
                    ['neutral',  'Neutral',  '#7A4A0E', '#F3E2BE'],
                    ['concern',  'Concern',  '#751A11', '#F0D5D0'],
                  ] as const).map(([id, label, color, bg]) => (
                    <button
                      key={id}
                      onClick={() => setOutcome(id)}
                      style={{
                        flex: 1, padding: '8px 0', fontSize: 12.5, fontWeight: 600,
                        backgroundColor: outcome === id ? bg : 'transparent',
                        color: outcome === id ? color : '#6A675F',
                        border: `1.5px solid ${outcome === id ? color : '#DDD7C6'}`,
                        borderRadius: 6, cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Next step */}
              <div style={{
                padding: '12px 14px', backgroundColor: '#F5E0CC',
                borderRadius: 8, marginBottom: 12,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
                }}>
                  <Target size={13} strokeWidth={2.5} style={{ color: '#6F2F0E' }} />
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#6F2F0E', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Next step
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                  <input
                    value={nextStep.description}
                    onChange={e => setNextStep(s => ({ ...s, description: e.target.value }))}
                    placeholder="What happens next?"
                    style={inputStyle}
                  />
                  <input
                    type="date"
                    value={nextStep.due}
                    onChange={e => setNextStep(s => ({ ...s, due: e.target.value }))}
                    style={{ ...inputStyle, width: 140, fontFamily: 'monospace', fontSize: 11.5 }}
                  />
                </div>
              </div>

              {/* Backdate */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <button
                  onClick={() => setBackdate(!backdate)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 11.5, color: '#6A675F', background: 'none',
                    border: 'none', cursor: 'pointer', padding: 0,
                  }}
                >
                  <Calendar size={12} strokeWidth={2} />
                  {backdate ? 'Use "just now"' : 'Backdate this entry'}
                </button>
                {backdate && (
                  <input
                    type="datetime-local"
                    style={{ ...inputStyle, flex: 1, fontSize: 11.5, fontFamily: 'monospace' }}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* Pinned submit */}
        <div style={{
          padding: '12px 20px 20px',
          borderTop: '1px solid #E8E3D2',
          display: 'flex', gap: 8,
          backgroundColor: '#fff',
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 16px', backgroundColor: '#EDE7D8',
              border: '1px solid #DDD7C6', borderRadius: 7,
              fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#363633',
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            style={{
              flex: 1, padding: '10px 0',
              backgroundColor: canSubmit ? '#C45A1E' : '#C9C2AC',
              color: '#fff', border: 'none', borderRadius: 7,
              fontSize: 13, fontWeight: 700,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Send size={14} strokeWidth={2.5} />
            Save activity
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px',
  backgroundColor: '#fff',
  border: '1px solid #DDD7C6',
  borderRadius: 6, fontSize: 13, color: '#161614', outline: 'none',
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 700, color: '#6A675F',
      letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6,
    }}>
      {children}
    </div>
  )
}

function ChipRow({ options, value, onChange }: {
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {options.map(o => (
        <button
          key={o}
          onClick={() => onChange(o)}
          style={{
            padding: '7px 12px', fontSize: 11.5, fontWeight: 600,
            backgroundColor: value === o ? '#0E5550' : '#fff',
            color: value === o ? '#fff' : '#363633',
            border: `1px solid ${value === o ? '#0E5550' : '#DDD7C6'}`,
            borderRadius: 5, cursor: 'pointer',
          }}
        >
          {o}
        </button>
      ))}
    </div>
  )
}
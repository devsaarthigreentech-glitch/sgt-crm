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
  { id: 'meeting',  label: 'Meeting'  },
  { id: 'call',     label: 'Call'     },
  { id: 'email',    label: 'Email'    },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'document', label: 'Document' },
]

const AI_DRAFTS: Record<string, string> = {
  meeting:  'Met with the team for approx 60 minutes. Covered scope of existing infrastructure and key pain points. Budget confirmed for this quarter. Next: send revised proposal.',
  call:     'Outbound call (~20 min). Qualified on budget and timeline. Key concern raised around SLA terms. Requested a site visit. Next: confirm date by EOW.',
  email:    'Sent follow-up email with the case study as requested on last call. Asked for a call this week to walk through their baseline numbers.',
  whatsapp: 'WhatsApp thread active. Shared brochure and one-pager. Contact responsive, confirmed decision timeline of Q2 FY27.',
  document: 'Submitted revised proposal via email. Key changes: updated pricing, added monsoon SLA clause, corrected fuel baseline.',
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

  const submit = () => {
    if (!type || !summary.trim()) return
    onSubmit({
      type,
      channel: type === 'meeting' ? meetingFormat : type,
      summary,
      outcome: outcome ?? undefined,
      nextStep: nextStep.description ? nextStep : undefined,
    })
    onClose()
  }

  const canSubmit = type && summary.trim().length >= 5

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

              {/* Summary */}
              <div style={{ marginBottom: 14 }}>
                <Label>Summary</Label>
                <div style={{ position: 'relative' }}>
                  <textarea
                    value={summary}
                    onChange={e => setSummary(e.target.value)}
                    placeholder={`What happened in this ${type}?`}
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
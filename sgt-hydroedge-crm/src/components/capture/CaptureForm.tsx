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
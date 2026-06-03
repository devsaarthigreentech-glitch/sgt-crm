import { useState, useRef } from 'react'
import { Camera, Upload, X, Loader, CheckCircle, AlertCircle } from 'lucide-react'
import { extractBusinessCard, type ExtractedCard } from '../../lib/gemini'

interface Props {
  onExtracted: (card: ExtractedCard) => void
  onClose: () => void
}

type ScanState = 'idle' | 'scanning' | 'done' | 'error'

export default function CardScanner({ onExtracted, onClose }: Props) {
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string>('')
  const [extracted, setExtracted] = useState<ExtractedCard | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file) return

    // Show preview
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    // Extract
    setScanState('scanning')
    setError('')

    try {
      const result = await extractBusinessCard(file)
      setExtracted(result)
      setScanState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed. Try again.')
      setScanState('error')
    }
  }

  const handleUseDetails = () => {
    if (extracted) onExtracted(extracted)
  }

  const reset = () => {
    setScanState('idle')
    setPreview(null)
    setError('')
    setExtracted(null)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(22,22,20,0.5)', zIndex: 60,
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 61, backgroundColor: '#fff',
        borderRadius: 12, width: 'min(480px, calc(100vw - 32px))',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(22,22,20,0.18)',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px',
          borderBottom: '1px solid #E8E3D2',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#161614' }}>
              Scan business card
            </div>
            <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 2 }}>
              Take a photo or upload from gallery
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              backgroundColor: '#EDE7D8', border: 'none',
              cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#6A675F',
            }}
          >
            <X size={15} strokeWidth={2.25} />
          </button>
        </div>

        <div style={{ padding: '20px' }}>

          {/* Idle state — pick source */}
          {scanState === 'idle' && !preview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Camera button */}
              <button
                onClick={() => cameraInputRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '16px 18px', backgroundColor: '#F4F0E5',
                  border: '1.5px solid #DDD7C6', borderRadius: 10,
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  backgroundColor: '#0E5550', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Camera size={22} strokeWidth={2} />
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#161614' }}>
                    Take a photo
                  </div>
                  <div style={{ fontSize: 12, color: '#6A675F', marginTop: 2 }}>
                    Use your camera to capture a business card
                  </div>
                </div>
              </button>

              {/* Upload button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '16px 18px', backgroundColor: '#F4F0E5',
                  border: '1.5px solid #DDD7C6', borderRadius: 10,
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  backgroundColor: '#C45A1E', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Upload size={22} strokeWidth={2} />
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#161614' }}>
                    Upload from gallery
                  </div>
                  <div style={{ fontSize: 12, color: '#6A675F', marginTop: 2 }}>
                    Pick an existing photo from your device
                  </div>
                </div>
              </button>

              <div style={{
                marginTop: 8, padding: '10px 14px',
                backgroundColor: '#FAF7EE', borderRadius: 7,
                border: '1px solid #E8E3D2',
                fontSize: 11.5, color: '#6A675F', lineHeight: 1.6,
              }}>
                💡 Works best with business cards, meeting notes, or any photo
                containing contact information. Powered by Gemini AI.
              </div>
            </div>
          )}

          {/* Preview + scanning */}
          {preview && (
            <div>
              <img
                src={preview}
                alt="Card preview"
                style={{
                  width: '100%', borderRadius: 8,
                  border: '1px solid #DDD7C6',
                  maxHeight: 220, objectFit: 'cover',
                  marginBottom: 16,
                }}
              />

              {/* Scanning state */}
              {scanState === 'scanning' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 16px', backgroundColor: '#EDE7D8',
                  borderRadius: 8, marginBottom: 16,
                }}>
                  <Loader size={18} strokeWidth={2} style={{
                    color: '#0E5550', animation: 'spin 1s linear infinite',
                  }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#161614' }}>
                      Reading card details…
                    </div>
                    <div style={{ fontSize: 11.5, color: '#6A675F', marginTop: 1 }}>
                      Gemini AI is extracting the information
                    </div>
                  </div>
                </div>
              )}

              {/* Error state */}
              {scanState === 'error' && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 14px', backgroundColor: '#F0D5D0',
                  border: '1px solid #A02B1F', borderRadius: 8, marginBottom: 16,
                }}>
                  <AlertCircle size={16} style={{ color: '#A02B1F', flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#751A11' }}>
                      Could not read card
                    </div>
                    <div style={{ fontSize: 12, color: '#751A11', marginTop: 2 }}>
                      {error}
                    </div>
                  </div>
                </div>
              )}

              {/* Success state — extracted fields */}
              {scanState === 'done' && extracted && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 12,
                  }}>
                    <CheckCircle size={16} style={{ color: '#3D6B1C' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#3D6B1C' }}>
                      Details extracted — review before using
                    </span>
                  </div>

                  <div style={{
                    backgroundColor: '#F4F0E5', borderRadius: 8,
                    border: '1px solid #DDD7C6', overflow: 'hidden',
                  }}>
                    {[
                      { label: 'Company',  value: extracted.companyName },
                      { label: 'Name',     value: extracted.contactName },
                      { label: 'Role',     value: extracted.role        },
                      { label: 'Email',    value: extracted.email       },
                      { label: 'Phone',    value: extracted.phone       },
                      { label: 'Location', value: extracted.location    },
                    ].map((row, i) => (
                      <div
                        key={row.label}
                        style={{
                          display: 'flex', alignItems: 'center',
                          padding: '9px 14px', fontSize: 12.5,
                          borderBottom: i < 5 ? '1px solid #E8E3D2' : 'none',
                          backgroundColor: row.value ? '#fff' : '#FAF7EE',
                        }}
                      >
                        <span style={{
                          width: 70, color: '#6A675F', fontWeight: 600,
                          fontSize: 11, flexShrink: 0,
                        }}>
                          {row.label}
                        </span>
                        <span style={{
                          color: row.value ? '#161614' : '#A39F94',
                          fontStyle: row.value ? 'normal' : 'italic',
                        }}>
                          {row.value || 'Not found'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={reset}
                  style={{
                    padding: '9px 16px', backgroundColor: '#EDE7D8',
                    border: '1px solid #DDD7C6', borderRadius: 7,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#363633',
                  }}
                >
                  Try again
                </button>
                {scanState === 'done' && (
                  <button
                    onClick={handleUseDetails}
                    style={{
                      flex: 1, padding: '9px 0',
                      backgroundColor: '#0E5550', color: '#fff',
                      border: 'none', borderRadius: 7,
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Use these details →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  )
}
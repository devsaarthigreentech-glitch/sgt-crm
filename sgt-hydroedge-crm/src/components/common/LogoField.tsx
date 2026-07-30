// The partner's logo — upload, preview, remove.
//
// Used from three screens that each talk to a different endpoint (a
// dealer registration in the portal, an approved dealer in the portal,
// an org in the CRM), so the endpoints arrive as callbacks and this
// component knows nothing about which is which.
//
// The preview is fetched as a BLOB rather than pointed at with a plain
// <img src>. Every one of those routes needs the bearer token, and an
// <img> tag cannot send one. Same reason the quotation PDF preview
// works the way it does.

import { useEffect, useRef, useState } from 'react'
import { Upload, Trash2, AlertCircle, Image as ImageIcon } from 'lucide-react'

const MUTED = '#6A675F'
const LINE = '#DDD7C6'
const FAINT = '#A39F94'
const DANGER = '#A6301C'

export interface LogoApi {
  /** Bytes of the current logo, or null when there is none. */
  fetch(): Promise<Blob | null>
  upload(file: File): Promise<void>
  remove(): Promise<void>
}

export default function LogoField({ api, disabled, hint }: {
  api: LogoApi
  disabled?: boolean
  hint?: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement | null>(null)

  // One object URL at a time, and always revoked — these hold the image
  // in memory until released, and this component remounts on every
  // dealer the user opens.
  const show = (blob: Blob | null) => {
    setUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return blob ? URL.createObjectURL(blob) : null
    })
  }

  useEffect(() => {
    let cancelled = false
    api.fetch()
      .then(b => { if (!cancelled) show(b) })
      .catch(() => { /* no logo yet is the normal case */ })
    return () => {
      cancelled = true
      setUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    }
  }, [])

  const pick = async (file: File) => {
    setBusy(true); setError(null)
    try {
      await api.upload(file)
      show(await api.fetch())
    } catch (e: any) {
      setError(e?.message ?? 'The logo could not be saved.')
    } finally { setBusy(false) }
  }

  const drop = async () => {
    setBusy(true); setError(null)
    try {
      await api.remove()
      show(null)
    } catch (e: any) {
      setError(e?.message ?? 'The logo could not be removed.')
    } finally { setBusy(false) }
  }

  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
        <div style={{
          width: 108, height: 76, flexShrink: 0,
          border: `1px ${url ? 'solid' : 'dashed'} ${LINE}`, borderRadius: 8,
          backgroundColor: '#fff', display: 'flex',
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          {url
            ? <img src={url} alt="Partner logo"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            : <ImageIcon size={22} style={{ color: FAINT }} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) pick(f)
            }} />

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy || disabled}
              onClick={() => input.current?.click()}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 12px', fontSize: 12.5, fontFamily: 'inherit',
                border: `1px solid ${LINE}`, borderRadius: 7,
                cursor: busy || disabled ? 'not-allowed' : 'pointer',
                background: '#fff', color: MUTED,
              }}>
              <Upload size={14} /> {busy ? 'Saving…' : url ? 'Replace' : 'Upload logo'}
            </button>
            {url && !disabled && (
              <button type="button" disabled={busy} onClick={drop}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '7px 12px', fontSize: 12.5, fontFamily: 'inherit',
                  border: `1px solid ${LINE}`, borderRadius: 7, cursor: 'pointer',
                  background: '#fff', color: MUTED,
                }}>
                <Trash2 size={13} /> Remove
              </button>
            )}
          </div>

          <div style={{ fontSize: 11, color: FAINT, marginTop: 6, lineHeight: 1.5 }}>
            {hint ?? 'Printed beside SGT’s mark on every quotation they raise.'}
            {' '}PNG, JPEG or WebP, up to 512 KB. A PNG with a transparent
            background sits best on the letterhead.
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 6, fontSize: 11.5, color: DANGER }}>
              <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Build a LogoApi for one REST prefix, e.g. `/portal/dealers/7`.
 *
 * `request` is the caller's own authenticated fetch helper, so this stays
 * out of the business of tokens and base URLs — each screen already has
 * one that knows those.
 */
export function logoApiFor(
  baseUrl: string,
  path: string,
  token: () => string | null,
): LogoApi {
  const headers = (): Record<string, string> => {
    const t = token()
    return t ? { Authorization: `Bearer ${t}` } : {}
  }

  return {
    async fetch() {
      const res = await window.fetch(`${baseUrl}${path}/logo`, { headers: headers() })
      if (res.status === 404) return null
      if (!res.ok) return null
      return res.blob()
    },
    async upload(file: File) {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
        reader.onload = () => {
          const url = String(reader.result ?? '')
          resolve(url.slice(url.indexOf(',') + 1))
        }
        reader.readAsDataURL(file)
      })
      const res = await window.fetch(`${baseUrl}${path}/logo`, {
        method: 'PUT',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'image/png',
          base64,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any))
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
      }
    },
    async remove() {
      const res = await window.fetch(`${baseUrl}${path}/logo`, {
        method: 'DELETE', headers: headers(),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any))
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
      }
    },
  }
}

// The "Send quotation" dialog: recipients, message, extra attachments.
//
// Lifted out of QuoteScreen when GreenDrive got its own quotation screen.
// Sending is product-neutral — the same route mails any quotation — so
// both screens open this one dialog rather than keeping two.

import { useRef, useState } from 'react'
import { Paperclip, Plus, Trash2 } from 'lucide-react'
import { INK, MUTED, LINE, FAINT, WARN_FG, inputStyle, labelStyle } from './theme'
import { F } from './Field'
import type { QuoteApi, QuoteAttachment } from './QuoteScreen'

export interface SendState {
  name: string; to: string; cc: string[]; subject: string; message: string
  customerName: string; provider: string
  attachments: QuoteAttachment[]; chosen: string[]
}

export type SendApi = Pick<QuoteApi, 'recipients' | 'send' | 'attach' | 'detach'>

/** Who it goes to and what it says, as the server suggests. Throws on failure. */
export async function loadSendState(api: SendApi, erpName: string): Promise<SendState> {
  const r = await api.recipients(erpName)
  const attachments = r.attachments ?? []
  return {
    name: erpName,
    to: r.to.join(', '),
    cc: r.cc,
    subject: r.suggestedSubject ?? `Quotation ${erpName} from SGT HydroEdge`,
    // Plain text on purpose — the server turns it into HTML on send.
    message: r.suggestedMessageText ?? '',
    customerName: r.customerName,
    provider: r.provider,
    attachments,
    // Everything already on the document is ticked: a file someone
    // deliberately attached is one they meant the customer to have.
    chosen: attachments.map(a => a.name),
  }
}

export function SendQuoteDialog({ api, sendFor, setSendFor, setBanner, onSent, attachMaxMb }: {
  api: SendApi
  sendFor: SendState
  setSendFor: React.Dispatch<React.SetStateAction<SendState | null>>
  setBanner: (msg: string | null) => void
  /** Called with a one-line summary once the mail has gone. */
  onSent: (summary: string) => void
  attachMaxMb?: number
}) {
  const [sending, setSending] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const uploadAttachment = async (file: File) => {
    setAttaching(true); setBanner(null)
    try {
      const a = await api.attach(sendFor.name, file)
      setSendFor(x => x && {
        ...x,
        attachments: [...x.attachments, a],
        chosen: [...x.chosen, a.name],
      })
    } catch (e: any) { setBanner(e.message) } finally { setAttaching(false) }
  }

  const removeAttachment = async (a: QuoteAttachment) => {
    try {
      await api.detach(sendFor.name, a.name)
      setSendFor(x => x && {
        ...x,
        attachments: x.attachments.filter(f => f.name !== a.name),
        chosen: x.chosen.filter(n => n !== a.name),
      })
    } catch (e: any) { setBanner(e.message) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60, backgroundColor: 'rgba(22,22,20,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        backgroundColor: '#fff', borderRadius: 12, padding: 20,
        width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto',
      }}>
        <h3 style={{ margin: '0 0 3px', fontSize: 15.5, fontWeight: 700, color: INK }}>
          Send {sendFor.name}
        </h3>
        <p style={{ margin: '0 0 15px', fontSize: 12, color: MUTED }}>
          The quotation PDF is attached automatically.
        </p>

        <F label="To" value={sendFor.to}
           onChange={v => setSendFor(x => x && { ...x, to: v })}
           hint="Comma-separated for more than one." />

        <div style={{ marginBottom: 13 }}>
          <label style={labelStyle}>Copied automatically</label>
          {sendFor.cc.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {sendFor.cc.map(a => (
                <span key={a} style={{
                  fontSize: 11.5, padding: '4px 9px', borderRadius: 999,
                  backgroundColor: '#EFEADC', color: INK,
                }}>{a}</span>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: WARN_FG }}>
              Nobody yet — set QUOTE_CC_SGT, and a contact email on the partner org.
            </div>
          )}
        </div>

        <F label="Subject" value={sendFor.subject}
           onChange={v => setSendFor(x => x && { ...x, subject: v })} />

        {/* Plain text, deliberately. Nobody should have to proofread
            <p> tags before a quotation goes to a customer — the server
            turns this into HTML at the moment of sending. */}
        <div style={{ marginBottom: 13 }}>
          <label style={labelStyle}>Message</label>
          <textarea
            value={sendFor.message}
            onChange={e => setSendFor(x => x && { ...x, message: e.target.value })}
            rows={13}
            spellCheck
            style={{
              ...inputStyle(), fontSize: 13, lineHeight: 1.6,
              resize: 'vertical',
            }}
          />
          <div style={{ fontSize: 11, color: FAINT, marginTop: 4 }}>
            Write it as you would a letter. A blank line starts a new
            paragraph, and <code>**text**</code> comes out bold. It is sent
            as a properly formatted email — no HTML to type.
          </div>
        </div>

        {/* ---- Extra documents ---------------------------------- */}
        <div style={{ marginBottom: 15 }}>
          <label style={labelStyle}>Attachments</label>
          {sendFor.attachments.length === 0 && (
            <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 7 }}>
              Nothing extra yet. Add a spec sheet, a drawing, a certificate —
              it goes out with the quotation and stays on the document.
            </div>
          )}
          {sendFor.attachments.map(a => {
            const on = sendFor.chosen.includes(a.name)
            return (
              <div key={a.name} style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                padding: '7px 9px', borderRadius: 7, border: `1px solid ${LINE}`,
                backgroundColor: on ? '#F7F4EA' : '#fff',
              }}>
                <input type="checkbox" checked={on}
                  onChange={() => setSendFor(x => x && {
                    ...x,
                    chosen: on ? x.chosen.filter(n => n !== a.name) : [...x.chosen, a.name],
                  })} />
                <Paperclip size={13} style={{ color: FAINT, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.fileName}
                </span>
                {a.sizeBytes != null && (
                  <span style={{ fontSize: 11, color: FAINT, whiteSpace: 'nowrap' }}>
                    {(a.sizeBytes / 1024).toFixed(0)} KB
                  </span>
                )}
                <button type="button" onClick={() => removeAttachment(a)} title="Remove from the quotation"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: FAINT, padding: 2, display: 'flex' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
          <input ref={fileInput} type="file" style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) uploadAttachment(f)
            }} />
          <button type="button" disabled={attaching} onClick={() => fileInput.current?.click()}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, marginTop: 4,
              padding: '7px 12px', fontSize: 12.5, fontFamily: 'inherit',
              border: `1px solid ${LINE}`, borderRadius: 7,
              cursor: attaching ? 'wait' : 'pointer', background: '#fff', color: MUTED,
            }}>
            <Plus size={14} /> {attaching ? 'Uploading…' : 'Attach a file'}
          </button>
          <div style={{ fontSize: 11, color: FAINT, marginTop: 5 }}>
            Up to {attachMaxMb ?? 15} MB each. Unticked files stay on the
            quotation but are not emailed.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            disabled={sending || !sendFor.to.trim()}
            onClick={async () => {
              if (!sendFor) return
              setSending(true); setBanner(null)
              try {
                const r = await api.send(sendFor.name, {
                  to: sendFor.to, subject: sendFor.subject,
                  message: sendFor.message,
                  messageFormat: 'text',
                  attachments: sendFor.chosen,
                })
                onSent(
                  `${sendFor.name} sent to ${r.to.join(', ')}` +
                  (r.cc.length ? `, copied to ${r.cc.length}` : '') +
                  (r.attached?.length ? `, with ${r.attached.length} attachment(s)` : '') +
                  (r.note ? ` — ${r.note}` : ''))
                setSendFor(null)
              } catch (e: any) { setBanner(e.message) } finally { setSending(false) }
            }}
            style={{
              flex: 1, padding: '11px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
              border: 'none', borderRadius: 7,
              cursor: sending || !sendFor.to.trim() ? 'not-allowed' : 'pointer',
              backgroundColor: sending || !sendFor.to.trim() ? '#D8D3C4' : INK,
              color: sending || !sendFor.to.trim() ? '#8C887E' : '#fff',
            }}>
            {sending ? 'Sending…' : 'Send now'}
          </button>
          <button onClick={() => setSendFor(null)} disabled={sending} style={{
            padding: '11px 16px', fontSize: 13.5, fontFamily: 'inherit',
            border: `1px solid ${LINE}`, borderRadius: 7, cursor: 'pointer',
            background: '#fff', color: MUTED,
          }}>Cancel</button>
        </div>
        <div style={{ fontSize: 10.5, color: FAINT, marginTop: 9, textAlign: 'center' }}>
          via {sendFor.provider === 'n8n' ? 'n8n' : 'ERPNext'}
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// AgreementScreen — appoint a dealer, in three clicks.
//
//   1. click the dealer      → everything the agreement will say is
//                              derived and shown. Nothing is typed.
//   2. click Generate        → the document is created and rendered.
//   3. click Send            → it goes to the dealer with the PDF.
//
// The review step between 1 and 2 exists because this is a contract. The
// server returns `warnings` for anything that will print as a blank or
// read oddly — a missing signatory, a turnover figure sitting in the
// operating-area field, a dealer outside the distributor's region. Those
// are worth thirty seconds before signing, and are an autopsy afterwards.
//
// Only the fields that WARN are editable here. The clause text is not:
// the owner asked to defer that, and it is seeded per agreement on the
// server, so making it editable later is a screen change and nothing
// more.
//
// One component, both surfaces. It takes an api adapter exactly as
// QuoteScreen does, so a distributor raising an agreement and SGT
// raising one run the same code.
// =====================================================================

import { useEffect, useState } from 'react'
import {
  FileText, Send, Upload, Download, AlertTriangle, Check, ChevronLeft,
  RefreshCw, Search, Clock,
} from 'lucide-react'
import type {
  AgreementApi, Agreement, DealerOption, Resolved, AgreementFields, Draft,
} from './agreementsApi'

const PAPER = '#F4F0E5'
const CARD = '#FFFFFF'
const INK = '#161614'
const MUTED = '#6A675F'
const LINE = '#DDD7C6'
const FAINT = '#A39F94'
const TEAL = '#0E5550'
const DANGER = '#A6301C'
const WARN = '#8A5A00'

const STATUS: Record<Agreement['status'], { label: string; bg: string; fg: string }> = {
  draft:     { label: 'Draft',     bg: '#EFECE1', fg: MUTED },
  generated: { label: 'Generated', bg: '#E4EDE9', fg: TEAL },
  sent:      { label: 'Sent',      bg: '#E2EAF4', fg: '#1B4B82' },
  signed:    { label: 'Signed',    bg: '#DEEEDF', fg: '#1F5E32' },
  cancelled: { label: 'Cancelled', bg: '#F3DAD5', fg: DANGER },
}

const fmtDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function Chip({ status }: { status: Agreement['status'] }) {
  const s = STATUS[status] ?? STATUS.draft
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      backgroundColor: s.bg, color: s.fg, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  )
}

function btn(kind: 'primary' | 'ghost' | 'danger' = 'ghost'): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '8px 14px', fontSize: 13, fontFamily: 'inherit', fontWeight: 600,
    borderRadius: 7, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
    gap: 6, whiteSpace: 'nowrap',
  }
  if (kind === 'primary') return { ...base, background: TEAL, color: '#fff', border: 'none' }
  if (kind === 'danger') return { ...base, background: '#fff', color: DANGER, border: `1px solid ${LINE}` }
  return { ...base, background: '#fff', color: INK, border: `1px solid ${LINE}` }
}

function Banner({ kind, children }: { kind: 'error' | 'warn' | 'ok'; children: React.ReactNode }) {
  const c = kind === 'error'
    ? { bg: '#F3DAD5', fg: DANGER }
    : kind === 'warn' ? { bg: '#F6EEDB', fg: WARN } : { bg: '#DEEEDF', fg: '#1F5E32' }
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8, backgroundColor: c.bg, color: c.fg,
      fontSize: 12.5, marginBottom: 14, lineHeight: 1.5,
    }}>{children}</div>
  )
}

/** One label/value line on the review panel. Editable only when asked. */
function Row({ label, value, onChange, placeholder }: {
  label: string
  value: string
  onChange?: (v: string) => void
  placeholder?: string
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '190px 1fr', gap: 12,
      padding: '7px 0', borderBottom: `1px solid #EFECE1`, alignItems: 'baseline',
    }}>
      <div style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>{label}</div>
      {onChange ? (
        <input
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          style={{
            fontSize: 13, fontFamily: 'inherit', color: INK, padding: '5px 8px',
            border: `1px solid ${LINE}`, borderRadius: 6, background: '#fff', width: '100%',
          }}
        />
      ) : (
        <div style={{ fontSize: 13, color: value ? INK : FAINT, lineHeight: 1.45 }}>
          {value || '—'}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------

export default function AgreementScreen({ api }: { api: AgreementApi }) {
  const [tab, setTab] = useState<'appoint' | 'list'>('appoint')
  const [dealers, setDealers] = useState<DealerOption[]>([])
  const [showAll, setShowAll] = useState(false)
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [signedMaxMb, setSignedMaxMb] = useState(15)
  const [provider, setProvider] = useState('')
  const [q, setQ] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // The review panel: a resolved dealer awaiting Generate.
  const [resolved, setResolved] = useState<Resolved | null>(null)
  const [overrides, setOverrides] = useState<Partial<AgreementFields>>({})
  const [busy, setBusy] = useState(false)

  // The send dialog.
  const [sending, setSending] = useState<{ row: Agreement; draft: Draft } | null>(null)

  const load = () => {
    setLoading(true)
    Promise.all([api.dealers(showAll), api.list(), api.meta()])
      .then(([d, a, m]) => {
        setDealers(d); setAgreements(a)
        setSignedMaxMb(m.signedMaxMb); setProvider(m.provider); setError(null)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [showAll])

  const pick = async (d: DealerOption) => {
    setError(null); setNotice(null); setBusy(true)
    try {
      const r = await api.resolve(d.id)
      setResolved(r)
      setOverrides({})
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  const generate = async () => {
    if (!resolved) return
    setBusy(true); setError(null)
    try {
      const row = await api.create(resolved.dealerOrgId, overrides)
      setResolved(null); setOverrides({})
      setNotice(`${row.erp_name} created for ${row.dealer_name}. Preview it, then send.`)
      setTab('list')
      load()
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  const preview = async (row: Agreement) => {
    setError(null)
    try { window.open(await api.pdfUrl(row.id), '_blank') }
    catch (e: any) { setError(e.message) }
  }

  const openSend = async (row: Agreement) => {
    setError(null)
    try { setSending({ row, draft: await api.draft(row.id) }) }
    catch (e: any) { setError(e.message) }
  }

  const doSend = async () => {
    if (!sending) return
    setBusy(true); setError(null)
    try {
      const r = await api.send(sending.row.id, {
        to: sending.draft.to,
        cc: sending.draft.cc,
        subject: sending.draft.subject,
        messageText: sending.draft.messageText,
      })
      setNotice(`Sent to ${r.to.join(', ')} via ${r.provider}.` + (r.note ? ` ${r.note}` : ''))
      setSending(null)
      load()
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  const uploadSigned = async (row: Agreement, file: File) => {
    // Checked here as well as on the server: base64 inflates by a third,
    // so a file over the limit is a wasted upload before it is a rejection.
    if (file.size > signedMaxMb * 1024 * 1024) {
      setError(`${file.name} is ${(file.size / 1048576).toFixed(1)} MB; the limit is ${signedMaxMb} MB.`)
      return
    }
    setBusy(true); setError(null)
    try {
      await api.uploadSigned(row.id, file)
      setNotice(`Signed copy filed against ${row.erp_name}.`)
      load()
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  const needle = q.trim().toLowerCase()
  const visibleDealers = needle
    ? dealers.filter(d =>
        `${d.legal_name} ${d.code} ${d.distributor_name ?? ''}`.toLowerCase().includes(needle))
    : dealers
  const visibleAgreements = needle
    ? agreements.filter(a =>
        `${a.dealer_name ?? ''} ${a.dealer_code ?? ''} ${a.erp_name}`.toLowerCase().includes(needle))
    : agreements

  // ---- The review panel ------------------------------------------------
  if (resolved) {
    const f = { ...resolved.fields, ...overrides }
    const set = (k: keyof AgreementFields) => (v: string) =>
      setOverrides(o => ({ ...o, [k]: v }))

    return (
      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: PAPER }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 20px 60px' }}>
          <button onClick={() => { setResolved(null); setOverrides({}) }} style={{
            ...btn(), marginBottom: 16, border: 'none', background: 'none', paddingLeft: 0,
            color: MUTED,
          }}>
            <ChevronLeft size={15} /> Back
          </button>

          <h1 style={{ margin: '0 0 3px', fontSize: 21, fontWeight: 700, color: INK }}>
            {f.dealer_name}
          </h1>
          <p style={{ margin: '0 0 18px', fontSize: 12.5, color: MUTED }}>
            {f.dealer_code} · {f.dealer_type === 'SS' ? 'Sales & Service' : 'Sales & Marketing'}
            {f.distributor_name ? ` · under ${f.distributor_name}` : ''}
          </p>

          {error && <Banner kind="error">{error}</Banner>}

          {resolved.warnings.length > 0 && (
            <Banner kind="warn">
              <div style={{ display: 'flex', gap: 8 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <strong>Check these before generating:</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {resolved.warnings.map((w, i) => <li key={i} style={{ marginBottom: 3 }}>{w}</li>)}
                  </ul>
                </div>
              </div>
            </Banner>
          )}

          <div style={{
            background: CARD, border: `1px solid ${LINE}`, borderRadius: 10,
            padding: '10px 16px 16px', marginBottom: 16,
          }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: TEAL, margin: '10px 0 4px' }}>
              Agreement
            </h2>
            <Row label="Effective date" value={String(f.effective_date ?? '')}
                 onChange={set('effective_date')} placeholder="YYYY-MM-DD" />

            <h2 style={{ fontSize: 13, fontWeight: 700, color: TEAL, margin: '18px 0 4px' }}>
              Dealer — as it will read
            </h2>
            <Row label="Legal name" value={String(f.dealer_name ?? '')} />
            <Row label="Dealer code" value={String(f.dealer_code ?? '')} />
            <Row label="Constitution" value={String(f.dealer_constitution ?? '')}
                 onChange={set('dealer_constitution')} placeholder="a proprietorship concern" />
            <Row label="GSTIN" value={String(f.dealer_gstin ?? '')} onChange={set('dealer_gstin')} />
            <Row label="Registered address" value={String(f.dealer_address ?? '')} />
            <Row label="Authorised signatory" value={String(f.dealer_signatory ?? '')}
                 onChange={set('dealer_signatory')} placeholder="Mr. …" />
            <Row label="Designation" value={String(f.dealer_signatory_designation ?? '')}
                 onChange={set('dealer_signatory_designation')} placeholder="Proprietor" />
            <Row label="Operating area" value={String(f.dealer_operating_area ?? '')}
                 onChange={set('dealer_operating_area')} placeholder="Jaipur, Rajasthan" />
            <Row label="Email" value={String(f.dealer_email ?? '')} />
            <Row label="Mobile" value={String(f.dealer_mobile ?? '')} />

            <h2 style={{ fontSize: 13, fontWeight: 700, color: TEAL, margin: '18px 0 4px' }}>
              Distributor
            </h2>
            <Row label="Legal name" value={String(f.distributor_name ?? '')} />
            <Row label="Code" value={String(f.distributor_code ?? '')} />
            <Row label="Associate" value={String(f.distributor_associate ?? '')} />
            <Row label="Exclusive region" value={String(f.distributor_region ?? '')} />
            <Row label="Signs as" value={String(f.distributor_sign_name ?? '')} />
            <Row label="Signature on file"
                 value={f.distributor_signature_url ? String(f.distributor_signature_url) : ''} />

            <h2 style={{ fontSize: 13, fontWeight: 700, color: TEAL, margin: '18px 0 4px' }}>
              SGT HydroEdge
            </h2>
            <Row label="Signs as" value={String(f.sgt_signatory ?? '')} />
            <Row label="Designation" value={String(f.sgt_signatory_designation ?? '')} />
            <Row label="Signature on file"
                 value={f.sgt_signature_url ? String(f.sgt_signature_url) : ''} />
          </div>

          <p style={{ fontSize: 12, color: MUTED, marginBottom: 14, lineHeight: 1.5 }}>
            Sections 1&ndash;13 are the standard clauses and are added automatically.
            Annexure A, the Annexure C sticker and the signature block are built from the
            values above.
          </p>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={generate} disabled={busy} style={{
              ...btn('primary'), opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer',
            }}>
              <FileText size={15} /> {busy ? 'Generating…' : 'Generate agreement'}
            </button>
            <button onClick={() => { setResolved(null); setOverrides({}) }} style={btn()}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- Main -------------------------------------------------------------
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, backgroundColor: PAPER }}>
      <header style={{
        padding: '18px 24px 0', borderBottom: `1px solid ${LINE}`, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', margin: 0 }}>
            Agreements
          </h1>
          <span style={{ fontSize: 12.5, color: MUTED }}>
            {loading ? 'Loading…' : `${agreements.length} raised · ${dealers.length} dealer${dealers.length === 1 ? '' : 's'} ${showAll ? 'total' : 'awaiting appointment'}`}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={load} title="Refresh" style={{
            background: 'none', border: 'none', cursor: 'pointer', color: FAINT, padding: 6,
          }}><RefreshCw size={16} /></button>
        </div>

        <div style={{ display: 'flex', gap: 2, marginTop: 12 }}>
          {(['appoint', 'list'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '9px 14px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
              background: 'none', border: 'none', marginBottom: -1,
              fontWeight: tab === t ? 700 : 500, color: tab === t ? INK : MUTED,
              borderBottom: `2px solid ${tab === t ? INK : 'transparent'}`,
            }}>
              {t === 'appoint' ? 'Appoint a dealer' : 'All agreements'}
            </button>
          ))}
        </div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 60px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {error && <Banner kind="error">{error}</Banner>}
          {notice && (
            <Banner kind="ok">
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Check size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>{notice}</div>
              </div>
            </Banner>
          )}

          <div style={{ position: 'relative', marginBottom: 14 }}>
            <Search size={15} style={{
              position: 'absolute', left: 10, top: 10, color: FAINT, pointerEvents: 'none',
            }} />
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder={tab === 'appoint' ? 'Search dealers…' : 'Search agreements…'}
              style={{
                width: '100%', padding: '9px 12px 9px 32px', fontSize: 13, fontFamily: 'inherit',
                border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff', color: INK,
              }}
            />
          </div>

          {tab === 'appoint' ? (
            <>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5,
                color: MUTED, marginBottom: 12, cursor: 'pointer',
              }}>
                <input type="checkbox" checked={showAll}
                       onChange={e => setShowAll(e.target.checked)} />
                Include dealers that already have an agreement
              </label>

              {!loading && visibleDealers.length === 0 && (
                <div style={{
                  padding: 28, textAlign: 'center', color: MUTED, fontSize: 13,
                  background: CARD, border: `1px solid ${LINE}`, borderRadius: 10,
                }}>
                  {showAll
                    ? 'No dealers found.'
                    : 'Every dealer has an agreement. Tick the box above to see them all.'}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visibleDealers.map(d => (
                  <button key={d.id} onClick={() => pick(d)} disabled={busy} style={{
                    textAlign: 'left', background: CARD, border: `1px solid ${LINE}`,
                    borderRadius: 10, padding: '13px 16px', cursor: busy ? 'wait' : 'pointer',
                    fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>
                        {d.legal_name}
                      </div>
                      <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                        Dealer · {d.dealer_type ?? '—'} · {d.code}
                        {d.distributor_code ? ` · under ${d.distributor_code}` : ''}
                        {d.territory ? ` · ${d.territory}` : ''}
                      </div>
                    </div>
                    {Number(d.agreements ?? 0) > 0 && (
                      <span style={{ fontSize: 11, color: FAINT }}>
                        {d.agreements} existing
                      </span>
                    )}
                    <FileText size={16} style={{ color: TEAL, flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {!loading && visibleAgreements.length === 0 && (
                <div style={{
                  padding: 28, textAlign: 'center', color: MUTED, fontSize: 13,
                  background: CARD, border: `1px solid ${LINE}`, borderRadius: 10,
                }}>
                  No agreements yet. Use <strong>Appoint a dealer</strong> to raise the first one.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visibleAgreements.map(a => (
                  <div key={a.id} style={{
                    background: CARD, border: `1px solid ${LINE}`, borderRadius: 10,
                    padding: '13px 16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>
                          {a.dealer_name}
                        </div>
                        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                          {a.erp_name} · {a.dealer_code}
                          {a.distributor_code ? ` · under ${a.distributor_code}` : ''}
                          {' · effective '}{fmtDate(a.effective_date)}
                        </div>
                      </div>
                      <Chip status={a.status} />
                    </div>

                    <div style={{
                      display: 'flex', gap: 14, fontSize: 11.5, color: FAINT,
                      marginTop: 8, flexWrap: 'wrap',
                    }}>
                      <span><Clock size={11} style={{ verticalAlign: -1 }} /> raised {fmtDate(a.created_at)}{a.raised_by_name ? ` by ${a.raised_by_name}` : ''}</span>
                      {a.sent_at && <span>sent {fmtDate(a.sent_at)} to {a.sent_to.join(', ')}</span>}
                      {a.signed_at && <span>signed {fmtDate(a.signed_at)}</span>}
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
                      <button onClick={() => preview(a)} style={btn()}>
                        <FileText size={14} /> Preview PDF
                      </button>
                      <button onClick={() => openSend(a)} style={btn('primary')}>
                        <Send size={14} /> {a.sent_at ? 'Send again' : 'Send to dealer'}
                      </button>
                      <label style={{ ...btn(), cursor: 'pointer' }}>
                        <Upload size={14} /> {a.signed_at ? 'Replace signed copy' : 'Upload signed copy'}
                        <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (file) uploadSigned(a, file)
                          }} />
                      </label>
                      {a.signed_at && (
                        <button onClick={async () => {
                          try { window.open(await api.signedUrl(a.id), '_blank') }
                          catch (err: any) { setError(err.message) }
                        }} style={btn()}>
                          <Download size={14} /> Signed copy
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---- Send dialog ------------------------------------------------ */}
      {sending && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(20,20,18,0.45)', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => !busy && setSending(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: CARD, borderRadius: 12, padding: 20, width: '100%', maxWidth: 620,
            maxHeight: '88vh', overflowY: 'auto',
          }}>
            <h2 style={{ margin: '0 0 3px', fontSize: 17, fontWeight: 700, color: INK }}>
              Send {sending.row.erp_name}
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 12.5, color: MUTED }}>
              {sending.row.dealer_name} · the rendered PDF is attached automatically
              {provider ? ` · via ${provider}` : ''}
            </p>

            {sending.draft.to.length === 0 && (
              <Banner kind="warn">
                This dealer has no email on record. Type one below, or add it to the dealer
                record so it is there next time.
              </Banner>
            )}

            <label style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>To</label>
            <input
              value={sending.draft.to.join(', ')}
              onChange={e => setSending(s => s && ({
                ...s, draft: { ...s.draft, to: e.target.value.split(',').map(x => x.trim()).filter(Boolean) },
              }))}
              placeholder="dealer@example.com"
              style={{
                width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
                border: `1px solid ${LINE}`, borderRadius: 7, margin: '4px 0 12px',
              }}
            />

            <label style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>Cc</label>
            <input
              value={sending.draft.cc.join(', ')}
              onChange={e => setSending(s => s && ({
                ...s, draft: { ...s.draft, cc: e.target.value.split(',').map(x => x.trim()).filter(Boolean) },
              }))}
              style={{
                width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
                border: `1px solid ${LINE}`, borderRadius: 7, margin: '4px 0 12px',
              }}
            />

            <label style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>Subject</label>
            <input
              value={sending.draft.subject}
              onChange={e => setSending(s => s && ({ ...s, draft: { ...s.draft, subject: e.target.value } }))}
              style={{
                width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
                border: `1px solid ${LINE}`, borderRadius: 7, margin: '4px 0 12px',
              }}
            />

            <label style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>Message</label>
            <textarea
              value={sending.draft.messageText}
              onChange={e => setSending(s => s && ({ ...s, draft: { ...s.draft, messageText: e.target.value } }))}
              rows={12}
              style={{
                width: '100%', padding: '9px 10px', fontSize: 13, fontFamily: 'inherit',
                border: `1px solid ${LINE}`, borderRadius: 7, margin: '4px 0 6px',
                lineHeight: 1.5, resize: 'vertical',
              }}
            />
            <p style={{ fontSize: 11.5, color: FAINT, margin: '0 0 16px' }}>
              Blank line starts a new paragraph. **bold** for emphasis.
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setSending(null)} disabled={busy} style={btn()}>Cancel</button>
              <button onClick={doSend} disabled={busy || !sending.draft.to.length} style={{
                ...btn('primary'),
                opacity: busy || !sending.draft.to.length ? 0.5 : 1,
                cursor: busy ? 'wait' : 'pointer',
              }}>
                <Send size={14} /> {busy ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

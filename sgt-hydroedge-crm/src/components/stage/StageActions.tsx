// // Drop-in stage controls for the lead detail (and kanban card menu).
// // Usage:  <StageActions lead={lead} onChanged={refetch} />
// //
// // `lead` should carry: id, stage, and the gate fields (contactEmail, contactPhone,
// // decisionAuthority, vertical, model, value, estClose, source, protectionId).
// import { useState } from 'react'
// import { stageApi, ApiError } from '../../lib/api'
// import {
//   type Stage, STAGE_LABELS, nextAdvanceStage, isMirror, isTerminal,
//   LOSS_REASONS, qualificationChecklist, type GateLead,
// } from '../../lib/stages'
// import { t } from '../../lib/tokens'

// interface LeadLike extends GateLead { id: string; stage: Stage }

// export default function StageActions({ lead, onChanged }: { lead: LeadLike; onChanged?: () => void }) {
//   const [busy, setBusy] = useState(false)
//   const [err, setErr] = useState<string | null>(null)
//   const [dialog, setDialog] = useState<null | 'qualify' | 'won' | 'lost' | 'reopen'>(null)

//   async function run(fn: () => Promise<any>) {
//     setBusy(true); setErr(null)
//     try { await fn(); setDialog(null); onChanged?.() }
//     catch (e) { setErr(e instanceof ApiError ? e.message : 'Something went wrong') }
//     finally { setBusy(false) }
//   }

//   const stage = lead.stage
//   const next = nextAdvanceStage(stage)

//   return (
//     <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
//       {/* Terminal states */}
//       {isTerminal(stage) && (
//         <>
//           <span style={{
//             fontSize: 13, fontWeight: 700,
//             color: stage === 'closed_won' ? t.won : t.lost,
//           }}>{STAGE_LABELS[stage]}</span>
//           {stage === 'closed_lost' && (
//             <Btn ghost onClick={() => setDialog('reopen')}>Reopen</Btn>
//           )}
//         </>
//       )}

//       {/* Mirror states are downstream-owned — read only */}
//       {isMirror(stage) && (
//         <span style={{ fontSize: 12, color: t.muted }}>
//           {STAGE_LABELS[stage]} · owned downstream (read-only here)
//         </span>
//       )}

//       {/* Active, pre-qualified */}
//       {!isTerminal(stage) && !isMirror(stage) && (
//         <>
//           {next && next !== 'qualified' && (
//             <Btn primary disabled={busy} onClick={() => run(() => stageApi.advance(lead.id))}>
//               Advance → {STAGE_LABELS[next]}
//             </Btn>
//           )}
//           {(next === 'qualified' || stage === 'qualified') && stage !== 'qualified' && (
//             <Btn primary disabled={busy} onClick={() => setDialog('qualify')}>Qualify…</Btn>
//           )}
//           {stage === 'qualified' && (
//             <>
//               <Btn primary disabled={busy} onClick={() => run(() => stageApi.handoff(lead.id, 'poc'))}>
//                 Send to POC
//               </Btn>
//               <Btn disabled={busy} onClick={() => run(() => stageApi.handoff(lead.id, 'quote'))}>
//                 Send to Quote
//               </Btn>
//             </>
//           )}
//           <Btn won onClick={() => setDialog('won')}>Close Won</Btn>
//           <Btn lost onClick={() => setDialog('lost')}>Close Lost</Btn>
//         </>
//       )}

//       {err && <span style={{ color: t.lost, fontSize: 12 }}>{err}</span>}

//       {dialog === 'qualify' && (
//         <QualifyDialog lead={lead} busy={busy} onClose={() => setDialog(null)}
//           onConfirm={() => run(() => stageApi.qualify(lead.id))} />
//       )}
//       {dialog === 'won' && (
//         <CloseWonDialog busy={busy} onClose={() => setDialog(null)}
//           onConfirm={(p) => run(() => stageApi.closeWon(lead.id, p))} />
//       )}
//       {dialog === 'lost' && (
//         <CloseLostDialog busy={busy} onClose={() => setDialog(null)}
//           onConfirm={(p) => run(() => stageApi.closeLost(lead.id, p))} />
//       )}
//       {dialog === 'reopen' && (
//         <ReopenDialog busy={busy} onClose={() => setDialog(null)}
//           onConfirm={(reason) => run(() => stageApi.reopen(lead.id, reason))} />
//       )}
//     </div>
//   )
// }

// // ── Dialogs ───────────────────────────────────────────────────────────────────
// function QualifyDialog({ lead, onConfirm, onClose, busy }:
//   { lead: GateLead; onConfirm: () => void; onClose: () => void; busy: boolean }) {
//   const checks = qualificationChecklist(lead)
//   const allPass = checks.every(c => c.pass)
//   return (
//     <Modal title="Qualify lead" onClose={onClose}>
//       <p style={{ fontSize: 13, color: t.muted, marginTop: 0 }}>
//         All criteria must pass before the lead can move to Qualified.
//       </p>
//       <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 16px' }}>
//         {checks.map(c => (
//           <li key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13.5 }}>
//             <span style={{
//               width: 18, height: 18, borderRadius: 999, display: 'inline-flex',
//               alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
//               backgroundColor: c.pass ? t.okBg : t.redBg, color: c.pass ? t.green : t.lost,
//             }}>{c.pass ? '✓' : '!'}</span>
//             <span style={{ color: c.pass ? t.ink : t.muted }}>{c.label}</span>
//           </li>
//         ))}
//       </ul>
//       <Actions>
//         <Btn ghost onClick={onClose}>Cancel</Btn>
//         <Btn primary disabled={!allPass || busy} onClick={onConfirm}>
//           {allPass ? 'Qualify' : 'Fix fields to continue'}
//         </Btn>
//       </Actions>
//     </Modal>
//   )
// }

// function CloseWonDialog({ onConfirm, onClose, busy }:
//   { onConfirm: (p: { orderRef?: string; override?: boolean; reason?: string }) => void; onClose: () => void; busy: boolean }) {
//   const [orderRef, setOrderRef] = useState('')
//   const [override, setOverride] = useState(false)
//   const [reason, setReason] = useState('')
//   const canSubmit = override ? reason.trim().length > 2 : orderRef.trim().length > 0
//   return (
//     <Modal title="Close as Won" onClose={onClose}>
//       <Field label="Order / PO reference">
//         <input value={orderRef} onChange={e => setOrderRef(e.target.value)} disabled={override}
//           placeholder="e.g. SO-2026-0142" style={inputStyle} />
//       </Field>
//       <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '8px 0' }}>
//         <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} />
//         No PO yet — L2 override
//       </label>
//       {override && (
//         <Field label="Override reason">
//           <input value={reason} onChange={e => setReason(e.target.value)}
//             placeholder="Why close without a PO reference?" style={inputStyle} />
//         </Field>
//       )}
//       <Actions>
//         <Btn ghost onClick={onClose}>Cancel</Btn>
//         <Btn won disabled={!canSubmit || busy}
//           onClick={() => onConfirm(override ? { override: true, reason } : { orderRef })}>
//           Confirm Won
//         </Btn>
//       </Actions>
//     </Modal>
//   )
// }

// function CloseLostDialog({ onConfirm, onClose, busy }:
//   { onConfirm: (p: { lossReason: string; note?: string }) => void; onClose: () => void; busy: boolean }) {
//   const [lossReason, setLossReason] = useState('')
//   const [note, setNote] = useState('')
//   const needNote = lossReason === 'other'
//   const canSubmit = !!lossReason && (!needNote || note.trim().length > 2)
//   return (
//     <Modal title="Close as Lost" onClose={onClose}>
//       <Field label="Reason">
//         <select value={lossReason} onChange={e => setLossReason(e.target.value)} style={inputStyle}>
//           <option value="">Select a reason…</option>
//           {LOSS_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
//         </select>
//       </Field>
//       {needNote && (
//         <Field label="Note">
//           <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add detail" style={inputStyle} />
//         </Field>
//       )}
//       <Actions>
//         <Btn ghost onClick={onClose}>Cancel</Btn>
//         <Btn lost disabled={!canSubmit || busy}
//           onClick={() => onConfirm({ lossReason, note: note || undefined })}>
//           Confirm Lost
//         </Btn>
//       </Actions>
//     </Modal>
//   )
// }

// function ReopenDialog({ onConfirm, onClose, busy }:
//   { onConfirm: (reason: string) => void; onClose: () => void; busy: boolean }) {
//   const [reason, setReason] = useState('')
//   return (
//     <Modal title="Reopen lead" onClose={onClose}>
//       <p style={{ fontSize: 13, color: t.muted, marginTop: 0 }}>
//         Allowed within 90 days of closure. Restores the prior stage.
//       </p>
//       <Field label="Reason">
//         <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why reopen?" style={inputStyle} />
//       </Field>
//       <Actions>
//         <Btn ghost onClick={onClose}>Cancel</Btn>
//         <Btn primary disabled={reason.trim().length < 3 || busy} onClick={() => onConfirm(reason)}>Reopen</Btn>
//       </Actions>
//     </Modal>
//   )
// }

// // ── Tiny UI atoms (inline-styled, responsive bottom-sheet on mobile) ──────────
// function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
//   return (
//     <div onClick={onClose} style={{
//       position: 'fixed', inset: 0, backgroundColor: 'rgba(20,18,16,0.35)',
//       display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000,
//     }}>
//       <div onClick={e => e.stopPropagation()} style={{
//         backgroundColor: t.surface, width: '100%', maxWidth: 460,
//         borderRadius: `${t.radius * 1.4}px ${t.radius * 1.4}px 0 0`, padding: 20,
//         boxShadow: '0 -8px 30px rgba(0,0,0,0.18)',
//         // becomes a centred card on wider screens
//         margin: 'auto',
//       }}>
//         <div style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: t.border, margin: '0 auto 14px' }} />
//         <h3 style={{ margin: '0 0 12px', fontSize: 16, color: t.ink }}>{title}</h3>
//         {children}
//       </div>
//     </div>
//   )
// }
// function Field({ label, children }: { label: string; children: React.ReactNode }) {
//   return (
//     <label style={{ display: 'block', marginBottom: 10 }}>
//       <span style={{ display: 'block', fontSize: 12, color: t.muted, marginBottom: 4 }}>{label}</span>
//       {children}
//     </label>
//   )
// }
// function Actions({ children }: { children: React.ReactNode }) {
//   return <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>{children}</div>
// }
// const inputStyle: React.CSSProperties = {
//   width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${t.border}`,
//   fontSize: 14, color: t.ink, backgroundColor: t.surface, boxSizing: 'border-box',
// }
// function Btn(props: {
//   children: React.ReactNode; onClick?: () => void; disabled?: boolean
//   primary?: boolean; ghost?: boolean; won?: boolean; lost?: boolean
// }) {
//   const { children, primary, ghost, won, lost, ...rest } = props
//   let bg = t.surface, fg = t.ink, border = t.border
//   if (primary) { bg = t.green; fg = '#fff'; border = t.green }
//   if (won) { bg = t.won; fg = '#fff'; border = t.won }
//   if (lost) { bg = '#fff'; fg = t.lost; border = t.lost }
//   if (ghost) { bg = 'transparent'; fg = t.muted; border = 'transparent' }
//   return (
//     <button {...rest} style={{
//       padding: '8px 14px', borderRadius: 8, border: `1px solid ${border}`,
//       backgroundColor: bg, color: fg, fontSize: 13, fontWeight: 600,
//       cursor: props.disabled ? 'not-allowed' : 'pointer', opacity: props.disabled ? 0.55 : 1,
//     }}>{children}</button>
//   )
// }
// Drop-in stage controls for the lead detail (and kanban card menu).
// Usage:  <StageActions lead={lead} onChanged={refetch} />
//
// `lead` should carry: id, stage, and the gate fields (contactEmail, contactPhone,
// decisionAuthority, vertical, model, value, estClose, source, protectionId).
import { useState } from 'react'
import { stageApi } from '../../lib/api'
import {
  type Stage, STAGE_LABELS, nextAdvanceStage, isMirror, isTerminal,
  LOSS_REASONS, qualificationChecklist, type GateLead,
} from '../../lib/stages'
import { t } from '../../lib/tokens'

interface LeadLike extends GateLead { id: string; stage: Stage }

export default function StageActions({ lead, onChanged }: { lead: LeadLike; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | 'qualify' | 'won' | 'lost' | 'reopen'>(null)

  async function run(fn: () => Promise<any>) {
    setBusy(true); setErr(null)
    try { await fn(); setDialog(null); onChanged?.() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusy(false) }
  }

  const stage = lead.stage
  const next = nextAdvanceStage(stage)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {/* Terminal states */}
      {isTerminal(stage) && (
        <>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: stage === 'closed_won' ? t.won : t.lost,
          }}>{STAGE_LABELS[stage]}</span>
          {stage === 'closed_lost' && (
            <Btn ghost onClick={() => setDialog('reopen')}>Reopen</Btn>
          )}
        </>
      )}

      {/* Mirror states are downstream-owned — read only */}
      {isMirror(stage) && (
        <span style={{ fontSize: 12, color: t.muted }}>
          {STAGE_LABELS[stage]} · owned downstream (read-only here)
        </span>
      )}

      {/* Active, pre-qualified */}
      {!isTerminal(stage) && !isMirror(stage) && (
        <>
          {next && next !== 'qualified' && (
            <Btn primary disabled={busy} onClick={() => run(() => stageApi.advance(lead.id))}>
              Advance → {STAGE_LABELS[next]}
            </Btn>
          )}
          {(next === 'qualified' || stage === 'qualified') && stage !== 'qualified' && (
            <Btn primary disabled={busy} onClick={() => setDialog('qualify')}>Qualify…</Btn>
          )}
          {stage === 'qualified' && (
            <>
              <Btn primary disabled={busy} onClick={() => run(() => stageApi.handoff(lead.id, 'poc'))}>
                Send to POC
              </Btn>
              <Btn disabled={busy} onClick={() => run(() => stageApi.handoff(lead.id, 'quote'))}>
                Send to Quote
              </Btn>
            </>
          )}
          <Btn won onClick={() => setDialog('won')}>Close Won</Btn>
          <Btn lost onClick={() => setDialog('lost')}>Close Lost</Btn>
        </>
      )}

      {err && <span style={{ color: t.lost, fontSize: 12 }}>{err}</span>}

      {dialog === 'qualify' && (
        <QualifyDialog lead={lead} busy={busy} onClose={() => setDialog(null)}
          onConfirm={() => run(() => stageApi.qualify(lead.id))} />
      )}
      {dialog === 'won' && (
        <CloseWonDialog busy={busy} onClose={() => setDialog(null)}
          onConfirm={(p) => run(() => stageApi.closeWon(lead.id, p))} />
      )}
      {dialog === 'lost' && (
        <CloseLostDialog busy={busy} onClose={() => setDialog(null)}
          onConfirm={(p) => run(() => stageApi.closeLost(lead.id, p))} />
      )}
      {dialog === 'reopen' && (
        <ReopenDialog busy={busy} onClose={() => setDialog(null)}
          onConfirm={(reason) => run(() => stageApi.reopen(lead.id, reason))} />
      )}
    </div>
  )
}

// ── Dialogs ───────────────────────────────────────────────────────────────────
function QualifyDialog({ lead, onConfirm, onClose, busy }:
  { lead: GateLead; onConfirm: () => void; onClose: () => void; busy: boolean }) {
  const checks = qualificationChecklist(lead)
  const allPass = checks.every(c => c.pass)
  return (
    <Modal title="Qualify lead" onClose={onClose}>
      <p style={{ fontSize: 13, color: t.muted, marginTop: 0 }}>
        All criteria must pass before the lead can move to Qualified.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 16px' }}>
        {checks.map(c => (
          <li key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13.5 }}>
            <span style={{
              width: 18, height: 18, borderRadius: 999, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
              backgroundColor: c.pass ? t.okBg : t.redBg, color: c.pass ? t.green : t.lost,
            }}>{c.pass ? '✓' : '!'}</span>
            <span style={{ color: c.pass ? t.ink : t.muted }}>{c.label}</span>
          </li>
        ))}
      </ul>
      <Actions>
        <Btn ghost onClick={onClose}>Cancel</Btn>
        <Btn primary disabled={!allPass || busy} onClick={onConfirm}>
          {allPass ? 'Qualify' : 'Fix fields to continue'}
        </Btn>
      </Actions>
    </Modal>
  )
}

function CloseWonDialog({ onConfirm, onClose, busy }:
  { onConfirm: (p: { orderRef?: string; override?: boolean; reason?: string }) => void; onClose: () => void; busy: boolean }) {
  const [orderRef, setOrderRef] = useState('')
  const [override, setOverride] = useState(false)
  const [reason, setReason] = useState('')
  const canSubmit = override ? reason.trim().length > 2 : orderRef.trim().length > 0
  return (
    <Modal title="Close as Won" onClose={onClose}>
      <Field label="Order / PO reference">
        <input value={orderRef} onChange={e => setOrderRef(e.target.value)} disabled={override}
          placeholder="e.g. SO-2026-0142" style={inputStyle} />
      </Field>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '8px 0' }}>
        <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} />
        No PO yet — L2 override
      </label>
      {override && (
        <Field label="Override reason">
          <input value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Why close without a PO reference?" style={inputStyle} />
        </Field>
      )}
      <Actions>
        <Btn ghost onClick={onClose}>Cancel</Btn>
        <Btn won disabled={!canSubmit || busy}
          onClick={() => onConfirm(override ? { override: true, reason } : { orderRef })}>
          Confirm Won
        </Btn>
      </Actions>
    </Modal>
  )
}

function CloseLostDialog({ onConfirm, onClose, busy }:
  { onConfirm: (p: { lossReason: string; note?: string }) => void; onClose: () => void; busy: boolean }) {
  const [lossReason, setLossReason] = useState('')
  const [note, setNote] = useState('')
  const needNote = lossReason === 'other'
  const canSubmit = !!lossReason && (!needNote || note.trim().length > 2)
  return (
    <Modal title="Close as Lost" onClose={onClose}>
      <Field label="Reason">
        <select value={lossReason} onChange={e => setLossReason(e.target.value)} style={inputStyle}>
          <option value="">Select a reason…</option>
          {LOSS_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </Field>
      {needNote && (
        <Field label="Note">
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add detail" style={inputStyle} />
        </Field>
      )}
      <Actions>
        <Btn ghost onClick={onClose}>Cancel</Btn>
        <Btn lost disabled={!canSubmit || busy}
          onClick={() => onConfirm({ lossReason, note: note || undefined })}>
          Confirm Lost
        </Btn>
      </Actions>
    </Modal>
  )
}

function ReopenDialog({ onConfirm, onClose, busy }:
  { onConfirm: (reason: string) => void; onClose: () => void; busy: boolean }) {
  const [reason, setReason] = useState('')
  return (
    <Modal title="Reopen lead" onClose={onClose}>
      <p style={{ fontSize: 13, color: t.muted, marginTop: 0 }}>
        Allowed within 90 days of closure. Restores the prior stage.
      </p>
      <Field label="Reason">
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why reopen?" style={inputStyle} />
      </Field>
      <Actions>
        <Btn ghost onClick={onClose}>Cancel</Btn>
        <Btn primary disabled={reason.trim().length < 3 || busy} onClick={() => onConfirm(reason)}>Reopen</Btn>
      </Actions>
    </Modal>
  )
}

// ── Tiny UI atoms (inline-styled, responsive bottom-sheet on mobile) ──────────
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(20,18,16,0.35)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor: t.surface, width: '100%', maxWidth: 460,
        borderRadius: `${t.radius * 1.4}px ${t.radius * 1.4}px 0 0`, padding: 20,
        boxShadow: '0 -8px 30px rgba(0,0,0,0.18)',
        // becomes a centred card on wider screens
        margin: 'auto',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: t.border, margin: '0 auto 14px' }} />
        <h3 style={{ margin: '0 0 12px', fontSize: 16, color: t.ink }}>{title}</h3>
        {children}
      </div>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={{ display: 'block', fontSize: 12, color: t.muted, marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  )
}
function Actions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>{children}</div>
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${t.border}`,
  fontSize: 14, color: t.ink, backgroundColor: t.surface, boxSizing: 'border-box',
}
function Btn(props: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean
  primary?: boolean; ghost?: boolean; won?: boolean; lost?: boolean
}) {
  const { children, primary, ghost, won, lost, ...rest } = props
  let bg = t.surface, fg = t.ink, border = t.border
  if (primary) { bg = t.green; fg = '#fff'; border = t.green }
  if (won) { bg = t.won; fg = '#fff'; border = t.won }
  if (lost) { bg = '#fff'; fg = t.lost; border = t.lost }
  if (ghost) { bg = 'transparent'; fg = t.muted; border = 'transparent' }
  return (
    <button {...rest} style={{
      padding: '8px 14px', borderRadius: 8, border: `1px solid ${border}`,
      backgroundColor: bg, color: fg, fontSize: 13, fontWeight: 600,
      cursor: props.disabled ? 'not-allowed' : 'pointer', opacity: props.disabled ? 0.55 : 1,
    }}>{children}</button>
  )
}
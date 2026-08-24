// Timesheet — every SGT login files their own day here.
//
// Three boxes, because that is what the day produces: what got done, what
// got in the way, anything else. Only the first is required; a day with no
// problems is a real day, and forcing text into that box would just teach
// everyone to type "none".
//
// The compose form is always at the top and always open. Filing is meant
// to take fifteen seconds — putting it behind an "Add entry" button adds a
// click to the one action the screen exists for.
//
// What may be filed and what may still be edited are the SERVER's rules
// (domain/timesheet.ts), fetched from /timesheets/config rather than
// restated here. This screen only disables controls to match; every one of
// those rules is enforced again on the way in.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, CalendarDays, Check, ClipboardList, Loader2,
  Pencil, Trash2, TriangleAlert, Users, X,
} from 'lucide-react'
import {
  timesheetApi, ValidationError,
  type TimesheetConfig, type TimesheetEntry, type TimesheetUserSummary,
} from './timesheetApi'

const INK = '#161614'
const MUTED = '#6A675F'
const LINE = '#DDD7C6'
const FAINT = '#A39F94'
const TEAL = '#0E5550'
const DANGER = '#A6301C'
const OK = '#2F6B4F'
const PAPER = '#ECE8DA'

type Tab = 'mine' | 'team'

// ---------------------------------------------------------------------
// Dates. All plain YYYY-MM-DD strings — the server settles what "today"
// is in IST and hands it over, so nothing here constructs a date from the
// browser clock and risks disagreeing with it.
// ---------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function shift(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function prettyDate(iso: string, today: string): string {
  if (iso === today) return 'Today'
  if (iso === shift(today, -1)) return 'Yesterday'
  const d = new Date(`${iso}T00:00:00Z`)
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

// ---------------------------------------------------------------------
// Shared bits of chrome
// ---------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 5,
}

const fieldStyle = (bad?: boolean): React.CSSProperties => ({
  width: '100%', boxSizing: 'border-box', padding: '9px 10px', fontSize: 13.5,
  color: INK, backgroundColor: '#fff', border: `1px solid ${bad ? DANGER : LINE}`,
  borderRadius: 6, outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
  resize: 'vertical' as const,
})

const cardStyle: React.CSSProperties = {
  backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 8,
  padding: 14, marginBottom: 10,
}

function Banner({ kind, children, onDismiss }: {
  kind: 'error' | 'ok'
  children: React.ReactNode
  onDismiss?: () => void
}) {
  const err = kind === 'error'
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '9px 11px', marginBottom: 12, borderRadius: 6, fontSize: 12.5,
      backgroundColor: err ? '#FBEDEA' : '#EAF3EE',
      border: `1px solid ${err ? '#E8C8C1' : '#C8DED2'}`,
      color: err ? DANGER : OK,
    }}>
      {err ? <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
           : <Check size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
      <span style={{ flex: 1 }}>{children}</span>
      {onDismiss && (
        <button onClick={onDismiss} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'inherit',
          padding: 0, display: 'flex',
        }}><X size={14} /></button>
      )}
    </div>
  )
}

/** A filled-in field on a saved entry. Blank ones are omitted, not shown empty. */
function Field({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  if (!value.trim()) return null
  return (
    <div style={{ marginTop: 9 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: tone === 'warn' ? '#8A5A18' : FAINT, marginBottom: 3,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: INK, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
        {value}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------

export default function TimesheetScreen({ role }: { role: string }) {
  const [config, setConfig] = useState<TimesheetConfig | null>(null)
  const [tab, setTab] = useState<Tab>('mine')

  const [entries, setEntries] = useState<TimesheetEntry[]>([])
  const [summary, setSummary] = useState<TimesheetUserSummary[]>([])
  const [loading, setLoading] = useState(true)

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Compose form
  const [entryDate, setEntryDate] = useState('')
  const [workDone, setWorkDone] = useState('')
  const [problemsFaced, setProblemsFaced] = useState('')
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Inline edit of an existing entry
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ workDone: '', problemsFaced: '', additionalNotes: '' })

  // Team range — the last 7 days, which is the span a weekly check covers.
  const [teamFrom, setTeamFrom] = useState('')
  const [teamTo, setTeamTo] = useState('')

  const canViewTeam = config?.canViewTeam ?? role === 'director'

  useEffect(() => {
    timesheetApi.config()
      .then(c => {
        setConfig(c)
        setEntryDate(c.today)
        setTeamFrom(shift(c.today, -6))
        setTeamTo(c.today)
      })
      .catch(e => setError(e.message))
  }, [])

  const loadMine = useCallback(async () => {
    setLoading(true)
    try {
      const r = await timesheetApi.list({ scope: 'mine' })
      setEntries(r.data)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  const loadTeam = useCallback(async (from: string, to: string) => {
    setLoading(true)
    try {
      const [r, s] = await Promise.all([
        timesheetApi.list({ scope: 'team', from, to, limit: 500 }),
        timesheetApi.summary(from, to),
      ])
      setEntries(r.data)
      setSummary(s)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  // Waits for config: firing on mount races the "today" the range is built
  // from and loads the team tab with two empty dates.
  useEffect(() => {
    if (!config) return
    if (tab === 'mine') loadMine()
    else loadTeam(teamFrom, teamTo)
  }, [config, tab, teamFrom, teamTo, loadMine, loadTeam])

  const submit = async () => {
    setError(null); setNotice(null); setFieldErrors({})
    if (!workDone.trim()) {
      setFieldErrors({ workDone: 'Work done is required' })
      return
    }
    setSaving(true)
    try {
      await timesheetApi.create({
        entryDate,
        workDone: workDone.trim(),
        problemsFaced: problemsFaced.trim(),
        additionalNotes: additionalNotes.trim(),
      })
      setWorkDone(''); setProblemsFaced(''); setAdditionalNotes('')
      setEntryDate(config?.today ?? entryDate)
      setNotice('Entry filed.')
      if (tab === 'mine') await loadMine()
      else await loadTeam(teamFrom, teamTo)
    } catch (e: any) {
      if (e instanceof ValidationError) setFieldErrors(e.fields)
      else setError(e.message)
    } finally { setSaving(false) }
  }

  const beginEdit = (e: TimesheetEntry) => {
    setEditingId(e.id)
    setDraft({
      workDone: e.workDone,
      problemsFaced: e.problemsFaced,
      additionalNotes: e.additionalNotes,
    })
  }

  const saveEdit = async (id: string) => {
    setError(null); setNotice(null)
    if (!draft.workDone.trim()) { setError('Work done cannot be emptied.'); return }
    try {
      await timesheetApi.update(id, {
        workDone: draft.workDone.trim(),
        problemsFaced: draft.problemsFaced.trim(),
        additionalNotes: draft.additionalNotes.trim(),
      })
      setEditingId(null)
      setNotice('Entry updated.')
      if (tab === 'mine') await loadMine()
      else await loadTeam(teamFrom, teamTo)
    } catch (e: any) { setError(e.message) }
  }

  const remove = async (e: TimesheetEntry) => {
    if (!confirm(`Delete your entry for ${prettyDate(e.entryDate, config?.today ?? '')}? This cannot be undone.`)) return
    setError(null); setNotice(null)
    try {
      await timesheetApi.remove(e.id)
      setNotice('Entry deleted.')
      if (tab === 'mine') await loadMine()
      else await loadTeam(teamFrom, teamTo)
    } catch (err: any) { setError(err.message) }
  }

  /** Entries bucketed by day, newest first — the list is read as a diary. */
  const grouped = useMemo(() => {
    const map = new Map<string, TimesheetEntry[]>()
    for (const e of entries) {
      const list = map.get(e.entryDate)
      if (list) list.push(e)
      else map.set(e.entryDate, [e])
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [entries])

  const today = config?.today ?? ''

  return (
    <div style={{ backgroundColor: PAPER, height: '100%', overflowY: 'auto', padding: '20px 18px 60px' }}>
      {/* Local keyframes for the loader, matching CardScanner/BottomDrawer —
          kept in the component rather than added to global CSS. */}
      <style>{`@keyframes tsspin { to { transform: rotate(360deg); } }
               .ts-spin { animation: tsspin .8s linear infinite; }`}</style>
      <h1 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: INK }}>Timesheet</h1>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: MUTED }}>
        What you did today, what got in the way, and anything worth noting.
        {config && ` Editable until the end of the following day; entries can be backdated up to ${config.backdateDays} days.`}
      </p>

      {error && <Banner kind="error" onDismiss={() => setError(null)}>{error}</Banner>}
      {notice && <Banner kind="ok" onDismiss={() => setNotice(null)}>{notice}</Banner>}

      {/* ---------------- Compose ---------------- */}
      <div style={{ ...cardStyle, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
          <ClipboardList size={15} color={TEAL} />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>New entry</span>
        </div>

        <div style={{ maxWidth: 220, marginBottom: 12 }}>
          <label style={labelStyle}>Date</label>
          <input
            type="date"
            value={entryDate}
            min={config?.earliestDate}
            max={config?.today}
            onChange={e => setEntryDate(e.target.value)}
            style={fieldStyle(!!fieldErrors.entryDate)}
          />
          {fieldErrors.entryDate && (
            <div style={{ fontSize: 11.5, color: DANGER, marginTop: 4 }}>{fieldErrors.entryDate}</div>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>
            Work done <span style={{ color: DANGER }}>*</span>
          </label>
          <textarea
            rows={4}
            value={workDone}
            onChange={e => setWorkDone(e.target.value)}
            placeholder="Calls, visits, quotations raised, follow-ups closed…"
            style={fieldStyle(!!fieldErrors.workDone)}
          />
          {fieldErrors.workDone && (
            <div style={{ fontSize: 11.5, color: DANGER, marginTop: 4 }}>{fieldErrors.workDone}</div>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Problems faced</label>
          <textarea
            rows={3}
            value={problemsFaced}
            onChange={e => setProblemsFaced(e.target.value)}
            placeholder="Blockers, delays, anything you need a decision on. Leave blank if none."
            style={fieldStyle(!!fieldErrors.problemsFaced)}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Additional notes</label>
          <textarea
            rows={3}
            value={additionalNotes}
            onChange={e => setAdditionalNotes(e.target.value)}
            placeholder="Anything else worth recording."
            style={fieldStyle(!!fieldErrors.additionalNotes)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={submit}
            disabled={saving || !workDone.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 16px', fontSize: 13, fontWeight: 600,
              color: '#fff', backgroundColor: saving || !workDone.trim() ? FAINT : TEAL,
              border: 'none', borderRadius: 6,
              cursor: saving || !workDone.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? <Loader2 size={14} className="ts-spin" /> : <Check size={14} />}
            {saving ? 'Filing…' : 'File entry'}
          </button>
          {config && entryDate !== config.today && (
            <span style={{ fontSize: 11.5, color: '#8A5A18', display: 'flex', alignItems: 'center', gap: 5 }}>
              <TriangleAlert size={13} />
              Backdated to {prettyDate(entryDate, config.today)}
            </span>
          )}
        </div>
      </div>

      {/* ---------------- Tabs ---------------- */}
      {canViewTeam && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: `1px solid ${LINE}` }}>
          {([['mine', 'My entries', ClipboardList], ['team', 'Team', Users]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 12px', fontSize: 12.5, fontWeight: tab === id ? 700 : 500,
                color: tab === id ? INK : MUTED, background: 'none', border: 'none',
                borderBottom: `2px solid ${tab === id ? TEAL : 'transparent'}`,
                marginBottom: -1, cursor: 'pointer',
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ---------------- Team: range + who filed ---------------- */}
      {tab === 'team' && canViewTeam && (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>From</label>
              <input type="date" value={teamFrom} max={teamTo}
                onChange={e => setTeamFrom(e.target.value)} style={{ ...fieldStyle(), width: 160 }} />
            </div>
            <div>
              <label style={labelStyle}>To</label>
              <input type="date" value={teamTo} min={teamFrom} max={config?.today}
                onChange={e => setTeamTo(e.target.value)} style={{ ...fieldStyle(), width: 160 }} />
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '10px 14px', borderBottom: `1px solid ${LINE}`,
              fontSize: 12.5, fontWeight: 700, color: INK,
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              <CalendarDays size={14} color={TEAL} />
              Filing over the selected range
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 520 }}>
                <thead>
                  <tr style={{ color: MUTED, textAlign: 'left' }}>
                    {['Name', 'Role', 'Days filed', 'Entries', 'Last entry', 'Today'].map(h => (
                      <th key={h} style={{
                        padding: '8px 14px', fontWeight: 600, fontSize: 11,
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                        borderBottom: `1px solid ${LINE}`, whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.map(s => (
                    <tr key={s.userId}>
                      <td style={{ padding: '9px 14px', borderBottom: `1px solid ${LINE}`, fontWeight: 600, color: INK }}>
                        {s.userName}
                      </td>
                      <td style={{ padding: '9px 14px', borderBottom: `1px solid ${LINE}`, color: MUTED }}>
                        {s.role}
                      </td>
                      <td style={{ padding: '9px 14px', borderBottom: `1px solid ${LINE}`, color: s.daysFiled ? INK : FAINT }}>
                        {s.daysFiled}
                      </td>
                      <td style={{ padding: '9px 14px', borderBottom: `1px solid ${LINE}`, color: s.entries ? INK : FAINT }}>
                        {s.entries}
                      </td>
                      <td style={{ padding: '9px 14px', borderBottom: `1px solid ${LINE}`, color: MUTED, whiteSpace: 'nowrap' }}>
                        {s.lastEntryDate ? prettyDate(s.lastEntryDate, today) : '—'}
                      </td>
                      <td style={{ padding: '9px 14px', borderBottom: `1px solid ${LINE}` }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                          color: s.filedToday ? OK : '#8A5A18',
                          backgroundColor: s.filedToday ? '#EAF3EE' : '#FBF0DA',
                        }}>
                          {s.filedToday ? 'Filed' : 'Not yet'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {summary.length === 0 && !loading && (
                    <tr><td colSpan={6} style={{ padding: '14px', color: MUTED }}>No staff accounts found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ---------------- Entries ---------------- */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: MUTED, fontSize: 13, padding: '20px 2px' }}>
          <Loader2 size={15} className="ts-spin" /> Loading entries…
        </div>
      ) : grouped.length === 0 ? (
        <div style={{ ...cardStyle, color: MUTED, fontSize: 13, textAlign: 'center', padding: 26 }}>
          {tab === 'team'
            ? 'Nobody filed anything in this range.'
            : 'No entries yet. The form above is where the first one goes.'}
        </div>
      ) : (
        grouped.map(([date, list]) => (
          <div key={date} style={{ marginBottom: 16 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7,
              fontSize: 12, fontWeight: 700, color: MUTED,
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
              <CalendarDays size={13} />
              {prettyDate(date, today)}
              <span style={{ color: FAINT, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
                · {list.length} {list.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            {list.map(e => (
              <div key={e.id} style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {tab === 'team' && (
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: TEAL, marginBottom: 2 }}>
                        {e.userName}
                      </div>
                    )}
                    {e.editedAt && (
                      <div style={{ fontSize: 10.5, color: FAINT }}>edited</div>
                    )}
                  </div>

                  {e.canEdit && editingId !== e.id && (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => beginEdit(e)} title="Edit" style={{
                        background: 'none', border: `1px solid ${LINE}`, borderRadius: 5,
                        padding: '4px 6px', cursor: 'pointer', color: MUTED, display: 'flex',
                      }}><Pencil size={13} /></button>
                      <button onClick={() => remove(e)} title="Delete" style={{
                        background: 'none', border: `1px solid ${LINE}`, borderRadius: 5,
                        padding: '4px 6px', cursor: 'pointer', color: DANGER, display: 'flex',
                      }}><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>

                {editingId === e.id ? (
                  <div style={{ marginTop: 8 }}>
                    <label style={labelStyle}>Work done <span style={{ color: DANGER }}>*</span></label>
                    <textarea rows={4} value={draft.workDone}
                      onChange={ev => setDraft({ ...draft, workDone: ev.target.value })}
                      style={{ ...fieldStyle(), marginBottom: 10 }} />
                    <label style={labelStyle}>Problems faced</label>
                    <textarea rows={3} value={draft.problemsFaced}
                      onChange={ev => setDraft({ ...draft, problemsFaced: ev.target.value })}
                      style={{ ...fieldStyle(), marginBottom: 10 }} />
                    <label style={labelStyle}>Additional notes</label>
                    <textarea rows={3} value={draft.additionalNotes}
                      onChange={ev => setDraft({ ...draft, additionalNotes: ev.target.value })}
                      style={{ ...fieldStyle(), marginBottom: 12 }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => saveEdit(e.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '7px 13px', fontSize: 12.5, fontWeight: 600, color: '#fff',
                        backgroundColor: TEAL, border: 'none', borderRadius: 6, cursor: 'pointer',
                      }}><Check size={13} /> Save</button>
                      <button onClick={() => setEditingId(null)} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '7px 13px', fontSize: 12.5, fontWeight: 600, color: MUTED,
                        backgroundColor: 'transparent', border: `1px solid ${LINE}`,
                        borderRadius: 6, cursor: 'pointer',
                      }}><X size={13} /> Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Field label="Work done" value={e.workDone} />
                    <Field label="Problems faced" value={e.problemsFaced} tone="warn" />
                    <Field label="Additional notes" value={e.additionalNotes} />
                  </>
                )}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}

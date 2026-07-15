// =====================================================================
// components/outreach/OutreachDesk.tsx
// Pre-CRM "Outreach" desk: drop an xlsx/csv → append to a persisted list,
// see all details, edit status inline.
//
// Themed to match the SGT paper/teal palette (App.tsx / Sidebar.tsx).
// Rename the module label in ONE place:
export const MODULE_LABEL = 'Outreach';
// =====================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchContacts,
  importContacts,
  parseContactsFile,
  patchContact,
  promoteContact,
  OUTREACH_STATUSES,
  type OutreachContact,
  type OutreachStats,
  type ImportResult,
} from '../../lib/outreach';

// ── SGT paper/teal palette (matches App.tsx & Sidebar.tsx) ──────────────
const C = {
  pageBg: '#F4F0E5',
  card: '#FFFFFF',
  rowAlt: '#FBF9F2',
  tone: '#EDE7D8',       // sidebar tone / subtle surfaces
  toneHover: '#F1ECDF',
  border: '#DDD7C6',
  text: '#161614',
  text2: '#363633',
  sub: '#6A675F',
  faint: '#A39F94',
  teal: '#0E5550',
  tealSoft: '#DBEAE6',
  red: '#A02B1F',
  redSoft: '#F4E1DC',
  amber: '#8A6D1F',
  amberSoft: '#F3E9CE',
  blue: '#1E3A6B',
  blueSoft: '#E0E6F0',
  purple: '#6B3FA0',
  purpleSoft: '#EAE1F2',
  green: '#1E7A3D',
  greenSoft: '#DCEBDD',
};

function layerStyle(layer: string): { bg: string; fg: string } {
  const l = (layer || '').toLowerCase();
  if (l.includes('signer') || l.includes('decision-maker')) return { bg: C.redSoft, fg: C.red };
  if (l.includes('technical') || l.includes('poc') || l.includes('sponsor')) return { bg: C.blueSoft, fg: C.blue };
  if (l.includes('gatekeeper') || l.includes('influencer') || l.includes('procurement')) return { bg: C.amberSoft, fg: C.amber };
  if (l.includes('esg') || l.includes('comms') || l.includes('hr') || l.includes('ir')) return { bg: C.purpleSoft, fg: C.purple };
  if (l.includes('operations') || l.includes('ops') || l.includes('planning')) return { bg: C.greenSoft, fg: C.green };
  return { bg: C.tone, fg: C.sub };
}

function statusStyle(status: string): { bg: string; fg: string } {
  switch (status) {
    case 'Green': return { bg: C.greenSoft, fg: C.green };
    case 'Replied': return { bg: C.blueSoft, fg: C.blue };
    case 'Contacted': return { bg: C.amberSoft, fg: C.amber };
    case 'Not now': return { bg: C.tone, fg: C.sub };
    case 'TO FIND': return { bg: C.purpleSoft, fg: C.purple };
    default: return { bg: '#EDE9DE', fg: '#8A857B' };
  }
}

function useIsNarrow(bp = 820) {
  const [narrow, setNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth < bp : false
  );
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < bp);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [bp]);
  return narrow;
}

// =====================================================================
export default function OutreachDesk() {
  const narrow = useIsNarrow();
  const [contacts, setContacts] = useState<OutreachContact[]>([]);
  const [stats, setStats] = useState<OutreachStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [company, setCompany] = useState('all');
  const [status, setStatus] = useState('all');
  const [view, setView] = useState<'active' | 'promoted'>('active');

  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [selected, setSelected] = useState<OutreachContact | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { contacts, stats } = await fetchContacts({ company, status, search, promoted: view });
      setContacts(contacts);
      setStats(stats);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [company, status, search, view]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const companies = useMemo(() => {
    const set = new Set(contacts.map((c) => c.company).filter(Boolean));
    return Array.from(set).sort();
  }, [contacts]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || !files.length) return;
    setImporting(true);
    setBanner(null);
    try {
      let agg: ImportResult = { inserted: 0, updated: 0, skipped: 0, total: 0 };
      for (const file of Array.from(files)) {
        const rows = await parseContactsFile(file);
        if (!rows.length) {
          setBanner({ kind: 'err', text: `No contact rows found in "${file.name}". Expected columns like Company, Name, Email…` });
          continue;
        }
        const r = await importContacts(rows, file.name);
        agg = {
          inserted: agg.inserted + r.inserted,
          updated: agg.updated + r.updated,
          skipped: agg.skipped + r.skipped,
          total: agg.total + r.total,
        };
      }
      if (agg.total > 0) {
        setBanner({
          kind: 'ok',
          text: `Imported — ${agg.inserted} new, ${agg.updated} updated${agg.skipped ? `, ${agg.skipped} skipped` : ''}.`,
        });
      }
      await load();
    } catch (e: any) {
      setBanner({ kind: 'err', text: e?.message || 'Import failed' });
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }, [load]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const changeStatus = useCallback(async (c: OutreachContact, next: string) => {
    setContacts((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: next } : x)));
    setSelected((s) => (s && s.id === c.id ? { ...s, status: next } : s));
    try {
      await patchContact(c.id, { status: next });
      const { stats } = await fetchContacts({ company, status, search, promoted: view });
      setStats(stats);
    } catch {
      load();
    }
  }, [company, status, search, view, load]);

  // save an edited field (phone/email/linkedin) on the open contact
  const saveField = useCallback(async (
    c: OutreachContact,
    patch: Partial<Pick<OutreachContact, 'phone' | 'email' | 'linkedin'>>,
  ) => {
    const fresh = await patchContact(c.id, patch);
    setContacts((prev) => prev.map((x) => (x.id === c.id ? fresh : x)));
    setSelected((s) => (s && s.id === c.id ? fresh : s));
  }, []);

  // Green signal → create a real lead; it lands unassigned in the triage queue
  const promote = useCallback(async (c: OutreachContact) => {
    setPromoting(true);
    setBanner(null);
    try {
      const { data } = await promoteContact(c.id);
      setBanner({ kind: 'ok', text: `${c.name} promoted to lead ${data.displayId} — now in the triage queue.` });
      setSelected(null);
      await load();
    } catch (e: any) {
      setBanner({ kind: 'err', text: e?.message || 'Promote failed' });
    } finally {
      setPromoting(false);
    }
  }, [load]);

  // ── render: root fills <main> and scrolls internally ──────────────
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: C.pageBg }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: narrow ? '16px 14px 96px' : '22px 24px 44px', color: C.text }}>

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: narrow ? 21 : 24, fontWeight: 600, letterSpacing: '-0.03em', margin: 0, color: C.text }}>
            {MODULE_LABEL}
          </h1>
          <span style={{ color: C.sub, fontSize: 12.5 }}>
            Cold contacts before triage · give a green signal to promote into the pipeline
          </span>
        </div>

        {/* stats */}
        {stats && (
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <Stat label="Contacts" value={stats.total} />
            <Stat label="Companies" value={stats.companies} />
            <Stat label="Signers" value={stats.signers} accent={C.red} />
            <Stat label="Contacted" value={stats.contacted} accent={C.amber} />
            <Stat label="Green" value={stats.green} accent={C.green} />
            <Stat label="Promoted" value={stats.promoted} accent={C.teal} />
          </div>
        )}

        {/* drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current?.click()}
          style={{
            marginTop: 16,
            border: `2px dashed ${dragOver ? C.teal : C.border}`,
            background: dragOver ? C.tealSoft : C.card,
            borderRadius: 10,
            padding: narrow ? '18px 14px' : '22px 20px',
            textAlign: 'center', cursor: 'pointer', transition: 'all .15s',
          }}
        >
          <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" multiple style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)} />
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>
            {importing ? 'Importing…' : 'Drop an .xlsx or .csv here to append'}
          </div>
          <div style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>
            Same file twice is safe — descriptive fields refresh, your status is never reset.
          </div>
        </div>

        {banner && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: banner.kind === 'ok' ? C.greenSoft : C.redSoft,
            color: banner.kind === 'ok' ? C.green : C.red,
            border: `1px solid ${banner.kind === 'ok' ? '#BFDCC5' : '#E7C9C2'}`,
          }}>
            {banner.text}
          </div>
        )}

        {/* filters */}
        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, email, angle…"
            style={{
              flex: narrow ? '1 1 100%' : '1 1 260px',
              background: C.card, border: `1px solid ${C.border}`, color: C.text,
              borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none',
            }}
          />
          <Select value={company} onChange={setCompany} options={[['all', 'All companies'], ...companies.map((c) => [c, c] as [string, string])]} />
          <Select value={status} onChange={setStatus} options={[['all', 'All statuses'], ...OUTREACH_STATUSES.map((s) => [s, s] as [string, string])]} />
          <Select
            value={view}
            onChange={(v) => setView(v as 'active' | 'promoted')}
            options={[['active', 'Working list'], ['promoted', 'Promoted']]}
          />
        </div>

        {/* list */}
        <div style={{ marginTop: 16 }}>
          {loading ? (
            <Empty text="Loading…" />
          ) : err ? (
            <Empty text={err} tone="err" />
          ) : contacts.length === 0 ? (
            <Empty text={view === 'promoted'
              ? 'Nothing promoted yet. Mark a contact Green, then promote it into the pipeline.'
              : 'No contacts yet. Drop your MDO_Contacts sheet above to get started.'} />
          ) : narrow ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {contacts.map((c) => (
                <Card key={c.id} c={c} onOpen={() => setSelected(c)} onStatus={changeStatus} />
              ))}
            </div>
          ) : (
            <Table contacts={contacts} onOpen={setSelected} onStatus={changeStatus} />
          )}
        </div>
      </div>

      {selected && (
        <Drawer
          c={selected}
          onClose={() => setSelected(null)}
          onStatus={changeStatus}
          onSaveField={saveField}
          onPromote={promote}
          promoting={promoting}
        />
      )}
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────
function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 16px', minWidth: 92 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || C.text }}>{value}</div>
      <div style={{ fontSize: 10.5, color: C.sub, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][]; }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: C.card, border: `1px solid ${C.border}`, color: C.text,
        borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer',
      }}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v} style={{ background: C.card, color: C.text }}>{l}</option>
      ))}
    </select>
  );
}

function Chip({ text, style }: { text: string; style: { bg: string; fg: string } }) {
  return (
    <span style={{ background: style.bg, color: style.fg, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{text}</span>
  );
}

function StatusPicker({ c, onStatus }: { c: OutreachContact; onStatus: (c: OutreachContact, s: string) => void; }) {
  const st = statusStyle(c.status);
  return (
    <select
      value={c.status}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onStatus(c, e.target.value)}
      style={{
        background: st.bg, color: st.fg, border: `1px solid ${C.border}`, borderRadius: 999,
        padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', outline: 'none',
      }}
    >
      {OUTREACH_STATUSES.map((s) => (
        <option key={s} value={s} style={{ background: C.card, color: C.text }}>{s}</option>
      ))}
    </select>
  );
}

function Table({ contacts, onOpen, onStatus }: {
  contacts: OutreachContact[];
  onOpen: (c: OutreachContact) => void;
  onStatus: (c: OutreachContact, s: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 10.5, color: C.sub, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '9px 14px' };
  const td: React.CSSProperties = { padding: '11px 14px', fontSize: 14, verticalAlign: 'top' };
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', background: C.card }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ background: C.tone }}>
          <tr>
            <th style={th}>Contact</th>
            <th style={th}>Company</th>
            <th style={th}>Layer</th>
            <th style={th}>City</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c, i) => (
            <tr
              key={c.id}
              onClick={() => onOpen(c)}
              onMouseEnter={() => setHover(c.id)}
              onMouseLeave={() => setHover((h) => (h === c.id ? null : h))}
              style={{
                cursor: 'pointer',
                background: hover === c.id ? C.toneHover : i % 2 ? C.rowAlt : C.card,
                borderTop: `1px solid ${C.border}`,
              }}
            >
              <td style={td}>
                <div style={{ fontWeight: 600, color: C.text }}>{c.name}</div>
                <div style={{ color: C.sub, fontSize: 12 }}>{c.title}</div>
              </td>
              <td style={{ ...td, color: C.text2 }}>{c.company}</td>
              <td style={td}><Chip text={c.layer || '—'} style={layerStyle(c.layer)} /></td>
              <td style={{ ...td, color: C.sub }}>{c.city || '—'}</td>
              <td style={td}>
                {c.promoted_lead_id
                  ? <Chip text={`→ ${c.promoted_display_id ?? 'lead'}`} style={{ bg: C.tealSoft, fg: C.teal }} />
                  : <StatusPicker c={c} onStatus={onStatus} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ c, onOpen, onStatus }: { c: OutreachContact; onOpen: () => void; onStatus: (c: OutreachContact, s: string) => void; }) {
  return (
    <div onClick={onOpen} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 600, color: C.text }}>{c.name}</div>
          <div style={{ color: C.sub, fontSize: 12 }}>{c.title}</div>
        </div>
        {c.promoted_lead_id
          ? <Chip text={`→ ${c.promoted_display_id ?? 'lead'}`} style={{ bg: C.tealSoft, fg: C.teal }} />
          : <StatusPicker c={c} onStatus={onStatus} />}
      </div>
      <div style={{ color: C.text2, fontSize: 13, marginTop: 8 }}>{c.company}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <Chip text={c.layer || '—'} style={layerStyle(c.layer)} />
        {c.city && <Chip text={c.city} style={{ bg: C.tone, fg: C.sub }} />}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10.5, color: C.sub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 14, color: C.text, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

function EditableField({ label, value, placeholder, onSave }: {
  label: string;
  value: string;
  placeholder: string;
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(value); }, [value]);

  const commit = async () => {
    if (draft.trim() === value.trim()) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(draft.trim()); setEditing(false); }
    finally { setSaving(false); }
  };

  return (
    <Field label={label}>
      {editing ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
            placeholder={placeholder}
            style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '6px 9px', fontSize: 13.5, outline: 'none' }}
          />
          <button onClick={commit} disabled={saving}
            style={{ background: C.teal, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 11px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            {saving ? '…' : 'Save'}
          </button>
        </div>
      ) : (
        <div
          onClick={() => setEditing(true)}
          style={{ cursor: 'text', color: value ? C.text : C.faint, borderBottom: `1px dashed ${C.border}`, paddingBottom: 2 }}
          title="Click to edit"
        >
          {value || placeholder}
        </div>
      )}
    </Field>
  );
}

function Drawer({ c, onClose, onStatus, onSaveField, onPromote, promoting }: {
  c: OutreachContact;
  onClose: () => void;
  onStatus: (c: OutreachContact, s: string) => void;
  onSaveField: (c: OutreachContact, patch: Partial<Pick<OutreachContact, 'phone' | 'email' | 'linkedin'>>) => Promise<void>;
  onPromote: (c: OutreachContact) => void;
  promoting: boolean;
}) {
  const mailto = c.email && c.email.includes('@')
    ? `mailto:${c.email}?subject=${encodeURIComponent(`SGT HydroEdge — ${c.company}`)}`
    : undefined;

  const isPromoted = !!c.promoted_lead_id;
  const canPromote = c.status === 'Green' && !isPromoted;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(22,22,20,0.42)', display: 'flex', justifyContent: 'flex-end', zIndex: 1000 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(460px, 100%)', height: '100%', background: C.pageBg,
          borderLeft: `1px solid ${C.border}`, padding: 22, overflowY: 'auto',
          boxShadow: '-8px 0 30px rgba(0,0,0,0.14)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: C.text }}>{c.name}</div>
            <div style={{ color: C.sub, fontSize: 13 }}>{c.title}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.sub, fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 8, margin: '14px 0 20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip text={c.layer || '—'} style={layerStyle(c.layer)} />
          {c.verified && <Chip text={c.verified} style={{ bg: C.tealSoft, fg: C.teal }} />}
          {isPromoted
            ? <Chip text={`Promoted → ${c.promoted_display_id ?? 'lead'}`} style={{ bg: C.tealSoft, fg: C.teal }} />
            : <StatusPicker c={c} onStatus={onStatus} />}
        </div>

        <Field label="Company">{c.company}</Field>
        {c.city && <Field label="City">{c.city}</Field>}

        <Field label="Email">
          {c.email
            ? (mailto ? <a href={mailto} style={{ color: C.teal, textDecoration: 'none' }}>{c.email}</a> : <span>{c.email}</span>)
            : <span style={{ color: C.faint }}>—</span>}
          {c.email2 && <div style={{ color: C.sub, fontSize: 13, marginTop: 4 }}>alt: {c.email2}</div>}
        </Field>

        {/* Phone isn't in the MDO sheet — hand-entered when found, carried to the lead on promote */}
        <EditableField
          label="Phone"
          value={c.phone || ''}
          placeholder="Add a phone number…"
          onSave={(v) => onSaveField(c, { phone: v })}
        />

        {c.linkedin && (
          <Field label="LinkedIn">
            <a href={c.linkedin} target="_blank" rel="noreferrer" style={{ color: C.teal, wordBreak: 'break-all', textDecoration: 'none' }}>
              {c.linkedin.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          </Field>
        )}

        {c.message_angle && (
          <Field label="Message angle">
            <div style={{ background: C.tone, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>{c.message_angle}</div>
          </Field>
        )}

        <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {mailto && !isPromoted && (
            <a href={mailto} style={{ background: C.card, color: C.teal, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              Open in mail →
            </a>
          )}

          {isPromoted ? (
            <div style={{ fontSize: 12.5, color: C.sub }}>
              Promoted as <strong style={{ color: C.teal }}>{c.promoted_display_id}</strong> — find it in the triage queue.
            </div>
          ) : (
            <button
              onClick={() => onPromote(c)}
              disabled={!canPromote || promoting}
              title={canPromote ? 'Create a lead and send it to triage' : 'Mark this contact Green first'}
              style={{
                background: canPromote ? C.teal : C.tone,
                color: canPromote ? '#fff' : C.faint,
                border: canPromote ? 'none' : `1px solid ${C.border}`,
                borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600,
                cursor: canPromote && !promoting ? 'pointer' : 'not-allowed',
              }}
            >
              {promoting ? 'Promoting…' : 'Promote to lead →'}
            </button>
          )}
        </div>

        {!canPromote && !isPromoted && (
          <div style={{ fontSize: 12, color: C.sub, marginTop: 8 }}>
            Only contacts marked <strong>Green</strong> can be promoted.
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ text, tone }: { text: string; tone?: 'err' }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: tone === 'err' ? C.red : C.sub, background: C.card, border: `1px dashed ${C.border}`, borderRadius: 10, fontSize: 14 }}>{text}</div>
  );
}
// =====================================================================
// components/outreach/OutreachDesk.tsx
// Pre-CRM "Outreach" desk. Contacts are grouped by the company text they
// already carry — grouping is a display concern, so it happens here rather
// than in the database. No company table, nothing to keep in sync.
//
// Rename the module label in ONE place:
export const MODULE_LABEL = 'Outreach';
// =====================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, Trash2 } from 'lucide-react';
import {
  fetchContacts,
  importContacts,
  parseContactsFile,
  patchContact,
  promoteContact,
  deleteContact as apiDeleteContact,
  OUTREACH_STATUSES,
  VERTICALS,
  type OutreachContact,
  type OutreachStats,
  type VerticalStat,
} from '../../lib/outreach';

// ── SGT paper/teal palette (matches App.tsx / Sidebar.tsx) ───────────
const C = {
  pageBg: '#F4F0E5', card: '#FFFFFF', rowAlt: '#FBF9F2',
  tone: '#EDE7D8', toneHover: '#F1ECDF', border: '#DDD7C6',
  text: '#161614', text2: '#363633', sub: '#6A675F', faint: '#A39F94',
  teal: '#0E5550', tealSoft: '#DBEAE6',
  red: '#A02B1F', redSoft: '#F4E1DC',
  amber: '#8A6D1F', amberSoft: '#F3E9CE',
  blue: '#1E3A6B', blueSoft: '#E0E6F0',
  purple: '#6B3FA0', purpleSoft: '#EAE1F2',
  green: '#1E7A3D', greenSoft: '#DCEBDD',
};

function layerStyle(layer: string): { bg: string; fg: string } {
  const l = (layer || '').toLowerCase();
  if (l.includes('signer') || l.includes('decision-maker')) return { bg: C.redSoft, fg: C.red };
  if (l.includes('technical') || l.includes('poc') || l.includes('sponsor')) return { bg: C.blueSoft, fg: C.blue };
  if (l.includes('gatekeeper') || l.includes('influencer') || l.includes('procurement')) return { bg: C.amberSoft, fg: C.amber };
  if (l.includes('esg') || l.includes('comms') || l.includes('hr') || l.includes('ir')) return { bg: C.purpleSoft, fg: C.purple };
  if (l.includes('operations') || l.includes('ops') || l.includes('planning')) return { bg: C.greenSoft, fg: C.green };
  if (l.includes('off-target') || l.includes('off target')) return { bg: '#EDE9DE', fg: '#8A857B' };
  return { bg: C.tone, fg: C.sub };
}

function statusStyle(status: string): { bg: string; fg: string } {
  switch (status) {
    case 'Green': return { bg: C.greenSoft, fg: C.green };
    case 'Replied': return { bg: C.blueSoft, fg: C.blue };
    case 'Contacted': return { bg: C.amberSoft, fg: C.amber };
    case 'Not now': return { bg: C.tone, fg: C.sub };
    case 'Do not contact': return { bg: C.redSoft, fg: C.red };
    case 'TO FIND': return { bg: C.purpleSoft, fg: C.purple };
    default: return { bg: '#EDE9DE', fg: '#8A857B' };
  }
}

const isSigner = (layer: string) => /signer|decision-maker/i.test(layer || '');

function verticalStyle(v: string): { bg: string; fg: string } {
  switch (v) {
    case 'DG': return { bg: C.blueSoft, fg: C.blue };
    case 'Mining': return { bg: C.amberSoft, fg: C.amber };
    case 'Marine': return { bg: C.tealSoft, fg: C.teal };
    case 'Vehicles': return { bg: C.purpleSoft, fg: C.purple };
    case 'Small DG': return { bg: C.greenSoft, fg: C.green };
    default: return { bg: C.tone, fg: C.faint };
  }
}

function useIsNarrow(bp = 820) {
  const [narrow, setNarrow] = useState(typeof window !== 'undefined' ? window.innerWidth < bp : false);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < bp);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [bp]);
  return narrow;
}

type Group = {
  company: string;
  vertical: string;          // company-level in practice: taken from its contacts
  contacts: OutreachContact[];
  green: number;
  signers: number;
};

// =====================================================================
export default function OutreachDesk() {
  const narrow = useIsNarrow();
  const [contacts, setContacts] = useState<OutreachContact[]>([]);
  const [stats, setStats] = useState<OutreachStats | null>(null);
  const [verticals, setVerticals] = useState<VerticalStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [view, setView] = useState<'active' | 'promoted'>('active');
  const [vertical, setVertical] = useState('all');
  const [grouped, setGrouped] = useState(true);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [selected, setSelected] = useState<OutreachContact | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetchContacts({ status, search, vertical, promoted: view });
      setContacts(r.contacts);
      setStats(r.stats);
      setVerticals(r.verticals ?? []);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load contacts');
    } finally { setLoading(false); }
  }, [status, search, vertical, view]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  // ── the grouping. Company is the text already on each contact; no lookup,
  //    no table, no sync. Sorted so the accounts with signers/green surface.
  const groups: Group[] = useMemo(() => {
    const m = new Map<string, OutreachContact[]>();
    for (const c of contacts) {
      const key = c.company || '—';
      const arr = m.get(key);
      if (arr) arr.push(c); else m.set(key, [c]);
    }
    return Array.from(m, ([company, cs]) => ({
      company,
      vertical: cs.find((c) => c.vertical)?.vertical ?? '',
      contacts: [...cs].sort((a, b) => a.name.localeCompare(b.name)),
      green: cs.filter((c) => c.status === 'Green').length,
      signers: cs.filter((c) => isSigner(c.layer)).length,
    })).sort((a, b) => a.company.localeCompare(b.company));
  }, [contacts]);

  // While filtering, open everything — hits shouldn't be hidden behind a chevron.
  const filtering = search.trim().length > 0 || status !== 'all';
  const isOpen = (co: string) => filtering || expanded.has(co);
  const toggle = (co: string) => setExpanded((prev) => {
    const n = new Set(prev);
    if (n.has(co)) n.delete(co); else n.add(co);
    return n;
  });
  const allOpen = groups.length > 0 && groups.every((g) => isOpen(g.company));
  const toggleAll = () => setExpanded(allOpen ? new Set() : new Set(groups.map((g) => g.company)));

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || !files.length) return;
    setImporting(true); setBanner(null);
    try {
      let ins = 0, upd = 0, skip = 0, total = 0;
      for (const file of Array.from(files)) {
        const rows = await parseContactsFile(file);
        if (!rows.length) {
          setBanner({ kind: 'err', text: `No contact rows found in "${file.name}". Expected columns like Company, Name, Email…` });
          continue;
        }
        const r = await importContacts(rows, file.name);
        ins += r.inserted; upd += r.updated; skip += r.skipped; total += r.total;
      }
      if (total > 0) {
        setBanner({ kind: 'ok', text: `Imported — ${ins} new, ${upd} updated${skip ? `, ${skip} skipped` : ''}.` });
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
    e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const patchLocal = (u: OutreachContact) => {
    setContacts((prev) => prev.map((x) => (x.id === u.id ? u : x)));
    setSelected((s) => (s && s.id === u.id ? u : s));
  };

  const changeStatus = useCallback(async (c: OutreachContact, next: string) => {
    patchLocal({ ...c, status: next });                     // optimistic
    try {
      patchLocal(await patchContact(c.id, { status: next }));
      const r = await fetchContacts({ status, search, vertical, promoted: view });
      setStats(r.stats);
      setVerticals(r.verticals ?? []);
    } catch { load(); }
  }, [status, search, vertical, view, load]);

  const saveField = useCallback(async (
    c: OutreachContact,
    patch: Partial<Pick<OutreachContact, 'phone' | 'email' | 'linkedin' | 'layer' | 'title' | 'vertical'>>,
  ) => { patchLocal(await patchContact(c.id, patch)); }, []);

  const removeContact = useCallback(async (c: OutreachContact) => {
    if (!window.confirm(`Remove "${c.name}" from the outreach list?\n\nIt won't come back if you re-import the same sheet.`)) return;
    try {
      await apiDeleteContact(c.id);
      setSelected((s) => (s && s.id === c.id ? null : s));
      setBanner({ kind: 'ok', text: `Removed ${c.name}.` });
      await load();
    } catch (e: any) {
      setBanner({ kind: 'err', text: e?.message || 'Delete failed' });
    }
  }, [load]);

  const promote = useCallback(async (c: OutreachContact) => {
    setPromoting(true); setBanner(null);
    try {
      const { data } = await promoteContact(c.id);
      setBanner({ kind: 'ok', text: `${c.name} promoted to lead ${data.displayId} — now in the triage queue.` });
      setSelected(null);
      await load();
    } catch (e: any) {
      setBanner({ kind: 'err', text: e?.message || 'Promote failed' });
    } finally { setPromoting(false); }
  }, [load]);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: C.pageBg }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: narrow ? '16px 14px 96px' : '22px 24px 44px', color: C.text }}>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: narrow ? 21 : 24, fontWeight: 600, letterSpacing: '-0.03em', margin: 0 }}>{MODULE_LABEL}</h1>
          <span style={{ color: C.sub, fontSize: 12.5 }}>
            Cold contacts before triage · mark one Green to promote into the pipeline
          </span>
        </div>

        {/* Two different pipelines — mining are end customers, DG are channel
            partners. Showing one at a time keeps the stats meaningful. */}
        {verticals.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
            <Pill label="All" count={verticals.reduce((n, v) => n + v.contacts, 0)}
              active={vertical === 'all'} onClick={() => setVertical('all')} />
            {verticals.map((v) => (
              <Pill key={v.vertical} label={v.vertical} count={v.contacts} sub={`${v.companies} co`}
                active={vertical === v.vertical} onClick={() => setVertical(v.vertical)}
                tone={verticalStyle(v.vertical)} />
            ))}
          </div>
        )}

        {stats && (
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <Stat label="Companies" value={stats.companies} />
            <Stat label="Contacts" value={stats.total} />
            <Stat label="Signers" value={stats.signers} accent={C.red} />
            <Stat label="Contacted" value={stats.contacted} accent={C.amber} />
            <Stat label="Green" value={stats.green} accent={C.green} />
            <Stat label="Do not contact" value={stats.dnc} accent={C.red} />
            <Stat label="Promoted" value={stats.promoted} accent={C.teal} />
          </div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current?.click()}
          style={{
            marginTop: 16, border: `2px dashed ${dragOver ? C.teal : C.border}`,
            background: dragOver ? C.tealSoft : C.card, borderRadius: 10,
            padding: narrow ? '18px 14px' : '22px 20px', textAlign: 'center',
            cursor: 'pointer', transition: 'all .15s',
          }}
        >
          <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" multiple style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)} />
          <div style={{ fontSize: 15, fontWeight: 600 }}>
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
          }}>{banner.text}</div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, email, angle…"
            style={{
              flex: narrow ? '1 1 100%' : '1 1 240px', background: C.card,
              border: `1px solid ${C.border}`, color: C.text, borderRadius: 8,
              padding: '9px 12px', fontSize: 14, outline: 'none',
            }}
          />
          <Select value={status} onChange={setStatus} options={[['all', 'All statuses'], ...OUTREACH_STATUSES.map((s) => [s, s] as [string, string])]} />
          <Select value={view} onChange={(v) => setView(v as 'active' | 'promoted')} options={[['active', 'Working list'], ['promoted', 'Promoted']]} />
          <Select value={grouped ? 'grouped' : 'flat'} onChange={(v) => setGrouped(v === 'grouped')} options={[['grouped', 'By company'], ['flat', 'All contacts']]} />
          {grouped && groups.length > 0 && !filtering && (
            <button onClick={toggleAll}
              style={{ background: 'none', border: `1px solid ${C.border}`, color: C.sub, borderRadius: 8, padding: '9px 12px', fontSize: 12.5, cursor: 'pointer' }}>
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          {loading ? <Empty text="Loading…" />
            : err ? <Empty text={err} tone="err" />
            : contacts.length === 0 ? (
              <Empty text={filtering
                ? 'No matches. Try a different search or clear the filters.'
                : view === 'promoted'
                  ? 'Nothing promoted yet. Mark a contact Green, then promote it into the pipeline.'
                  : vertical !== 'all'
                    ? `Nothing in ${vertical} yet.`
                    : 'No contacts yet. Drop your contact sheet above to get started.'} />
            ) : grouped ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {groups.map((g) => (
                  <CompanyGroup
                    key={g.company} g={g} narrow={narrow} showVertical={vertical === 'all'}
                    open={isOpen(g.company)} onToggle={() => toggle(g.company)}
                    onContact={setSelected} onStatus={changeStatus} onDelete={removeContact}
                  />
                ))}
              </div>
            ) : (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', background: C.card }}>
                {contacts.map((c, i) => (
                  <ContactRow key={c.id} c={c} narrow={narrow} showCompany
                    style={{ background: i % 2 ? C.rowAlt : C.card, borderTop: i ? `1px solid ${C.border}` : 'none', paddingLeft: 14 }}
                    onClick={() => setSelected(c)} onStatus={changeStatus} onDelete={removeContact} />
                ))}
              </div>
            )}
        </div>
      </div>

      {selected && (
        <ContactDrawer
          c={selected} onClose={() => setSelected(null)} onStatus={changeStatus}
          onSaveField={saveField} onPromote={promote} promoting={promoting} onDelete={removeContact}
        />
      )}
    </div>
  );
}

// ── company group ─────────────────────────────────────────────────────
function CompanyGroup({ g, narrow, open, showVertical, onToggle, onContact, onStatus, onDelete }: {
  g: Group; narrow: boolean; open: boolean; showVertical: boolean; onToggle: () => void;
  onContact: (c: OutreachContact) => void;
  onStatus: (c: OutreachContact, s: string) => void;
  onDelete: (c: OutreachContact) => void;
}) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.card, overflow: 'hidden' }}>
      <div onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: narrow ? '11px 12px' : '12px 14px', cursor: 'pointer' }}>
        <span style={{ color: C.sub, display: 'flex', flexShrink: 0 }}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 14.5 }}>{g.company}</span>
            {showVertical && g.vertical && <Chip text={g.vertical} style={verticalStyle(g.vertical)} />}
          </div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
            {g.contacts.length} contact{g.contacts.length > 1 ? 's' : ''}
            {g.signers > 0 && ` · ${g.signers} signer${g.signers > 1 ? 's' : ''}`}
            {g.green > 0 && <span style={{ color: C.green, fontWeight: 600 }}> · {g.green} green</span>}
          </div>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${C.border}`, background: C.rowAlt }}>
          {g.contacts.map((c) => (
            <ContactRow key={c.id} c={c} narrow={narrow}
              style={{ borderTop: `1px solid ${C.border}`, paddingLeft: 40 }}
              onClick={() => onContact(c)} onStatus={onStatus} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function ContactRow({ c, narrow, style, showCompany, onClick, onStatus, onDelete }: {
  c: OutreachContact; narrow: boolean; style?: React.CSSProperties; showCompany?: boolean;
  onClick: () => void;
  onStatus: (c: OutreachContact, s: string) => void;
  onDelete: (c: OutreachContact) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', cursor: 'pointer',
        flexWrap: narrow ? 'wrap' : 'nowrap',
        ...(hover ? { background: C.toneHover } : {}),
        ...style,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</div>
        <div style={{ color: C.sub, fontSize: 12 }}>
          {showCompany ? `${c.company}${c.title ? ' · ' : ''}${c.title}` : c.title}
        </div>
      </div>
      <Chip text={c.layer || '—'} style={layerStyle(c.layer)} />
      {!narrow && <span style={{ color: C.sub, fontSize: 12.5, width: 96, flexShrink: 0 }}>{c.city || '—'}</span>}
      {c.promoted_lead_id
        ? <Chip text={`→ ${c.promoted_display_id ?? 'lead'}`} style={{ bg: C.tealSoft, fg: C.teal }} />
        : <StatusPicker c={c} onStatus={onStatus} />}
      <button onClick={(e) => { e.stopPropagation(); onDelete(c); }} title="Remove from list"
        style={{ background: 'none', border: 'none', color: hover ? C.red : C.faint, cursor: 'pointer', padding: 4, display: 'flex', flexShrink: 0 }}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ── shared bits ───────────────────────────────────────────────────────
function Pill({ label, count, sub, active, onClick, tone }: {
  label: string; count: number; sub?: string; active: boolean;
  onClick: () => void; tone?: { bg: string; fg: string };
}) {
  return (
    <button onClick={onClick}
      style={{
        display: 'flex', alignItems: 'baseline', gap: 6,
        background: active ? C.teal : (tone?.bg ?? C.card),
        color: active ? '#fff' : (tone?.fg ?? C.text2),
        border: `1px solid ${active ? C.teal : C.border}`,
        borderRadius: 999, padding: '6px 13px', fontSize: 13, fontWeight: 600,
        cursor: 'pointer', transition: 'all .12s',
      }}>
      {label}
      <span style={{ fontSize: 12, opacity: active ? 0.85 : 0.6 }}>{count}</span>
      {sub && <span style={{ fontSize: 10.5, opacity: active ? 0.7 : 0.5 }}>· {sub}</span>}
    </button>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 16px', minWidth: 88 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || C.text }}>{value}</div>
      <div style={{ fontSize: 10.5, color: C.sub, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
      {options.map(([v, l]) => <option key={v} value={v} style={{ background: C.card, color: C.text }}>{l}</option>)}
    </select>
  );
}

function Chip({ text, style }: { text: string; style: { bg: string; fg: string } }) {
  return <span style={{ background: style.bg, color: style.fg, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{text}</span>;
}

function StatusPicker({ c, onStatus }: { c: OutreachContact; onStatus: (c: OutreachContact, s: string) => void }) {
  const st = statusStyle(c.status);
  // A <select> whose value matches no option silently renders the FIRST one —
  // that's how 'Do not contact' rows once displayed as 'Not contacted'.
  const known = (OUTREACH_STATUSES as readonly string[]).includes(c.status);
  const options = known ? [...OUTREACH_STATUSES] : [c.status, ...OUTREACH_STATUSES];
  return (
    <select value={c.status} onClick={(e) => e.stopPropagation()} onChange={(e) => onStatus(c, e.target.value)}
      style={{ background: st.bg, color: st.fg, border: `1px solid ${C.border}`, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
      {options.map((s) => <option key={s} value={s} style={{ background: C.card, color: C.text }}>{s}</option>)}
    </select>
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

function EditableField({ label, value, placeholder, onSave, render }: {
  label: string; value: string; placeholder: string;
  onSave: (v: string) => Promise<void>;
  render?: (v: string) => React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(value); }, [value]);

  const commit = async () => {
    if (draft.trim() === value.trim()) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(draft.trim()); setEditing(false); } finally { setSaving(false); }
  };

  return (
    <Field label={label}>
      {editing ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
            style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '6px 9px', fontSize: 13.5, outline: 'none' }} />
          <button onClick={commit} disabled={saving}
            style={{ background: C.teal, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 11px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            {saving ? '…' : 'Save'}
          </button>
        </div>
      ) : (
        <div onClick={() => setEditing(true)} title="Click to edit"
          style={{ cursor: 'text', color: value ? C.text : C.faint, borderBottom: `1px dashed ${C.border}`, paddingBottom: 2 }}>
          {render ? render(value) : (value || placeholder)}
        </div>
      )}
    </Field>
  );
}

// ── contact slide-over ───────────────────────────────────────────────
function ContactDrawer({ c, onClose, onStatus, onSaveField, onPromote, promoting, onDelete }: {
  c: OutreachContact; onClose: () => void;
  onStatus: (c: OutreachContact, s: string) => void;
  onSaveField: (c: OutreachContact, patch: Partial<Pick<OutreachContact, 'phone' | 'email' | 'linkedin' | 'layer' | 'title' | 'vertical'>>) => Promise<void>;
  onPromote: (c: OutreachContact) => void;
  promoting: boolean;
  onDelete: (c: OutreachContact) => void;
}) {
  const mailto = c.email && c.email.includes('@')
    ? `mailto:${c.email}?subject=${encodeURIComponent(`SGT HydroEdge — ${c.company}`)}` : undefined;
  const isPromoted = !!c.promoted_lead_id;
  const canPromote = c.status === 'Green' && !isPromoted;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(22,22,20,0.42)', display: 'flex', justifyContent: 'flex-end', zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(460px, 100%)', height: '100%', background: C.pageBg, borderLeft: `1px solid ${C.border}`, padding: 22, overflowY: 'auto', boxShadow: '-8px 0 30px rgba(0,0,0,0.14)' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{c.name}</div>
            <div style={{ color: C.sub, fontSize: 13 }}>{c.title}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.sub, fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 8, margin: '14px 0 20px', flexWrap: 'wrap', alignItems: 'center' }}>
          {c.verified && <Chip text={c.verified} style={{ bg: C.tealSoft, fg: C.teal }} />}
          {isPromoted
            ? <Chip text={`Promoted → ${c.promoted_display_id ?? 'lead'}`} style={{ bg: C.tealSoft, fg: C.teal }} />
            : <StatusPicker c={c} onStatus={onStatus} />}
        </div>

        <EditableField label="Layer" value={c.layer || ''} placeholder="e.g. DECISION-MAKER (signer)"
          onSave={(v) => onSaveField(c, { layer: v })} render={(v) => <Chip text={v || '—'} style={layerStyle(v)} />} />

        <Field label="Company">{c.company}</Field>

        {/* Vertical is company-level in practice — changing it here changes this
            contact only, so re-import or edit siblings if a company moves. */}
        <Field label="Vertical">
          <select
            value={c.vertical || ''}
            onChange={(e) => onSaveField(c, { vertical: e.target.value })}
            style={{
              background: verticalStyle(c.vertical).bg, color: verticalStyle(c.vertical).fg,
              border: `1px solid ${C.border}`, borderRadius: 999, padding: '4px 10px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', outline: 'none',
            }}>
            <option value="" style={{ background: C.card, color: C.text }}>— untagged —</option>
            {(VERTICALS as readonly string[]).concat(
              c.vertical && !(VERTICALS as readonly string[]).includes(c.vertical) ? [c.vertical] : []
            ).map((v) => <option key={v} value={v} style={{ background: C.card, color: C.text }}>{v}</option>)}
          </select>
        </Field>
        {c.city && <Field label="City">{c.city}</Field>}

        <Field label="Email">
          {c.email ? (mailto ? <a href={mailto} style={{ color: C.teal, textDecoration: 'none' }}>{c.email}</a> : <span>{c.email}</span>)
            : <span style={{ color: C.faint }}>—</span>}
          {c.email2 && <div style={{ color: C.sub, fontSize: 13, marginTop: 4 }}>alt: {c.email2}</div>}
        </Field>

        <EditableField label="Phone" value={c.phone || ''} placeholder="Add a phone number…"
          onSave={(v) => onSaveField(c, { phone: v })} />

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

        <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
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
            <button onClick={() => onPromote(c)} disabled={!canPromote || promoting}
              title={canPromote ? 'Create a lead and send it to triage' : 'Mark this contact Green first'}
              style={{
                background: canPromote ? C.teal : C.tone, color: canPromote ? '#fff' : C.faint,
                border: canPromote ? 'none' : `1px solid ${C.border}`, borderRadius: 8,
                padding: '9px 14px', fontSize: 13, fontWeight: 600,
                cursor: canPromote && !promoting ? 'pointer' : 'not-allowed',
              }}>
              {promoting ? 'Promoting…' : 'Promote to lead →'}
            </button>
          )}
          <button onClick={() => onDelete(c)} title="Remove from the outreach list"
            style={{ background: 'none', color: C.red, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Trash2 size={13} /> Remove
          </button>
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
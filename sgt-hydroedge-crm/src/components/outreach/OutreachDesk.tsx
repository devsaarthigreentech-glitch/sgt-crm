// =====================================================================
// components/outreach/OutreachDesk.tsx
// Pre-CRM "Outreach" desk: drop an xlsx/csv → append to a persisted list,
// see all details, edit status inline. Mail compose / n8n auto-capture /
// promote-to-lead land in later rounds (stubs noted below).
//
// Rename the module label in ONE place:
export const MODULE_LABEL = 'Outreach';
// =====================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchContacts,
  importContacts,
  parseContactsFile,
  patchContact,
  OUTREACH_STATUSES,
  type OutreachContact,
  type OutreachStats,
  type ImportResult,
} from '../../lib/outreach';

// ── local palette (swap for your tokens.ts values for exact brand match) ──
const C = {
  bg: '#0f1419',
  panel: '#1a2129',
  panel2: '#232c36',
  border: '#2d3742',
  text: '#e6edf3',
  sub: '#8b98a5',
  faint: '#5c6b7a',
  accent: '#22c55e',      // green — fits the Green* product family
  accentSoft: 'rgba(34,197,94,0.14)',
  blue: '#3b82f6',
  amber: '#f59e0b',
  red: '#ef4444',
  purple: '#a855f7',
};

// layer → chip color
function layerStyle(layer: string): { bg: string; fg: string } {
  const l = (layer || '').toLowerCase();
  if (l.includes('signer') || l.includes('decision-maker'))
    return { bg: 'rgba(239,68,68,0.15)', fg: '#fca5a5' };
  if (l.includes('technical') || l.includes('poc') || l.includes('sponsor'))
    return { bg: 'rgba(59,130,246,0.15)', fg: '#93c5fd' };
  if (l.includes('gatekeeper') || l.includes('influencer') || l.includes('procurement'))
    return { bg: 'rgba(245,158,11,0.15)', fg: '#fcd34d' };
  if (l.includes('esg') || l.includes('comms') || l.includes('hr') || l.includes('ir'))
    return { bg: 'rgba(168,85,247,0.15)', fg: '#d8b4fe' };
  if (l.includes('operations') || l.includes('ops') || l.includes('planning'))
    return { bg: 'rgba(34,197,94,0.13)', fg: '#86efac' };
  return { bg: 'rgba(139,152,165,0.15)', fg: '#c3ccd6' };
}

function statusStyle(status: string): { bg: string; fg: string } {
  switch (status) {
    case 'Green': return { bg: 'rgba(34,197,94,0.18)', fg: '#86efac' };
    case 'Replied': return { bg: 'rgba(59,130,246,0.18)', fg: '#93c5fd' };
    case 'Contacted': return { bg: 'rgba(245,158,11,0.16)', fg: '#fcd34d' };
    case 'Not now': return { bg: 'rgba(139,152,165,0.16)', fg: '#c3ccd6' };
    case 'TO FIND': return { bg: 'rgba(168,85,247,0.16)', fg: '#d8b4fe' };
    default: return { bg: 'rgba(139,152,165,0.12)', fg: '#8b98a5' };
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

  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [selected, setSelected] = useState<OutreachContact | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { contacts, stats } = await fetchContacts({ company, status, search });
      setContacts(contacts);
      setStats(stats);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [company, status, search]);

  useEffect(() => {
    const t = setTimeout(load, 200); // debounce search/filter
    return () => clearTimeout(t);
  }, [load]);

  const companies = useMemo(() => {
    const set = new Set(contacts.map((c) => c.company).filter(Boolean));
    return Array.from(set).sort();
  }, [contacts]);

  // ── import (drop or picker) ──────────────────────────────────────
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || !files.length) return;
    setImporting(true);
    setBanner(null);
    try {
      let agg: ImportResult = { inserted: 0, updated: 0, skipped: 0, total: 0 };
      for (const file of Array.from(files)) {
        const rows = await parseContactsFile(file);
        if (!rows.length) {
          setBanner({
            kind: 'err',
            text: `No contact rows found in "${file.name}". Expected columns like Company, Name, Email…`,
          });
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
          text: `Imported — ${agg.inserted} new, ${agg.updated} updated${
            agg.skipped ? `, ${agg.skipped} skipped` : ''
          }.`,
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
    // optimistic
    setContacts((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: next } : x)));
    setSelected((s) => (s && s.id === c.id ? { ...s, status: next } : s));
    try {
      await patchContact(c.id, { status: next });
      const { stats } = await fetchContacts({ company, status, search });
      setStats(stats);
    } catch {
      load(); // revert by reloading
    }
  }, [company, status, search, load]);

  // ── render ────────────────────────────────────────────────────────
  return (
    <div style={{ padding: narrow ? 14 : 24, color: C.text, maxWidth: 1200, margin: '0 auto' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: narrow ? 22 : 28, fontWeight: 700, margin: 0 }}>{MODULE_LABEL}</h1>
        <span style={{ color: C.sub, fontSize: 13 }}>
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
          <Stat label="Green" value={stats.green} accent={C.accent} />
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
          border: `2px dashed ${dragOver ? C.accent : C.border}`,
          background: dragOver ? C.accentSoft : C.panel,
          borderRadius: 12,
          padding: narrow ? '18px 14px' : '22px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all .15s',
        }}
      >
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div style={{ fontSize: 15, fontWeight: 600 }}>
          {importing ? 'Importing…' : 'Drop an .xlsx or .csv here to append'}
        </div>
        <div style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>
          Same file twice is safe — descriptive fields refresh, your status is never reset.
        </div>
      </div>

      {banner && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 13,
            background: banner.kind === 'ok' ? C.accentSoft : 'rgba(239,68,68,0.14)',
            color: banner.kind === 'ok' ? '#86efac' : '#fca5a5',
            border: `1px solid ${banner.kind === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}
        >
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
            background: C.panel, border: `1px solid ${C.border}`, color: C.text,
            borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none',
          }}
        />
        <Select value={company} onChange={setCompany} options={[['all', 'All companies'], ...companies.map((c) => [c, c] as [string, string])]} />
        <Select value={status} onChange={setStatus} options={[['all', 'All statuses'], ...OUTREACH_STATUSES.map((s) => [s, s] as [string, string])]} />
      </div>

      {/* list */}
      <div style={{ marginTop: 16 }}>
        {loading ? (
          <Empty text="Loading…" />
        ) : err ? (
          <Empty text={err} tone="err" />
        ) : contacts.length === 0 ? (
          <Empty text="No contacts yet. Drop your MDO_Contacts sheet above to get started." />
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

      {selected && (
        <Drawer c={selected} onClose={() => setSelected(null)} onStatus={changeStatus} />
      )}
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────
function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{
      background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: '10px 16px', minWidth: 92,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || C.text }}>{value}</div>
      <div style={{ fontSize: 11, color: C.sub, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
    </div>
  );
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: C.panel, border: `1px solid ${C.border}`, color: C.text,
        borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer',
      }}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v} style={{ background: C.panel2 }}>{l}</option>
      ))}
    </select>
  );
}

function Chip({ text, style }: { text: string; style: { bg: string; fg: string } }) {
  return (
    <span style={{
      background: style.bg, color: style.fg, fontSize: 11, fontWeight: 600,
      padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
    }}>{text}</span>
  );
}

function StatusPicker({ c, onStatus }: {
  c: OutreachContact; onStatus: (c: OutreachContact, s: string) => void;
}) {
  const st = statusStyle(c.status);
  return (
    <select
      value={c.status}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onStatus(c, e.target.value)}
      style={{
        background: st.bg, color: st.fg, border: 'none', borderRadius: 999,
        padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', outline: 'none',
      }}
    >
      {OUTREACH_STATUSES.map((s) => (
        <option key={s} value={s} style={{ background: C.panel2, color: C.text }}>{s}</option>
      ))}
    </select>
  );
}

function Table({ contacts, onOpen, onStatus }: {
  contacts: OutreachContact[];
  onOpen: (c: OutreachContact) => void;
  onStatus: (c: OutreachContact, s: string) => void;
}) {
  const th: React.CSSProperties = {
    textAlign: 'left', fontSize: 11, color: C.sub, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 0.4, padding: '8px 12px',
  };
  const td: React.CSSProperties = { padding: '11px 12px', fontSize: 14, verticalAlign: 'top' };
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ background: C.panel }}>
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
              style={{
                cursor: 'pointer',
                background: i % 2 ? C.bg : 'transparent',
                borderTop: `1px solid ${C.border}`,
              }}
            >
              <td style={td}>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                <div style={{ color: C.sub, fontSize: 12 }}>{c.title}</div>
              </td>
              <td style={{ ...td, color: C.text }}>{c.company}</td>
              <td style={td}><Chip text={c.layer || '—'} style={layerStyle(c.layer)} /></td>
              <td style={{ ...td, color: C.sub }}>{c.city || '—'}</td>
              <td style={td}><StatusPicker c={c} onStatus={onStatus} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ c, onOpen, onStatus }: {
  c: OutreachContact; onOpen: () => void; onStatus: (c: OutreachContact, s: string) => void;
}) {
  return (
    <div
      onClick={onOpen}
      style={{
        background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: 14, cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 600 }}>{c.name}</div>
          <div style={{ color: C.sub, fontSize: 12 }}>{c.title}</div>
        </div>
        <StatusPicker c={c} onStatus={onStatus} />
      </div>
      <div style={{ color: C.text, fontSize: 13, marginTop: 8 }}>{c.company}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <Chip text={c.layer || '—'} style={layerStyle(c.layer)} />
        {c.city && <Chip text={c.city} style={{ bg: C.panel2, fg: C.sub }} />}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: C.sub, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: C.text, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

function Drawer({ c, onClose, onStatus }: {
  c: OutreachContact; onClose: () => void; onStatus: (c: OutreachContact, s: string) => void;
}) {
  const mailto = c.email
    ? `mailto:${c.email}?subject=${encodeURIComponent(`SGT HydroEdge — ${c.company}`)}`
    : undefined;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        display: 'flex', justifyContent: 'flex-end', zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(460px, 100%)', height: '100%', background: C.panel,
          borderLeft: `1px solid ${C.border}`, padding: 22, overflowY: 'auto',
          boxShadow: '-8px 0 30px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{c.name}</div>
            <div style={{ color: C.sub, fontSize: 13 }}>{c.title}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: C.sub, fontSize: 24, cursor: 'pointer', lineHeight: 1 }}
          >×</button>
        </div>

        <div style={{ display: 'flex', gap: 8, margin: '14px 0 20px', flexWrap: 'wrap' }}>
          <Chip text={c.layer || '—'} style={layerStyle(c.layer)} />
          {c.verified && <Chip text={c.verified} style={{ bg: C.accentSoft, fg: '#86efac' }} />}
          <StatusPicker c={c} onStatus={onStatus} />
        </div>

        <Field label="Company">{c.company}</Field>
        {c.city && <Field label="City">{c.city}</Field>}

        <Field label="Email">
          {c.email ? (
            <a href={mailto} style={{ color: C.blue, textDecoration: 'none' }}>{c.email}</a>
          ) : <span style={{ color: C.faint }}>—</span>}
          {c.email2 && (
            <div style={{ color: C.sub, fontSize: 13, marginTop: 4 }}>alt: {c.email2}</div>
          )}
        </Field>

        {c.linkedin && (
          <Field label="LinkedIn">
            <a href={c.linkedin} target="_blank" rel="noreferrer" style={{ color: C.blue, wordBreak: 'break-all', textDecoration: 'none' }}>
              {c.linkedin.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          </Field>
        )}

        {c.message_angle && (
          <Field label="Message angle">
            <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
              {c.message_angle}
            </div>
          </Field>
        )}

        {/* NEXT ROUNDS — intentionally not wired yet:
            • "Draft email" (Gemini) → mail compose + sent/not-sent toggle
            • n8n auto-capture writes last_touch_at / mail_status
            • "Promote to lead" → creates lead_service.leads row on a Green signal */}
        <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {mailto && (
            <a
              href={mailto}
              style={{
                background: C.accentSoft, color: '#86efac', border: `1px solid rgba(34,197,94,0.3)`,
                borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none',
              }}
            >
              Open in mail →
            </a>
          )}
          <button
            disabled
            title="Coming in the next round"
            style={{
              background: C.panel2, color: C.faint, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'not-allowed',
            }}
          >
            Promote to lead (soon)
          </button>
        </div>
      </div>
    </div>
  );
}

function Empty({ text, tone }: { text: string; tone?: 'err' }) {
  return (
    <div style={{
      padding: 40, textAlign: 'center', color: tone === 'err' ? '#fca5a5' : C.sub,
      background: C.panel, border: `1px dashed ${C.border}`, borderRadius: 12, fontSize: 14,
    }}>{text}</div>
  );
}
// =====================================================================
// lib/outreach.ts
// Client-side parsing (xlsx + csv via SheetJS) + API calls for the
// Outreach (pre-CRM) module.
//
// Requires SheetJS:   npm i xlsx
//
// INTEGRATION POINTS:
//  1) authFetch import — matches memory (Bearer token via authFetch).
//     If your file lives elsewhere, fix the import path only.
//  2) BASE — if your authFetch already prepends '/api/v1', set BASE = '/outreach'.
// =====================================================================

import * as XLSX from 'xlsx';
import { authFetch } from './auth';

const API = import.meta.env.VITE_API_URL ?? '/api/v1';
const BASE = `${API}/outreach`;

export type OutreachContact = {
  id: number;
  company: string;
  name: string;
  title: string;
  layer: string;
  email: string;
  email2: string;
  phone: string;
  verified: string;
  linkedin: string;
  city: string;
  message_angle: string;
  vertical: string;
  status: string;
  mail_status: string;
  notes: string;
  notes_updated_at: string | null;
  follow_up_due: boolean;
  last_touch_at: string | null;
  promoted_lead_id: string | null;
  promoted_display_id: string | null;
  promoted_at: string | null;
  deleted_at: string | null;
  source_file: string | null;
  created_at: string;
  updated_at: string;
};


export type OutreachStats = {
  total: number;
  companies: number;
  signers: number;
  contacted: number;
  green: number;
  dnc: number;
  promoted: number;
  follow_up_due: number;
};

export type IncomingRow = {
  company?: string;
  name?: string;
  title?: string;
  layer?: string;
  email?: string;
  email2?: string;
  phone?: string;
  verified?: string;
  linkedin?: string;
  city?: string;
  messageAngle?: string;
  vertical?: string;
  status?: string;
};

export type ImportResult = {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
};

// The statuses used across the module (edit here to change everywhere)
// Known verticals. Free text on the wire, so an unexpected one still imports.
export const VERTICALS = ['DG', 'Mining', 'Marine', 'Vehicles', 'Small DG'] as const;

export type VerticalStat = { vertical: string; contacts: number; companies: number };

export const OUTREACH_STATUSES = [
  'Not contacted',
  'Contacted',
  'Replied',
  'Green',
  'Not now',
  'Do not contact',
  'TO FIND',
] as const;

// ---------------------------------------------------------------------
// Column mapping. Normalizes header cells to alphanumerics-lowercase and
// matches against known aliases, so column order / spacing / casing in the
// dropped file don't matter.
// ---------------------------------------------------------------------
const norm = (v: unknown) =>
  String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Order matters: email2 checked before email.
const FIELD_ALIASES: Array<[keyof IncomingRow, string[]]> = [
  ['email2', ['2ndemail', 'email2', 'secondemail', 'altemail', 'backupemail', 'emailalt']],
  ['company', ['company', 'organisation', 'organization', 'account', 'firm']],
  ['name', ['name', 'contact', 'contactname', 'fullname', 'person']],
  ['title', ['title', 'designation', 'role', 'jobtitle', 'position']],
  ['layer', ['layer', 'persona', 'segment', 'tier']],
  ['email', ['email', 'emailaddress', 'primaryemail', 'mail', 'workemail']],
  ['phone', ['phone', 'mobile', 'contactnumber', 'phoneno', 'phonenumber', 'cell', 'telephone', 'contactno']],
  ['verified', ['verified', 'verification', 'emailstatus', 'valid']],
  ['linkedin', ['linkedin', 'linkedinurl', 'li', 'profile', 'linkedinprofile']],
  ['city', ['city', 'location', 'base', 'town']],
  ['messageAngle', ['messageangle', 'angle', 'pitch', 'notes', 'hook', 'approach']],
  ['vertical', ['vertical', 'segment', 'business', 'division', 'pipeline']],
  ['status', ['status', 'stage', 'outreachstatus', 'state']],
];

function buildHeaderMap(headerRow: any[]): Record<number, keyof IncomingRow> {
  const map: Record<number, keyof IncomingRow> = {};
  const taken = new Set<keyof IncomingRow>();
  headerRow.forEach((cell, idx) => {
    const n = norm(cell);
    if (!n) return;
    for (const [field, aliases] of FIELD_ALIASES) {
      if (taken.has(field)) continue;
      if (aliases.includes(n)) {
        map[idx] = field;
        taken.add(field);
        break;
      }
    }
  });
  return map;
}

// How many recognizable contact columns a header row has — used to pick the
// right sheet (ignores a "Summary" sheet whose headers are Metric/Value).
function headerScore(headerRow: any[]): number {
  const m = buildHeaderMap(headerRow);
  const fields = new Set(Object.values(m));
  let score = fields.size;
  if (fields.has('company')) score += 2;
  if (fields.has('email') || fields.has('name')) score += 2;
  return score;
}

/**
 * Parse a dropped File (.xlsx / .xls / .csv) into IncomingRow[].
 * Scans every sheet, picks the one that looks most like a contact list
 * (so a "Summary" tab is ignored), finds its header row, and maps it.
 */
export async function parseContactsFile(file: File): Promise<IncomingRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  let best: { rows: IncomingRow[]; score: number } = { rows: [], score: 0 };

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
    if (!grid.length) continue;

    let headerIdx = -1;
    let headerBest = 0;
    for (let r = 0; r < Math.min(grid.length, 5); r++) {
      const sc = headerScore(grid[r]);
      if (sc > headerBest) { headerBest = sc; headerIdx = r; }
    }
    if (headerIdx < 0 || headerBest < 4) continue; // not a contact sheet

    const headerMap = buildHeaderMap(grid[headerIdx]);
    const rows: IncomingRow[] = [];

    for (let r = headerIdx + 1; r < grid.length; r++) {
      const line = grid[r];
      if (!line || line.every((c) => String(c ?? '').trim() === '')) continue;
      const row: IncomingRow = {};
      for (const [idxStr, field] of Object.entries(headerMap)) {
        const val = String(line[Number(idxStr)] ?? '').trim();
        if (val) (row as any)[field] = val;
      }
      if (row.company && (row.name || row.email)) rows.push(row);
    }

    if (rows.length && headerBest > best.score) best = { rows, score: headerBest };
  }

  return best.rows;
}

// ---------------------------------------------------------------------
// API
// ---------------------------------------------------------------------
async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function fetchContacts(params: {
  company?: string;
  status?: string;
  search?: string;
  vertical?: string;
  promoted?: 'active' | 'promoted' | 'all';
  followUp?: 'due';
} = {}): Promise<{ contacts: OutreachContact[]; stats: OutreachStats; verticals: VerticalStat[] }> {
  const qs = new URLSearchParams();
  if (params.company && params.company !== 'all') qs.set('company', params.company);
  if (params.status && params.status !== 'all') qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);
  if (params.vertical && params.vertical !== 'all') qs.set('vertical', params.vertical);
  if (params.promoted) qs.set('promoted', params.promoted);
  if (params.followUp) qs.set('followUp', params.followUp);
  const q = qs.toString();
  const res = await authFetch(`${BASE}/contacts${q ? `?${q}` : ''}`);
  return json(res);
}

export async function importContacts(
  rows: IncomingRow[],
  sourceFile: string
): Promise<ImportResult> {
  const res = await authFetch(`${BASE}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, sourceFile }),
  });
  return json(res);
}

export async function deleteContact(id: number): Promise<void> {
  const res = await authFetch(`${BASE}/contacts/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function patchContact(
  id: number,
  patch: Partial<Pick<OutreachContact, 'status' | 'mail_status' | 'phone' | 'email' | 'linkedin' | 'layer' | 'title' | 'vertical' | 'notes'>>
): Promise<OutreachContact> {
  const res = await authFetch(`${BASE}/contacts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return json(res);
}

// Promote a Green contact into lead_service.leads. Lands unassigned so it
// enters the triage queue like any other capture.
export async function promoteContact(
  id: number
): Promise<{ data: { ok: true; leadId: string; displayId: string } }> {
  const res = await authFetch(`${BASE}/contacts/${id}/promote`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}


// =====================================================================
// COMPANY INTEL
// Separate grain from contacts: one row per company, joined by name.
// =====================================================================
export type Fact = { label: string; value: string };

export type Company = {
  id: number;
  name: string;
  name_key: string;
  vertical: string;
  headline: string;
  thesis: string;
  entry_path: string;
  tier: string;
  priority: string;
  score: number | null;
  website: string;
  hq: string;
  confidence: string;
  source_url: string;
  facts: Fact[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type IncomingCompany = {
  company?: string; vertical?: string; headline?: string; thesis?: string;
  entryPath?: string; tier?: string; priority?: string; score?: string | number;
  website?: string; hq?: string; confidence?: string; sourceUrl?: string;
  facts?: Fact[];
};

// Header aliases for the KNOWN structured columns. Anything not matched here
// becomes a fact (label = the sheet's own column header). Per-vertical synonyms
// live together so one parser handles both the Atlas and the Lead Engine sheet.
const COMPANY_FIELD_ALIASES: [keyof IncomingCompany, string[]][] = [
  ['company',    ['company', 'companyname', 'partner', 'account']],
  ['vertical',   ['vertical', 'segment2', 'pipeline', 'division']],
  ['headline',   ['headline', 'oneliner', 'snapshot', 'summary', 'keyoperationsassets', 'keyoperations', 'keyassets']],
  ['thesis',     ['thesis', 'whythem', 'whygreenxfits', 'whyrelevanthook', 'whyrelevanthookoutreachopener', 'whyrelevant', 'hook']],
  ['entryPath',  ['entrypath', 'wayin', 'entrypathnotes', 'nextstep', 'engagementstrategy', 'recommendedengagementstrategy']],
  ['tier',       ['tier']],
  ['priority',   ['priority', 'priorityabc']],
  ['score',      ['score', 'score100', 'sgtscore', 'relevancyscore']],
  ['website',    ['website', 'url', 'web']],
  ['hq',         ['hq', 'headquarters', 'location', 'country']],
  ['confidence', ['confidence']],
  ['sourceUrl',  ['sourceurl', 'evidence', 'evidencesource', 'source']],
];

// Columns that are internal rubric noise — don't surface them as facts.
const FACT_SKIP = new Set([
  'namekey', 'owner', 'status', 'greenvisionfit',
  'diesarelintensity25', 'dieselintensity25', 'paysfuelbill20', 'fleetdgscale15',
  'esgregulatory15', 'geoserviceability15', 'commercialfit10',
]);

const normKey = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export async function parseCompaniesFile(file: File): Promise<IncomingCompany[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  const all: IncomingCompany[] = [];

  for (const sheetName of wb.SheetNames) {
    const grid: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', blankrows: false });
    if (!grid.length) continue;

    // header row = the row where "company" appears
    let headerIdx = -1;
    for (let r = 0; r < Math.min(grid.length, 6); r++) {
      if (grid[r].some((c) => normKey(c) === 'company')) { headerIdx = r; break; }
    }
    if (headerIdx < 0) continue;

    const headers = grid[headerIdx];
    // map each column index → structured field, or leave for facts
    const colField: (keyof IncomingCompany | null)[] = [];
    const colLabel: string[] = [];
    const used = new Set<keyof IncomingCompany>();
    for (let i = 0; i < headers.length; i++) {
      const nk = normKey(headers[i]);
      colLabel[i] = String(headers[i] ?? '').trim();
      let matched: keyof IncomingCompany | null = null;
      for (const [field, aliases] of COMPANY_FIELD_ALIASES) {
        if (used.has(field)) continue;
        if (aliases.includes(nk)) { matched = field; used.add(field); break; }
      }
      colField[i] = matched;
    }

    const rows: IncomingCompany[] = [];
    for (let r = headerIdx + 1; r < grid.length; r++) {
      const line = grid[r];
      if (!line || line.every((c) => String(c ?? '').trim() === '')) continue;
      const rec: IncomingCompany = {}; const facts: Fact[] = [];
      for (let i = 0; i < headers.length; i++) {
        const val = String(line[i] ?? '').trim();
        if (!val) continue;
        const f = colField[i];
        if (f) (rec as any)[f] = val;
        else if (!FACT_SKIP.has(normKey(colLabel[i])) && colLabel[i]) facts.push({ label: colLabel[i], value: val });
      }
      if (rec.company) { rec.facts = facts; rows.push(rec); }
    }
    if (rows.length) all.push(...rows);
  }
  return all;
}

const CO_BASE = `${API}/outreach/companies`;

export async function fetchCompanyMap(vertical?: string): Promise<Record<string, Company>> {
  const qs = vertical && vertical !== 'all' ? `?vertical=${encodeURIComponent(vertical)}` : '';
  const res = await authFetch(`${CO_BASE}${qs}`);
  return (await json<{ companies: Record<string, Company> }>(res)).companies;
}

export async function importCompanies(rows: IncomingCompany[]): Promise<{ upserted: number; skipped: number; total: number }> {
  const res = await authFetch(`${CO_BASE}/import`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
  return json(res);
}

export async function ensureCompany(name: string, vertical: string): Promise<Company> {
  const res = await authFetch(`${CO_BASE}/ensure`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, vertical }),
  });
  return (await json<{ company: Company }>(res)).company;
}

export async function patchCompany(id: number, patch: Partial<Company>): Promise<Company> {
  const res = await authFetch(`${CO_BASE}/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return (await json<{ company: Company }>(res)).company;
}

// Per-contact email activity (read-only auto-list under the notes box).
export type EmailEvent = {
  id: number;
  direction: 'outbound' | 'inbound' | string;
  address: string;
  from_addr: string;
  subject: string;
  occurred_at: string | null;
  thread_id: string | null;
  status_moved: string;
  created_at: string;
};

export async function fetchContactActivity(id: number): Promise<EmailEvent[]> {
  const res = await authFetch(`${API}/outreach/contacts/${id}/activity`);
  return (await json<{ events: EmailEvent[] }>(res)).events;
}
// =====================================================================
// services/companies.ts
// Company-level sales intelligence. Separate grain from contacts:
// one row per company, joined to contacts by normalised name.
//
// Import maps a WIDE sheet: known headers → structured columns, everything
// else → the flexible `facts` list. That means your Atlas "Partner Companies"
// sheet and the Mining "Scored Longlist" both import almost as-is, each
// contributing its own facts without a schema change.
// =====================================================================

import { pool } from '../db/pool';

const s = (v: unknown): string => (v == null ? '' : String(v).trim());
const nameKey = (name: string) => name.toLowerCase().trim();

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

// Incoming intel row (already header-mapped on the client, same as contacts).
export type IncomingCompany = {
  company?: string;
  vertical?: string;
  headline?: string;
  thesis?: string;
  entryPath?: string;
  tier?: string;
  priority?: string;
  score?: string | number;
  website?: string;
  hq?: string;
  confidence?: string;
  sourceUrl?: string;
  facts?: Fact[];               // pre-collected key→value pairs from unmapped columns
};

const toScore = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------------
// READ — one map of name_key → company, so the desk can look intel up per
// group without an N+1. Optionally scoped to a vertical.
// ---------------------------------------------------------------------
export async function companyMap(vertical?: string): Promise<Record<string, Company>> {
  const params: any[] = [];
  let where = '';
  if (vertical && vertical !== 'all') { params.push(vertical); where = 'where vertical = $1'; }
  const { rows } = await pool.query(`select * from outreach_service.companies ${where}`, params);
  const out: Record<string, Company> = {};
  for (const r of rows) out[r.name_key] = r;
  return out;
}

export async function getCompany(nameOrKey: string): Promise<Company | null> {
  const { rows } = await pool.query(
    'select * from outreach_service.companies where name_key = $1',
    [nameKey(nameOrKey)],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------
// UPSERT one company (used by inline edit + as the import primitive).
// Import REFRESHES intel fields but never fabricates: a blank incoming field
// leaves the stored one untouched, so a partial edit sheet won't wipe columns.
// ---------------------------------------------------------------------
export async function upsertCompany(
  incoming: IncomingCompany, user: string | null,
): Promise<Company | null> {
  const name = s(incoming.company);
  if (!name) return null;
  const key = nameKey(name);
  const facts = Array.isArray(incoming.facts)
    ? incoming.facts.filter((f) => s(f?.label) && s(f?.value))
                    .map((f) => ({ label: s(f.label), value: s(f.value) }))
    : [];

  const { rows } = await pool.query(
    `insert into outreach_service.companies
       (name, name_key, vertical, headline, thesis, entry_path, tier, priority,
        score, website, hq, confidence, source_url, facts, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$15)
     on conflict (name_key) do update set
       vertical   = case when excluded.vertical   <> '' then excluded.vertical   else outreach_service.companies.vertical   end,
       headline   = case when excluded.headline   <> '' then excluded.headline   else outreach_service.companies.headline   end,
       thesis     = case when excluded.thesis     <> '' then excluded.thesis     else outreach_service.companies.thesis     end,
       entry_path = case when excluded.entry_path <> '' then excluded.entry_path else outreach_service.companies.entry_path end,
       tier       = case when excluded.tier       <> '' then excluded.tier       else outreach_service.companies.tier       end,
       priority   = case when excluded.priority   <> '' then excluded.priority   else outreach_service.companies.priority   end,
       score      = coalesce(excluded.score, outreach_service.companies.score),
       website    = case when excluded.website    <> '' then excluded.website    else outreach_service.companies.website    end,
       hq         = case when excluded.hq         <> '' then excluded.hq         else outreach_service.companies.hq         end,
       confidence = case when excluded.confidence <> '' then excluded.confidence else outreach_service.companies.confidence end,
       source_url = case when excluded.source_url <> '' then excluded.source_url else outreach_service.companies.source_url end,
       -- facts: replace wholesale only when the incoming sheet actually carries some
       facts      = case when jsonb_array_length(excluded.facts) > 0 then excluded.facts else outreach_service.companies.facts end,
       updated_by = excluded.updated_by,
       updated_at = now()
     returning *`,
    [
      name, key, s(incoming.vertical), s(incoming.headline), s(incoming.thesis),
      s(incoming.entryPath), s(incoming.tier), s(incoming.priority), toScore(incoming.score),
      s(incoming.website), s(incoming.hq), s(incoming.confidence), s(incoming.sourceUrl),
      JSON.stringify(facts), user,
    ],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------
// IMPORT many.
// ---------------------------------------------------------------------
export async function importCompanies(
  incoming: IncomingCompany[], user: string | null,
): Promise<{ upserted: number; skipped: number; total: number }> {
  let upserted = 0, skipped = 0;
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const row of incoming) {
      const r = await upsertCompanyTx(client, row, user);
      if (r) upserted++; else skipped++;
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  return { upserted, skipped, total: incoming.length };
}

// transaction-scoped twin of upsertCompany (same SQL, shared client)
async function upsertCompanyTx(client: any, incoming: IncomingCompany, user: string | null) {
  const name = s(incoming.company);
  if (!name) return null;
  const key = nameKey(name);
  const facts = Array.isArray(incoming.facts)
    ? incoming.facts.filter((f) => s(f?.label) && s(f?.value))
                    .map((f) => ({ label: s(f.label), value: s(f.value) }))
    : [];
  const { rows } = await client.query(
    `insert into outreach_service.companies
       (name, name_key, vertical, headline, thesis, entry_path, tier, priority,
        score, website, hq, confidence, source_url, facts, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$15)
     on conflict (name_key) do update set
       vertical   = case when excluded.vertical   <> '' then excluded.vertical   else outreach_service.companies.vertical   end,
       headline   = case when excluded.headline   <> '' then excluded.headline   else outreach_service.companies.headline   end,
       thesis     = case when excluded.thesis     <> '' then excluded.thesis     else outreach_service.companies.thesis     end,
       entry_path = case when excluded.entry_path <> '' then excluded.entry_path else outreach_service.companies.entry_path end,
       tier       = case when excluded.tier       <> '' then excluded.tier       else outreach_service.companies.tier       end,
       priority   = case when excluded.priority   <> '' then excluded.priority   else outreach_service.companies.priority   end,
       score      = coalesce(excluded.score, outreach_service.companies.score),
       website    = case when excluded.website    <> '' then excluded.website    else outreach_service.companies.website    end,
       hq         = case when excluded.hq         <> '' then excluded.hq         else outreach_service.companies.hq         end,
       confidence = case when excluded.confidence <> '' then excluded.confidence else outreach_service.companies.confidence end,
       source_url = case when excluded.source_url <> '' then excluded.source_url else outreach_service.companies.source_url end,
       facts      = case when jsonb_array_length(excluded.facts) > 0 then excluded.facts else outreach_service.companies.facts end,
       updated_by = excluded.updated_by,
       updated_at = now()
     returning id`,
    [
      name, key, s(incoming.vertical), s(incoming.headline), s(incoming.thesis),
      s(incoming.entryPath), s(incoming.tier), s(incoming.priority), toScore(incoming.score),
      s(incoming.website), s(incoming.hq), s(incoming.confidence), s(incoming.sourceUrl),
      JSON.stringify(facts), user,
    ],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------
// PATCH (inline edit). Whitelisted; facts replaced wholesale when provided.
// ---------------------------------------------------------------------
const PATCHABLE = new Set([
  'vertical', 'headline', 'thesis', 'entry_path', 'tier', 'priority',
  'score', 'website', 'hq', 'confidence', 'source_url',
]);

export async function updateCompany(
  id: number, patch: Record<string, unknown>, user: string | null,
): Promise<Company | null> {
  const sets: string[] = [];
  const params: any[] = [];

  for (const [k, v] of Object.entries(patch)) {
    if (k === 'facts') continue;                 // handled below
    if (!PATCHABLE.has(k)) continue;
    if (k === 'score') { params.push(toScore(v)); sets.push(`score = $${params.length}`); continue; }
    params.push(s(v));
    sets.push(`${k} = $${params.length}`);
  }

  if (Array.isArray((patch as any).facts)) {
    const facts = (patch as any).facts
      .filter((f: any) => s(f?.label) && s(f?.value))
      .map((f: any) => ({ label: s(f.label), value: s(f.value) }));
    params.push(JSON.stringify(facts));
    sets.push(`facts = $${params.length}::jsonb`);
  }

  if (!sets.length) return getCompany(String(id));   // no-op patch → return current

  params.push(user); sets.push(`updated_by = $${params.length}`);
  sets.push('updated_at = now()');
  params.push(id);

  const { rows } = await pool.query(
    `update outreach_service.companies set ${sets.join(', ')} where id = $${params.length} returning *`,
    params,
  );
  return rows[0] ?? null;
}

// Create an empty shell so a company with no intel yet still opens a panel.
export async function ensureCompany(name: string, vertical: string, user: string | null): Promise<Company | null> {
  const existing = await getCompany(name);
  if (existing) return existing;
  return upsertCompany({ company: name, vertical }, user);
}
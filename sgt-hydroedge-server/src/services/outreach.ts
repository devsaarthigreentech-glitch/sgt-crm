// =====================================================================
// services/outreach.ts
// Domain SQL for the Outreach (pre-CRM) module. Route file is wiring only.
//
// INTEGRATION POINT: this imports the shared pg pool. If your db module
// exports something other than `pool` (e.g. `{ query }` or a default `db`),
// change ONLY the import line below and the two `pool.query(...)` call sites.
// =====================================================================

import { pool } from '../db/pool';

export type OutreachContact = {
  id: number;
  company: string;
  name: string;
  title: string;
  layer: string;
  email: string;
  email2: string;
  verified: string;
  linkedin: string;
  city: string;
  message_angle: string;
  status: string;
  mail_status: string;
  last_touch_at: string | null;
  promoted_lead_id: number | null;
  source_file: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

// A row as it arrives from the client parser (all optional/loose strings)
export type IncomingRow = {
  company?: string;
  name?: string;
  title?: string;
  layer?: string;
  email?: string;
  email2?: string;
  verified?: string;
  linkedin?: string;
  city?: string;
  messageAngle?: string;
  status?: string;
};

const s = (v: unknown): string => (v == null ? '' : String(v).trim());

// dedup_key: prefer a real email, else company|name. Keeps re-drops idempotent.
function dedupKey(company: string, name: string, email: string): string {
  const e = email.toLowerCase();
  if (e && e.includes('@')) return e;
  return `${company.toLowerCase()}|${name.toLowerCase()}`;
}

// ---------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------
export async function listContacts(filters: {
  company?: string;
  status?: string;
  search?: string;
} = {}): Promise<OutreachContact[]> {
  const where: string[] = [];
  const params: any[] = [];

  if (filters.company && filters.company !== 'all') {
    params.push(filters.company);
    where.push(`company = $${params.length}`);
  }
  if (filters.status && filters.status !== 'all') {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  if (filters.search && filters.search.trim()) {
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    const i = params.length;
    where.push(
      `(lower(name) like $${i} or lower(company) like $${i} or lower(email) like $${i} or lower(title) like $${i} or lower(message_angle) like $${i})`
    );
  }

  const sql = `
    select *
    from outreach_service.contacts
    ${where.length ? 'where ' + where.join(' and ') : ''}
    order by company asc, name asc
  `;
  const { rows } = await pool.query(sql, params);
  return rows;
}

// ---------------------------------------------------------------------
// IMPORT (append + upsert). On conflict we refresh SOURCE fields but
// NEVER touch app-owned workflow state (status / mail_status / promoted).
// ---------------------------------------------------------------------
export async function importContacts(
  incoming: IncomingRow[],
  meta: { sourceFile?: string | null; user?: string | null } = {}
): Promise<{ inserted: number; updated: number; skipped: number; total: number }> {
  const sourceFile = meta.sourceFile ?? null;
  const user = meta.user ?? null;

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const client = await pool.connect();
  try {
    await client.query('begin');

    for (const raw of incoming) {
      const company = s(raw.company);
      const name = s(raw.name);
      const email = s(raw.email);

      // Need at least a company and (name or email) to be a real contact.
      if (!company || (!name && !email)) {
        skipped++;
        continue;
      }

      const key = dedupKey(company, name, email);

      const sql = `
        insert into outreach_service.contacts
          (company, name, title, layer, email, email2, verified, linkedin,
           city, message_angle, status, source_file, dedup_key, created_by, updated_by)
        values
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
           coalesce(nullif($11,''),'Not contacted'),$12,$13,$14,$14)
        on conflict (dedup_key) do update set
          company       = excluded.company,
          name          = excluded.name,
          title         = excluded.title,
          layer         = excluded.layer,
          email         = case when excluded.email    <> '' then excluded.email    else outreach_service.contacts.email    end,
          email2        = case when excluded.email2   <> '' then excluded.email2   else outreach_service.contacts.email2   end,
          verified      = excluded.verified,
          linkedin      = case when excluded.linkedin <> '' then excluded.linkedin else outreach_service.contacts.linkedin end,
          city          = excluded.city,
          message_angle = excluded.message_angle,
          -- status / mail_status / promoted_lead_id / last_touch_at are intentionally NOT overwritten
          source_file   = excluded.source_file,
          updated_by    = excluded.updated_by,
          updated_at    = now()
        returning (xmax = 0) as was_insert
      `;

      const { rows } = await client.query(sql, [
        company,
        name,
        s(raw.title),
        s(raw.layer),
        email,
        s(raw.email2),
        s(raw.verified),
        s(raw.linkedin),
        s(raw.city),
        s(raw.messageAngle),
        s(raw.status),
        sourceFile,
        key,
        user,
      ]);

      if (rows[0]?.was_insert) inserted++;
      else updated++;
    }

    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }

  return { inserted, updated, skipped, total: incoming.length };
}

// ---------------------------------------------------------------------
// PATCH (inline edits: status, mail_status). Whitelisted fields only.
// ---------------------------------------------------------------------
const PATCHABLE = new Set(['status', 'mail_status']);

export async function updateContact(
  id: number,
  patch: Record<string, unknown>,
  user: string | null
): Promise<OutreachContact | null> {
  const sets: string[] = [];
  const params: any[] = [];

  for (const [k, v] of Object.entries(patch)) {
    if (!PATCHABLE.has(k)) continue;
    params.push(s(v));
    sets.push(`${k} = $${params.length}`);
  }
  if (!sets.length) {
    const { rows } = await pool.query(
      'select * from outreach_service.contacts where id = $1',
      [id]
    );
    return rows[0] ?? null;
  }

  params.push(user);
  sets.push(`updated_by = $${params.length}`);
  sets.push(`updated_at = now()`);

  params.push(id);
  const sql = `
    update outreach_service.contacts
    set ${sets.join(', ')}
    where id = $${params.length}
    returning *
  `;
  const { rows } = await pool.query(sql, params);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------
// STATS (small summary for the header cards)
// ---------------------------------------------------------------------
export async function contactStats(): Promise<{
  total: number;
  companies: number;
  signers: number;
  contacted: number;
  green: number;
}> {
  const sql = `
    select
      count(*)::int                                                             as total,
      count(distinct company)::int                                             as companies,
      count(*) filter (where lower(layer) like '%signer%'
                          or lower(layer) like '%decision-maker%')::int        as signers,
      count(*) filter (where status not in ('Not contacted','TO FIND'))::int   as contacted,
      count(*) filter (where status = 'Green')::int                            as green
    from outreach_service.contacts
  `;
  const { rows } = await pool.query(sql);
  return rows[0];
}
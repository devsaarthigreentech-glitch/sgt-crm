// =====================================================================
// services/outreach.ts
// Domain SQL for the Outreach (pre-CRM) module. Route file is wiring only.
// =====================================================================

import { pool } from '../db/pool';
import { createLeadInTx } from './leadCreate.ts';

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
  status: string;
  mail_status: string;
  last_touch_at: string | null;
  promoted_lead_id: string | null;
  promoted_display_id: string | null;
  promoted_at: string | null;
  source_file: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
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
  promoted?: string;   // 'active' (default) | 'promoted' | 'all'
} = {}): Promise<OutreachContact[]> {
  const where: string[] = [];
  const params: any[] = [];

  // Default desk view hides contacts that already became leads.
  const p = filters.promoted ?? 'active';
  if (p === 'active') where.push('promoted_lead_id is null');
  else if (p === 'promoted') where.push('promoted_lead_id is not null');

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
// IMPORT (append + upsert). Refreshes SOURCE fields but NEVER touches
// app-owned workflow state (status / mail_status / promoted / phone).
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

      if (!company || (!name && !email)) {
        skipped++;
        continue;
      }

      const key = dedupKey(company, name, email);

      const sql = `
        insert into outreach_service.contacts
          (company, name, title, layer, email, email2, phone, verified, linkedin,
           city, message_angle, status, source_file, dedup_key, created_by, updated_by)
        values
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
           coalesce(nullif($12,''),'Not contacted'),$13,$14,$15,$15)
        on conflict (dedup_key) do update set
          company       = excluded.company,
          name          = excluded.name,
          title         = excluded.title,
          layer         = excluded.layer,
          email         = case when excluded.email    <> '' then excluded.email    else outreach_service.contacts.email    end,
          email2        = case when excluded.email2   <> '' then excluded.email2   else outreach_service.contacts.email2   end,
          phone         = case when excluded.phone    <> '' then excluded.phone    else outreach_service.contacts.phone    end,
          verified      = excluded.verified,
          linkedin      = case when excluded.linkedin <> '' then excluded.linkedin else outreach_service.contacts.linkedin end,
          city          = excluded.city,
          message_angle = excluded.message_angle,
          -- status / mail_status / promoted_* / last_touch_at intentionally NOT overwritten
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
        s(raw.phone),
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
// PATCH (inline edits). Whitelisted fields only.
// ---------------------------------------------------------------------
const PATCHABLE = new Set(['status', 'mail_status', 'phone', 'email', 'linkedin']);

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
// STATS
// ---------------------------------------------------------------------
export async function contactStats(): Promise<{
  total: number;
  companies: number;
  signers: number;
  contacted: number;
  green: number;
  promoted: number;
}> {
  const sql = `
    select
      count(*) filter (where promoted_lead_id is null)::int                    as total,
      count(distinct company)::int                                             as companies,
      count(*) filter (where (lower(layer) like '%signer%'
                          or lower(layer) like '%decision-maker%')
                         and promoted_lead_id is null)::int                    as signers,
      count(*) filter (where status not in ('Not contacted','TO FIND')
                         and promoted_lead_id is null)::int                    as contacted,
      count(*) filter (where status = 'Green'
                         and promoted_lead_id is null)::int                    as green,
      count(*) filter (where promoted_lead_id is not null)::int                as promoted
    from outreach_service.contacts
  `;
  const { rows } = await pool.query(sql);
  return rows[0];
}

// ---------------------------------------------------------------------
// PROMOTE → lead_service.leads
// Gated on status='Green'. Lands UNASSIGNED (owner_name null) so it enters
// the triage queue exactly like a normal capture; created_by = promoter so
// a scoped rep still sees their own. Reuses createLeadInTx — same code path
// as POST /leads, in one transaction with the contact stamp.
// ---------------------------------------------------------------------
export type PromoteResult =
  | { ok: true; leadId: string; displayId: string }
  | { ok: false; reason: 'not_found' | 'not_green' | 'already_promoted'; message: string };

export async function promoteContact(
  id: number,
  actor: string | null,
): Promise<PromoteResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');

    // lock the row so two clicks can't create two leads
    const { rows } = await client.query(
      'select * from outreach_service.contacts where id = $1 for update',
      [id],
    );
    const c: OutreachContact | undefined = rows[0];

    if (!c) {
      await client.query('rollback');
      return { ok: false, reason: 'not_found', message: 'Contact not found' };
    }
    if (c.promoted_lead_id) {
      await client.query('rollback');
      return {
        ok: false,
        reason: 'already_promoted',
        message: `Already promoted as ${c.promoted_display_id ?? 'a lead'}`,
      };
    }
    if (c.status !== 'Green') {
      await client.query('rollback');
      return {
        ok: false,
        reason: 'not_green',
        message: 'Only contacts marked Green can be promoted to a lead',
      };
    }

    // Only pass an email the leads side would accept as real.
    const email = (c.email || '').includes('@') ? c.email : undefined;
    const notes = [
      c.message_angle ? `Outreach angle: ${c.message_angle}` : null,
      c.linkedin ? `LinkedIn: ${c.linkedin}` : null,
      c.source_file ? `Source: ${c.source_file}` : null,
    ].filter(Boolean).join('\n') || undefined;

    const lead = await createLeadInTx(
      client,
      {
        account: { name: c.company, location: c.city || undefined },
        primaryContact: {
          name: c.name,
          role: c.title || undefined,
          email,
          phone: c.phone || undefined,
        },
        leadType: 'Prospect',
        captureSource: 'INTERNAL',
        initialNotes: notes,
        ownerName: undefined,   // unassigned → lands in triage
        ownerId: undefined,
        metadata: { promotedFromOutreachContactId: c.id, outreachLayer: c.layer || null },
      },
      actor,                    // created_by = promoter
    );

    await client.query(
      `update outreach_service.contacts
          set promoted_lead_id = $1,
              promoted_display_id = $2,
              promoted_at = now(),
              updated_by = $3,
              updated_at = now()
        where id = $4`,
      [lead.id, lead.displayId, actor, id],
    );

    await client.query('commit');
    return { ok: true, leadId: lead.id, displayId: lead.displayId };
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}
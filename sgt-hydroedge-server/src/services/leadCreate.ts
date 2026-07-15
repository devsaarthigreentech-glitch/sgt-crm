// =====================================================================
// services/leadCreate.ts
// The canonical lead-creation transaction, extracted VERBATIM from the
// inline body of POST /leads so that logic lives in exactly one place.
//
// Two callers:
//   1. routes/leads.ts  → POST /leads          (capture form)
//   2. services/outreach.ts → promoteContact() (Outreach desk, green signal)
//
// Takes an existing pg client so the caller controls the transaction
// (promote needs to stamp the outreach contact in the SAME tx).
// =====================================================================

import type { PoolClient } from 'pg';
import { normaliseAccountName, generateDisplayId, defaultDivision } from '../domain/leads';

// Mirrors CreateLeadSchema's parsed output (already validated by the caller).
export type CreateLeadInput = {
  account: { name: string; location?: string; pan?: string };
  primaryContact?: { name: string; role?: string; email?: string; phone?: string };
  leadType?: string;
  vertical?: string;
  commercialModel?: string;
  origin?: string;
  estimatedValue?: number;
  estimatedCloseDate?: string;
  captureSource?: string;
  initialNotes?: string;
  ownerName?: string;
  ownerId?: string;
  referredBy?: string;
  metadata?: Record<string, any>;
};

export type CreateLeadResult = { id: string; displayId: string };

/**
 * Creates account (find-or-create) → contact → lead → audit row.
 * MUST be called inside an open transaction on `client`.
 * `actorName` becomes created_by (who captured/promoted it).
 */
export async function createLeadInTx(
  client: PoolClient,
  body: CreateLeadInput,
  actorName: string | null,
): Promise<CreateLeadResult> {
  // 1. Find or create account
  const nameNorm = normaliseAccountName(body.account.name);

  let accountId: string;
  const existing = await client.query(
    `SELECT id FROM lead_service.accounts
     WHERE name_normalized = $1 AND deleted_at IS NULL LIMIT 1`,
    [nameNorm],
  );

  if (existing.rows.length > 0) {
    accountId = existing.rows[0].id;
  } else {
    const acc = await client.query(
      `INSERT INTO lead_service.accounts
         (name, name_normalized, location, pan)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [body.account.name, nameNorm, body.account.location ?? null, body.account.pan ?? null],
    );
    accountId = acc.rows[0].id;
  }

  // 2. Create contact if provided
  let contactId: string | null = null;
  if (body.primaryContact) {
    const c = await client.query(
      `INSERT INTO lead_service.contacts
         (account_id, name, role, email, phone, is_primary)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id`,
      [
        accountId,
        body.primaryContact.name,
        body.primaryContact.role ?? null,
        body.primaryContact.email ?? null,
        body.primaryContact.phone ?? null,
      ],
    );
    contactId = c.rows[0].id;
  }

  // 3. Generate display ID
  const seqResult = await client.query(
    `SELECT nextval('lead_service.lead_id_seq') AS seq`,
  );
  const displayId = generateDisplayId(Number(seqResult.rows[0].seq));

  // 4. Create lead
  const lead = await client.query(
    `INSERT INTO lead_service.leads (
      display_id, account_id, primary_contact_id,
      vertical, commercial_model, origin, division,
      owner_name, owner_id,
      estimated_value, estimated_close_date,
      capture_source, initial_notes,
      lead_type, referred_by, metadata,
      created_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13,
      $14, $15, $16, $17
    ) RETURNING *`,
    [
      displayId, accountId, contactId,
      body.vertical ?? null,
      body.commercialModel ?? null,
      body.origin ?? null,
      body.vertical ? defaultDivision(body.vertical) : 'GREENEDGE',
      body.ownerName ?? null,        // stays unassigned — capture never assigns
      body.ownerId ?? null,
      body.estimatedValue ? body.estimatedValue * 100 : null,
      body.estimatedCloseDate ?? null,
      body.captureSource ?? 'INTERNAL',
      body.initialNotes ?? null,
      body.leadType ?? 'Prospect',
      body.referredBy ?? null,
      JSON.stringify(body.metadata ?? {}),
      actorName,                     // created_by — who captured it
    ],
  );

  // 5. Audit log
  await client.query(
    `INSERT INTO lead_service.lead_audit_log
       (lead_id, actor_name, action, to_state)
     VALUES ($1, $2, $3, $4)`,
    [
      lead.rows[0].id,
      body.ownerName ?? actorName ?? 'System',
      'lead_created',
      JSON.stringify({ stage: 'New', vertical: body.vertical }),
    ],
  );

  return { id: lead.rows[0].id, displayId };
}
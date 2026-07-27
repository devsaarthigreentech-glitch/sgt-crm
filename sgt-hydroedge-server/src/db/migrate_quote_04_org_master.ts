// =====================================================================
// migrate_quote_04_org_master.ts
// Turns quote_service.org from a thin identity row into the living
// partner master record.
//
// The gap this closes: address, contact and bank details only ever
// existed on partner_service.registration, which freezes at submit. So
// once a partner was approved there was nowhere to record that they had
// since registered for GST, moved premises, or changed their contact.
//
// The split this establishes:
//
//   registration  = an immutable record of what was APPLIED for. Frozen
//                   on submit. It is the audit trail, and stays that way.
//   org           = the LIVING record. Everything that changes over the
//                   partner's life is edited here.
//
// Also adds `status`. Note it coexists with the pre-existing `is_active`
// boolean, which existing queries all read. Rather than migrate every
// caller, a CHECK constraint keeps the two in lockstep — it is not
// possible to set one without the other, so they can never drift.
//
// Run:  npx tsx src/db/migrate_quote_04_org_master.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
alter table quote_service.org
  add column if not exists status text not null default 'active',

  add column if not exists address_line1  text,
  add column if not exists address_line2  text,
  add column if not exists city           text,
  add column if not exists state          text,
  add column if not exists state_code     char(2),
  add column if not exists pincode        text,
  add column if not exists country        text default 'India',

  add column if not exists contact_name        text,
  add column if not exists contact_designation text,
  add column if not exists contact_mobile      text,
  add column if not exists contact_email       text,

  add column if not exists pan                 text,
  add column if not exists bank_account_name   text,
  add column if not exists bank_account_number text,
  add column if not exists bank_ifsc           text,
  add column if not exists bank_name           text,
  add column if not exists bank_branch         text,

  add column if not exists notes      text,
  add column if not exists updated_at timestamptz not null default now();

alter table quote_service.org drop constraint if exists org_status_check;
alter table quote_service.org
  add constraint org_status_check
  check (status in ('active','suspended','terminated'));

-- Backfill status from the flag that already existed, BEFORE the
-- lockstep constraint goes on, or existing inactive rows would reject it.
update quote_service.org
   set status = case when is_active then 'active' else 'suspended' end
 where status is distinct from (case when is_active then 'active' else 'suspended' end);

-- The two can never disagree. Any write must set both.
alter table quote_service.org drop constraint if exists org_status_active_agree;
alter table quote_service.org
  add constraint org_status_active_agree
  check ((status = 'active') = is_active);

-- Append-only audit for the living record. registration_event covers the
-- application; this covers everything after approval.
create table if not exists quote_service.org_event (
  id         serial      primary key,
  org_id     integer     not null references quote_service.org(id) on delete cascade,
  event_type text        not null,
  actor      text,
  actor_name text,
  changes    jsonb       not null default '{}'::jsonb,
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists org_event_org_idx on quote_service.org_event (org_id, created_at);
`;

async function main() {
  console.log('▶ quote_04_org_master: widening org into a master record…');
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: [pre] } = await client.query<{ ok: boolean }>(
      `select to_regclass('quote_service.org') is not null as ok`);
    if (!pre.ok) throw new Error('quote_service.org missing — run migrate_quote_01.ts first');

    await client.query(ddl);

    // Seed each org's master data from the registration that created it,
    // so an approved partner's details are immediately editable rather
    // than stranded in the frozen application. Only fills blanks.
    const hasRegistrations = await client.query<{ ok: boolean }>(
      `select to_regclass('partner_service.registration') is not null as ok`);
    let backfilled = 0;
    if (hasRegistrations.rows[0].ok) {
      const { rowCount } = await client.query(/* sql */ `
        update quote_service.org o
           set address_line1  = coalesce(o.address_line1,  r.address_line1),
               address_line2  = coalesce(o.address_line2,  r.address_line2),
               city           = coalesce(o.city,           r.city),
               state          = coalesce(o.state,          r.state),
               state_code     = coalesce(o.state_code,     r.state_code),
               pincode        = coalesce(o.pincode,        r.pincode),
               contact_name        = coalesce(o.contact_name,        r.contact_name),
               contact_designation = coalesce(o.contact_designation, r.contact_designation),
               contact_mobile      = coalesce(o.contact_mobile,      r.contact_mobile),
               contact_email       = coalesce(o.contact_email,       r.contact_email),
               pan                 = coalesce(o.pan,                 r.pan),
               bank_account_name   = coalesce(o.bank_account_name,   r.bank_account_name),
               bank_account_number = coalesce(o.bank_account_number, r.bank_account_number),
               bank_ifsc           = coalesce(o.bank_ifsc,           r.bank_ifsc),
               bank_name           = coalesce(o.bank_name,           r.bank_name),
               bank_branch         = coalesce(o.bank_branch,         r.bank_branch),
               gstin               = coalesce(o.gstin,               r.gstin)
          from partner_service.registration r
         where r.created_org_id = o.id;
      `);
      backfilled = rowCount ?? 0;
    }
    console.log(backfilled
      ? `  backfilled master data onto ${backfilled} org(s) from their registration`
      : '  no approved registrations to backfill from yet');

    // Prove the lockstep constraint actually bites, rather than assuming.
    let enforced = false;
    try {
      await client.query('savepoint probe');
      await client.query(
        `update quote_service.org set status = 'suspended' where code = 'SGT'`);
      await client.query('rollback to savepoint probe');
    } catch {
      await client.query('rollback to savepoint probe');
      enforced = true;
    }
    console.log(enforced
      ? '  status/is_active lockstep constraint verified ✓'
      : '  ⚠ lockstep constraint did NOT reject a status-only change — check it');
    if (!enforced) throw new Error('org_status_active_agree is not enforcing');

    const { rows: [counts] } = await client.query(/* sql */ `
      select (select count(*) from quote_service.org)                       as orgs,
             (select count(*) from quote_service.org where status='active') as active,
             (select count(*) from quote_service.org_event)                 as events;
    `);

    await client.query('commit');
    console.log('✔ migrate_quote_04_org_master complete:', counts);
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_quote_04_org_master: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

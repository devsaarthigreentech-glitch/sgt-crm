// =====================================================================
// migrate_partner_03_registration_contact.ts
// Additional contacts on a partner registration.
//
// The registration row carries ONE contact inline (contact_name,
// contact_mobile, contact_email…), which submit-time validation requires.
// Real partners have several people — a proprietor, a service head, an
// accounts contact — so this table holds everyone beyond the primary.
//
// This mirrors the pattern the spec already set for addresses: the
// primary lives inline on the registration, additional ones live in a
// child table. Same shape, same reasoning, so the two stay consistent.
//
// Additional contacts require only a NAME. You often get a name and a
// phone from a forwarded card long before you get a designation or an
// email, and a half-known contact is worth recording. The primary
// contact remains strictly validated at submit.
//
// The legacy alt_contact_name / _mobile / _email columns on registration
// are superseded by this table. They are backfilled below and then left
// alone rather than dropped — dropping columns is irreversible and they
// cost nothing empty. The form no longer writes to them.
//
// Run:  npx tsx src/db/migrate_partner_03_registration_contact.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
create table if not exists partner_service.registration_contact (
  id              serial      primary key,
  registration_id integer     not null
                    references partner_service.registration(id) on delete cascade,
  name            text        not null,
  designation     text,
  mobile          text,
  email           text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists reg_contact_reg_idx
  on partner_service.registration_contact (registration_id);
`;

async function main() {
  console.log('▶ partner_03_registration_contact: adding contacts table…');
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: [pre] } = await client.query<{ ok: boolean }>(/* sql */ `
      select to_regclass('partner_service.registration') is not null as ok;
    `);
    if (!pre.ok) {
      throw new Error('partner_service.registration missing — run migrate_partner_01_schema.ts first');
    }

    await client.query(ddl);

    // Move any existing alt contact into the new table. Guarded on a
    // matching row not already existing, so a re-run does not duplicate.
    const { rowCount } = await client.query(/* sql */ `
      insert into partner_service.registration_contact
        (registration_id, name, mobile, email, notes)
      select r.id, r.alt_contact_name, r.alt_contact_mobile, r.alt_contact_email,
             'migrated from alt_contact_* by partner_03'
        from partner_service.registration r
       where coalesce(btrim(r.alt_contact_name), '') <> ''
         and not exists (
           select 1 from partner_service.registration_contact c
            where c.registration_id = r.id
              and c.name = r.alt_contact_name
         );
    `);
    console.log(rowCount
      ? `  migrated ${rowCount} alt contact(s) into registration_contact`
      : '  no alt contacts to migrate');

    const { rows: [counts] } = await client.query(/* sql */ `
      select (select count(*) from partner_service.registration)         as registrations,
             (select count(*) from partner_service.registration_contact) as contacts;
    `);

    await client.query('commit');
    console.log('✔ migrate_partner_03_registration_contact complete:', counts);
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_partner_03_registration_contact: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

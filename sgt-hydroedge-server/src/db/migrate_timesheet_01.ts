// =====================================================================
// migrate_timesheet_01.ts
// Daily timesheet — one row per entry a staff member files.
//
// Three fields, because that is what the day actually produces:
//   work_done        what got done (required — an entry with nothing in it
//                    is not a timesheet entry)
//   problems_faced   what got in the way (optional; blank is a real answer)
//   additional_notes anything else
//
// entry_date is a DATE, not a timestamp. A timesheet is filed AGAINST a
// day, and which day that is has to be settled in IST — the server runs
// UTC on the droplet, so anything logged after 05:30 IST would otherwise
// land on the wrong date. The date is therefore computed by the caller
// (domain/timesheet.ts) and stored as given; the column carries no
// default for exactly that reason.
//
// No unique constraint on (user_id, entry_date): a rep who visits two
// sites files two entries, and forcing them to merge into one textarea
// loses the separation. The UI groups by date instead.
//
// Run:  npx tsx src/db/migrate_timesheet_01.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
create schema if not exists lead_service;

create table if not exists lead_service.timesheet_entry (
  id               bigserial   primary key,
  user_id          bigint      not null
                     references lead_service.app_user(id) on delete cascade,
  entry_date       date        not null,
  work_done        text        not null,
  problems_faced   text        not null default '',
  additional_notes text        not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Set on the first edit and never cleared. The list shows "edited" from
  -- this, so a rewritten entry cannot pass as the original filing.
  edited_at        timestamptz
);

-- The two reads this table gets: "my last N entries" and "everyone, this
-- week". Both want entry_date descending.
create index if not exists timesheet_entry_user_date_idx
  on lead_service.timesheet_entry (user_id, entry_date desc, id desc);

create index if not exists timesheet_entry_date_idx
  on lead_service.timesheet_entry (entry_date desc, id desc);
`;

async function main() {
  console.log('▶ timesheet_01: creating timesheet_entry…');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(ddl);

    const { rows } = await client.query(/* sql */ `
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'lead_service' and table_name = 'timesheet_entry'
      order by ordinal_position;
    `);
    console.table(rows);

    await client.query('commit');
    console.log('✔ timesheet_01: done (no-op if the table already existed)');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ timesheet_01: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

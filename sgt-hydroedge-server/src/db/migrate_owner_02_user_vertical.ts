// =====================================================================
// migrate_owner_02_user_vertical.ts
// Maps a user to the verticals they own — the storage behind the new
// `pipeline_owner` role.
//
// A pipeline owner sits between sales and director: sales sees only leads
// assigned to them, a pipeline owner sees every lead in their vertical(s)
// regardless of assignee, a director sees everything. One person may hold
// several verticals (e.g. Marine + Vehicles), hence a join table rather
// than a column on app_user.
//
// On the FK: this table DOES reference app_user(id), departing from the
// loose-TEXT convention documented in migrate_vault_01_customer.ts. That
// convention exists for cross-schema references; this is same-schema, both
// sides are bigint, and a user_vertical row for a deleted user is pure
// garbage — cascade is the correct semantics. leads.owner_id stays loose
// TEXT as before; this is not a precedent for changing it.
//
// Verticals are stored as free text to match leads.vertical, which has no
// CHECK constraint either. Canonical list after this feature lands:
//   Industry, Mining, Marine, Vehicles, Small DG, Cross-vertical
//
// Run:  npx tsx src/db/migrate_owner_02_user_vertical.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
create table if not exists lead_service.user_vertical (
  user_id     bigint      not null
                references lead_service.app_user(id) on delete cascade,
  vertical    text        not null,
  assigned_at timestamptz not null default now(),
  assigned_by text,
  primary key (user_id, vertical)
);

-- "who owns Marine?" — the lookup the auth layer runs on every request.
create index if not exists idx_user_vertical_vertical
  on lead_service.user_vertical (vertical);
`;

async function main() {
  console.log('▶ owner_02_user_vertical: creating user_vertical…');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(ddl);

    // No backfill: nobody holds the pipeline_owner role yet. Assignments are
    // made through the director-facing UI once the rest of the feature lands.
    const { rows } = await client.query(/* sql */ `
      select count(*)::int as assignments from lead_service.user_vertical;
    `);
    console.log(`   existing assignments: ${rows[0].assignments}`);

    await client.query('commit');
    console.log('✔ owner_02_user_vertical: done');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ owner_02_user_vertical: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

// =====================================================================
// migrate_owner_03_backfill_owner_id.ts
// Populates leads.owner_id from leads.owner_name.
//
// Why: owner_id has existed and been indexed since the base migration, and
// every visibility query already checks it — but NO code path has ever
// written it. Live introspection (2026-07-20) found owner_id empty on all
// 24 leads, 20 of which have owner_name set. Access control therefore rests
// entirely on display-name string matching: rename a user in app_user and
// their leads vanish from their own view.
//
// This backfill closes the gap for existing rows. The write paths that keep
// it closed (PATCH /leads/:id, POST /leads/:id/triage) are fixed separately
// — this migration alone does not prevent regression.
//
// Matching is case- and whitespace-insensitive on name. Names are not
// unique in app_user, so an ambiguous name is left alone and reported
// rather than guessed at.
//
// Also reports (does NOT modify) leads with no vertical. Those cannot be
// backfilled — none were promoted from outreach, so there is no upstream
// source to recover from. They need tagging by hand in the UI, and they
// will be invisible to pipeline owners until that happens.
//
// Run:  npx tsx src/db/migrate_owner_03_backfill_owner_id.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Names shared by two or more active users — unsafe to resolve automatically.
const ambiguousSql = /* sql */ `
select lower(btrim(name)) as name_key, count(*)::int as users
from lead_service.app_user
where active = true
group by 1 having count(*) > 1;
`;

const backfillSql = /* sql */ `
update lead_service.leads l
set owner_id = u.id::text
from lead_service.app_user u
where (l.owner_id is null or l.owner_id = '')
  and l.owner_name is not null and btrim(l.owner_name) <> ''
  and lower(btrim(l.owner_name)) = lower(btrim(u.name))
  and u.active = true
  and lower(btrim(u.name)) not in (
    select lower(btrim(name)) from lead_service.app_user
    where active = true group by lower(btrim(name)) having count(*) > 1
  )
returning l.display_id, l.owner_name, l.owner_id;
`;

// owner_name set but still unresolved after the update — typos, departed
// staff, or ambiguous names. These keep falling back to string matching.
const unmatchedSql = /* sql */ `
select display_id, owner_name, stage, coalesce(vertical, '<none>') as vertical
from lead_service.leads
where (owner_id is null or owner_id = '')
  and owner_name is not null and btrim(owner_name) <> ''
order by owner_name, display_id;
`;

const untaggedSql = /* sql */ `
select display_id, coalesce(owner_name, '<unassigned>') as owner_name,
       stage, created_at::date as created
from lead_service.leads
where vertical is null or btrim(vertical) = ''
order by created_at;
`;

async function main() {
  console.log('▶ owner_03_backfill_owner_id: linking owners to user ids…');
  const client = await pool.connect();
  try {
    await client.query('begin');

    const ambiguous = await client.query(ambiguousSql);
    if (ambiguous.rowCount) {
      console.warn('\n⚠ duplicate active user names — these are SKIPPED, resolve by hand:');
      console.table(ambiguous.rows);
    }

    const filled = await client.query(backfillSql);
    console.log(`\n   linked ${filled.rowCount} lead(s):`);
    if (filled.rowCount) console.table(filled.rows);

    const unmatched = await client.query(unmatchedSql);
    if (unmatched.rowCount) {
      console.warn(`\n⚠ ${unmatched.rowCount} lead(s) have an owner_name that matches no active user.`);
      console.warn('  These still rely on name-string matching and will break on rename:');
      console.table(unmatched.rows);
    }

    const untagged = await client.query(untaggedSql);
    if (untagged.rowCount) {
      console.warn(`\n⚠ ${untagged.rowCount} lead(s) have NO vertical — not modified by this migration.`);
      console.warn('  Pipeline owners will NOT see these until a vertical is set in the UI:');
      console.table(untagged.rows);
    }

    await client.query('commit');
    console.log('\n✔ owner_03_backfill_owner_id: done');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ owner_03_backfill_owner_id: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

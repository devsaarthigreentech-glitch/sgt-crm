// =====================================================================
// migrate_owner_05_activity_edit.ts
// Let an activity be corrected — by the person who logged it, and only
// them — without losing the fact that it was corrected.
//
// An activity log is evidence. "Spoke to the MD, he confirmed the order"
// is the kind of line a commission argument turns on six months later,
// so an edit that leaves no trace is worse than no edit at all: the
// record still looks contemporaneous when it is not.
//
// Hence edited_at / edited_by, and hence the UI marks a corrected entry
// rather than quietly showing the new text.
//
// WHAT THIS DOES NOT ADD is a full version history. If you later need
// "what did it say before", that is an activity_revision table, not more
// columns here — and it is a different feature with a different cost.
// The point of these two columns is to make the absence of history
// obvious rather than to pretend there is some.
//
// Run:  npx tsx src/db/migrate_owner_05_activity_edit.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
alter table lead_service.lead_activities
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by text;
`;

async function main() {
  console.log('▶ owner_05_activity_edit: allowing an author to correct their own entry…');
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: [pre] } = await client.query<{ ok: boolean }>(
      `select to_regclass('lead_service.lead_activities') is not null as ok`);
    if (!pre.ok) throw new Error('lead_service.lead_activities missing — run migrate.ts first');

    await client.query(ddl);

    // Editing is author-only, and authorship is actor_id. Rows without one
    // can never be edited by anybody — they were logged before the actor
    // was taken from the token, so there is nothing to match against.
    // Reported rather than back-filled: guessing an author would be worse
    // than admitting there isn't one.
    const { rows: [counts] } = await client.query(/* sql */ `
      select count(*)                                   as activities,
             count(*) filter (where actor_id is null)   as no_actor,
             count(distinct actor_id)                   as distinct_actors
        from lead_service.lead_activities
    `);

    await client.query('commit');
    console.log('✔ migrate_owner_05_activity_edit complete:', counts);
    if (Number(counts.no_actor) > 0) {
      console.log('');
      console.log(`  Note: ${counts.no_actor} existing activity/activities have no actor_id.`);
      console.log('  Those cannot be edited by anyone — there is no author to match.');
      console.log('  New ones are stamped from the login token, so this does not recur.');
    }
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_owner_05_activity_edit: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

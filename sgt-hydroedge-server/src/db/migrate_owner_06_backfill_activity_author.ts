// =====================================================================
// migrate_owner_06_backfill_activity_author.ts
// Attribute the pre-31-Jul-2026 activities to an app_user by name, so
// their authors can correct them.
//
// migrate_owner_05 deliberately did NOT do this, and its reasoning still
// stands: actor_id is supposed to be PROVEN authorship, stamped from the
// login token, and a display-name match is INFERRED authorship. They are
// not the same fact and this script writes the weaker one into the column
// that means the stronger one.
//
// It is being run anyway, knowingly, because the alternative is that a
// handful of real entries by current staff stay frozen forever. The risk
// is bounded by two things:
//
//   1. Only names matching EXACTLY ONE active app_user are touched. A
//      name matching zero or several users is left NULL and reported —
//      guessing between two people is the failure mode that matters.
//   2. Every row it writes is stamped in metadata.actor_id_source, so a
//      backfilled author can always be told apart from a stamped one.
//      If a commission argument ever turns on one of these entries, that
//      flag is the difference between evidence and an assumption.
//
// This is a ONE-TIME correction for rows that predate token-stamped
// authorship. It is not a pattern to repeat: rows created after this
// point get a real actor_id at INSERT and must never be backfilled.
//
// Dry run (default, changes nothing):
//   npx tsx src/db/migrate_owner_06_backfill_activity_author.ts
// Apply:
//   npx tsx src/db/migrate_owner_06_backfill_activity_author.ts --apply
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const APPLY = process.argv.includes('--apply');
const SOURCE_TAG = 'name_match_backfill_2026_08_05';

// One row per orphaned activity, with the single user it resolves to (or
// NULL if it resolves to none or several). Candidates are ACTIVE users
// only — a deactivated account cannot log in, so attributing an entry to
// one buys nothing and risks pinning it on the wrong person.
const CANDIDATES = /* sql */ `
  select a.id            as activity_id,
         a.actor_name    as actor_name,
         a.actor_type    as actor_type,
         a.occurred_at   as occurred_at,
         count(u.id)     as match_count,
         min(u.id)::text as user_id
    from lead_service.lead_activities a
    left join lead_service.app_user u
           on lower(btrim(u.name)) = lower(btrim(a.actor_name))
          and u.active
   where a.actor_id is null
     and a.actor_type = 'USER'
   group by a.id, a.actor_name, a.actor_type, a.occurred_at
`;

async function main() {
  console.log(`▶ owner_06_backfill_activity_author (${APPLY ? 'APPLY' : 'DRY RUN'})`);
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: [pre] } = await client.query<{ ok: boolean }>(
      `select to_regclass('lead_service.app_user') is not null as ok`);
    if (!pre.ok) throw new Error('lead_service.app_user missing — nothing to match against');

    // What we are about to touch, grouped by name so the operator can see
    // the attribution being made rather than just a row count.
    const { rows: plan } = await client.query(/* sql */ `
      with c as (${CANDIDATES})
      select actor_name,
             match_count,
             max(user_id)  as user_id,
             count(*)::int as activities,
             min(occurred_at) as oldest,
             max(occurred_at) as newest
        from c
       group by actor_name, match_count
       order by match_count desc, actor_name
    `);
    console.table(plan);

    const willFix  = plan.filter(r => Number(r.match_count) === 1);
    const wontFix  = plan.filter(r => Number(r.match_count) !== 1);
    const total    = (rs: typeof plan) => rs.reduce((s, r) => s + Number(r.activities), 0);

    // Rows excluded because they are not USER-authored — system entries
    // have no human author and must stay uneditable.
    const { rows: [skipped] } = await client.query(/* sql */ `
      select count(*)::int as n from lead_service.lead_activities
       where actor_id is null and actor_type is distinct from 'USER'
    `);

    if (!APPLY) {
      await client.query('rollback');
      console.log(`\n  Would attribute : ${total(willFix)} activities across ${willFix.length} name(s)`);
      console.log(`  Would leave NULL: ${total(wontFix)} activities (0 or >1 matching active user)`);
      if (wontFix.length) {
        for (const r of wontFix) {
          console.log(`    · ${r.actor_name} — ${r.match_count} matching active users, ${r.activities} activities`);
        }
      }
      console.log(`  Not USER-authored, untouched: ${skipped.n}`);
      console.log('\n  Nothing was changed. Re-run with --apply to write it.');
      return;
    }

    const { rowCount } = await client.query(/* sql */ `
      with c as (${CANDIDATES})
      update lead_service.lead_activities a
         set actor_id = c.user_id,
             metadata = coalesce(a.metadata, '{}'::jsonb)
                        || jsonb_build_object(
                             'actor_id_source', $1::text,
                             'actor_id_matched_name', a.actor_name)
        from c
       where a.id = c.activity_id
         and c.match_count = 1
    `, [SOURCE_TAG]);

    await client.query('commit');

    console.log(`\n✔ backfilled ${rowCount} activity/activities.`);
    console.log(`  Left NULL (unattributable): ${total(wontFix)}`);
    console.log(`  Not USER-authored, untouched: ${skipped.n}`);
    console.log(`\n  Each backfilled row carries metadata.actor_id_source = '${SOURCE_TAG}'.`);
    console.log('  To undo:');
    console.log(`    update lead_service.lead_activities`);
    console.log(`       set actor_id = null,`);
    console.log(`           metadata = metadata - 'actor_id_source' - 'actor_id_matched_name'`);
    console.log(`     where metadata->>'actor_id_source' = '${SOURCE_TAG}';`);
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_owner_06_backfill_activity_author: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

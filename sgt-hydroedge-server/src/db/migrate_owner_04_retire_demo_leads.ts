// =====================================================================
// migrate_owner_04_retire_demo_leads.ts
// Retires four seed/demo leads left over from initial setup.
//
// migrate_owner_03 found five leads whose owner_name matches no active user.
// The user confirmed Karthik Reddy, Priya Sharma and Rohan Mehta are demo
// data, not departed staff — they own L-1001, L-1004, L-1005, L-1010.
//
// SOFT delete (sets deleted_at), not DELETE, because:
//   - every read path already filters on `deleted_at is null`, so these
//     disappear from the app immediately;
//   - lead_activities and lead_audit_log carry FKs to leads, so a hard
//     delete would either cascade away real audit history or fail outright;
//   - it is reversible. To undo:
//       update lead_service.leads set deleted_at = null
//        where display_id in ('L-1001','L-1004','L-1005','L-1010');
//
// NOT included: L-1009, whose owner_name is 'Pune EnergyTech LLP' — a company
// name in a person field. That looks like a data-entry slip on a real lead,
// not demo data, so it is left alone and reported for a human to fix.
//
// Run:  npx tsx src/db/migrate_owner_04_retire_demo_leads.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DEMO_LEADS = ['L-1001', 'L-1004', 'L-1005', 'L-1010'];

// Guard: only retire rows that still look like the demo data we identified.
// If someone has since reassigned one to a real user, leave it be.
const EXPECTED_OWNERS = ['Karthik Reddy', 'Priya Sharma', 'Rohan Mehta'];

async function main() {
  console.log('▶ owner_04_retire_demo_leads: retiring seed leads…');
  const client = await pool.connect();
  try {
    await client.query('begin');

    const before = await client.query(
      /* sql */ `
      select display_id, owner_name, stage, deleted_at
      from lead_service.leads
      where display_id = any($1)
      order by display_id;`,
      [DEMO_LEADS],
    );
    console.log('\n   current state:');
    console.table(before.rows);

    const skipped = before.rows.filter(
      (r: any) => r.deleted_at === null && !EXPECTED_OWNERS.includes(r.owner_name),
    );
    if (skipped.length) {
      console.warn('\n⚠ owner changed since identification — SKIPPING these:');
      console.table(skipped);
    }

    const retired = await client.query(
      /* sql */ `
      update lead_service.leads
      set deleted_at = now(), updated_at = now(), updated_by = 'migration:owner_04'
      where display_id = any($1)
        and deleted_at is null
        and owner_name = any($2)
      returning display_id, owner_name;`,
      [DEMO_LEADS, EXPECTED_OWNERS],
    );
    console.log(`\n   retired ${retired.rowCount} lead(s):`);
    if (retired.rowCount) console.table(retired.rows);

    const remaining = await client.query(/* sql */ `
      select count(*)::int as active_leads
      from lead_service.leads where deleted_at is null;`);
    console.log(`\n   active leads remaining: ${remaining.rows[0].active_leads}`);

    console.log('\n⚠ L-1009 NOT touched — owner_name is "Pune EnergyTech LLP",');
    console.log('  a company name in a person field. Fix by hand in the CRM.');

    await client.query('commit');
    console.log('\n✔ owner_04_retire_demo_leads: done');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ owner_04_retire_demo_leads: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

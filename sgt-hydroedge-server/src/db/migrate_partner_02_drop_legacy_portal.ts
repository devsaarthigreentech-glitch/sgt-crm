// =====================================================================
// migrate_partner_02_drop_legacy_portal.ts
// Drops the legacy Partner Portal tables. The portal's code was removed
// on 2026-07-27; this clears the eight tables it owned.
//
// DESTRUCTIVE AND IRREVERSIBLE. It therefore does nothing unless you
// explicitly opt in:
//
//   DRY RUN (default) — prints row counts and dependants, changes nothing:
//     npx tsx src/db/migrate_partner_02_drop_legacy_portal.ts
//
//   ACTUALLY DROP:
//     CONFIRM_DROP=1 npx tsx src/db/migrate_partner_02_drop_legacy_portal.ts
//
// Run the dry run first and read the counts. If any table holds rows you
// care about, dump it before proceeding:
//     pg_dump -t lead_service.partners ... > partners_backup.sql
//
// NOT dropped, because migrate_stage_partner.ts created them in the same
// file but they are core lead infrastructure, not portal tables:
//     lead_stage_transitions, lead_protections, stage_sla_config,
//     reserved_accounts, outbox
//
// Two leftovers this deliberately does not touch, because they are
// historical fact rather than portal machinery:
//   - lead_service.leads.partner_id — plain text, no FK, harmless
//   - leads with source = 'partner_portal' — records how those leads
//     actually arrived; rewriting it would falsify history
//
// Gotcha: migrate_stage_partner.ts still contains the CREATE TABLE
// statements for all eight. Re-running that migration would bring them
// back. Comment out its partner section, or simply never re-run it.
//
// Run:  see above
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Children first, parent last.
const PORTAL_TABLES = [
  'service_tickets',
  'partner_customer_health',
  'training_assignments',
  'partner_documents',
  'partner_statements',
  'partner_scorecards',
  'partner_users',
  'partners',
];

const CONFIRMED = process.env.CONFIRM_DROP === '1';

async function main() {
  console.log(CONFIRMED
    ? '▶ partner_02: DROPPING legacy portal tables…'
    : '▶ partner_02: DRY RUN — nothing will be changed.\n');
  const client = await pool.connect();
  try {
    await client.query('begin');

    // ---- What is actually there, and how much is in it? --------------
    const counts: Array<{ table: string; rows: number | string }> = [];
    for (const t of PORTAL_TABLES) {
      const { rows: [exists] } = await client.query<{ ok: boolean }>(
        `select to_regclass($1) is not null as ok`, [`lead_service.${t}`]);
      if (!exists.ok) { counts.push({ table: t, rows: '(absent)' }); continue; }
      const { rows: [c] } = await client.query<{ n: string }>(
        `select count(*)::text as n from lead_service.${t}`);
      counts.push({ table: t, rows: Number(c.n) });
    }
    console.table(counts);

    const totalRows = counts.reduce(
      (a, c) => a + (typeof c.rows === 'number' ? c.rows : 0), 0);
    console.log(`  total rows across portal tables: ${totalRows}`);

    // ---- Anything outside the set depending on these? ----------------
    // Guards against dropping a table something else quietly references.
    const { rows: deps } = await client.query<{
      dependent: string; referenced: string; constraint_name: string;
    }>(/* sql */ `
      select rel.relname       as dependent,
             frel.relname      as referenced,
             con.conname       as constraint_name
        from pg_constraint con
        join pg_class rel   on rel.oid  = con.conrelid
        join pg_class frel  on frel.oid = con.confrelid
        join pg_namespace n on n.oid    = frel.relnamespace
       where con.contype = 'f'
         and n.nspname   = 'lead_service'
         and frel.relname = any($1)
         and rel.relname <> all($1);
    `, [PORTAL_TABLES]);

    if (deps.length) {
      console.error('\n✗ ABORTING — tables outside the portal set reference these:');
      console.table(deps);
      throw new Error('unexpected foreign-key dependants; resolve before dropping');
    }
    console.log('  no external foreign-key dependants ✓');

    if (!CONFIRMED) {
      await client.query('rollback');
      console.log('\n  DRY RUN complete — nothing dropped.');
      console.log('  Re-run with CONFIRM_DROP=1 to drop these eight tables.');
      return;
    }

    for (const t of PORTAL_TABLES) {
      await client.query(`drop table if exists lead_service.${t};`);
      console.log(`  dropped lead_service.${t}`);
    }

    await client.query('commit');
    console.log('\n✔ migrate_partner_02_drop_legacy_portal: done');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_partner_02_drop_legacy_portal: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

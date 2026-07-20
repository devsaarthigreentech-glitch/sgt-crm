// =====================================================================
// introspect_schema.ts
// READ-ONLY. Dumps the live schema (columns, indexes, constraints) for
// lead_service + outreach_service, plus a few aggregate counts needed to
// plan the pipeline-owner work.
//
// Why this exists: the repo migrations have drifted from the live DB.
// migrate.ts declares leads.vertical NOT NULL, but promoted leads insert
// NULL; leadCreate.ts writes lead_type / referred_by / created_by, none of
// which appear in any CREATE TABLE. app_user has no DDL in the repo at all.
// Writing new migrations against migrate.ts would therefore be guesswork.
//
// Safety: issues only SELECTs against information_schema / pg_indexes plus
// aggregate COUNT/GROUP BY. No DDL, no writes, no row-level data, no PII.
// The whole run is wrapped in a read-only transaction so the server itself
// rejects any write that somehow slips in.
//
// Output goes to stdout — redirect it to a file and share that file.
//
// Run:  npx tsx src/db/introspect_schema.ts > schema-dump.txt
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SCHEMAS = ['lead_service', 'outreach_service'];

const columnsSql = /* sql */ `
select table_schema, table_name, ordinal_position, column_name,
       data_type, is_nullable, column_default, character_maximum_length
from information_schema.columns
where table_schema = any($1)
order by table_schema, table_name, ordinal_position;
`;

const constraintsSql = /* sql */ `
select tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type,
       string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as columns,
       cc.check_clause
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name
 and kcu.table_schema = tc.table_schema
left join information_schema.check_constraints cc
  on cc.constraint_name = tc.constraint_name
where tc.table_schema = any($1)
group by tc.table_schema, tc.table_name, tc.constraint_name,
         tc.constraint_type, cc.check_clause
order by tc.table_schema, tc.table_name, tc.constraint_type;
`;

const indexesSql = /* sql */ `
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = any($1)
order by schemaname, tablename, indexname;
`;

// Aggregates only — counts and distinct label values, never individual rows.
const statsSql = /* sql */ `
select 'leads.vertical' as field, coalesce(vertical, '<NULL>') as value, count(*)::int as n
from lead_service.leads group by 1, 2
union all
select 'leads.stage', coalesce(stage, '<NULL>'), count(*)::int
from lead_service.leads group by 1, 2
union all
select 'app_user.role', coalesce(role, '<NULL>'), count(*)::int
from lead_service.app_user group by 1, 2
union all
select 'contacts.vertical', coalesce(vertical, '<NULL>'), count(*)::int
from outreach_service.contacts group by 1, 2
union all
select 'companies.vertical', coalesce(vertical, '<NULL>'), count(*)::int
from outreach_service.companies group by 1, 2
order by field, n desc;
`;

// How many leads could a vertical backfill actually recover?
const backfillSql = /* sql */ `
select
  count(*) filter (where vertical is null or vertical = '')                    as leads_missing_vertical,
  count(*) filter (where (vertical is null or vertical = '')
                     and metadata ? 'promotedFromOutreachContactId')           as recoverable_via_outreach,
  count(*) filter (where owner_id is null or owner_id = '')                    as leads_missing_owner_id,
  count(*) filter (where owner_name is not null and owner_name <> ''
                     and (owner_id is null or owner_id = ''))                  as name_set_but_id_missing,
  count(*)                                                                     as leads_total
from lead_service.leads;
`;

async function main() {
  console.log('▶ introspect_schema: reading live schema…\n');
  const client = await pool.connect();
  try {
    // Belt and braces: the server rejects writes for the whole session.
    await client.query('begin read only');

    const cols = await client.query(columnsSql, [SCHEMAS]);
    console.log('=== COLUMNS ===');
    console.table(cols.rows);

    const cons = await client.query(constraintsSql, [SCHEMAS]);
    console.log('\n=== CONSTRAINTS (PK / FK / UNIQUE / CHECK) ===');
    console.table(cons.rows);

    const idx = await client.query(indexesSql, [SCHEMAS]);
    console.log('\n=== INDEXES ===');
    idx.rows.forEach((r: any) => console.log(`${r.schemaname}.${r.tablename}  ${r.indexdef}`));

    const stats = await client.query(statsSql);
    console.log('\n=== VALUE DISTRIBUTION (aggregate counts only) ===');
    console.table(stats.rows);

    const backfill = await client.query(backfillSql);
    console.log('\n=== BACKFILL FEASIBILITY ===');
    console.table(backfill.rows);

    await client.query('commit');
    console.log('\n✔ introspect_schema: done');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ introspect_schema: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

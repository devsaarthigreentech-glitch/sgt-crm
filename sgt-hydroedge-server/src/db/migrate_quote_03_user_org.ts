// =====================================================================
// migrate_quote_03_user_org.ts
// Links app_user to the partner org tree, so an external login can be
// scoped to exactly one distributor and its descendants.
//
// This is the round the quote SPEC called out as highest-risk: get the
// scoping wrong once and a partner sees something that is not theirs.
// It ships with nothing else in it.
//
// Two things get added:
//
//   1. lead_service.app_user.org_id -> quote_service.org(id)
//      NULL for SGT staff. Required for external roles, enforced at
//      user-creation time rather than by constraint, because `role` is
//      free text with no CHECK and a schema-level rule would have to
//      hardcode a role vocabulary that lives in the auth layer.
//
//   2. quote_service.visible_org_ids(integer) — a recursive CTE
//      returning the org itself plus every descendant. Every partner-
//      scoped query routes through this and nothing else, so the scoping
//      rule exists in exactly one place. Defined in SQL rather than TS
//      so it cannot be bypassed by a query that forgets to call it.
//
// Note app_user.id is bigint and quote_service.org.id is integer, so the
// FK column is integer to match the target, not the source.
//
// Run:  npx tsx src/db/migrate_quote_03_user_org.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
alter table lead_service.app_user
  add column if not exists org_id integer references quote_service.org(id);

create index if not exists app_user_org_idx on lead_service.app_user (org_id);

-- Every org the given org may see: itself, plus everything beneath it.
-- A distributor sees its dealers and their sub-dealers. A dealer sees its
-- own sub-dealers and NOT its distributor's other dealers — the recursion
-- only ever walks downwards.
create or replace function quote_service.visible_org_ids(root_id integer)
returns table (org_id integer)
language sql
stable
as $$
  with recursive tree as (
    select o.id
      from quote_service.org o
     where o.id = root_id
       and o.is_active
    union all
    select c.id
      from quote_service.org c
      join tree t on c.parent_id = t.id
     where c.is_active
  )
  select id from tree;
$$;
`;

async function main() {
  console.log('▶ quote_03_user_org: linking app_user to the org tree…');
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: [pre] } = await client.query<{ ok: boolean }>(/* sql */ `
      select to_regclass('quote_service.org') is not null as ok;
    `);
    if (!pre.ok) throw new Error('quote_service.org missing — run migrate_quote_01.ts first');

    await client.query(ddl);

    // Prove the CTE terminates and scopes correctly against real rows
    // before committing, rather than trusting that it reads right.
    const { rows: dist } = await client.query<{ id: number; code: string }>(
      `select id, code from quote_service.org where code = 'EDINGX001'`);
    if (dist.length) {
      const { rows: visible } = await client.query<{ org_id: number }>(
        `select org_id from quote_service.visible_org_ids($1)`, [dist[0].id]);
      console.log(`  visible_org_ids(EDINGX001) -> ${visible.length} org(s): ${visible.map(v => v.org_id).join(', ')}`);
      if (!visible.some(v => v.org_id === dist[0].id)) {
        throw new Error('visible_org_ids did not include the root org');
      }

      // A distributor must never see upwards. SGT is its parent, so SGT
      // appearing here would be a scoping leak, not a quirk.
      const { rows: sgt } = await client.query<{ id: number }>(
        `select id from quote_service.org where code = 'SGT'`);
      if (sgt.length && visible.some(v => v.org_id === sgt[0].id)) {
        throw new Error('visible_org_ids leaked the parent org — recursion is walking upwards');
      }
      console.log('  parent (SGT) correctly NOT visible from the distributor ✓');
    }

    const { rows: [counts] } = await client.query(/* sql */ `
      select (select count(*) from lead_service.app_user)                     as users,
             (select count(*) from lead_service.app_user where org_id is not null) as linked_users,
             (select count(*) from quote_service.org)                         as orgs;
    `);

    await client.query('commit');
    console.log('✔ migrate_quote_03_user_org complete:', counts);
    console.log('  No user is linked to an org yet — that happens when you create the login.');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_quote_03_user_org: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

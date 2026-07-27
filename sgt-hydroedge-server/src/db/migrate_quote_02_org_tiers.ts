// =====================================================================
// migrate_quote_02_org_tiers.ts
// Corrects the org tier model to match the partner code logic the owner
// confirmed on 2026-07-27.
//
// EDINGX001 decomposes as ED|IN|GX|001 — Exclusive DISTRIBUTOR, India,
// GreenX, serial 001. So the org seeded in Round 1 as org_type='dealer'
// was mis-typed: Continental Power System is the Distributor, and
// "Distributor" is the new name for what the price list calls the
// Exclusive Dealer. It is not a new tier above it. Dealers are a real
// level BELOW, coded as {distributor}-{SS|SM}{NN}, e.g. EDINGX001-SS01.
//
// Resulting tree:  sgt -> distributor -> dealer -> sub_dealer
//
// dealer_type stores the code token itself ('SS' | 'SM') so the column
// and the partner code can never disagree:
//   SM = Sales & Marketing   -> can sell, cannot service
//   SS = Sales & Service     -> can sell, can service
// The handoff spec's third type (service-only, no sales) is deliberately
// NOT created — the owner's list of dealer types was exhaustive. Add it
// here if a service-only partner ever needs onboarding.
//
// Round 1's price book is still coded ..._DEALERNET_... and tier
// 'dealer_net'. Left alone on purpose: that is the vocabulary the signed
// price list uses ("Dealer Unit Price", "Dealer Margin %"), and renaming
// it would churn the seed for no functional gain.
//
// Run:  npx tsx src/db/migrate_quote_02_org_tiers.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
-- Widen org_type before re-typing anything, or the update below trips the
-- old CHECK. Dropped by name; Round 1 left it as an inline column
-- constraint precisely so this name would be stable.
alter table quote_service.org
  drop constraint if exists org_org_type_check;

alter table quote_service.org
  add constraint org_org_type_check
  check (org_type in ('sgt','distributor','dealer','sub_dealer'));

alter table quote_service.org
  add column if not exists dealer_type text;

-- dealer_type is required for dealers and forbidden for everyone else.
-- Enforced in the schema rather than the application, so no route can
-- create a typeless dealer or a distributor that claims to service.
alter table quote_service.org
  drop constraint if exists org_dealer_type_check;

alter table quote_service.org
  add constraint org_dealer_type_check
  check (
    (org_type =  'dealer' and dealer_type in ('SS','SM'))
    or
    (org_type <> 'dealer' and dealer_type is null)
  );
`;

async function main() {
  console.log('▶ quote_02_org_tiers: correcting the org tier model…');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(ddl);

    // Re-type the grandfathered org. Guarded on its current value so a
    // re-run is a no-op and a hand-correction is never clobbered.
    const { rowCount } = await client.query(/* sql */ `
      update quote_service.org
         set org_type = 'distributor'
       where code = 'EDINGX001'
         and org_type = 'dealer';
    `);
    console.log(rowCount === 1
      ? '  EDINGX001 re-typed dealer -> distributor'
      : '  EDINGX001 already correct (no change)');

    // The code is immutable and must not be regenerated, so confirm the
    // grandfathered value still parses under the confirmed scheme.
    const { rows: [d] } = await client.query<{ code: string; org_type: string; parent: string | null }>(/* sql */ `
      select o.code, o.org_type, p.code as parent
        from quote_service.org o
        left join quote_service.org p on p.id = o.parent_id
       where o.code = 'EDINGX001';
    `);
    const parsed = /^(ED)(IN)(GX)(\d{3})$/.exec(d.code);
    if (!parsed || d.org_type !== 'distributor' || d.parent !== 'SGT') {
      throw new Error(`EDINGX001 failed post-check: ${JSON.stringify(d)}`);
    }
    console.log(`  parses as ED|IN|GX|${parsed[4]} under parent ${d.parent} ✓`);

    const { rows } = await client.query(/* sql */ `
      select code, org_type, dealer_type, coalesce(
               (select code from quote_service.org p where p.id = o.parent_id), '—') as parent
        from quote_service.org o
       order by o.id;
    `);

    await client.query('commit');
    console.log('✔ migrate_quote_02_org_tiers: done');
    console.table(rows);
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_quote_02_org_tiers: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

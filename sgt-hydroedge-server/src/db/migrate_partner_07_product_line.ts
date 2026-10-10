// =====================================================================
// migrate_partner_07_product_line.ts
// Which product line a partner belongs to: GreenX or GreenDrive.
//
// GreenDrive has its own partner network, the same shape as GreenX
// (distributor -> dealer SS/SM -> sub-dealer) with its own code series
// (EDINGD001, EDINGD001-SS01). A firm in both networks is a SEPARATE org
// row per product line — the owner's choice, 2026-10-07 — so the line is
// a property of the org, not a list on it.
//
//   quote_service.org.product_line            the partner's network
//   partner_service.registration.product_line which network they apply to
//
// Every existing row is GreenX — nothing else has ever been onboarded —
// so the default backfills them correctly. SGT's own row also defaults to
// GreenX; nothing reads the line off org_type = 'sgt', which sits above
// both networks.
//
// Agreements need no column: an agreement's line is its dealer's.
//
// Run BEFORE restarting the API with the GreenDrive partner code: the
// partner lists filter on these columns and fail without them.
//
// Run:  npx tsx src/db/migrate_partner_07_product_line.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
alter table quote_service.org
  add column if not exists product_line text not null default 'GreenX';
alter table quote_service.org
  drop constraint if exists org_product_line_check;
alter table quote_service.org
  add constraint org_product_line_check
  check (product_line in ('GreenX','GreenDrive'));
create index if not exists org_product_line_idx on quote_service.org (product_line, org_type);

alter table partner_service.registration
  add column if not exists product_line text not null default 'GreenX';
alter table partner_service.registration
  drop constraint if exists registration_product_line_check;
alter table partner_service.registration
  add constraint registration_product_line_check
  check (product_line in ('GreenX','GreenDrive'));
`;

async function main() {
  console.log('▶ partner_07_product_line: tagging partners by product line…');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(ddl);
    const { rows } = await client.query(/* sql */ `
      select 'org' as what, product_line, org_type as kind, count(*)::int as n
        from quote_service.org group by 2, 3
      union all
      select 'registration', product_line, partner_type, count(*)::int
        from partner_service.registration group by 2, 3
      order by 1, 2, 3
    `);
    await client.query('commit');
    for (const r of rows) {
      console.log(`  ${r.what.padEnd(13)} ${r.product_line.padEnd(10)} ${String(r.kind).padEnd(12)} ${r.n}`);
    }
    console.log('✔ done');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

main()
  .catch(e => { console.error('✗ failed —', e.message ?? e); process.exitCode = 1; })
  .finally(() => pool.end());

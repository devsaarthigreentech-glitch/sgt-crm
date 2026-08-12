// =====================================================================
// migrate_partner_02_branch_office.ts
// An optional second address for a partner — the office they actually
// work out of, as distinct from the one on their GST certificate.
//
// Why this is a separate set of columns and not a second row in some
// address table: a partner has exactly two addresses that matter to a
// printed document, they are both one-to-one with the org, and the
// quotation header has to put them in a fixed order. A generic address
// table would buy flexibility nobody has asked for and cost a join on
// every quotation render.
//
// Added to BOTH partner_service.registration and quote_service.org.
// The registration is what gets filled in at application time; approval
// copies the master data across to the org, and anything the org is
// missing is stranded there forever (see the approve route's own note).
// So a column that exists on only one of the two is a bug waiting for
// the next approval.
//
// All nullable. A branch office is optional and most partners have none
// — the printed block simply does not appear for them.
//
// Run:  npx tsx src/db/migrate_partner_02_branch_office.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const COLUMNS = `
  add column if not exists branch_address_line1  text,
  add column if not exists branch_address_line2  text,
  add column if not exists branch_city           text,
  add column if not exists branch_state          text,
  add column if not exists branch_pincode        text,
  add column if not exists branch_phone          text,
  add column if not exists branch_email          text
`;

const ddl = /* sql */ `
alter table partner_service.registration ${COLUMNS};
alter table quote_service.org            ${COLUMNS};
`;

async function main() {
  console.log('▶ partner_02_branch_office: adding the optional branch office…');
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: [pre] } = await client.query<{ reg: boolean; org: boolean }>(
      `select to_regclass('partner_service.registration') is not null as reg,
              to_regclass('quote_service.org') is not null            as org`);
    if (!pre.reg) throw new Error('partner_service.registration missing — run migrate_partner_01_schema.ts first');
    if (!pre.org) throw new Error('quote_service.org missing — run migrate_quote_01.ts first');

    await client.query(ddl);

    const { rows: [counts] } = await client.query(/* sql */ `
      select (select count(*) from quote_service.org where org_type <> 'sgt')::int as orgs,
             (select count(*) from quote_service.org
               where branch_address_line1 is not null)::int                        as orgs_with_branch,
             (select count(*) from partner_service.registration)::int              as registrations
    `);

    await client.query('commit');
    console.log('✔ migrate_partner_02_branch_office complete:', counts);
    console.log('  Branch office is optional — partners without one print exactly as before.');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_partner_02_branch_office: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

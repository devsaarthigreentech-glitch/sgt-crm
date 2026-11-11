// =====================================================================
// migrate_partner_08_sister_org.ts
// One firm, both networks, one login.
//
// A firm in both GreenX and GreenDrive is a SEPARATE org row per product
// line (owner's choice, 2026-10-07): its own code series, its own ERPNext
// Sales Partner and commission rate, its own agreement. That stays. What
// this adds is a link between the two rows, so the firm's EXISTING login
// can switch between them instead of needing a second email.
//
//   quote_service.org.sister_org_id   the same firm's org in the OTHER line
//
// Set on BOTH rows, by src/db/link-sister-orgs.ts — never by hand, since
// the script checks the two rows really are one firm in two lines.
//
// What reads it:
//   - the portal: a login's home org is app_user.org_id; asking for the
//     other line (X-Product-Line header) switches to the sister, if any.
//   - customer claims: a customer held by the firm's GreenX org is not
//     "someone else's" to its GreenDrive org, and vice versa.
//
// Run BEFORE restarting the API: the portal and the customer-claim check
// read this column on every request and fail without it.
//
// Run:  npx tsx src/db/migrate_partner_08_sister_org.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
alter table quote_service.org
  add column if not exists sister_org_id integer references quote_service.org(id);
alter table quote_service.org
  drop constraint if exists org_sister_not_self;
alter table quote_service.org
  add constraint org_sister_not_self check (sister_org_id is null or sister_org_id <> id);
create unique index if not exists org_sister_org_uidx
  on quote_service.org (sister_org_id) where sister_org_id is not null;
`;

async function main() {
  console.log('▶ partner_08_sister_org: linking one firm across product lines…');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(ddl);
    const { rows } = await client.query(
      `select count(*)::int as n from quote_service.org where sister_org_id is not null`);
    await client.query('commit');
    console.log(`  ${rows[0].n} org(s) currently linked`);
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

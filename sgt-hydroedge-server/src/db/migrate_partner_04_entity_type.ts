// =====================================================================
// migrate_partner_04_entity_type.ts
// A partner can be a PERSON, not only a firm.
//
// Until now every registration and every org was implicitly a company:
// the form asked for a constitution, a trade name and a company bank
// account, and the validator's required list read like a firm's. Plenty
// of dealers are individuals — a proprietor working under their own
// name, with a mobile number and an address and nothing else.
//
// entity_type says which. It changes three things and nothing else:
//
//   · the form asks for a person's details rather than a firm's
//   · submit-time validation drops the firm-shaped requirements
//   · the ERPNext party is created as Individual rather than Company,
//     which is ERPNext's own distinction (Customer.customer_type)
//
// It is NOT a permission or a tier. An individual dealer sells on the
// same terms, under the same code series, with the same discount cap.
//
// Default 'company' on both tables, so every row that exists keeps
// behaving exactly as it does today.
//
// Run:  npx tsx src/db/migrate_partner_04_entity_type.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
alter table partner_service.registration
  add column if not exists entity_type text not null default 'company';

alter table partner_service.registration
  drop constraint if exists registration_entity_type_check;
alter table partner_service.registration
  add constraint registration_entity_type_check
  check (entity_type in ('company','individual'));

alter table quote_service.org
  add column if not exists entity_type text not null default 'company';

alter table quote_service.org
  drop constraint if exists org_entity_type_check;
alter table quote_service.org
  add constraint org_entity_type_check
  check (entity_type in ('company','individual'));
`;

async function main() {
  console.log('▶ partner_04_entity_type: allowing individual partners…');
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: [pre] } = await client.query<{ reg: boolean; org: boolean }>(`
      select to_regclass('partner_service.registration') is not null as reg,
             to_regclass('quote_service.org')            is not null as org
    `);
    if (!pre.reg) throw new Error('partner_service.registration missing — run migrate_partner_01_schema.ts first');
    if (!pre.org) throw new Error('quote_service.org missing — run migrate_quote_01.ts first');

    await client.query(ddl);

    // Prove the constraint bites rather than assuming it does.
    let enforced = false;
    try {
      await client.query('savepoint probe');
      await client.query(
        `update quote_service.org set entity_type = 'partnership' where code = 'SGT'`);
      await client.query('rollback to savepoint probe');
    } catch {
      await client.query('rollback to savepoint probe');
      enforced = true;
    }
    if (!enforced) throw new Error('org_entity_type_check is not enforcing');
    console.log('  entity_type check constraint verified ✓');

    const { rows: [counts] } = await client.query(/* sql */ `
      select (select count(*) from quote_service.org where entity_type = 'company')            as company_orgs,
             (select count(*) from quote_service.org where entity_type = 'individual')         as individual_orgs,
             (select count(*) from partner_service.registration where entity_type = 'company') as company_regs
    `);

    await client.query('commit');
    console.log('✔ migrate_partner_04_entity_type complete:', counts);
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_partner_04_entity_type: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

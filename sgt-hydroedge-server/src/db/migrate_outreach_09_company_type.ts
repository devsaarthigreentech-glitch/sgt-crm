// =====================================================================
// migrate_outreach_09_company_type.ts
// A company-level TYPE that sub-divides a vertical. In DG it's the thing
// you asked for: Dealer vs OEM/Direct vs O&M — the KIND of counterparty,
// distinct from Tier (which is priority/fit) and from Vertical (DG/Mining).
//
// Lives on the companies (intel) table, because it's a property of the
// company, not the person. The desk derives sub-pills from it, so it shows
// once per company — never repeated on every contact row.
//
// Run:  npx tsx src/db/migrate_outreach_09_company_type.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
alter table outreach_service.companies
  add column if not exists company_type text not null default '';

create index if not exists companies_type_idx
  on outreach_service.companies (company_type);
`;

async function main() {
  console.log('▶ outreach_09_company_type: adding company_type…');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(ddl);
    await client.query('commit');
    console.log('✔ outreach_09_company_type: done');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ outreach_09_company_type: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
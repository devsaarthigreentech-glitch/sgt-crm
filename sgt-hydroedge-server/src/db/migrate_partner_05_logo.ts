// =====================================================================
// migrate_partner_05_logo.ts
// A partner's own logo, so a quotation they raise looks like theirs.
//
// Under SGT-direct billing the customer receives a document from SGT
// that a dealer actually sold. Printing only SGT's mark makes the dealer
// invisible on their own deal; printing only the dealer's would misstate
// who the supplier is. Both belong on it.
//
// WHERE THE BYTES LIVE
// In Postgres, on the row. Not in the vault, and not in ERPNext:
//
//   · the vault's StorageProvider is wired for customer documents and
//     defaults to a local disk path — one more thing to exist, back up
//     and keep in step for what is a 30 KB PNG.
//   · ERPNext must NOT be the store of record for an applicant who has
//     not been approved. A rejected application would leave an orphan
//     File behind, and the CRM would depend on ERPNext being reachable
//     to show a logo on its own screens.
//
// ERPNext gets a COPY, once, the first time the partner is quoted for —
// see erp_logo_url below. That column is a cache, not the truth: delete
// it and the next quotation re-uploads.
//
// bytea rather than a base64 text column: half the storage, and the pg
// driver hands it back as a Buffer ready to stream or re-upload.
//
// Run:  npx tsx src/db/migrate_partner_05_logo.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
alter table partner_service.registration
  add column if not exists logo_filename text,
  add column if not exists logo_mime     text,
  add column if not exists logo_bytes    bytea;

alter table quote_service.org
  add column if not exists logo_filename text,
  add column if not exists logo_mime     text,
  add column if not exists logo_bytes    bytea,
  -- Absolute URL of the copy ERPNext holds. Cached so a logo is uploaded
  -- once per partner rather than once per quotation.
  add column if not exists erp_logo_url  text;
`;

async function main() {
  console.log('▶ partner_05_logo: giving partners a logo…');
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

    const { rows: [counts] } = await client.query(/* sql */ `
      select (select count(*) from quote_service.org)                            as orgs,
             (select count(*) from quote_service.org where logo_bytes is not null) as with_logo
    `);

    await client.query('commit');
    console.log('✔ migrate_partner_05_logo complete:', counts);
    console.log('  Add logos from the portal (My dealers) or the CRM org screen.');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_partner_05_logo: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

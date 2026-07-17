// =====================================================================
// migrate_outreach_05_vertical.ts
// Tag every outreach contact with a vertical: 'DG' or 'Mining'.
//
// WHY A COLUMN ON CONTACTS: vertical is really a company-level property,
// but there's no companies table (grouping is done in the component). So
// it's denormalised onto the contact — every contact at GMMCO carries 'DG'.
// The desk groups by company anyway, so it still reads as company-level.
// When a company ever needs to OWN data, this moves to a companies table.
//
// BACKFILL: the 11 partner companies (from the Apollo pull) are DG; every
// other existing contact is Mining. That is exactly the split you asked for.
//
// Run:  npx tsx src/db/migrate_outreach_05_vertical.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Exact company strings as imported from SGT_Partner_Contacts_ALL.
// Matched case-insensitively so a stray capital doesn't silently miss.
const DG_COMPANIES = [
  'OVN Engineers',
  'Sudhir Power Ltd',
  'Powerica Ltd',
  'Jakson Group',
  'GMMCO Ltd (CK Birla Group)',
  'Apollo Power Systems Pvt Ltd',
  'Deccan Sales & Service Pvt Ltd',
  'Mahindra Powerol',
  'GMDT Marine & Industrial Engineering Pvt Ltd',
  'Sterling and Wilson Renewable Energy',
  'Sterling Engineering (US)',
];

const ddl = /* sql */ `
alter table outreach_service.contacts
  add column if not exists vertical text not null default '';

create index if not exists contacts_vertical_idx
  on outreach_service.contacts (vertical);
`;

async function main() {
  console.log('▶ outreach_05_vertical: adding vertical + backfilling…');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(ddl);

    // DG = the partner companies
    const dg = await client.query(
      `update outreach_service.contacts
          set vertical = 'DG'
        where lower(btrim(company)) = any($1::text[])`,
      [DG_COMPANIES.map((c) => c.toLowerCase().trim())],
    );

    // Everything else that isn't tagged yet = Mining
    const mining = await client.query(
      `update outreach_service.contacts
          set vertical = 'Mining'
        where vertical = ''`,
    );

    const summary = await client.query(
      `select vertical, count(*)::int as contacts, count(distinct company)::int as companies
         from outreach_service.contacts
        where deleted_at is null
        group by vertical order by 2 desc`,
    );
    console.log(`  tagged DG:     ${dg.rowCount}`);
    console.log(`  tagged Mining: ${mining.rowCount}`);
    console.table(summary.rows);

    // Loud warning if a DG company name didn't match anything — that would
    // silently dump partner contacts into Mining.
    for (const name of DG_COMPANIES) {
      const { rows } = await client.query(
        `select count(*)::int as n from outreach_service.contacts
          where lower(btrim(company)) = lower(btrim($1))`,
        [name],
      );
      if (rows[0].n === 0) console.warn(`  ⚠ no contacts matched DG company "${name}" — check the exact spelling in your DB`);
    }

    await client.query('commit');
    console.log('✔ outreach_05_vertical: done');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ outreach_05_vertical: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
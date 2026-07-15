// =====================================================================
// migrate_outreach_04_delete.ts
// Soft delete for outreach contacts — so the "— GAP: MD / promoter —"
// placeholder rows can be removed from the desk.
//
// WHY SOFT, NOT HARD: dedup_key is unique, so re-dropping the same sheet
// UPDATEs the existing row rather than inserting a new one. The import's
// update never touches deleted_at, so a deleted row stays deleted. A hard
// delete would resurrect every GAP row on the next import.
//
// Run:  npx tsx src/db/migrate_outreach_04_delete.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = /* sql */ `
alter table outreach_service.contacts
  add column if not exists deleted_at timestamptz;

create index if not exists contacts_deleted_idx
  on outreach_service.contacts (deleted_at);
`;

async function main() {
  console.log('▶ outreach_04_delete: adding soft delete…');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    console.log('✔ outreach_04_delete: done');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ outreach_04_delete: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
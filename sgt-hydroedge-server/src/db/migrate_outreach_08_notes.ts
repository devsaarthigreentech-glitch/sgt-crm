// =====================================================================
// migrate_outreach_08_notes.ts
// A free-text notes box the rep owns, per contact. Calls, WhatsApps,
// "spoke to MD, wants a demo" — anything that isn't an email.
//
// Deliberately NOT where caught emails go: n8n writes email activity into
// email_events (round 07), which the desk shows as a separate read-only list
// beneath this box. Keeping them apart means an incoming email can never
// overwrite what the rep typed.
//
// Run:  npx tsx src/db/migrate_outreach_08_notes.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
alter table outreach_service.contacts
  add column if not exists notes            text not null default '',
  add column if not exists notes_updated_at timestamptz,
  add column if not exists notes_updated_by text;
`;

async function main() {
  console.log('▶ outreach_08_notes: adding notes box…');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(ddl);
    await client.query('commit');
    console.log('✔ outreach_08_notes: done');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ outreach_08_notes: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
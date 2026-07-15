// =====================================================================
// migrate_outreach_02_promote.ts
// Step 3 — promote-to-lead support.
//
//  • FIX: promoted_lead_id was bigint in round 1, but lead_service.leads.id
//    is a uuid/text. Never populated yet, so we drop & re-add as text.
//  • phone: editable on the contact (the MDO sheet has no phone column, but
//    you want somewhere to put one when you find it).
//  • promoted_display_id / promoted_at: show "Promoted → L-0042" without a
//    cross-schema join.
//
// Run:  npx tsx src/db/migrate_outreach_02_promote.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = /* sql */ `
-- phone: not in the source sheet; hand-entered when found
alter table outreach_service.contacts
  add column if not exists phone text default '';

-- leads.id is uuid/text, NOT bigint. Safe to drop: never populated.
alter table outreach_service.contacts
  drop column if exists promoted_lead_id;

alter table outreach_service.contacts
  add column if not exists promoted_lead_id text;

alter table outreach_service.contacts
  add column if not exists promoted_display_id text;

alter table outreach_service.contacts
  add column if not exists promoted_at timestamptz;

-- default desk view hides promoted contacts
create index if not exists contacts_promoted_idx
  on outreach_service.contacts (promoted_lead_id);
`;

async function main() {
  console.log('▶ outreach_02_promote: adding phone + promote columns…');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    console.log('✔ outreach_02_promote: done');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ outreach_02_promote: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
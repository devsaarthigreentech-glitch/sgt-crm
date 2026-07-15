// =====================================================================
// migrate_outreach_03_status.ts
// Data-only migration. No schema change.
//
// WHY: the importer wrote the sheet's Status column verbatim, so values
// outside the app enum landed in the DB ("Do not contact" × 10). That made
// the Contacted stat over-count (it used an "everything except" rule) and
// made the status dropdown fall back to showing its first option — i.e.
// displaying "Not contacted" for people explicitly marked DO NOT CONTACT.
//
// This canonicalises case/spacing variants. Values we don't recognise are
// LEFT ALONE on purpose — the UI now shows unknown values verbatim rather
// than silently mis-rendering them, so nothing is lost or invented here.
//
// Run:  npx tsx src/db/migrate_outreach_03_status.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = /* sql */ `
update outreach_service.contacts
set status = case
  when lower(btrim(status)) in ('do not contact','do-not-contact','donotcontact','dnc','do not approach')
       then 'Do not contact'
  when lower(btrim(status)) in ('not contacted','not contacted yet','uncontacted','new','')
       then 'Not contacted'
  when lower(btrim(status)) in ('contacted','sent','reached out','emailed')
       then 'Contacted'
  when lower(btrim(status)) in ('replied','responded','reply')
       then 'Replied'
  when lower(btrim(status)) in ('green','green signal','interested','warm')
       then 'Green'
  when lower(btrim(status)) in ('not now','later','revisit','cold')
       then 'Not now'
  when lower(btrim(status)) in ('to find','tofind','to-find','gap','missing')
       then 'TO FIND'
  else status
end
where status is not null;
`;

async function main() {
  console.log('▶ outreach_03_status: canonicalising status values…');
  const client = await pool.connect();
  try {
    await client.query('begin');
    const before = await client.query(
      'select status, count(*)::int from outreach_service.contacts group by status order by 2 desc'
    );
    console.log('  before:', before.rows);

    await client.query(sql);

    const after = await client.query(
      'select status, count(*)::int from outreach_service.contacts group by status order by 2 desc'
    );
    console.log('  after: ', after.rows);
    await client.query('commit');
    console.log('✔ outreach_03_status: done');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ outreach_03_status: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
// =====================================================================
// migrate_outreach_07_email_events.ts
// Email capture: a CC'd mailbox (outreach@sgthydroedge.com) is watched by
// n8n, which POSTs each caught message here. We stamp the contact and log
// every event — matched or not — so nothing is lost.
//
// WHY AN EVENTS TABLE (not just columns on contacts): one email touches
// several addresses, some of which won't match a contact. A log lets us keep
// the unmatched ones for review, dedupe re-runs by message-id, and later
// reconstruct a thread. The contact columns are just the fast "last touch"
// denormalisation the desk reads.
//
// Run:  npx tsx src/db/migrate_outreach_07_email_events.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
alter table outreach_service.contacts
  add column if not exists last_touch_at   timestamptz,
  add column if not exists last_thread_id  text,
  add column if not exists last_direction  text;   -- 'outbound' | 'inbound'

create index if not exists contacts_last_touch_idx
  on outreach_service.contacts (last_touch_at desc);

create table if not exists outreach_service.email_events (
  id           bigserial primary key,
  message_id   text not null,               -- RFC Message-ID; idempotency key
  thread_id    text,                         -- Gmail threadId
  direction    text not null default '',     -- 'outbound' | 'inbound'
  address      text not null default '',     -- the matched/attempted recipient or sender
  from_addr    text not null default '',
  to_addrs     text not null default '',     -- comma-joined
  cc_addrs     text not null default '',
  subject      text not null default '',
  occurred_at  timestamptz,                  -- the email's own Date header
  matched      boolean not null default false,
  contact_id   bigint,                       -- fk-ish; null when unmatched
  status_moved text not null default '',     -- what we nudged the contact to, if anything
  created_at   timestamptz not null default now()
);

-- One row per (message, address, direction): a message hitting 3 contacts is 3
-- rows, but a re-poll of the same message won't duplicate them.
create unique index if not exists email_events_dedup_uq
  on outreach_service.email_events (message_id, address, direction);

create index if not exists email_events_unmatched_idx
  on outreach_service.email_events (matched) where matched = false;

create index if not exists email_events_contact_idx
  on outreach_service.email_events (contact_id);
`;

async function main() {
  console.log('▶ outreach_07_email_events: adding email capture…');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(ddl);
    await client.query('commit');
    console.log('✔ outreach_07_email_events: done');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ outreach_07_email_events: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
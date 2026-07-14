// =====================================================================
// migrate_outreach_01_init.ts
// Pre-CRM "Outreach" module: raw cold-outreach contacts that live BEFORE
// a lead exists. A contact is promoted into lead_service.leads only after
// a green signal (handled in a later round).
//
// Run:  npx tsx src/db/migrate_outreach_01_init.ts
// (from the backend dir so dotenv resolves .env — same as your other migrates)
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

// If your other migrates import a shared pool (e.g. `import { pool } from '../db'`),
// delete this block and use that import instead — the SQL below is unchanged.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = /* sql */ `
create schema if not exists outreach_service;

create table if not exists outreach_service.contacts (
    id                bigint generated always as identity primary key,

    -- source columns (from the dropped xlsx/csv)
    company           text  not null default '',
    name              text  not null default '',
    title             text  default '',
    layer             text  default '',
    email             text  default '',
    email2            text  default '',
    verified          text  default '',
    linkedin          text  default '',
    city              text  default '',
    message_angle     text  default '',

    -- app-owned workflow state (SURVIVES re-imports)
    status            text  not null default 'Not contacted',  -- Not contacted | Contacted | Replied | Green | Not now | TO FIND
    mail_status       text  not null default 'not_sent',       -- not_sent | sent  (used by the mail step, next round)
    last_touch_at     timestamptz,                             -- last outreach interaction (n8n will write here later)
    promoted_lead_id  bigint,                                  -- set when this contact becomes a lead_service.leads row

    -- provenance / dedup
    source_file       text,
    dedup_key         text  not null,                          -- lower(email) OR lower(company)||'|'||lower(name)

    -- audit (matches lead_service convention)
    created_by        text,
    updated_by        text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

-- one row per dedup_key: this is what makes "drop another excel → append (not duplicate)" work
create unique index if not exists contacts_dedup_uidx  on outreach_service.contacts (dedup_key);
create index        if not exists contacts_company_idx on outreach_service.contacts (company);
create index        if not exists contacts_status_idx  on outreach_service.contacts (status);
create index        if not exists contacts_layer_idx   on outreach_service.contacts (layer);
`;

async function main() {
  console.log('▶ outreach_01_init: creating outreach_service schema…');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(sql);        // DDL is transactional in Postgres — all-or-nothing
    await client.query('commit');
    console.log('✔ outreach_01_init: done');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ outreach_01_init: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
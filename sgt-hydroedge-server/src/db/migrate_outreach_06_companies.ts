// =====================================================================
// migrate_outreach_06_companies.ts
// Company-level sales intelligence, keyed by company name.
//
// WHY A TABLE NOW (when we deliberately avoided one before): grouping never
// needed a table — it's derived from the company text on each contact. But
// company INTEL is data a company *owns*: a one-liner, a "why them" thesis,
// an entry path, a flexible facts map. Different grain from contacts (one row
// per company vs one per person), different rhythm (intel is slow, contacts
// churn). So it's its own table, joined to contacts by normalised name — no
// FK, loosely coupled, exactly the philosophy we've held.
//
// The facts column is JSONB: DG carries {installed base, OEMs, rental…},
// Mining carries {segment, diesel indicators, pays fuel bill…}. Same panel
// renders whichever keys exist, so adding Marine later needs no schema change.
//
// Run:  npx tsx src/db/migrate_outreach_06_companies.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
create table if not exists outreach_service.companies (
  id            bigserial primary key,
  name          text not null,
  name_key      text not null,               -- lower(btrim(name)); the join key to contacts.company
  vertical      text not null default '',

  headline      text not null default '',    -- one-liner: what this company is
  thesis        text not null default '',    -- "why them" — the pre-call read
  entry_path    text not null default '',    -- "way in" — opener + who to target
  tier          text not null default '',    -- 'Tier 1' / 'A' etc (free text)
  priority      text not null default '',    -- 'A+' (DG) — free text
  score         integer,                     -- 0-100 (Mining); null when N/A
  website       text not null default '',
  hq            text not null default '',
  confidence    text not null default '',    -- Verified / Partial / To verify
  source_url    text not null default '',

  facts         jsonb not null default '[]'::jsonb,  -- [{label, value}] flexible context

  created_by    text,
  updated_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists companies_name_key_uq
  on outreach_service.companies (name_key);

create index if not exists companies_vertical_idx
  on outreach_service.companies (vertical);
`;

async function main() {
  console.log('▶ outreach_06_companies: creating intel table…');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(ddl);
    await client.query('commit');
    console.log('✔ outreach_06_companies: done');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ outreach_06_companies: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
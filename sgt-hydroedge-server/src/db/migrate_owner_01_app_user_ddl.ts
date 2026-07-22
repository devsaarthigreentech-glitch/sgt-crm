// =====================================================================
// migrate_owner_01_app_user_ddl.ts
// Captures the EXISTING lead_service.app_user definition as code.
//
// app_user was created by hand against the live DB and had no DDL anywhere
// in this repo, so the schema could not be rebuilt from source. This is a
// no-op against the current production database — every statement is
// `if not exists`. Its purpose is reproducibility: a fresh environment can
// now be stood up from migrations alone.
//
// Definition transcribed verbatim from live introspection (2026-07-20):
//   id bigint PK (app_user_id_seq), email text NOT NULL UNIQUE,
//   name text NOT NULL, password_hash text NOT NULL,
//   role text NOT NULL default 'sales', active boolean NOT NULL default true,
//   created_at timestamptz NOT NULL default now()
//
// Note: `role` is free text with no CHECK constraint. Roles in use today are
// director, sales, accounts, supply_chain — and pipeline_owner is added by
// this feature. Deliberately left unconstrained to match existing behaviour;
// role validation lives in the auth layer, not the schema.
//
// Run:  npx tsx src/db/migrate_owner_01_app_user_ddl.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
create schema if not exists lead_service;

create table if not exists lead_service.app_user (
  id            bigserial   primary key,
  email         text        not null unique,
  name          text        not null,
  password_hash text        not null,
  role          text        not null default 'sales',
  active        boolean     not null default true,
  created_at    timestamptz not null default now()
);
`;

async function main() {
  console.log('▶ owner_01_app_user_ddl: capturing app_user definition…');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(ddl);

    // Confirm we matched reality rather than silently creating a second shape.
    const { rows } = await client.query(/* sql */ `
      select column_name, data_type
      from information_schema.columns
      where table_schema = 'lead_service' and table_name = 'app_user'
      order by ordinal_position;
    `);
    console.table(rows);

    await client.query('commit');
    console.log('✔ owner_01_app_user_ddl: done (no-op if table already existed)');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ owner_01_app_user_ddl: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

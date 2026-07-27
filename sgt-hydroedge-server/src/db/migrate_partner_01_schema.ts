// =====================================================================
// migrate_partner_01_schema.ts
// P1 — the partner_service schema: registrations, addresses, documents,
// the code counter, the allotted-code ledger, the GSTIN cache, the audit
// trail, and the GST state-code reference table.
//
// Depends on migrate_quote_02_org_tiers.ts (needs quote_service.org to
// carry org_type='distributor' and the dealer_type column).
//
// Two deliberate deviations from SPEC_partner_onboarding.md, both to
// match deployed reality rather than the handoff:
//
//  1. registration_document stores storage_bucket + storage_key, not the
//     spec's `file_path`. That is what document_service.document_version
//     already does, and it is what makes the LocalDisk -> MinIO swap a
//     config change. Uploads go through the SAME StorageProvider in
//     src/services/storage.ts — there is no second upload path.
//
//     Note the table itself cannot be reused: document_service.document
//     has account_id NOT NULL REFERENCES lead_service.accounts(id), and an
//     applicant has no account until they are approved. Reuse the
//     provider, not the table.
//
//  2. dealer_type here is 'SS' | 'SM', matching the partner code tokens
//     and quote_service.org.dealer_type, not the spec's three-value
//     sales_marketing/service/sales_marketing_service enum.
//
// The dealer_type CHECK enforces SHAPE, not COMPLETENESS: a distributor
// may never carry one, but a *draft* dealer may not have chosen one yet.
// Drafts must always be saveable, so "a dealer must have a type" is a
// submit-time validation, not a constraint. This differs from
// quote_service.org, where the row only exists post-approval and the
// type is therefore mandatory.
//
// Run:  npx tsx src/db/migrate_partner_01_schema.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
create schema if not exists partner_service;

-- ---------------------------------------------------------------------
-- GST state codes. Needed for GSTIN derivation (P2) and for the
-- CGST/SGST vs IGST split. No such reference existed anywhere in the repo.
-- ---------------------------------------------------------------------
create table if not exists partner_service.state_code (
  code       char(2)  primary key,
  name       text     not null,
  is_active  boolean  not null default true,
  notes      text
);

-- ---------------------------------------------------------------------
-- Registration — one row per application, both tiers.
-- ---------------------------------------------------------------------
create table if not exists partner_service.registration (
  id                    serial      primary key,
  partner_type          text        not null check (partner_type in ('distributor','dealer')),
  dealer_type           text        check (dealer_type in ('SS','SM')),
  parent_org_id         integer     references quote_service.org(id),
  status                text        not null default 'draft'
                          check (status in ('draft','submitted','under_review','approved','rejected','withdrawn')),

  -- business identity
  legal_name            text        not null,
  trade_name            text,
  constitution          text,
  incorporation_date    date,
  years_in_business     integer,

  -- tax identity
  gstin                 text,
  gstin_verified        boolean     not null default false,
  gstin_verified_at     timestamptz,
  gstin_source          text        check (gstin_source in ('manual','derived','api')),
  pan                   text,
  gst_category          text,
  state_code            char(2)     references partner_service.state_code(code),
  udyam_number          text,
  tan                   text,

  -- primary address
  address_line1         text,
  address_line2         text,
  city                  text,
  state                 text,
  pincode               text,
  country               text        not null default 'India',

  -- primary contact
  contact_name          text,
  contact_designation   text,
  contact_mobile        text,
  contact_email         text,
  alt_contact_name      text,
  alt_contact_mobile    text,
  alt_contact_email     text,

  -- banking
  bank_account_name     text,
  bank_account_number   text,
  bank_ifsc             text,
  bank_name             text,
  bank_branch           text,

  -- commercial
  proposed_territory    text,
  product_lines         text[]      not null default '{}',
  customer_segments     text[]      not null default '{}',
  expected_annual_units integer,
  existing_brands       text,
  annual_turnover_band  text,

  -- type-specific fields (sales team size, service engineers, workshop…)
  -- live here rather than as nullable columns per dealer type.
  profile               jsonb       not null default '{}'::jsonb,

  -- workflow
  submitted_at          timestamptz,
  reviewed_at           timestamptz,
  approved_at           timestamptz,
  reviewed_by           text,
  approved_by           text,
  rejection_reason      text,
  allotted_code         text        unique,
  created_org_id        integer     references quote_service.org(id),

  created_by            text,
  created_by_name       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Shape, not completeness — see the header note.
alter table partner_service.registration
  drop constraint if exists registration_dealer_type_shape;
alter table partner_service.registration
  add constraint registration_dealer_type_shape
  check (partner_type = 'dealer' or dealer_type is null);

create index if not exists registration_status_idx  on partner_service.registration (status);
create index if not exists registration_parent_idx  on partner_service.registration (parent_org_id);
create index if not exists registration_gstin_idx   on partner_service.registration (gstin);
create index if not exists registration_creator_idx on partner_service.registration (created_by);

-- ---------------------------------------------------------------------
-- Additional locations. A partner may hold several GSTINs.
-- ---------------------------------------------------------------------
create table if not exists partner_service.registration_address (
  id              serial      primary key,
  registration_id integer     not null references partner_service.registration(id) on delete cascade,
  address_type    text        not null check (address_type in ('warehouse','service_centre','branch_office','registered','other')),
  address_line1   text,
  address_line2   text,
  city            text,
  state           text,
  state_code      char(2)     references partner_service.state_code(code),
  pincode         text,
  country         text        not null default 'India',
  gstin           text,
  is_primary      boolean     not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists reg_address_reg_idx on partner_service.registration_address (registration_id);

-- ---------------------------------------------------------------------
-- Upload checklist. Bytes go through src/services/storage.ts.
-- ---------------------------------------------------------------------
create table if not exists partner_service.registration_document (
  id                serial      primary key,
  registration_id   integer     not null references partner_service.registration(id) on delete cascade,
  doc_type          text        not null check (doc_type in (
                      'gst_certificate','pan_card','incorporation_certificate','partnership_deed',
                      'cancelled_cheque','address_proof','udyam_certificate',
                      'service_capability_proof','signed_agreement')),
  storage_bucket    text,
  storage_key       text        not null,
  original_filename text,
  mime_type         text,
  size_bytes        bigint,
  uploaded_by       text,
  uploaded_by_name  text,
  uploaded_at       timestamptz not null default now(),
  verified          boolean     not null default false,
  verified_by       text,
  verified_at       timestamptz,
  deleted_at        timestamptz
);

create index if not exists reg_doc_reg_idx  on partner_service.registration_document (registration_id);
create index if not exists reg_doc_type_idx on partner_service.registration_document (registration_id, doc_type);

-- ---------------------------------------------------------------------
-- Code counters. One row per series, locked FOR UPDATE during approval.
--   distributor  'ED|IN|GX'       -> EDINGX + 3-digit serial
--   dealer       'EDINGX001|SS'   -> EDINGX001-SS + 2-digit serial
-- Serial is counted per distributor per type, per the owner's decision.
-- ---------------------------------------------------------------------
create table if not exists partner_service.code_series (
  id          serial  primary key,
  series_key  text    not null unique,
  prefix      text    not null,
  next_serial integer not null default 1,
  padding     integer not null default 3
);

-- ---------------------------------------------------------------------
-- Every code ever minted. The owner chose "new code on upgrade, retire
-- the old", so codes change over a partner's life and must never be
-- reissued. The primary key here is what makes reuse impossible — do not
-- check uniqueness by scanning live orgs, because a retired code has no
-- live org row to find.
--
-- Corollary: quote_service.org.code is NOT a stable key. Nothing may
-- foreign-key to it. Reference quote_service.org.id, which survives an
-- upgrade.
-- ---------------------------------------------------------------------
create table if not exists partner_service.allotted_code (
  code            text        primary key,
  org_id          integer     references quote_service.org(id),
  registration_id integer     references partner_service.registration(id),
  series_key      text,
  allotted_at     timestamptz not null default now(),
  retired_at      timestamptz,
  retired_reason  text
);

create index if not exists allotted_code_org_idx on partner_service.allotted_code (org_id);

-- ---------------------------------------------------------------------
-- GSTIN lookup cache (P7). GST API calls are metered.
-- ---------------------------------------------------------------------
create table if not exists partner_service.gstin_cache (
  gstin      text        primary key,
  payload    jsonb       not null,
  provider   text        not null,
  fetched_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Append-only audit. Every status change writes one row.
-- Nothing updates or deletes here — enforced by convention in the
-- domain layer, since the app connects as the schema owner.
-- ---------------------------------------------------------------------
create table if not exists partner_service.registration_event (
  id              serial      primary key,
  registration_id integer     not null references partner_service.registration(id) on delete cascade,
  event_type      text        not null,
  from_status     text,
  to_status       text,
  actor           text,
  actor_name      text,
  payload         jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists reg_event_reg_idx on partner_service.registration_event (registration_id, created_at);
`;

// GST state codes. 25 and 28 are retired but kept inactive: GSTINs issued
// before the 2020 DNH/Daman merger and the 2014 AP bifurcation still carry
// them, and P2's derivation must resolve a historical GSTIN rather than
// reject it as malformed.
const STATE_CODES: Array<[string, string, boolean, string | null]> = [
  ['01', 'Jammu and Kashmir', true, null],
  ['02', 'Himachal Pradesh', true, null],
  ['03', 'Punjab', true, null],
  ['04', 'Chandigarh', true, null],
  ['05', 'Uttarakhand', true, null],
  ['06', 'Haryana', true, null],
  ['07', 'Delhi', true, null],
  ['08', 'Rajasthan', true, null],
  ['09', 'Uttar Pradesh', true, null],
  ['10', 'Bihar', true, null],
  ['11', 'Sikkim', true, null],
  ['12', 'Arunachal Pradesh', true, null],
  ['13', 'Nagaland', true, null],
  ['14', 'Manipur', true, null],
  ['15', 'Mizoram', true, null],
  ['16', 'Tripura', true, null],
  ['17', 'Meghalaya', true, null],
  ['18', 'Assam', true, null],
  ['19', 'West Bengal', true, null],
  ['20', 'Jharkhand', true, null],
  ['21', 'Odisha', true, null],
  ['22', 'Chhattisgarh', true, null],
  ['23', 'Madhya Pradesh', true, null],
  ['24', 'Gujarat', true, null],
  ['25', 'Daman and Diu', false, 'Retired 2020 — merged into 26'],
  ['26', 'Dadra and Nagar Haveli and Daman and Diu', true, null],
  ['27', 'Maharashtra', true, null],
  ['28', 'Andhra Pradesh (pre-bifurcation)', false, 'Retired — Telangana is 36, Andhra Pradesh is 37'],
  ['29', 'Karnataka', true, null],
  ['30', 'Goa', true, null],
  ['31', 'Lakshadweep', true, null],
  ['32', 'Kerala', true, null],
  ['33', 'Tamil Nadu', true, null],
  ['34', 'Puducherry', true, null],
  ['35', 'Andaman and Nicobar Islands', true, null],
  ['36', 'Telangana', true, null],
  ['37', 'Andhra Pradesh', true, null],
  ['38', 'Ladakh', true, null],
  ['97', 'Other Territory', true, null],
  ['99', 'Centre Jurisdiction', true, null],
];

async function main() {
  console.log('▶ partner_01_schema: creating partner_service…');
  const client = await pool.connect();
  try {
    await client.query('begin');

    // Fail loudly rather than half-build if quote_02 has not been run.
    const { rows: [pre] } = await client.query<{ ok: boolean }>(/* sql */ `
      select exists (
        select 1 from information_schema.columns
         where table_schema = 'quote_service'
           and table_name   = 'org'
           and column_name  = 'dealer_type'
      ) as ok;
    `);
    if (!pre.ok) {
      throw new Error('quote_service.org.dealer_type missing — run migrate_quote_02_org_tiers.ts first');
    }

    await client.query(ddl);

    for (const [code, name, isActive, notes] of STATE_CODES) {
      await client.query(/* sql */ `
        insert into partner_service.state_code (code, name, is_active, notes)
        values ($1, $2, $3, $4)
        on conflict (code) do update
          set name = excluded.name, is_active = excluded.is_active, notes = excluded.notes;
      `, [code, name, isActive, notes]);
    }

    // ---- Code series -------------------------------------------------
    // EDINGX001 is grandfathered, so the distributor series starts at 002.
    // greatest() keeps a re-run from winding the counter backwards after
    // real codes have been allotted.
    await client.query(/* sql */ `
      insert into partner_service.code_series (series_key, prefix, next_serial, padding)
      values ('ED|IN|GX', 'EDINGX', 2, 3)
      on conflict (series_key) do update
        set next_serial = greatest(partner_service.code_series.next_serial, 2);
    `);

    // The two dealer series under the only distributor that exists today.
    // P6 must create these on demand for any future distributor rather
    // than assume they are pre-seeded.
    for (const t of ['SS', 'SM']) {
      await client.query(/* sql */ `
        insert into partner_service.code_series (series_key, prefix, next_serial, padding)
        values ($1, $2, 1, 2)
        on conflict (series_key) do nothing;
      `, [`EDINGX001|${t}`, `EDINGX001-${t}`]);
    }

    // ---- Backfill the grandfathered code -----------------------------
    // Must exist in the ledger before the first allotment, or the new
    // series could mint a colliding code.
    await client.query(/* sql */ `
      insert into partner_service.allotted_code (code, org_id, series_key, allotted_at)
      select o.code, o.id, 'ED|IN|GX', o.created_at
        from quote_service.org o
       where o.code = 'EDINGX001'
      on conflict (code) do nothing;
    `);

    const { rows: [counts] } = await client.query(/* sql */ `
      select (select count(*) from partner_service.state_code)    as states,
             (select count(*) from partner_service.code_series)   as series,
             (select count(*) from partner_service.allotted_code) as codes,
             (select count(*) from partner_service.registration)  as registrations;
    `);

    const { rows: series } = await client.query(/* sql */ `
      select series_key, prefix, next_serial, padding
        from partner_service.code_series order by series_key;
    `);

    await client.query('commit');
    console.log('✔ migrate_partner_01_schema complete:', counts);
    console.table(series);
    console.log('  next distributor code: EDINGX002   next dealer: EDINGX001-SS01 / -SM01');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_partner_01_schema: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

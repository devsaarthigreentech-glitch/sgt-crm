// =====================================================================
// migrate_agreement_01.ts
// The dealer agreement module: the party fields the agreement needs on
// the living org record, the local agreement mirror, and its audit trail.
//
// Depends on migrate_quote_04_org_master.ts (org must already be the
// living master record, not the thin identity row).
//
// Why these columns go on `org` and not on the agreement
// -----------------------------------------------------
// A signatory, a constitution and a signature image are facts about the
// PARTNER, not about one agreement. Putting them on the agreement would
// mean retyping them for every dealer appointed under the same
// distributor — which is exactly the hand-filled-Word-file failure this
// module exists to remove. They live on org, are read once when an
// agreement is created, and are SNAPSHOTTED onto the ERPNext document
// from that moment on. Same rule as the quotation's partner block:
// change the org record tomorrow and an agreement already raised still
// prints what was signed.
//
// Why signatory_* and sign_* are different columns
// ------------------------------------------------
// The recital names everyone who may sign ("Mr. Mahadev (M. D.) Jethani
// and Ms. Sanya Jethani", "Authorised Signatories"). The signature block
// names the ONE person who did, in the singular. Reusing one field for
// both prints "Authorised Signatories" over a single signature, which is
// wrong on the face of the document. Found while validating the print
// format against the executed Word template.
//
// Run:  npx tsx src/db/migrate_agreement_01.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
-- ---------------------------------------------------------------------
-- Party fields on the living record.
-- ---------------------------------------------------------------------
alter table quote_service.org
  -- "a proprietorship concern" — reads INSIDE the recital sentence, so it
  -- is stored as the phrase, not as a bare enum value.
  add column if not exists constitution         text,

  -- "(with its associate Triumph Engineer)". Rare; blank for most.
  add column if not exists associate_name       text,

  -- Everyone who may sign, as the recital names them. Falls back to
  -- contact_name / contact_designation when unset, so a partner whose
  -- contact IS the signatory needs no extra data entry.
  add column if not exists signatory_name        text,
  add column if not exists signatory_designation text,

  -- The one who actually signs. Singular. Falls back to signatory_*.
  add column if not exists sign_name             text,
  add column if not exists sign_designation      text,

  -- ERPNext file URL, e.g. /files/sign.jpg. Relative is correct: the PDF
  -- renderer resolves it against the site, which is the same convention
  -- ERP_TERMS_STAMP_URLS already uses for the quotation stamps.
  add column if not exists signature_url         text,

  -- The BARE exclusive region for a distributor, e.g. "Rajasthan".
  -- Deliberately NOT reusing the territory column: it is free text and in
  -- practice already holds things that are not regions at all.
  add column if not exists region                text;

-- ---------------------------------------------------------------------
-- The local agreement mirror. Shaped like quote_service.quotation_ref,
-- and for the same reason: ERPNext holds the printable document, this
-- holds what the CRM lists, scopes and tracks.
--
-- The party snapshots here are for LISTING ONLY — so the agreements list
-- renders without a round trip to ERPNext per row. The document itself
-- is authoritative for anything printed.
-- ---------------------------------------------------------------------
create table if not exists quote_service.agreement_ref (
  id                  serial      primary key,

  -- ERPNext's document name, e.g. AG-2026-0001. Unique: one row per
  -- document, so a retry cannot mirror the same agreement twice.
  erp_name            text        not null unique,

  dealer_org_id       integer     not null references quote_service.org(id),
  distributor_org_id  integer     references quote_service.org(id),

  effective_date      date,

  status              text        not null default 'draft'
                        check (status in ('draft','generated','sent','signed','cancelled')),

  -- Listing snapshot.
  dealer_code         text,
  dealer_name         text,
  dealer_type         text,
  distributor_code    text,
  distributor_name    text,

  sent_at             timestamptz,
  sent_to             text[]      not null default '{}',
  signed_at           timestamptz,

  -- The countersigned scan, through the SAME StorageProvider the vault
  -- and partner documents use (src/services/storage.ts). Bucket + key,
  -- never a path, so the LocalDisk -> MinIO swap stays a config change.
  signed_bucket       text,
  signed_key          text,
  signed_filename     text,
  signed_mime         text,
  signed_size         bigint,

  raised_by           text,
  raised_by_name      text,
  raised_via          text        not null default 'crm'
                        check (raised_via in ('crm','portal')),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists agreement_ref_dealer_idx
  on quote_service.agreement_ref (dealer_org_id, created_at desc);
create index if not exists agreement_ref_distributor_idx
  on quote_service.agreement_ref (distributor_org_id, created_at desc);
create index if not exists agreement_ref_status_idx
  on quote_service.agreement_ref (status);

-- ---------------------------------------------------------------------
-- Append-only audit. An agreement is a legal instrument; "when was it
-- sent, to whom, by whom" has to survive someone editing the row.
-- ---------------------------------------------------------------------
create table if not exists quote_service.agreement_event (
  id           serial      primary key,
  agreement_id integer     not null references quote_service.agreement_ref(id) on delete cascade,
  event_type   text        not null,
  from_status  text,
  to_status    text,
  actor        text,
  actor_name   text,
  payload      jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists agreement_event_idx
  on quote_service.agreement_event (agreement_id, created_at);
`;

/**
 * Signatories and signatures the owner supplied on 2026-08-03.
 *
 * Keyed on org CODE, which is safe HERE and nowhere else: this runs once,
 * against codes that exist today. Nothing in the running application may
 * key on code — a partner's code changes on type upgrade and retired
 * codes are never reused. See partner_service.allotted_code.
 *
 * Only ever fills blanks (coalesce), so a value corrected by hand in the
 * CRM survives a re-run.
 */
const PARTIES: Array<{
  code: string;
  constitution?: string;
  associate_name?: string;
  signatory_name?: string;
  signatory_designation?: string;
  sign_name?: string;
  sign_designation?: string;
  signature_url?: string;
  region?: string;
}> = [
  {
    code: 'SGT',
    sign_name: 'Alok Kumar',
    sign_designation: 'Managing Director',
    signatory_name: 'Alok Kumar',
    signatory_designation: 'Managing Director',
    signature_url: '/files/sign.jpg',
  },
  {
    code: 'EDINGX001',
    associate_name: 'Triumph Engineer',
    signatory_name: 'Mr. Mahadev (M. D.) Jethani and Ms. Sanya Jethani',
    signatory_designation: 'Authorised Signatories',
    sign_name: 'Mr. Mahadev (M. D.) Jethani',
    sign_designation: 'Authorised Signatory',
    signature_url: '/files/cps-sign.png',
    region: 'Rajasthan',
  },
];

async function main() {
  console.log('▶ agreement_01: party fields, agreement mirror, audit…');
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: [pre] } = await client.query<{ ok: boolean }>(/* sql */ `
      select exists (
        select 1 from information_schema.columns
         where table_schema = 'quote_service'
           and table_name   = 'org'
           and column_name  = 'contact_designation'
      ) as ok;
    `);
    if (!pre.ok) {
      throw new Error('quote_service.org is not the master record yet — run migrate_quote_04_org_master.ts first');
    }

    await client.query(ddl);

    // ---- Seed the two known signatories ------------------------------
    let seeded = 0;
    for (const p of PARTIES) {
      const { rowCount } = await client.query(/* sql */ `
        update quote_service.org
           set constitution          = coalesce(constitution,          $2),
               associate_name        = coalesce(associate_name,        $3),
               signatory_name        = coalesce(signatory_name,        $4),
               signatory_designation = coalesce(signatory_designation, $5),
               sign_name             = coalesce(sign_name,             $6),
               sign_designation      = coalesce(sign_designation,      $7),
               signature_url         = coalesce(signature_url,         $8),
               region                = coalesce(region,                $9),
               updated_at            = now()
         where code = $1;
      `, [
        p.code, p.constitution ?? null, p.associate_name ?? null,
        p.signatory_name ?? null, p.signatory_designation ?? null,
        p.sign_name ?? null, p.sign_designation ?? null,
        p.signature_url ?? null, p.region ?? null,
      ]);
      if (rowCount) { seeded++; console.log(`  seeded ${p.code}`); }
      else console.log(`  ⚠ no org with code ${p.code} — skipped`);
    }

    // ---- Carry the constitution onto every approved partner ----------
    // It was captured at application time and then stranded on the frozen
    // registration. The recital needs it as a phrase ("a proprietorship
    // concern"), so a bare "Proprietorship" is lower-cased and given its
    // article. Anything already set by hand is left alone.
    const { rowCount: consts } = await client.query(/* sql */ `
      update quote_service.org o
         set constitution = case
               when lower(r.constitution) like 'a %' or lower(r.constitution) like 'an %'
                 then r.constitution
               when lower(r.constitution) ~ '^[aeiou]'
                 then 'an ' || lower(r.constitution) || ' concern'
               else 'a ' || lower(r.constitution) || ' concern'
             end,
             updated_at = now()
        from partner_service.registration r
       where r.created_org_id = o.id
         and o.constitution is null
         and coalesce(r.constitution, '') <> '';
    `);
    console.log(consts
      ? `  derived constitution for ${consts} partner(s) from their registration`
      : '  no constitutions to derive');

    // ---- Report what an agreement would still be missing --------------
    // Not a failure: a blank signatory prints as a ruled line, which is a
    // perfectly valid agreement for someone to sign by hand. But the
    // whole point of the module is that it does not need hand-filling, so
    // say plainly which partners still would.
    const { rows: gaps } = await client.query(/* sql */ `
      select o.code, o.legal_name, o.org_type,
             o.constitution is null                              as no_constitution,
             coalesce(o.signatory_name, o.contact_name) is null  as no_signatory,
             coalesce(o.territory, '') = ''                      as no_area
        from quote_service.org o
       where o.org_type in ('distributor','dealer')
         and o.is_active
       order by o.org_type, o.code;
    `);

    const { rows: [counts] } = await client.query(/* sql */ `
      select (select count(*) from quote_service.agreement_ref)   as agreements,
             (select count(*) from quote_service.agreement_event) as events,
             (select count(*) from quote_service.org
               where signature_url is not null)                   as with_signature;
    `);

    await client.query('commit');
    console.log(`✔ migrate_agreement_01 complete:`, counts, `(${seeded} party row(s) seeded)`);

    const incomplete = gaps.filter(g => g.no_constitution || g.no_signatory || g.no_area);
    if (incomplete.length) {
      console.log('\n  Partners whose agreement would print a blank where data should be:');
      for (const g of incomplete) {
        const missing = [
          g.no_constitution ? 'constitution' : null,
          g.no_signatory ? 'signatory' : null,
          g.no_area ? 'operating area' : null,
        ].filter(Boolean).join(', ');
        console.log(`    · ${g.code}  ${g.legal_name}  —  ${missing}`);
      }
      console.log('  Fill these on the partner record, or on the agreement form before generating.');
    }
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_agreement_01: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

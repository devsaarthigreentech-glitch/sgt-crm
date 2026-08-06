// =====================================================================
// migrate_partner_06_signature.ts
// A partner's own signature, so the document they raise is signed by
// them rather than by whoever was hardcoded into the config.
//
// Depends on migrate_partner_05_logo.ts (same shape, same reasoning) and
// migrate_agreement_01.ts (which already put `signature_url` on org).
//
// The problem this fixes
// ----------------------
// Every quotation prints two images under the terms, and until now both
// came from ERP_TERMS_STAMP_URLS — one env var, one list, the same two
// files on every document ever raised. SGT's own stamp was right. The
// second was Continental Power System's signature, printed on quotations
// raised by dealers who have never heard of them.
//
// Why these columns and not `signature_url`
// -----------------------------------------
// org.signature_url already exists, from the agreement module, and holds
// an ERPNext path someone typed in by hand. That is fine for the two
// parties who were seeded and useless for a dealer who has never had a
// file put on the ERPNext server for them.
//
// So the bytes live here, exactly as the logo's do, and `erp_sign_url`
// caches the public copy ERPNext holds — uploaded once, on the first
// document that needs it. `signature_url` is left alone and continues to
// serve the agreement; where a partner has both, the uploaded one wins
// because it is the one they can change themselves.
//
// Run:  npx tsx src/db/migrate_partner_06_signature.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
alter table quote_service.org
  add column if not exists sign_filename text,
  add column if not exists sign_mime     text,
  add column if not exists sign_bytes    bytea,

  -- Absolute URL of the copy ERPNext holds, so the image is published
  -- once and reused. A CACHE, not the truth: clearing it re-publishes,
  -- and services/partnerLogoStore.ts clears it on every re-upload for
  -- exactly the reason the logo does — leave it set and every future
  -- document keeps printing the OLD signature with nothing reporting an
  -- error, which is the worst kind of bug because it looks like it
  -- worked.
  add column if not exists erp_sign_url  text;
`;

async function main() {
  console.log('▶ partner_06_signature: giving partners a signature…');
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: [pre] } = await client.query<{ ok: boolean }>(/* sql */ `
      select exists (
        select 1 from information_schema.columns
         where table_schema = 'quote_service'
           and table_name   = 'org'
           and column_name  = 'logo_bytes'
      ) as ok;
    `);
    if (!pre.ok) throw new Error('quote_service.org has no logo columns — run migrate_partner_05_logo.ts first');

    await client.query(ddl);

    const { rows: [counts] } = await client.query(/* sql */ `
      select count(*)                                             as orgs,
             count(*) filter (where sign_bytes is not null)        as with_signature,
             count(*) filter (where coalesce(signature_url,'')<>'') as with_typed_path
        from quote_service.org
       where is_active;
    `);

    await client.query('commit');
    console.log('✔ migrate_partner_06_signature complete:', counts);
    console.log('  Upload signatures from the CRM partner screen, or the distributor');
    console.log('  portal for a dealer beneath them.');
    console.log('');
    console.log('  Until a partner has one, their documents print a blank signing rule');
    console.log('  under their name — which is a document they can sign by hand, and a');
    console.log('  great deal better than printing somebody else\'s signature.');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_partner_06_signature: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

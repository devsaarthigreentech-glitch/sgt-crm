// =====================================================================
// backfill_org_master.ts — copy a partner's master data from the
// registration that created them onto their quote_service.org row.
//
// WHY THIS EXISTS
// The approval handler used to create the org from eight columns only
// (code, names, type, parent, territory, gstin). Everything else the
// applicant filled in — contact, address, PAN, bank — stayed in the
// frozen registration, so the distributor portal showed a partner with
// an empty Contact card. migrate_quote_04_org_master.ts backfilled the
// orgs that existed when it ran; anyone approved AFTER it was left blank.
//
// The approval handler now copies the lot at insert time, so this is a
// one-off repair for the partners approved in between. It is idempotent
// and safe to re-run: coalesce means it only ever FILLS BLANKS, never
// overwrites a value someone has since edited in the portal or the CRM.
//
// Run:  npx tsx src/db/backfill_org_master.ts        (apply)
//       npx tsx src/db/backfill_org_master.ts --dry  (report only)
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DRY = process.argv.includes('--dry');

// Registration column -> org column. Same list migrate_quote_04 used,
// plus territory, which that one missed.
const FIELDS: [orgCol: string, regCol: string][] = [
  ['address_line1', 'address_line1'],
  ['address_line2', 'address_line2'],
  ['city', 'city'],
  ['state', 'state'],
  ['state_code', 'state_code'],
  ['pincode', 'pincode'],
  ['contact_name', 'contact_name'],
  ['contact_designation', 'contact_designation'],
  ['contact_mobile', 'contact_mobile'],
  ['contact_email', 'contact_email'],
  ['pan', 'pan'],
  ['bank_account_name', 'bank_account_name'],
  ['bank_account_number', 'bank_account_number'],
  ['bank_ifsc', 'bank_ifsc'],
  ['bank_name', 'bank_name'],
  ['bank_branch', 'bank_branch'],
  ['gstin', 'gstin'],
  ['territory', 'proposed_territory'],
];

async function main() {
  console.log(`▶ backfill_org_master${DRY ? ' (dry run — nothing will be written)' : ''}`);
  const client = await pool.connect();
  try {
    await client.query('begin');

    // What is actually missing, per org, before touching anything.
    const { rows: gaps } = await client.query(/* sql */ `
      select o.id, o.code, o.legal_name,
             ${FIELDS.map(([oc, rc]) =>
               `(o.${oc} is null and r.${rc} is not null) as fill_${oc}`).join(',\n             ')}
        from quote_service.org o
        join partner_service.registration r on r.created_org_id = o.id
       order by o.code
    `);

    const pending = gaps
      .map(g => ({
        code: g.code,
        legal_name: g.legal_name,
        fills: FIELDS.map(([oc]) => oc).filter(oc => g[`fill_${oc}`]),
      }))
      .filter(g => g.fills.length);

    if (!pending.length) {
      console.log('  every approved org already carries its registration data — nothing to do');
      await client.query('rollback');
      return;
    }

    for (const p of pending) {
      console.log(`  ${p.code}  ${p.legal_name}`);
      console.log(`      ${p.fills.length} blank field(s): ${p.fills.join(', ')}`);
    }

    if (DRY) {
      console.log(`\n  would fill ${pending.length} org(s). Re-run without --dry to apply.`);
      await client.query('rollback');
      return;
    }

    const { rowCount } = await client.query(/* sql */ `
      update quote_service.org o
         set ${FIELDS.map(([oc, rc]) => `${oc} = coalesce(o.${oc}, r.${rc})`).join(',\n             ')},
             updated_at = now()
        from partner_service.registration r
       where r.created_org_id = o.id
    `);

    // Leave a trail on each org that actually gained something, so the
    // change is visible in the same history the portal writes to.
    for (const p of pending) {
      await client.query(
        `insert into quote_service.org_event (org_id, event_type, actor, actor_name, changes, note)
         select o.id, 'updated', null, 'backfill_org_master', $2, $3
           from quote_service.org o where o.code = $1`,
        [p.code, JSON.stringify(Object.fromEntries(p.fills.map(f => [f, { from: null, to: 'from registration' }]))),
         'master data copied from the approved registration']);
    }

    await client.query('commit');
    console.log(`\n✔ backfill_org_master complete: ${rowCount} org(s) scanned, ${pending.length} filled`);
  } catch (err) {
    await client.query('rollback');
    console.error('✗ backfill_org_master: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

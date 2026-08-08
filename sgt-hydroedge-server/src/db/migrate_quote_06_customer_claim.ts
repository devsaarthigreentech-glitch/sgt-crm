// =====================================================================
// migrate_quote_06_customer_claim.ts
// One customer, one partner. Who got there first.
//
// ERPNext's Customer master is shared and flat — every partner can see
// and quote every customer in it. That was fine while SGT was the only
// one quoting. With dealers in the portal it means two of them can work
// the same account without either knowing, and the argument that follows
// is not one anybody can settle from the data.
//
// This table is the claim. It lives here rather than as a custom field
// on ERPNext's Customer for two reasons: the partner hierarchy it points
// into is ours (quote_service.org), and a claim needs to be checked on
// every portal request, which a REST round-trip to ERPNext would make
// too slow to put in front of a search box.
//
// WHAT A CLAIM IS NOT is a lock on the customer record. Anybody in the
// owning org's subtree can still quote, edit and correct them. It only
// answers "may THIS partner approach them", and the answer for a partner
// outside that subtree is no.
//
// BACKFILL: the first quotation ever raised for a customer decides who
// owns them. That is the closest thing to evidence of who did the work
// that we actually hold — better than creation order (ERPNext does not
// record who created a Customer) and better than leaving several years
// of accounts open to a land-grab by whoever logs in first. Customers
// never quoted stay unclaimed and are free to anyone.
//
// Run:  npx tsx src/db/migrate_quote_06_customer_claim.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
create table if not exists quote_service.customer_claim (
  -- ERPNext's Customer.name. The primary key IS the claim: one row per
  -- customer means a second partner physically cannot claim the same one.
  erp_customer     text        primary key,

  org_id           integer     not null references quote_service.org(id),

  -- Snapshotted for the audit trail and for support conversations. The
  -- live values belong to ERPNext; these are what it said at claim time.
  customer_name    text,
  customer_gstin   text,

  claimed_by       text,
  claimed_by_name  text,
  claimed_via      text        not null default 'portal'
                     check (claimed_via in ('portal','crm','backfill')),
  created_at       timestamptz not null default now()
);

create index if not exists customer_claim_org_idx
  on quote_service.customer_claim (org_id);
`;

// First quotation wins. distinct on + order by created_at asc picks the
// earliest row per customer; id breaks ties within the same timestamp so
// the result is deterministic rather than whatever the planner returns.
const backfill = /* sql */ `
insert into quote_service.customer_claim
  (erp_customer, org_id, customer_name, customer_gstin, claimed_via, created_at)
select distinct on (q.erp_customer)
       q.erp_customer, q.org_id, q.customer_name, q.customer_gstin,
       'backfill', q.created_at
  from quote_service.quotation_ref q
 where q.erp_customer is not null
   and btrim(q.erp_customer) <> ''
   and q.org_id is not null
 order by q.erp_customer, q.created_at asc, q.id asc
on conflict (erp_customer) do nothing
`;

async function main() {
  console.log('▶ quote_06_customer_claim: linking customers to the partner who won them…');
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: [pre] } = await client.query<{ org: boolean; qref: boolean }>(
      `select to_regclass('quote_service.org') is not null            as org,
              to_regclass('quote_service.quotation_ref') is not null  as qref`);
    if (!pre.org) throw new Error('quote_service.org missing — run migrate_quote_01.ts first');
    if (!pre.qref) throw new Error('quote_service.quotation_ref missing — run migrate_quote_05_quotation_ref.ts first');

    await client.query(ddl);
    const { rowCount } = await client.query(backfill);

    const { rows: byOrg } = await client.query(/* sql */ `
      select o.code, o.legal_name, o.org_type, count(*)::int as customers
        from quote_service.customer_claim c
        join quote_service.org o on o.id = c.org_id
       group by o.code, o.legal_name, o.org_type
       order by customers desc, o.code
    `);

    // Quoted by nobody, or quoted only by SGT directly (org_id null).
    // These stay open — the next partner to add or quote them claims them.
    const { rows: [open] } = await client.query(/* sql */ `
      select count(distinct q.erp_customer)::int as n
        from quote_service.quotation_ref q
       where q.erp_customer is not null
         and q.org_id is null
         and not exists (select 1 from quote_service.customer_claim c
                          where c.erp_customer = q.erp_customer)
    `);

    await client.query('commit');

    console.log(`✔ migrate_quote_06_customer_claim complete: ${rowCount} customer(s) claimed from quote history.`);
    if (byOrg.length) console.table(byOrg);
    console.log(`  Quoted by SGT directly, left unclaimed and open to any partner: ${open.n}`);
    console.log('  Customers never quoted are not listed and are also open.');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_quote_06_customer_claim: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

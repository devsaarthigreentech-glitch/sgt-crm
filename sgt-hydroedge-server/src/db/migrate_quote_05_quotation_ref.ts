// =====================================================================
// migrate_quote_05_quotation_ref.ts
// A local mirror of the quotations ERPNext owns.
//
// ERPNext is the system of record for quotations — that was the owner's
// decision. This table is NOT a second copy of the commercial truth; it
// exists for two things ERPNext cannot do for us:
//
//   1. Scoping. A distributor is an external login and must never reach
//      ERPNext. To let them list their own quotations we need a row on
//      our side carrying org_id, which visible_org_ids() can filter.
//
//   2. Provenance. ERPNext records `sales_partner` but not which CRM
//      user raised the quote, from which kVA input, against which
//      resolved model. That trail is ours to keep.
//
// Money is stored here only as a snapshot for listing. Anything that
// matters commercially — tax, totals, status after submission — is read
// from ERPNext, never from this table.
//
// Run:  npx tsx src/db/migrate_quote_05_quotation_ref.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
create table if not exists quote_service.quotation_ref (
  id                serial      primary key,

  -- ERPNext's Quotation name, e.g. SAL-QTN-2026-00013. Unique: one row
  -- per ERPNext document, so a retry cannot mirror the same quote twice.
  erp_name          text        not null unique,

  -- Which partner the quote belongs to. NULL when SGT quoted directly
  -- with no partner involved.
  org_id            integer     references quote_service.org(id),

  -- What the user actually asked for, and what the resolver chose.
  input_kva         numeric(10,2),
  model_id          integer     references quote_service.product_model(id),
  model_code        text,
  qty               integer     not null default 1,

  -- Snapshot for listing only. ERPNext holds the real figures.
  unit_rate         numeric(14,2),
  net_total         numeric(14,2),
  grand_total       numeric(14,2),
  commission_rate   numeric(6,2),

  erp_customer      text,
  customer_name     text,
  customer_gstin    text,
  customer_state    text,

  status            text        not null default 'draft',
  raised_by         text,
  raised_by_name    text,
  raised_via        text        not null default 'crm'
                      check (raised_via in ('crm','portal')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists quotation_ref_org_idx  on quote_service.quotation_ref (org_id, created_at desc);
create index if not exists quotation_ref_cust_idx on quote_service.quotation_ref (erp_customer);
`;

async function main() {
  console.log('▶ quote_05_quotation_ref: creating the local quotation mirror…');
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: [pre] } = await client.query<{ ok: boolean }>(
      `select to_regclass('quote_service.product_model') is not null as ok`);
    if (!pre.ok) throw new Error('quote_service.product_model missing — run migrate_quote_01.ts first');

    await client.query(ddl);

    const { rows: [counts] } = await client.query(`
      select (select count(*) from quote_service.quotation_ref) as quotations,
             (select count(*) from quote_service.product_model where is_active) as models
    `);

    await client.query('commit');
    console.log('✔ migrate_quote_05_quotation_ref complete:', counts);
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_quote_05_quotation_ref: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

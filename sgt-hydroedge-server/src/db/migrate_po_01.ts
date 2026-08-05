// =====================================================================
// migrate_po_01.ts
// The local mirror of the dealer POs ERPNext renders.
//
// Depends on migrate_quote_05_quotation_ref.ts — a PO is always raised
// against a quotation, and the FK below says so.
//
// Shaped like quote_service.agreement_ref, and for the same reasons:
//
//   1. Scoping. A dealer or distributor is an external login and must
//      never reach ERPNext. Listing their own POs needs a row on our
//      side carrying org_id, which visible_org_ids() can filter.
//
//   2. Provenance. ERPNext holds the printable document; it does not
//      hold which CRM user raised it, from which surface, or against
//      which quotation in OUR records.
//
// Money is stored here only as a snapshot for listing. The document is
// authoritative for anything printed.
//
// Run:  npx tsx src/db/migrate_po_01.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
create table if not exists quote_service.dealer_po_ref (
  id                serial      primary key,

  -- ERPNext's document name, e.g. SGT-PO-202627-0001. Unique: one row per
  -- document, so a retry cannot mirror the same PO twice.
  erp_name          text        not null unique,

  -- The quotation this PO was raised from. TEXT rather than an FK to
  -- quotation_ref.id on purpose: reconcileQuotations() DELETES mirror rows
  -- whose ERPNext quotation has gone, and a real FK would either cascade
  -- that deletion into POs the dealer already holds a PDF of, or block the
  -- reconciliation entirely. The PO must outlive its quotation.
  quotation_erp_name text       not null,

  -- Which partner raised it. NULL when SGT raised it directly.
  org_id            integer     references quote_service.org(id),

  status            text        not null default 'generated'
                      check (status in ('generated','cancelled')),

  -- Listing snapshot. ERPNext holds the real figures.
  erp_customer      text,
  customer_name     text,
  model_code        text,
  line_count        integer     not null default 1,
  net_total         numeric(14,2),
  grand_total       numeric(14,2),

  po_date           date,
  terms_template    text,

  raised_by         text,
  raised_by_name    text,
  raised_via        text        not null default 'crm'
                      check (raised_via in ('crm','portal')),

  cancelled_at      timestamptz,
  cancel_reason     text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists dealer_po_ref_org_idx
  on quote_service.dealer_po_ref (org_id, created_at desc);
create index if not exists dealer_po_ref_quote_idx
  on quote_service.dealer_po_ref (quotation_erp_name);
create index if not exists dealer_po_ref_status_idx
  on quote_service.dealer_po_ref (status);
`;

async function main() {
  console.log('▶ po_01: creating the local dealer PO mirror…');
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: [pre] } = await client.query<{ ok: boolean }>(
      `select to_regclass('quote_service.quotation_ref') is not null as ok`);
    if (!pre.ok) {
      throw new Error(
        'quote_service.quotation_ref missing — run migrate_quote_05_quotation_ref.ts first');
    }

    await client.query(ddl);

    const { rows: [counts] } = await client.query(`
      select (select count(*) from quote_service.dealer_po_ref) as pos,
             (select count(*) from quote_service.quotation_ref) as quotations
    `);

    await client.query('commit');
    console.log('✔ migrate_po_01 complete:', counts);
    console.log('  Next: CONFIRM_CREATE=1 npx tsx src/db/erp_create_dealer_po_doctype.ts');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_po_01: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

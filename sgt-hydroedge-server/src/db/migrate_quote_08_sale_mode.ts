// =====================================================================
// migrate_quote_08_sale_mode.ts
// Whether a quotation SELLS the equipment or RENTS it (DaaS).
//
// DaaS is a commercial mode across both product lines, so it is its own
// column rather than two more product_line values: a GreenX DaaS quote is
// still a GreenX quote. The sale screens list sale_mode = 'sale' only —
// a DaaS quotation has no discount, AMC choice or kVA line to edit, and
// no PO can be raised from it — and the DaaS screens list 'daas'.
//
// Every existing row is a sale; the default backfills them.
// Requires migrate_quote_07_product_line.ts.
//
// Run BEFORE restarting the API with the DaaS code: the quotation list
// filters on this column and fails without it.
//
// Run:  npx tsx src/db/migrate_quote_08_sale_mode.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
alter table quote_service.quotation_ref
  add column if not exists sale_mode text not null default 'sale';
alter table quote_service.quotation_ref
  drop constraint if exists quotation_ref_sale_mode_check;
alter table quote_service.quotation_ref
  add constraint quotation_ref_sale_mode_check
  check (sale_mode in ('sale','daas'));
create index if not exists quotation_ref_mode_idx
  on quote_service.quotation_ref (product_line, sale_mode, created_at desc);
`;

async function main() {
  console.log('▶ quote_08_sale_mode: tagging quotations as sale or DaaS…');
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows: [pre] } = await client.query<{ ok: boolean }>(
      `select exists (select 1 from information_schema.columns
                       where table_schema = 'quote_service' and table_name = 'quotation_ref'
                         and column_name = 'product_line') as ok`);
    if (!pre.ok) throw new Error('quotation_ref.product_line missing — run migrate_quote_07_product_line.ts first');
    await client.query(ddl);
    const { rows } = await client.query(
      `select product_line, sale_mode, count(*)::int as n
         from quote_service.quotation_ref group by 1, 2 order by 1, 2`);
    await client.query('commit');
    for (const r of rows) console.log(`  ${r.product_line.padEnd(10)} ${r.sale_mode.padEnd(5)} ${r.n}`);
    console.log('✔ done');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

main()
  .catch(e => { console.error('✗ failed —', e.message ?? e); process.exitCode = 1; })
  .finally(() => pool.end());

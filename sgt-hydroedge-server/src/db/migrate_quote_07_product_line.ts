// =====================================================================
// migrate_quote_07_product_line.ts
// Which product line a quotation belongs to.
//
// GreenDrive quotations are raised beside GreenX ones and the screens
// filter on this column, so the GreenX list never shows a GreenDrive
// quotation it could not edit or raise a PO from. Every existing row is
// GreenX — nothing else has ever been quoted — so the default backfills
// them correctly with no update.
//
// Run BEFORE restarting the API with the GreenDrive code: the quotation
// list filters on this column and fails without it.
//
// Run:  npx tsx src/db/migrate_quote_07_product_line.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
alter table quote_service.quotation_ref
  add column if not exists product_line text not null default 'GreenX';
alter table quote_service.quotation_ref
  drop constraint if exists quotation_ref_product_line_check;
alter table quote_service.quotation_ref
  add constraint quotation_ref_product_line_check
  check (product_line in ('GreenX','GreenDrive'));

create index if not exists quotation_ref_product_idx
  on quote_service.quotation_ref (product_line, created_at desc);
`;

async function main() {
  console.log('▶ quote_07_product_line: tagging quotations by product line…');
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: [pre] } = await client.query<{ q: boolean }>(
      `select to_regclass('quote_service.quotation_ref') is not null as q`);
    if (!pre.q) throw new Error('quote_service.quotation_ref missing — run migrate_quote_05_quotation_ref.ts first');

    await client.query(ddl);

    const { rows: counts } = await client.query(/* sql */ `
      select product_line, count(*)::int as n
        from quote_service.quotation_ref group by product_line order by 1
    `);
    await client.query('commit');
    for (const c of counts) console.log(`  ${c.product_line.padEnd(10)} ${c.n} quotation(s)`);
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

// =====================================================================
// migrate_quote_06_quote_lines.ts
// A quotation can carry MORE THAN ONE machine.
//
// quotation_ref was built around a single line: one input_kva, one
// model_code, one qty, one unit_rate. A customer asking for three DGs of
// three different ratings had to be quoted three times, which is not how
// anyone buys a plant room.
//
// The single-line columns are KEPT and keep meaning what they always
// did — they now describe the FIRST line, which is what the list screens
// show. Nothing that reads them needs to change.
//
// What is added:
//
//   line_count  how many machine lines, so a list can say "+2 more"
//               without parsing the JSON
//   lines       the full breakdown: resolved model, qty, rate, discount,
//               AMC and the optional product specification per line
//   tax_mode    whether GST was derived from the customer's GSTIN or
//               chosen by hand. Provenance: when a quotation carries
//               IGST, this is the record of WHY.
//
// `lines` is a snapshot for our own screens and audit. ERPNext remains
// the system of record for every commercial figure.
//
// Run:  npx tsx src/db/migrate_quote_06_quote_lines.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
alter table quote_service.quotation_ref
  add column if not exists line_count integer not null default 1,
  add column if not exists lines      jsonb   not null default '[]'::jsonb,
  add column if not exists tax_mode   text    not null default 'auto';

alter table quote_service.quotation_ref
  drop constraint if exists quotation_ref_tax_mode_check;
alter table quote_service.quotation_ref
  add constraint quotation_ref_tax_mode_check
  check (tax_mode in ('auto','in_state','out_state'));

alter table quote_service.quotation_ref
  drop constraint if exists quotation_ref_line_count_check;
alter table quote_service.quotation_ref
  add constraint quotation_ref_line_count_check
  check (line_count >= 1);
`;

async function main() {
  console.log('▶ quote_06_quote_lines: widening the mirror to many lines…');
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: [pre] } = await client.query<{ ok: boolean }>(
      `select to_regclass('quote_service.quotation_ref') is not null as ok`);
    if (!pre.ok) throw new Error('quote_service.quotation_ref missing — run migrate_quote_05_quotation_ref.ts first');

    await client.query(ddl);

    // Backfill: every existing quotation is a single line, and its shape
    // is already in the flat columns. Write it into `lines` so readers
    // never have to handle "old row / new row" as two different cases.
    const { rowCount } = await client.query(/* sql */ `
      update quote_service.quotation_ref q
         set lines = jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
               'kva',       q.input_kva,
               'modelId',   q.model_id,
               'modelCode', q.model_code,
               'qty',       q.qty,
               'unitRate',  q.unit_rate
             ))),
             line_count = 1
       where jsonb_array_length(q.lines) = 0
    `);
    console.log(rowCount
      ? `  backfilled ${rowCount} existing quotation(s) into the lines array`
      : '  no existing quotations to backfill');

    const { rows: [counts] } = await client.query(/* sql */ `
      select count(*)                                as quotations,
             coalesce(sum(line_count), 0)            as total_lines,
             count(*) filter (where line_count > 1)  as multi_line
        from quote_service.quotation_ref
    `);

    await client.query('commit');
    console.log('✔ migrate_quote_06_quote_lines complete:', counts);
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_quote_06_quote_lines: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

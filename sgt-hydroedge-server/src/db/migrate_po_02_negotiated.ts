// =====================================================================
// migrate_po_02_negotiated.ts
// Room to record a negotiated PO: what was quoted, what was agreed.
//
// Depends on migrate_po_01.ts.
//
// Why the quoted figures are stored at all
// ----------------------------------------
// From the moment prices can be changed while raising a PO, "what did we
// quote and what did we actually agree" becomes a question somebody will
// ask — about commission, about margin, about whether a discount was
// authorised. Neither document answers it on its own: the quotation
// knows only the offer, the PO knows only the outcome, and the PO can be
// raised against a quotation that is later edited or deleted.
//
// So the comparison is snapshotted HERE, at the moment of agreement, the
// same way quotation_ref.lines snapshots what was asked for.
//
// Run:  npx tsx src/db/migrate_po_02_negotiated.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = /* sql */ `
alter table quote_service.dealer_po_ref
  -- What the quotation said, at the moment the PO was raised. NULL on
  -- rows created before this migration — absence is not "no change".
  add column if not exists quoted_total       numeric(14,2),
  add column if not exists quoted_grand_total numeric(14,2),

  -- Whether the raiser actually changed anything. Kept as its own column
  -- rather than derived from the totals: a PO can be renegotiated to the
  -- same grand total by moving money between lines, and that is still a
  -- negotiation somebody may need to find.
  add column if not exists negotiated         boolean not null default false,

  -- Per line: kVA asked for, model resolved, qty, list rate, what the
  -- quotation charged, what the PO charges, discount, AMC, spec. The
  -- shape of quote_service.quotation_ref.lines, plus the quoted-vs-agreed
  -- pair. This is what the PO editor reloads and what any later margin
  -- question is answered from.
  add column if not exists lines              jsonb   not null default '[]'::jsonb;

create index if not exists dealer_po_ref_negotiated_idx
  on quote_service.dealer_po_ref (negotiated) where negotiated;
`;

async function main() {
  console.log('▶ po_02_negotiated: adding the quoted-vs-agreed snapshot…');
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: [pre] } = await client.query<{ ok: boolean }>(
      `select to_regclass('quote_service.dealer_po_ref') is not null as ok`);
    if (!pre.ok) throw new Error('quote_service.dealer_po_ref missing — run migrate_po_01.ts first');

    await client.query(ddl);

    const { rows: [counts] } = await client.query(`
      select count(*)                              as pos,
             count(*) filter (where negotiated)    as negotiated,
             count(*) filter (where lines <> '[]'::jsonb) as with_lines
        from quote_service.dealer_po_ref
    `);

    await client.query('commit');
    console.log('✔ migrate_po_02_negotiated complete:', counts);
    console.log('  Existing POs keep negotiated = false and no line snapshot, which is');
    console.log('  accurate: none of them could have been negotiated.');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_po_02_negotiated: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

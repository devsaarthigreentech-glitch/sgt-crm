/// <reference types="node" />
// =====================================================================
// erp_reprice_greenx.ts
// Push the CRM's price book into ERPNext when a price list is REVISED.
//
// DRY RUN BY DEFAULT.
//
//   npx tsx src/db/erp_reprice_greenx.ts                     # report
//   CONFIRM_REPRICE=1 npx tsx src/db/erp_reprice_greenx.ts   # apply
//
// WHY THIS EXISTS
// erp_create_greenx_items.ts and erp_create_amc_matrix.ts only CREATE.
// They POST an Item Price and move on if one already exists, which is
// right for a first run and useless for a repricing — the new figure
// lands nowhere and quotations keep quoting last year's number, with no
// error anywhere to say so.
//
// ORDER OF OPERATIONS, and it matters:
//
//   1. edit the catalogue in migrate_quote_01.ts
//   2. re-run migrate_quote_01.ts   (updates quote_service.price_line)
//   3. run THIS                     (updates ERPNext Item Price)
//
// Postgres is read here, never written: this script's whole job is to
// make ERPNext agree with the price book, so the price book has to be
// right before it runs.
//
// ERPNext's Item Price is what actually prices a quotation — the CRM's
// book is only the fallback and the comparison. Skip step 3 and the two
// disagree silently; the quote screen flags it as a rate mismatch, but
// only if somebody reads the warning.
//
// AMC items are repriced too. Their rate is derived from the machine's
// MRP, so a machine that moves and an AMC that does not is a margin
// error waiting to be found by a customer.
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;
const PRICE_LIST = process.env.ERP_SELLING_PRICE_LIST ?? 'Standard Selling';
const MRP_BOOK = process.env.GREENX_MRP_BOOK ?? 'GREENX_MRP_V1_1';
const AMC_PCT = Number(process.env.QUOTE_AMC_PCT ?? '10');
const AMC_TERMS = [1, 2, 3];
const CONFIRMED = process.env.CONFIRM_REPRICE === '1';

if (!BASE || !KEY || !SECRET) {
  console.error('✗ ERPNEXT_URL / ERPNEXT_API_KEY / ERPNEXT_API_SECRET must be set');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const headers = {
  Authorization: `token ${KEY}:${SECRET}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, json, text };
}

const inr = (n: number) => '₹' + n.toLocaleString('en-IN');

/** Every selling Item Price for a code, on our price list. */
async function currentPrices(itemCode: string) {
  const r = await call('GET',
    `/api/resource/Item Price?filters=` +
    encodeURIComponent(JSON.stringify([
      ['item_code', '=', itemCode],
      ['price_list', '=', PRICE_LIST],
    ])) +
    `&fields=${encodeURIComponent('["name","price_list_rate"]')}&limit_page_length=20`);
  return r.ok ? (r.json?.data ?? []) : [];
}

interface Plan {
  code: string;
  want: number;
  have: number | null;
  rowName: string | null;
  extra: number;
}

async function planFor(itemCode: string, want: number): Promise<Plan> {
  const rows = await currentPrices(itemCode);
  return {
    code: itemCode,
    want,
    have: rows.length ? Number(rows[0].price_list_rate) : null,
    rowName: rows.length ? String(rows[0].name) : null,
    // More than one selling price for the same item on the same list is
    // ambiguous — ERPNext will pick one and it may not be ours.
    extra: Math.max(0, rows.length - 1),
  };
}

async function main() {
  console.log(CONFIRMED
    ? `▶ Repricing GreenX in ERPNext — ${BASE}\n`
    : `▶ DRY RUN — nothing will be written. ${BASE}\n`);
  console.log(`  price list: ${PRICE_LIST}`);
  console.log(`  source:     quote_service.price_line / ${MRP_BOOK}`);
  console.log(`  AMC:        ${AMC_PCT}% of MRP per year\n`);

  const { rows: models } = await pool.query<{ model_code: string; mrp: string }>(/* sql */ `
    select pm.model_code, pl.unit_price::text as mrp
      from quote_service.price_line pl
      join quote_service.product_model pm on pm.id = pl.model_id
      join quote_service.price_book pb on pb.id = pl.price_book_id
     where pb.code = $1 and pm.is_active
     order by pm.covers_upto_kva asc
  `, [MRP_BOOK]);

  if (!models.length) {
    console.error(`✗ no price lines under '${MRP_BOOK}' — run migrate_quote_01.ts first`);
    process.exitCode = 1;
    return;
  }
  console.log(`  ${models.length} model(s) in the book\n`);

  const plans: Plan[] = [];
  for (const m of models) {
    const mrp = Number(m.mrp);
    plans.push(await planFor(m.model_code, mrp));
    for (const y of AMC_TERMS) {
      plans.push(await planFor(
        `${m.model_code}-AMC-${y}Y`,
        Math.round(mrp * AMC_PCT / 100) * y));
    }
  }

  const changing = plans.filter(p => p.have !== null && p.have !== p.want);
  const missing = plans.filter(p => p.have === null);
  const dupes = plans.filter(p => p.extra > 0);

  if (changing.length) {
    console.log(`  ${changing.length} price(s) to CHANGE:`);
    for (const p of changing) {
      const dir = p.want > (p.have ?? 0) ? '↑' : '↓';
      console.log(`    ${dir} ${p.code.padEnd(20)} ${inr(p.have!)}  ->  ${inr(p.want)}`);
    }
  } else {
    console.log('  No existing price differs from the book.');
  }

  if (missing.length) {
    console.log(`\n  ${missing.length} item(s) with NO price on ${PRICE_LIST} — will be created:`);
    for (const p of missing) console.log(`    + ${p.code.padEnd(20)} ${inr(p.want)}`);
  }

  if (dupes.length) {
    console.log(`\n  ⚠ ${dupes.length} item(s) have MORE THAN ONE selling price on this list.`);
    console.log('    Only the first is updated; ERPNext may quote from either.');
    for (const p of dupes) console.log(`      · ${p.code} (${p.extra + 1} rows)`);
  }

  if (!changing.length && !missing.length) {
    console.log('\n✔ ERPNext already matches the price book — nothing to do.');
    return;
  }

  if (!CONFIRMED) {
    console.log('\n  DRY RUN — nothing written.');
    console.log('  Re-run with CONFIRM_REPRICE=1 to apply.');
    return;
  }

  console.log('\n  applying…');
  let updated = 0, created = 0, failed = 0;

  for (const p of changing) {
    const r = await call('PUT', `/api/resource/Item Price/${encodeURIComponent(p.rowName!)}`,
      { price_list_rate: p.want });
    if (r.ok) { updated++; console.log(`    ✓ ${p.code} -> ${inr(p.want)}`); }
    else {
      failed++;
      console.log(`    ✗ ${p.code}: ${String(r.json?.exception ?? r.text).replace(/\s+/g, ' ').slice(0, 160)}`);
    }
  }

  for (const p of missing) {
    const r = await call('POST', '/api/resource/Item Price', {
      doctype: 'Item Price',
      item_code: p.code,
      price_list: PRICE_LIST,
      price_list_rate: p.want,
      currency: 'INR',
      selling: 1,
    });
    if (r.ok) { created++; console.log(`    + ${p.code} = ${inr(p.want)}`); }
    else {
      failed++;
      // A missing AMC item is normal on a site where the matrix was never
      // run; say so rather than reporting it as a pricing failure.
      const why = String(r.json?.exception ?? r.text).replace(/\s+/g, ' ');
      const hint = /not found|does not exist/i.test(why) && p.code.includes('-AMC-')
        ? '  (run erp_create_amc_matrix.ts first)' : '';
      console.log(`    ✗ ${p.code}: ${why.slice(0, 140)}${hint}`);
    }
  }

  console.log(`\n✔ ${updated} updated, ${created} created` + (failed ? `, ${failed} failed` : ''));
  console.log('  Existing quotations are unaffected — they carry the rate they were raised at.');
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());

/// <reference types="node" />
// =====================================================================
// erp_discount_probe.ts — how does ERPNext actually want a line discount?
//
//   npx tsx src/db/erp_discount_probe.ts
//   KEEP=1 npx tsx src/db/erp_discount_probe.ts   # leave the drafts
//
// Creates the SAME one-line quotation five ways, prints what ERPNext
// stored for each, then DELETES every draft it made. Nothing is submitted.
//
// The question: we send price_list_rate plus a discount and expect the
// printed line to show list, discount and net separately. Something is
// landing in `rate` instead, so the discount columns read zero.
//
// ERPNext recalculates on insert, and which fields it honours depends on
// which others are present. These five combinations cover the plausible
// answers rather than betting on one.
// =====================================================================

import 'dotenv/config';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;
const COMPANY = process.env.ERP_COMPANY ?? 'SGT Hydroedge Private Limited';
const PRICE_LIST = process.env.ERP_SELLING_PRICE_LIST ?? 'Standard Selling';
const ITEM = process.env.PROBE_ITEM ?? 'GreenX-25';
const KEEP = process.env.KEEP === '1';

if (!BASE || !KEY || !SECRET) {
  console.error('✗ ERPNEXT_URL / ERPNEXT_API_KEY / ERPNEXT_API_SECRET must be set');
  process.exit(1);
}
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

const money = (v: any) =>
  v == null ? '—' : '₹' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 });

async function main() {
  console.log(`▶ Discount probe — ${BASE}\n`);

  // A customer to hang the drafts on.
  const cust = await call('GET',
    `/api/resource/Customer?fields=${encodeURIComponent('["name"]')}&limit_page_length=1`);
  const customer = cust.json?.data?.[0]?.name;
  if (!customer) { console.error('✗ no customer to test with'); process.exit(1); }

  // The list price we are discounting from.
  const ip = await call('GET',
    `/api/resource/${encodeURIComponent('Item Price')}?filters=` +
    encodeURIComponent(JSON.stringify([['item_code', '=', ITEM], ['price_list', '=', PRICE_LIST]])) +
    `&fields=${encodeURIComponent('["price_list_rate"]')}&limit_page_length=1`);
  const list = Number(ip.json?.data?.[0]?.price_list_rate ?? 0);
  if (!list) { console.error(`✗ no Item Price for ${ITEM} in ${PRICE_LIST}`); process.exit(1); }

  const PCT = 5;
  const AMT = Math.round(list * PCT / 100);
  console.log(`  ${ITEM} lists at ${money(list)}. Testing ${PCT}% / ${money(AMT)} per unit.`);
  console.log(`  Expect: list ${money(list)}, discount ${money(AMT)}, net ${money(list - AMT)}\n`);

  const today = new Date().toISOString().slice(0, 10);
  const base = (item: Record<string, unknown>) => ({
    doctype: 'Quotation',
    quotation_to: 'Customer',
    party_name: customer,
    company: COMPANY,
    currency: 'INR',
    selling_price_list: PRICE_LIST,
    transaction_date: today,
    items: [{ item_code: ITEM, qty: 1, gst_treatment: 'Taxable', ...item }],
  });

  const variants: [string, any][] = [
    ['A  price_list_rate + discount_percentage',
      base({ price_list_rate: list, discount_percentage: PCT })],
    ['B  price_list_rate + discount_amount  (what we send now)',
      base({ price_list_rate: list, discount_amount: AMT })],
    ['C  price_list_rate + discount_amount + rate',
      base({ price_list_rate: list, discount_amount: AMT, rate: list - AMT })],
    ['D  discount_percentage only, no price_list_rate',
      base({ discount_percentage: PCT })],
    ['E  discount_amount only, no price_list_rate',
      base({ discount_amount: AMT })],
  ];

  const made: string[] = [];
  for (const [label, doc] of variants) {
    const r = await call('POST', '/api/resource/Quotation', doc);
    if (!r.ok) {
      const why = r.json?.exception ?? r.text.slice(0, 150);
      console.log(`  ${label}\n     ✗ HTTP ${r.status} — ${String(why).replace(/\s+/g, ' ').slice(0, 150)}`);
      continue;
    }
    const d = r.json.data;
    made.push(d.name);
    const it = (d.items ?? [])[0] ?? {};
    const good =
      Math.abs(Number(it.price_list_rate) - list) < 1 &&
      Math.abs(Number(it.discount_amount) - AMT) < 2 &&
      Math.abs(Number(it.rate) - (list - AMT)) < 2;
    console.log(`  ${label}   ${good ? '  ✓ CORRECT' : ''}`);
    console.log(`     list=${money(it.price_list_rate)}  disc%=${it.discount_percentage}` +
                `  discAmt=${money(it.discount_amount)}  rate=${money(it.rate)}` +
                `  net=${money(d.net_total)}`);
  }

  console.log('');
  if (KEEP) {
    console.log(`  KEEP=1 — leaving ${made.length} draft(s): ${made.join(', ')}`);
  } else {
    for (const n of made) {
      const del = await call('DELETE', `/api/resource/Quotation/${encodeURIComponent(n)}`);
      console.log(del.ok ? `  deleted ${n}` : `  ⚠ could not delete ${n} — remove it by hand`);
    }
  }

  console.log('\n' + '─'.repeat(66));
  console.log('The variant marked CORRECT is the shape to send. If only the');
  console.log('percentage variants work, an entered rupee amount has to be');
  console.log('converted to a percentage before it reaches ERPNext.');
  console.log('─'.repeat(66));
}

main().catch(e => { console.error(e); process.exit(1); });

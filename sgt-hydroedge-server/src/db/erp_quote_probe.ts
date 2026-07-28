/// <reference types="node" />
// =====================================================================
// erp_quote_probe.ts — find out empirically how ERPNext wants tax rows.
//
// We are guessing about why `taxes: []` comes back. This stops the
// guessing: it POSTs the SAME quotation four different ways, prints what
// ERPNext stored for each, and then DELETES every draft it made.
//
// Nothing is submitted. Every document created here is a draft and is
// removed at the end unless you pass KEEP=1.
//
//   npx tsx src/db/erp_quote_probe.ts
//   KEEP=1 npx tsx src/db/erp_quote_probe.ts    # leave them for inspection
//
// The variants differ only in how the child rows are shaped:
//
//   A  taxes_and_charges + plain tax row objects      (what we send today)
//   B  ... plus doctype on each child row             (Frappe sometimes
//                                                      needs the child
//                                                      doctype named)
//   C  ... plus parentfield / parenttype
//   D  taxes_and_charges alone, no rows               (control — proves
//                                                      whether the server
//                                                      expands it itself)
// =====================================================================

import 'dotenv/config';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;
const COMPANY = process.env.ERP_COMPANY ?? 'SGT Hydroedge Private Limited';
const PRICE_LIST = process.env.ERP_SELLING_PRICE_LIST ?? 'Standard Selling';
const IN_STATE = process.env.ERP_TAX_IN_STATE ?? 'Output GST In-state - SGT';
const ITEM = process.env.PROBE_ITEM ?? 'GreenX-125';
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
  try { json = JSON.parse(text); } catch { /* non-JSON error page */ }
  return { ok: res.ok, status: res.status, json, text };
}

async function main() {
  console.log(`▶ Quotation tax probe — ${BASE}\n`);

  // ---- A customer in SGT's own state, so CGST+SGST is what should apply.
  const company = await call('GET',
    `/api/resource/Company/${encodeURIComponent(COMPANY)}`);
  const homeGstin = String(company.json?.data?.gstin ?? '').trim();
  const homeState = homeGstin.slice(0, 2) || '27';
  console.log(`  company GSTIN ${homeGstin || '(none)'} → home state ${homeState}`);

  const cust = await call('GET',
    `/api/resource/Customer?fields=${encodeURIComponent('["name","gstin"]')}` +
    `&filters=${encodeURIComponent(`[["gstin","like","${homeState}%"]]`)}&limit_page_length=1`);
  const customer = cust.json?.data?.[0];
  if (!customer) {
    console.error(`✗ No customer with a ${homeState}* GSTIN to test in-state tax against.`);
    process.exit(1);
  }
  console.log(`  customer: ${customer.name} (${customer.gstin})\n`);

  // ---- The rows, from Frappe's own expander -------------------------
  const exp = await call('GET',
    `/api/method/erpnext.controllers.accounts_controller.get_taxes_and_charges` +
    `?master_doctype=${encodeURIComponent('Sales Taxes and Charges Template')}` +
    `&master_name=${encodeURIComponent(IN_STATE)}`);
  const raw = exp.json?.message ?? [];
  console.log(`  expander returned ${raw.length} row(s) for "${IN_STATE}"`);
  if (!raw.length) { console.error('✗ nothing to send — stop here'); process.exit(1); }

  const base = raw.map((t: any) => ({
    charge_type: t.charge_type,
    account_head: t.account_head,
    description: t.description,
    rate: t.rate,
    cost_center: t.cost_center,
    included_in_print_rate: t.included_in_print_rate ?? 0,
    ...(t.gst_tax_type ? { gst_tax_type: t.gst_tax_type } : {}),
  }));

  const today = new Date().toISOString().slice(0, 10);
  const mkDoc = (taxes: any[] | null) => ({
    doctype: 'Quotation',
    quotation_to: 'Customer',
    party_name: customer.name,
    company: COMPANY,
    currency: 'INR',
    selling_price_list: PRICE_LIST,
    transaction_date: today,
    taxes_and_charges: IN_STATE,
    items: [{ item_code: ITEM, qty: 1, gst_treatment: 'Taxable' }],
    ...(taxes ? { taxes } : {}),
  });

  const variants: [string, any][] = [
    ['A  plain rows (current)', mkDoc(base)],
    ['B  + doctype on rows', mkDoc(base.map((t: any) => ({ ...t, doctype: 'Sales Taxes and Charges' })))],
    ['C  + parentfield/parenttype', mkDoc(base.map((t: any) => ({
      ...t, doctype: 'Sales Taxes and Charges', parentfield: 'taxes', parenttype: 'Quotation',
    })))],
    ['D  template only, no rows (control)', mkDoc(null)],
  ];

  const made: string[] = [];
  console.log('');
  for (const [label, doc] of variants) {
    const r = await call('POST', '/api/resource/Quotation', doc);
    if (!r.ok) {
      const why = r.json?.exception ?? r.text.slice(0, 160);
      console.log(`  ${label}\n     ✗ HTTP ${r.status} — ${String(why).replace(/\s+/g, ' ').slice(0, 170)}`);
      continue;
    }
    const d = r.json.data;
    made.push(d.name);
    const rows = d.taxes ?? [];
    const item = (d.items ?? [])[0] ?? {};
    console.log(`  ${label}`);
    console.log(`     ${d.name} · tax rows=${rows.length} · total tax=${d.total_taxes_and_charges}` +
                ` · grand=${d.grand_total}`);
    console.log(`     item gst_treatment=${item.gst_treatment} cgst=${item.cgst_rate} sgst=${item.sgst_rate} igst=${item.igst_rate}`);
    for (const t of rows) console.log(`       ↳ ${t.description} ${t.rate}% = ${t.tax_amount}`);
  }

  // ---- Clean up ------------------------------------------------------
  console.log('');
  if (KEEP) {
    console.log(`  KEEP=1 — leaving ${made.length} draft(s): ${made.join(', ')}`);
  } else {
    for (const name of made) {
      const del = await call('DELETE', `/api/resource/Quotation/${encodeURIComponent(name)}`);
      console.log(del.ok ? `  deleted ${name}` : `  ⚠ could not delete ${name} (HTTP ${del.status}) — remove it by hand`);
    }
  }

  console.log('\n' + '─'.repeat(64));
  console.log('Whichever variant shows non-zero total tax is the shape to use.');
  console.log('If ALL are zero including D, the server is rejecting the rows and');
  console.log('the next step is a whitelisted method rather than the REST resource.');
  console.log('─'.repeat(64));
}

main().catch(e => { console.error(e); process.exit(1); });

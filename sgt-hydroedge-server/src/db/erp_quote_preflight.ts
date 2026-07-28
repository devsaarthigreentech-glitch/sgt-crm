// =====================================================================
// erp_quote_preflight.ts
// READ-ONLY report on whether ERPNext can own quotations yet.
//
// The owner chose ERPNext as the system of record for quotations. That
// only works if a set of masters already exist there — a Quotation needs
// real item codes, a price list, a tax template and (for the commission
// model) a Sales Partner. None of that can be assumed, and creating any
// of it is a decision about SGT's ERPNext masters, not something this
// module should do behind the owner's back.
//
// So: this script only LOOKS. It writes nothing. Run it, read the
// report, and decide what to create.
//
// Run:  npx tsx src/db/erp_quote_preflight.ts
// =====================================================================

/// <reference types="node" />
// The reference above is load-bearing: unlike the migrations, this file does
// not import `pg`, which is what transitively pulls @types/node in everywhere
// else. Without it `process` and `fetch` are untyped.

import 'dotenv/config';

const BASE = process.env.ERPNEXT_URL;
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;

if (!BASE || !KEY || !SECRET) {
  console.error('✗ ERPNEXT_URL / ERPNEXT_API_KEY / ERPNEXT_API_SECRET must be set in .env');
  process.exit(1);
}

const headers = {
  Authorization: `token ${KEY}:${SECRET}`,
  Accept: 'application/json',
};

type Row = Record<string, any>;

async function get(doctype: string, params: Record<string, unknown> = {}): Promise<Row[] | null> {
  const url = new URL(`${BASE}/api/resource/${encodeURIComponent(doctype)}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  try {
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      const body = await res.text();
      console.log(`   ⚠ ${doctype}: HTTP ${res.status} — ${body.slice(0, 140).replace(/\s+/g, ' ')}`);
      return null;
    }
    return (await res.json()).data as Row[];
  } catch (e: any) {
    console.log(`   ⚠ ${doctype}: ${String(e?.message ?? e).slice(0, 140)}`);
    return null;
  }
}

// The 23 GreenX model codes the catalogue expects to find as ERPNext items.
const MODELS = [
  'GreenX-25', 'GreenX-30', 'GreenX-40', 'GreenX-50', 'GreenX-60', 'GreenX-80',
  'GreenX-100', 'GreenX-125', 'GreenX-160', 'GreenX-180', 'GreenX-200', 'GreenX-250',
  'GreenX-320', 'GreenX-400', 'GreenX-500', 'GreenX-650', 'GreenX-750', 'GreenX-1000',
  'GreenX-1250', 'GreenX-1500', 'GreenX-1800', 'GreenX-2000', 'GreenX-2500',
];

async function main() {
  console.log(`▶ ERPNext quotation preflight — ${BASE}\n`);
  const todo: string[] = [];

  // ---- 1. Can we even talk to it, and is Quotation readable? ----------
  console.log('1. Connectivity and Quotation access');
  const quotes = await get('Quotation', { fields: ['name'], limit_page_length: 1 });
  if (quotes === null) {
    console.log('   ✗ Cannot read the Quotation doctype. Check the API key\'s role permissions.');
    todo.push('Grant the API user read+write on Quotation');
  } else {
    console.log(`   ✓ Quotation readable (${quotes.length ? 'existing quotations found' : 'none yet'})`);
  }

  // ---- 2. Company ------------------------------------------------------
  console.log('\n2. Company');
  const companies = await get('Company', { fields: ['name', 'abbr', 'default_currency', 'country'] });
  if (companies?.length) {
    for (const c of companies) {
      console.log(`   ✓ ${c.name} (${c.abbr}) · ${c.default_currency} · ${c.country}`);
    }
    if (companies.length > 1) {
      todo.push(`More than one Company (${companies.length}) — decide which issues quotations`);
    }
  } else {
    todo.push('No Company found — quotations cannot be created without one');
  }

  // ---- 3. GreenX items -------------------------------------------------
  console.log('\n3. GreenX items (a Quotation line needs a real item_code)');
  const items = await get('Item', {
    filters: [['item_name', 'like', '%GreenX%']],
    fields: ['name', 'item_name', 'item_group', 'stock_uom', 'is_sales_item', 'gst_hsn_code'],
    limit_page_length: 100,
  });
  if (items === null) {
    todo.push('Could not read Item — check permissions');
  } else if (items.length === 0) {
    console.log('   ✗ No items matching "GreenX" exist.');
    console.log(`     All ${MODELS.length} models would need creating before any quotation can be raised.`);
    todo.push(`Create ${MODELS.length} GreenX items in the Item master (or map to existing codes)`);
  } else {
    console.log(`   Found ${items.length} GreenX-ish item(s):`);
    for (const i of items.slice(0, 30)) {
      console.log(`     · ${i.name}  [${i.item_group}]  uom=${i.stock_uom}  hsn=${i.gst_hsn_code ?? '—'}`);
    }
    const present = new Set(items.map(i => String(i.name)));
    const missing = MODELS.filter(m => !present.has(m));
    if (missing.length) {
      console.log(`   ⚠ ${missing.length} of ${MODELS.length} expected codes not found by exact name:`);
      console.log(`     ${missing.join(', ')}`);
      todo.push(`Reconcile item codes — ${missing.length} of ${MODELS.length} GreenX models have no exact match`);
    } else {
      console.log(`   ✓ All ${MODELS.length} model codes present`);
    }
  }

  // ---- 4. Price lists --------------------------------------------------
  console.log('\n4. Price lists');
  const lists = await get('Price List', { fields: ['name', 'currency', 'selling', 'buying', 'enabled'] });
  if (lists?.length) {
    for (const l of lists) {
      console.log(`   · ${l.name} · ${l.currency} · selling=${l.selling} buying=${l.buying} enabled=${l.enabled}`);
    }
    const selling = lists.filter(l => l.selling);
    if (!selling.length) todo.push('No selling price list — a Quotation needs one');
  } else {
    todo.push('No Price List found');
  }

  const prices = await get('Item Price', {
    filters: [['item_code', 'like', '%GreenX%']],
    fields: ['item_code', 'price_list', 'price_list_rate'],
    limit_page_length: 60,
  });
  if (prices === null) {
    console.log('   ⚠ Could not read Item Price');
  } else if (prices.length === 0) {
    console.log('   ✗ No Item Price rows for GreenX.');
    console.log('     Rates can still be pushed per quotation line, but ERPNext would not own pricing.');
    todo.push('Decide: mirror the MRP price book into Item Price, or send rates per line');
  } else {
    console.log(`   ✓ ${prices.length} GreenX Item Price row(s)`);
  }

  // ---- 5. Sales Partner — the commission model -------------------------
  console.log('\n5. Sales Partner (how the partner\'s share is recorded)');
  const partners = await get('Sales Partner', {
    fields: ['name', 'partner_name', 'commission_rate'],
    limit_page_length: 50,
  });
  if (partners === null) {
    todo.push('Could not read Sales Partner — check permissions');
  } else if (partners.length === 0) {
    console.log('   ✗ None defined.');
    console.log('     Quotation.sales_partner + commission_rate is how SGT-direct billing records');
    console.log('     the distributor\'s 40.48% share. Without it, commission has nowhere to live.');
    todo.push('Create a Sales Partner per approved partner org (EDINGX001 first)');
  } else {
    for (const p of partners) {
      console.log(`   · ${p.name} · ${p.partner_name} · commission ${p.commission_rate}%`);
    }
  }

  // ---- 6. Tax templates ------------------------------------------------
  console.log('\n6. Sales tax templates (CGST/SGST vs IGST)');
  const taxes = await get('Sales Taxes and Charges Template', {
    fields: ['name', 'is_default', 'company'],
    limit_page_length: 30,
  });
  if (taxes?.length) {
    for (const t of taxes) console.log(`   · ${t.name}${t.is_default ? ' (default)' : ''}`);
    const hasIn = taxes.some(t => /in.?state|cgst|sgst/i.test(String(t.name)));
    const hasOut = taxes.some(t => /out.?state|igst|inter/i.test(String(t.name)));
    if (!hasIn || !hasOut) {
      todo.push('Confirm in-state (CGST+SGST) and inter-state (IGST) templates both exist');
    }
  } else {
    todo.push('No sales tax templates — GST would have to be pushed per quotation');
  }

  // ---- 7. Defaults ensureErpCustomer already relies on ------------------
  console.log('\n7. Customer defaults used by the existing ensureErpCustomer()');
  for (const [dt, want] of [
    ['Customer Group', process.env.ERP_CUSTOMER_GROUP ?? 'Commercial'],
    ['Territory', process.env.ERP_TERRITORY ?? 'India'],
  ] as const) {
    const rows = await get(dt, { filters: [['name', '=', want]], fields: ['name'] });
    console.log(rows?.length ? `   ✓ ${dt} "${want}" exists` : `   ✗ ${dt} "${want}" NOT found`);
    if (!rows?.length) todo.push(`${dt} "${want}" missing — ensureErpCustomer() will fail`);
  }

  // ---- Verdict ---------------------------------------------------------
  console.log('\n' + '─'.repeat(66));
  if (todo.length === 0) {
    console.log('✔ ERPNext looks ready to own quotations. Nothing blocking.');
  } else {
    console.log(`⚠ ${todo.length} thing(s) to resolve before quotations can be created:\n`);
    todo.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
    console.log('\nEach is a change to SGT\'s ERPNext masters, so they are listed rather than');
    console.log('done automatically. Tell me which you want scripted and I will write it.');
  }
  console.log('─'.repeat(66));
}

main().catch(e => { console.error(e); process.exit(1); });

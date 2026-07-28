/// <reference types="node" />
// =====================================================================
// erp_tax_diagnose.ts — READ-ONLY. Why did a created Quotation come back
// with taxes: [] and gst_treatment "Nil-Rated"?
//
// Writes nothing. It answers three questions:
//
//   1. Do the GST templates actually contain tax rows, and what shape?
//   2. Does Frappe's own get_taxes_and_charges method work for us?
//      (That is the canonical way to expand a template; copying the doc
//      by hand is the fallback.)
//   3. What do the tax rows look like on a quotation that DID get GST —
//      one made in the ERPNext UI? Comparing against a known-good
//      document beats reasoning about it.
//
// Run:  npx tsx src/db/erp_tax_diagnose.ts
// =====================================================================

import 'dotenv/config';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;
const IN_STATE = process.env.ERP_TAX_IN_STATE ?? 'Output GST In-state - SGT';
const OUT_STATE = process.env.ERP_TAX_OUT_STATE ?? 'Output GST Out-state - SGT';

if (!BASE || !KEY || !SECRET) {
  console.error('✗ ERPNEXT_URL / ERPNEXT_API_KEY / ERPNEXT_API_SECRET must be set');
  process.exit(1);
}
const headers = { Authorization: `token ${KEY}:${SECRET}`, Accept: 'application/json' };

async function raw(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function main() {
  console.log(`▶ GST diagnosis — ${BASE}\n`);

  // ---- 1. The templates themselves -----------------------------------
  console.log('1. Do the templates contain tax rows?');
  for (const t of [IN_STATE, OUT_STATE]) {
    const r = await raw(`/api/resource/${encodeURIComponent('Sales Taxes and Charges Template')}/${encodeURIComponent(t)}`);
    if (!r.ok) {
      console.log(`   ✗ ${t}: HTTP ${r.status} — ${r.text.slice(0, 200).replace(/\s+/g, ' ')}`);
      console.log('     ^ THIS is why the copy failed. Likely a permission on the template doctype.');
      continue;
    }
    const doc = JSON.parse(r.text).data;
    const rows = doc.taxes ?? [];
    console.log(`   ✓ ${t}: ${rows.length} row(s), company=${doc.company}, disabled=${doc.disabled ?? 0}`);
    for (const x of rows) {
      console.log(`       charge_type=${x.charge_type} | rate=${x.rate} | account=${x.account_head}`);
      console.log(`       description=${JSON.stringify(x.description)} cost_center=${x.cost_center ?? '—'}`);
    }
  }

  // ---- 2. Frappe's own expander ---------------------------------------
  console.log('\n2. Frappe get_taxes_and_charges (the canonical expansion)');
  const m = await raw(
    `/api/method/erpnext.controllers.accounts_controller.get_taxes_and_charges` +
    `?master_doctype=${encodeURIComponent('Sales Taxes and Charges Template')}` +
    `&master_name=${encodeURIComponent(IN_STATE)}`);
  if (m.ok) {
    const rows = JSON.parse(m.text).message ?? [];
    console.log(`   ✓ returned ${rows.length} row(s)`);
    if (rows[0]) console.log(`     keys: ${Object.keys(rows[0]).join(', ')}`);
  } else {
    console.log(`   ✗ HTTP ${m.status} — ${m.text.slice(0, 200).replace(/\s+/g, ' ')}`);
  }

  // ---- 3. A known-good quotation ---------------------------------------
  console.log('\n3. A quotation that DID get GST (made in the ERPNext UI)');
  const list = await raw(
    `/api/resource/Quotation?fields=${encodeURIComponent('["name","total_taxes_and_charges","taxes_and_charges"]')}` +
    `&filters=${encodeURIComponent('[["total_taxes_and_charges",">",0]]')}` +
    `&limit_page_length=3&order_by=${encodeURIComponent('creation desc')}`);
  if (!list.ok) {
    console.log(`   ✗ HTTP ${list.status}`);
  } else {
    const rows = JSON.parse(list.text).data ?? [];
    if (!rows.length) {
      console.log('   (none found — no quotation in this site has non-zero tax to compare against)');
    }
    for (const q of rows) {
      const d = await raw(`/api/resource/Quotation/${encodeURIComponent(q.name)}`);
      if (!d.ok) continue;
      const doc = JSON.parse(d.text).data;
      console.log(`   ${doc.name} · template=${doc.taxes_and_charges} · tax total=${doc.total_taxes_and_charges}`);
      for (const t of doc.taxes ?? []) {
        console.log(`     tax row: charge_type=${t.charge_type} rate=${t.rate} account=${t.account_head}`);
        console.log(`              included_in_print_rate=${t.included_in_print_rate} description=${JSON.stringify(t.description)}`);
      }
      const it = (doc.items ?? [])[0];
      if (it) {
        console.log(`     item ${it.item_code}: gst_treatment=${it.gst_treatment} ` +
                    `cgst=${it.cgst_rate} sgst=${it.sgst_rate} igst=${it.igst_rate}`);
        console.log(`              item_tax_template=${it.item_tax_template ?? '—'} item_tax_rate=${it.item_tax_rate}`);
      }
      break; // one is enough to compare against
    }
  }

  // ---- 4. Do OUR items carry an Item Tax Template? ---------------------
  console.log('\n4. Item Tax Template on our catalogue items vs an existing one');
  for (const code of ['GreenX-125', 'Saarthi GreenX-625']) {
    const r = await raw(`/api/resource/Item/${encodeURIComponent(code)}`);
    if (!r.ok) { console.log(`   ${code}: HTTP ${r.status}`); continue; }
    const doc = JSON.parse(r.text).data;
    const taxes = doc.taxes ?? [];
    console.log(`   ${code}: ${taxes.length} item tax row(s)` +
                ` · is_nil_exempt=${doc.is_nil_exempt ?? 0} is_non_gst=${doc.is_non_gst ?? 0}` +
                ` · hsn=${doc.gst_hsn_code}`);
    for (const t of taxes) console.log(`       item_tax_template=${t.item_tax_template}`);
  }

  console.log('\n' + '─'.repeat(64));
  console.log('Read section 1 first: if the templates have rows but our POST sent none,');
  console.log('the copy failed. If an existing quotation shows item_tax_template set and');
  console.log('ours does not, the item master is what makes it Nil-Rated.');
  console.log('─'.repeat(64));
}

main().catch(e => { console.error(e); process.exit(1); });

/// <reference types="node" />
// =====================================================================
// erp_pdf_diagnose.ts — READ-ONLY. Why is the quotation PDF 502-ing?
//
// Our route returns 502 whenever ERPNext's render fails, which tells you
// nothing. This asks ERPNext directly and prints the real answer.
//
//   npx tsx src/db/erp_pdf_diagnose.ts                    # newest quotation
//   npx tsx src/db/erp_pdf_diagnose.ts SAL-QTN-2026-00036 # a specific one
//
// Writes nothing.
// =====================================================================

import 'dotenv/config';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;

if (!BASE || !KEY || !SECRET) {
  console.error('✗ ERPNEXT_URL / ERPNEXT_API_KEY / ERPNEXT_API_SECRET must be set');
  process.exit(1);
}
const headers = { Authorization: `token ${KEY}:${SECRET}` };

async function probe(label: string, url: string) {
  try {
    const res = await fetch(url, { headers: { ...headers, Accept: '*/*' } });
    const ct = res.headers.get('content-type') ?? '';
    const len = res.headers.get('content-length') ?? '?';
    if (res.ok && ct.includes('pdf')) {
      const buf = await res.arrayBuffer();
      const head = Buffer.from(buf.slice(0, 5)).toString('latin1');
      console.log(`   ✓ ${label}`);
      console.log(`     HTTP ${res.status} · ${ct} · ${buf.byteLength} bytes · starts "${head}"`);
      return true;
    }
    const text = await res.text();
    let detail = text.slice(0, 400).replace(/\s+/g, ' ');
    try {
      const j = JSON.parse(text);
      detail = String(j.exception ?? j.message ?? j._server_messages ?? detail);
    } catch { /* keep raw */ }
    console.log(`   ✗ ${label}`);
    console.log(`     HTTP ${res.status} · ${ct} · len=${len}`);
    console.log(`     ${detail.slice(0, 350)}`);
    return false;
  } catch (e: any) {
    console.log(`   ✗ ${label}\n     threw: ${String(e?.message ?? e).slice(0, 250)}`);
    return false;
  }
}

async function main() {
  console.log(`▶ PDF diagnosis — ${BASE}\n`);

  // ---- Which quotation ------------------------------------------------
  let name = process.argv[2];
  if (!name) {
    const r = await fetch(
      `${BASE}/api/resource/Quotation?fields=${encodeURIComponent('["name"]')}` +
      `&limit_page_length=1&order_by=${encodeURIComponent('creation desc')}`, { headers });
    const rows = (await r.json()).data ?? [];
    name = rows[0]?.name;
  }
  if (!name) { console.error('✗ no quotation to test with'); process.exit(1); }
  console.log(`  testing with ${name}\n`);

  // ---- Print formats available ----------------------------------------
  console.log('1. Print Formats for Quotation');
  const pf = await fetch(
    `${BASE}/api/resource/${encodeURIComponent('Print Format')}` +
    `?filters=${encodeURIComponent('[["doc_type","=","Quotation"]]')}` +
    `&fields=${encodeURIComponent('["name","disabled","print_format_type"]')}&limit_page_length=30`,
    { headers });
  const formats: any[] = pf.ok ? ((await pf.json()).data ?? []) : [];
  if (!formats.length) console.log('   (none defined — ERPNext falls back to the Standard format)');
  for (const f of formats) {
    console.log(`   · ${f.name} · type=${f.print_format_type ?? '—'} · disabled=${f.disabled ?? 0}`);
  }

  // ---- The call we actually make ---------------------------------------
  console.log('\n2. download_pdf — exactly what the server calls');
  const dl = (extra: string) =>
    `${BASE}/api/method/frappe.utils.print_format.download_pdf` +
    `?doctype=Quotation&name=${encodeURIComponent(name!)}${extra}`;
  const okPlain = await probe('no format, no_letterhead=0', dl('&no_letterhead=0'));

  // ---- Alternatives, if that failed ------------------------------------
  if (!okPlain) {
    console.log('\n3. Alternatives');
    await probe('format=Standard', dl('&format=Standard&no_letterhead=0'));
    for (const f of formats.filter(x => !x.disabled).slice(0, 3)) {
      await probe(`format=${f.name}`, dl(`&format=${encodeURIComponent(f.name)}&no_letterhead=0`));
    }
    await probe('no_letterhead=1', dl('&no_letterhead=1'));
    await probe('printview via /printview',
      `${BASE}/printview?doctype=Quotation&name=${encodeURIComponent(name)}&format=Standard&no_letterhead=0`);
  }

  console.log('\n' + '─'.repeat(64));
  console.log('A PermissionError means the API key\'s role lacks Print on Quotation.');
  console.log('A wkhtmltopdf / OSError means the PDF binary is missing on the site.');
  console.log('If one of the alternatives worked, set ERP_QUOTE_PRINT_FORMAT to it.');
  console.log('─'.repeat(64));
}

main().catch(e => { console.error(e); process.exit(1); });

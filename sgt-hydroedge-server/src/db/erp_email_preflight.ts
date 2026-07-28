/// <reference types="node" />
// =====================================================================
// erp_email_preflight.ts — READ-ONLY. Can ERPNext send the quotation?
//
//   npx tsx src/db/erp_email_preflight.ts
//
// Sends nothing, writes nothing. It answers whether ERPNext already has
// what it needs to email a quotation with the PDF attached, which decides
// whether we route mail through ERPNext or through n8n.
// =====================================================================

import 'dotenv/config';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;

if (!BASE || !KEY || !SECRET) {
  console.error('✗ ERPNEXT_URL / ERPNEXT_API_KEY / ERPNEXT_API_SECRET must be set');
  process.exit(1);
}
const headers = { Authorization: `token ${KEY}:${SECRET}`, Accept: 'application/json' };

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, json, text };
}

async function main() {
  console.log(`▶ Email preflight — ${BASE}\n`);
  const blockers: string[] = [];

  // ---- 1. An outgoing account ----------------------------------------
  console.log('1. Outgoing email accounts');
  const acc = await get(
    `/api/resource/${encodeURIComponent('Email Account')}` +
    `?fields=${encodeURIComponent('["name","email_id","enable_outgoing","default_outgoing","smtp_server"]')}` +
    `&limit_page_length=30`);
  if (!acc.ok) {
    console.log(`   ⚠ cannot read Email Account (HTTP ${acc.status}) — likely a permission`);
    blockers.push('The API user cannot read Email Account; grant it or use n8n instead');
  } else {
    const rows = acc.json?.data ?? [];
    if (!rows.length) {
      console.log('   ✗ none configured');
      blockers.push('No Email Account in ERPNext — nothing can send');
    }
    for (const a of rows) {
      console.log(`   · ${a.name} <${a.email_id}> · outgoing=${a.enable_outgoing} ` +
                  `default=${a.default_outgoing} · smtp=${a.smtp_server ?? '—'}`);
    }
    const out = rows.filter((a: any) => a.enable_outgoing);
    if (rows.length && !out.length) {
      blockers.push('An Email Account exists but none has outgoing enabled');
    }
    if (out.length && !out.some((a: any) => a.default_outgoing)) {
      blockers.push('No DEFAULT outgoing account — Frappe needs one to pick a sender');
    }
  }

  // ---- 2. Can we reach the send method? -------------------------------
  // Called with no arguments on purpose: a "missing argument" error proves
  // the method exists and is callable. Nothing is sent either way.
  console.log('\n2. The send method');
  const probe = await get('/api/method/frappe.core.doctype.communication.email.make');
  const body = String(probe.json?.exception ?? probe.text ?? '').slice(0, 200).replace(/\s+/g, ' ');
  if (probe.status === 403) {
    console.log('   ✗ 403 — the API user lacks permission to send email');
    blockers.push('API user cannot call communication.email.make');
  } else {
    console.log(`   ✓ reachable (HTTP ${probe.status})`);
    if (body) console.log(`     ${body.slice(0, 150)}`);
  }

  // ---- 3. Where would the CCs come from? ------------------------------
  console.log('\n3. Addresses the send would use');
  const sgt = process.env.QUOTE_CC_SGT ?? '';
  console.log(`   SGT cc  : ${sgt || '(not set — put QUOTE_CC_SGT in .env)'}`);
  if (!sgt) blockers.push('QUOTE_CC_SGT is not set, so SGT would not be copied');

  const orgs = await get(
    `/api/resource/Contact?fields=${encodeURIComponent('["name","email_id"]')}&limit_page_length=1`);
  console.log(`   partner cc: taken from quote_service.org.contact_email at send time`);
  console.log(`   customer  : typed on the send dialog, defaulting to the ERPNext contact`);
  if (!orgs.ok) console.log('   (Contact doctype unreadable — not required, just noted)');

  console.log('\n' + '─'.repeat(64));
  if (!blockers.length) {
    console.log('✔ ERPNext can send. Routing mail through it keeps the sent copy');
    console.log('  logged against the Quotation itself, which n8n cannot do.');
  } else {
    console.log(`⚠ ${blockers.length} thing(s) in the way:\n`);
    blockers.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
    console.log('\nIf the Email Account is the blocker and you would rather not');
    console.log('configure SMTP in ERPNext, n8n is the sensible alternative —');
    console.log('we post the PDF and recipients to a webhook and it sends.');
  }
  console.log('─'.repeat(64));
}

main().catch(e => { console.error(e); process.exit(1); });

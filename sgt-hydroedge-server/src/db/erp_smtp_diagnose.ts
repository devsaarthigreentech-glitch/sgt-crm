/// <reference types="node" />
// =====================================================================
// erp_smtp_diagnose.ts — READ-ONLY. Why is ERPNext not sending mail?
//
//   npx tsx src/db/erp_smtp_diagnose.ts
//
// Sends nothing, changes nothing. It checks the five things that account
// for almost every "I configured SMTP and nothing happened":
//
//   1. Outgoing is enabled AND one account is the default.
//   2. Port and encryption agree — 587 is STARTTLS, 465 is SSL. Setting
//      port 587 with SSL (or 465 with TLS) fails silently-ish.
//   3. No Email Domain is quietly overriding what you typed. If an
//      account is linked to a Domain, the Domain's server settings win
//      and editing the account fields does nothing.
//   4. The Email Queue is actually draining. Frappe does not send inline
//      — it queues, and a background scheduler sends. If the scheduler is
//      paused, mail sits in the queue looking fine forever.
//   5. Nothing is sitting in the queue with an error already.
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

const q = (o: unknown) => encodeURIComponent(JSON.stringify(o));

async function main() {
  console.log(`▶ SMTP diagnosis — ${BASE}\n`);
  const problems: string[] = [];

  // ---- 1. The accounts ------------------------------------------------
  console.log('1. Email Accounts');
  const accs = await get(
    `/api/resource/${encodeURIComponent('Email Account')}?fields=` +
    q(['name', 'email_id', 'domain', 'smtp_server', 'smtp_port', 'use_tls', 'use_ssl',
       'enable_outgoing', 'default_outgoing', 'awaiting_password', 'login_id_is_different',
       'login_id', 'always_use_account_email_id_as_sender']) +
    `&limit_page_length=30`);

  if (!accs.ok) {
    console.log(`   ⚠ cannot read (HTTP ${accs.status})`);
    problems.push('The API user cannot read Email Account — check its role');
  } else {
    const rows = accs.json?.data ?? [];
    if (!rows.length) problems.push('No Email Account exists at all');
    for (const a of rows) {
      console.log(`\n   · ${a.name}  <${a.email_id}>`);
      console.log(`     outgoing=${a.enable_outgoing}  default=${a.default_outgoing}` +
                  `  domain=${a.domain || '(none)'}`);
      console.log(`     smtp=${a.smtp_server || '(none)'}:${a.smtp_port || '(none)'}` +
                  `  tls=${a.use_tls}  ssl=${a.use_ssl}`);
      if (a.login_id_is_different) console.log(`     login_id=${a.login_id}`);
      if (a.awaiting_password) {
        console.log('     ⚠ awaiting_password — the password was never accepted');
        problems.push(`${a.name}: awaiting_password is set, so authentication has not succeeded`);
      }

      if (!a.enable_outgoing) continue;

      // Port vs encryption. This is the single most common misconfiguration.
      const port = Number(a.smtp_port);
      if (port === 587 && a.use_ssl) {
        problems.push(`${a.name}: port 587 with SSL. 587 is STARTTLS — tick "Use TLS", untick SSL`);
      }
      if (port === 465 && a.use_tls) {
        problems.push(`${a.name}: port 465 with TLS. 465 is implicit SSL — tick "Use SSL", untick TLS`);
      }
      if (port && port !== 587 && port !== 465 && port !== 25) {
        console.log(`     note: port ${port} is unusual; 587 (TLS) and 465 (SSL) are the normal ones`);
      }
      if (!a.smtp_server) {
        problems.push(`${a.name}: outgoing is enabled but no SMTP server is set`);
      }
      if (a.domain) {
        console.log(`     ⚠ linked to Email Domain "${a.domain}" — the DOMAIN's server`);
        console.log('       settings win. Editing them on this account has no effect.');
      }
    }
    const out = rows.filter((a: any) => a.enable_outgoing);
    if (rows.length && !out.length) problems.push('No account has "Enable Outgoing" ticked');
    if (out.length && !out.some((a: any) => a.default_outgoing)) {
      problems.push('No account is marked "Default Outgoing" — Frappe cannot pick a sender');
    }
  }

  // ---- 2. Email Domain, if any ----------------------------------------
  console.log('\n2. Email Domains (these override account settings)');
  const doms = await get(
    `/api/resource/${encodeURIComponent('Email Domain')}?fields=` +
    q(['name', 'smtp_server', 'smtp_port', 'use_tls', 'use_ssl']) + `&limit_page_length=20`);
  const domRows = doms.ok ? (doms.json?.data ?? []) : [];
  if (!domRows.length) console.log('   (none — account settings apply directly, which is simpler)');
  for (const d of domRows) {
    console.log(`   · ${d.name}  smtp=${d.smtp_server}:${d.smtp_port}  tls=${d.use_tls} ssl=${d.use_ssl}`);
    if (Number(d.smtp_port) === 587 && d.use_ssl) {
      problems.push(`Email Domain ${d.name}: port 587 with SSL — should be TLS`);
    }
    if (Number(d.smtp_port) === 465 && d.use_tls) {
      problems.push(`Email Domain ${d.name}: port 465 with TLS — should be SSL`);
    }
  }

  // ---- 3. Is the queue draining? --------------------------------------
  // Frappe does NOT send inline. Everything goes to Email Queue and a
  // background job sends it. A paused scheduler looks exactly like
  // "configured correctly but nothing arrives".
  console.log('\n3. Email Queue');
  const queue = await get(
    `/api/resource/${encodeURIComponent('Email Queue')}?fields=` +
    q(['name', 'status', 'error', 'creation', 'reference_doctype']) +
    `&order_by=${encodeURIComponent('creation desc')}&limit_page_length=10`);
  if (!queue.ok) {
    console.log(`   ⚠ cannot read Email Queue (HTTP ${queue.status})`);
  } else {
    const rows = queue.json?.data ?? [];
    if (!rows.length) {
      console.log('   (empty — nothing has ever been queued)');
    }
    for (const e of rows) {
      console.log(`   · ${e.creation?.slice(0, 19)}  ${e.status}` +
                  `${e.reference_doctype ? `  (${e.reference_doctype})` : ''}`);
      if (e.error) {
        console.log(`     error: ${String(e.error).replace(/\s+/g, ' ').slice(0, 220)}`);
      }
    }
    const stuck = rows.filter((e: any) => e.status === 'Not Sent');
    const failed = rows.filter((e: any) => e.status === 'Error');
    if (stuck.length) {
      problems.push(
        `${stuck.length} email(s) stuck at "Not Sent" — the scheduler is probably paused, ` +
        `so the queue is never drained`);
    }
    if (failed.length) {
      problems.push(`${failed.length} email(s) with status Error — see the messages above`);
    }
  }

  // ---- 4. Scheduler ----------------------------------------------------
  console.log('\n4. Scheduler');
  const sched = await get('/api/method/frappe.utils.scheduler.get_scheduler_status');
  if (sched.ok) {
    const st = sched.json?.message;
    console.log(`   ${JSON.stringify(st)}`);
    if (JSON.stringify(st).toLowerCase().includes('inactive') ||
        JSON.stringify(st).toLowerCase().includes('disabled')) {
      problems.push('The scheduler is INACTIVE — queued email will never be sent');
    }
  } else {
    console.log(`   (not readable over the API, HTTP ${sched.status})`);
    console.log('   Check in ERPNext: Settings → System Health, or the Frappe Cloud dashboard.');
  }

  // ---- Verdict ---------------------------------------------------------
  console.log('\n' + '─'.repeat(66));
  if (!problems.length) {
    console.log('✔ Nothing obviously wrong. If mail still does not arrive, the cause is');
    console.log('  usually outside ERPNext: the provider rejecting the sender address');
    console.log('  (SPF/DMARC), or an app-password requirement.');
  } else {
    console.log(`⚠ ${problems.length} thing(s) to fix:\n`);
    problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  }
  console.log('─'.repeat(66));
}

main().catch(e => { console.error(e); process.exit(1); });

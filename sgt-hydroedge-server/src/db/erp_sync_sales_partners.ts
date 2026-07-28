/// <reference types="node" />
// =====================================================================
// erp_sync_sales_partners.ts
// Creates an ERPNext Sales Partner for each approved partner org.
//
// DRY RUN BY DEFAULT.
//
//   npx tsx src/db/erp_sync_sales_partners.ts                  # report
//   CONFIRM_CREATE=1 npx tsx src/db/erp_sync_sales_partners.ts # create
//
// Why this exists
// ---------------
// Under SGT-direct billing SGT invoices the end customer, so the partner
// is not a party to the sale — they earn a commission on it. ERPNext
// models that natively: Quotation and Sales Order carry `sales_partner`,
// `commission_rate` and `total_commission`, and compute the commission
// on the net (ex-GST) total.
//
// That lines up exactly with the rate card, where the dealer margin is
// 40.48% of MRP on an ex-GST basis. So commission_rate defaults to 40.48
// and the arithmetic is ERPNext's, not ours.
//
// Naming: the Sales Partner is named after the partner CODE, not the
// legal name. Codes are unique and stable per org id; legal names are
// neither. Note codes DO change on a dealer-type upgrade — when that
// happens this script creates the new one and reports the old as
// orphaned rather than renaming, because renaming a Sales Partner would
// rewrite history on every quotation already pointing at it.
//
// Existing Sales Partners are never modified.
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const KEY = process.env.ERPNEXT_API_KEY;
const SECRET = process.env.ERPNEXT_API_SECRET;
const DEFAULT_COMMISSION = Number(process.env.ERP_PARTNER_COMMISSION ?? '40.48');
const FALLBACK_TERRITORY = process.env.ERP_TERRITORY ?? 'India';
const CONFIRMED = process.env.CONFIRM_CREATE === '1';

if (!BASE || !KEY || !SECRET) {
  console.error('✗ ERPNEXT_URL / ERPNEXT_API_KEY / ERPNEXT_API_SECRET must be set');
  process.exit(1);
}
if (!Number.isFinite(DEFAULT_COMMISSION) || DEFAULT_COMMISSION < 0 || DEFAULT_COMMISSION > 100) {
  console.error(`✗ ERP_PARTNER_COMMISSION must be 0-100, got "${process.env.ERP_PARTNER_COMMISSION}"`);
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const headers = {
  Authorization: `token ${KEY}:${SECRET}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

async function erpGet(doctype: string, params: Record<string, unknown> = {}) {
  const url = new URL(`${BASE}/api/resource/${encodeURIComponent(doctype)}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`GET ${doctype} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).data as any[];
}

async function erpPost(doctype: string, doc: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/resource/${encodeURIComponent(doctype)}`, {
    method: 'POST', headers, body: JSON.stringify(doc),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${doctype} ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text).data as any;
}

async function main() {
  console.log(CONFIRMED
    ? `▶ Syncing Sales Partners to ${BASE}\n`
    : `▶ DRY RUN — nothing will be created. ${BASE}\n`);

  const { rows: orgs } = await pool.query<{
    id: number; code: string; legal_name: string; org_type: string;
    dealer_type: string | null; territory: string | null; status: string;
  }>(`
    select id, code, legal_name, org_type, dealer_type, territory,
           coalesce(status, case when is_active then 'active' else 'suspended' end) as status
      from quote_service.org
     where org_type in ('distributor','dealer','sub_dealer')
     order by case org_type when 'distributor' then 0 when 'dealer' then 1 else 2 end, code
  `);

  if (!orgs.length) {
    console.log('  No partner orgs yet. Approve a registration first.');
    return;
  }

  // ---- Territory is mandatory on Sales Partner -----------------------
  // Our org.territory is free text ("Rajasthan + sub-dealers across India");
  // ERPNext needs the name of a real Territory record. Resolve properly
  // rather than forcing everyone to the fallback: try the whole string,
  // then the part before the first "+" or "," (which is nearly always the
  // actual state), then fall back.
  const territories = await erpGet('Territory', { fields: ['name'], limit_page_length: 500 });
  const tByLower = new Map(territories.map(t => [String(t.name).toLowerCase(), String(t.name)]));
  if (!tByLower.has(FALLBACK_TERRITORY.toLowerCase())) {
    throw new Error(
      `Fallback Territory "${FALLBACK_TERRITORY}" does not exist in ERPNext. ` +
      `Available: ${territories.map(t => t.name).join(', ').slice(0, 300)}. ` +
      `Set ERP_TERRITORY to one of them.`);
  }

  function resolveTerritory(raw: string | null): { name: string; exact: boolean } {
    const tryers = [
      (raw ?? '').trim(),
      (raw ?? '').split(/[+,;/]/)[0].trim(),
    ].filter(Boolean);
    for (const t of tryers) {
      const hit = tByLower.get(t.toLowerCase());
      if (hit) return { name: hit, exact: true };
    }
    return { name: tByLower.get(FALLBACK_TERRITORY.toLowerCase())!, exact: false };
  }

  const existing = await erpGet('Sales Partner', {
    fields: ['name', 'partner_name', 'commission_rate'], limit_page_length: 200,
  });
  const have = new Map(existing.map(p => [String(p.name), p]));
  console.log(`  ${orgs.length} partner org(s) in the CRM · ${existing.length} Sales Partner(s) in ERPNext\n`);

  const toCreate = orgs.filter(o => o.status === 'active' && !have.has(o.code));
  const already = orgs.filter(o => have.has(o.code));
  const skipped = orgs.filter(o => o.status !== 'active' && !have.has(o.code));

  if (already.length) {
    console.log('  Already present, left untouched:');
    for (const o of already) {
      const p = have.get(o.code)!;
      console.log(`    · ${o.code.padEnd(18)} commission ${p.commission_rate}%`);
    }
    console.log('');
  }
  if (skipped.length) {
    console.log('  Skipped — not active:');
    for (const o of skipped) console.log(`    · ${o.code} (${o.status})`);
    console.log('');
  }

  // A Sales Partner in ERPNext with no matching live org usually means a
  // dealer-type upgrade minted a new code. Worth surfacing, never auto-deleted.
  const codes = new Set(orgs.map(o => o.code));
  const orphans = existing.filter(p => !codes.has(String(p.name)));
  if (orphans.length) {
    console.log('  ⚠ In ERPNext but not a live partner code (probably retired by an upgrade):');
    for (const p of orphans) console.log(`    · ${p.name}`);
    console.log('    Left alone — quotations may still reference them.\n');
  }

  if (!toCreate.length) {
    console.log('✔ Nothing to create.');
    return;
  }

  console.log(`  ${toCreate.length} to create at ${DEFAULT_COMMISSION}% commission:`);
  for (const o of toCreate) {
    const t = resolveTerritory(o.territory);
    console.log(`    · ${o.code.padEnd(18)} ${o.legal_name}` +
                `  [${o.org_type}${o.dealer_type ? '/' + o.dealer_type : ''}]`);
    console.log(`      territory: ${t.name}${t.exact ? '' : `  (fallback — "${o.territory ?? 'none'}" is not an ERPNext Territory)`}`);
  }

  if (!CONFIRMED) {
    console.log('\n  DRY RUN — nothing created.');
    console.log('  Re-run with CONFIRM_CREATE=1 to create them.');
    console.log(`  Override the rate with ERP_PARTNER_COMMISSION=<n> if 40.48 is not right.`);
    return;
  }

  console.log('\n  creating…');
  let made = 0;
  for (const o of toCreate) {
    try {
      await erpPost('Sales Partner', {
        doctype: 'Sales Partner',
        partner_name: o.code,
        commission_rate: DEFAULT_COMMISSION,
        territory: resolveTerritory(o.territory).name,
        // Kept in the description so anyone reading the ERPNext record can
        // tell which CRM partner it is without cross-referencing codes.
        description: `${o.legal_name}${o.territory ? ` — ${o.territory}` : ''}` +
                     ` (${o.org_type}${o.dealer_type ? '/' + o.dealer_type : ''}, CRM org #${o.id})`,
      });
      made++;
      console.log(`    ✓ ${o.code}`);
    } catch (e: any) {
      console.log(`    ✗ ${o.code}: ${String(e.message).slice(0, 200)}`);
    }
  }
  console.log(`\n✔ created ${made} of ${toCreate.length} Sales Partner(s)`);
}

main()
  .catch(e => { console.error('\n✗ failed —', e.message ?? e); process.exitCode = 1; })
  .finally(() => pool.end());

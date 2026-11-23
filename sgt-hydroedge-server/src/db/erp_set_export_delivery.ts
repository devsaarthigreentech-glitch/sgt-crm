/// <reference types="node" />
// =====================================================================
// erp_set_export_delivery.ts
// Replaces ONLY the Delivery clause of the live export terms template
// with the one in domain/dealerTerms.ts. Every other clause — including
// anything the owner edited in ERPNext — is left byte for byte as it is.
//
// DRY RUN BY DEFAULT; CONFIRM=1 to save. Prints the old clause, so it can
// be put back.
//
//   npx tsx src/db/erp_set_export_delivery.ts
// =====================================================================

import 'dotenv/config';
import { EXPORT_CLAUSES } from '../domain/dealerTerms.js';
import { GREENDRIVE_EXPORT_TERMS } from '../domain/greenDrive.js';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const headers = {
  Authorization: `token ${process.env.ERPNEXT_API_KEY}:${process.env.ERPNEXT_API_SECRET}`,
  Accept: 'application/json', 'Content-Type': 'application/json',
};
const url = `${BASE}/api/resource/${encodeURIComponent('Terms and Conditions')}/${encodeURIComponent(GREENDRIVE_EXPORT_TERMS)}`;

async function read(): Promise<string> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GET ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return String((await res.json()).data?.terms ?? '');
}

async function main() {
  const html = await read();
  const found: string[] = [];
  const next = html.replace(/<li\b([^>]*)>([\s\S]*?)<\/li>/g, (whole, attrs: string, inner: string) => {
    const text = inner.replace(/<[^>]*>/g, '').trim();
    if (!/^Delivery\b/.test(text)) return whole;
    found.push(text);
    const ui = /<span class="ql-ui"[^>]*><\/span>/.exec(inner)?.[0] ?? '';
    return `<li${attrs}>${ui}<strong>Delivery</strong> — ${EXPORT_CLAUSES['Delivery']}</li>`;
  });
  if (found.length !== 1) throw new Error(`expected exactly one Delivery clause, found ${found.length} — nothing changed`);
  console.log(`OLD  ${found[0]}\n\nNEW  Delivery — ${EXPORT_CLAUSES['Delivery']}\n`);
  if (process.env.CONFIRM !== '1') { console.log('DRY RUN — re-run with CONFIRM=1 to save.'); return; }
  const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ terms: next }) });
  if (!res.ok) throw new Error(`PUT ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const after = (await read()).replace(/<[^>]*>/g, '');
  console.log(`saved — FOB in template: ${/\bFOB\b/.test(after)}, FCA in template: ${/\bFCA\b/.test(after)}`);
}

main().catch(e => { console.error('✗ failed —', e.message ?? e); process.exitCode = 1; });

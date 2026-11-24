/// <reference types="node" />
// =====================================================================
// erp_create_evaluation_terms.ts
// Creates the ERPNext terms template for evaluation-only GreenDrive
// quotations, from EVALUATION_TERMS. An existing template is never
// touched: once created, it is edited in ERPNext.
//
// DRY RUN BY DEFAULT; CONFIRM_CREATE=1 to create.
//
//   npx tsx src/db/erp_create_evaluation_terms.ts
// =====================================================================

import 'dotenv/config';
import { EVALUATION_TERMS, clausesToHtml } from '../domain/dealerTerms.js';
import { GREENDRIVE_EVALUATION_TERMS as NAME } from '../domain/greenDrive.js';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '');
const headers = {
  Authorization: `token ${process.env.ERPNEXT_API_KEY}:${process.env.ERPNEXT_API_SECRET}`,
  Accept: 'application/json', 'Content-Type': 'application/json',
};
const url = `${BASE}/api/resource/${encodeURIComponent('Terms and Conditions')}`;

async function main() {
  const got = await fetch(`${url}/${encodeURIComponent(NAME)}`, { headers });
  if (got.ok) { console.log(`✔ "${NAME}" exists — left untouched.`); return; }
  if (got.status !== 404) throw new Error(`GET ${got.status}: ${(await got.text()).slice(0, 200)}`);
  console.log(`To create: "${NAME}"`);
  EVALUATION_TERMS.forEach(([h], i) => console.log(`  ${i + 1}. ${h}`));
  if (process.env.CONFIRM_CREATE !== '1') { console.log('DRY RUN — re-run with CONFIRM_CREATE=1.'); return; }
  const res = await fetch(url, {
    method: 'POST', headers,
    body: JSON.stringify({ title: NAME, terms: clausesToHtml(EVALUATION_TERMS), selling: 1, buying: 0 }),
  });
  if (!res.ok) throw new Error(`POST ${res.status}: ${(await res.text()).slice(0, 300)}`);
  console.log(`✓ created "${(await res.json()).data?.name}"`);
}

main().catch(e => { console.error('✗ failed —', e.message ?? e); process.exitCode = 1; });

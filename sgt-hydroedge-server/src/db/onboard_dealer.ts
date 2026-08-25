// =====================================================================
// onboard_dealer.ts
// Onboard a dealer from a JSON file, without touching the CRM screen.
//
// WHY THIS DRIVES THE HTTP API AND NOT THE DATABASE
// -------------------------------------------------
// Approving a partner is not an INSERT. It mints a code under a lock
// (domain/partnerCode.ts), writes the allotted_code ledger that makes
// reuse impossible, copies the application onto quote_service.org, and
// creates the partner's login. Reproducing that here would mean a second
// implementation of the rules, and the two would drift. So this script
// logs in as a director and calls the same four endpoints the onboarding
// screen calls, in the same order:
//
//     POST  /partners/registrations              create the draft
//     PATCH /partners/registrations/:id          fill it in
//     POST  /partners/registrations/:id/submit   validate
//     POST  /partners/registrations/:id/approve  mint the code   <-- --approve
//
// Everything the screen enforces is therefore enforced here too, because
// it is literally the same code path.
//
// APPROVAL IS OPT-IN
// ------------------
// Without --approve the script stops after submit and prints what it
// would have done. That default is deliberate: approving allots a code
// from a series that never reuses a serial, so a code burned on a
// typo'd record is burned for good. Read the summary, then re-run with
// --approve. A submitted registration can be reopened; an approved one
// cannot.
//
// Run:
//   npx tsx src/db/onboard_dealer.ts <file.json> [--approve]
//
// Credentials come from the environment, never from argv (argv shows up
// in `ps` and in shell history):
//   SGT_API=http://localhost:3004/api/v1
//   SGT_DIRECTOR_EMAIL=...
//   SGT_DIRECTOR_PASSWORD=...
// =====================================================================

import 'dotenv/config';
import { readFileSync } from 'node:fs';

const API = process.env.SGT_API ?? 'http://localhost:3004/api/v1';
const EMAIL = process.env.SGT_DIRECTOR_EMAIL ?? '';
const PASSWORD = process.env.SGT_DIRECTOR_PASSWORD ?? '';

const argv = process.argv.slice(2);
const APPROVE = argv.includes('--approve');
const FILE = argv.find(a => !a.startsWith('--'));

/** Fields the server refuses to submit without. Checked here so the failure
 *  arrives before a draft row exists, not after. */
const REQUIRED_FOR_COMPANY = [
  'legal_name', 'contact_name', 'contact_mobile',
] as const;

interface DealerFile {
  /** Matched against distributor legal_name / trade_name / code, case-insensitively. */
  parent: string;
  dealer_type: 'SS' | 'SM';
  [k: string]: unknown;
}

let token = '';

async function call<T = any>(
  path: string, init: RequestInit = {},
): Promise<{ status: number; body: any }> {
  const hasBody = init.body !== undefined && init.body !== null;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

/** Print a server error the way the CRM would show it, fields and all. */
function explain(label: string, r: { status: number; body: any }): never {
  console.error(`\n✗ ${label} failed — HTTP ${r.status}`);
  const msg = r.body?.error?.message ?? r.body?.error ?? JSON.stringify(r.body);
  console.error(`  ${msg}`);
  if (r.body?.fields) {
    console.error('  Fields the server rejected:');
    for (const [k, v] of Object.entries(r.body.fields)) {
      console.error(`    · ${k}: ${v}`);
    }
  }
  if (r.body?.existing) {
    console.error(`  Existing partner: ${JSON.stringify(r.body.existing)}`);
  }
  process.exit(1);
}

async function main() {
  if (!FILE) {
    console.error('usage: npx tsx src/db/onboard_dealer.ts <file.json> [--approve]');
    process.exit(2);
  }
  if (!EMAIL || !PASSWORD) {
    console.error('Set SGT_DIRECTOR_EMAIL and SGT_DIRECTOR_PASSWORD in the environment.');
    console.error('Onboarding is director-only, so the script needs a director login.');
    process.exit(2);
  }

  const spec = JSON.parse(readFileSync(FILE, 'utf8')) as DealerFile;

  // ---- Local checks, before anything is created ------------------------
  const missing: string[] = [];
  for (const f of REQUIRED_FOR_COMPANY) {
    const v = spec[f];
    if (v === null || v === undefined || String(v).trim() === '') missing.push(f);
  }
  const isIndividual = spec.entity_type === 'individual';
  if (!isIndividual) {
    const segs = spec.customer_segments;
    if (!Array.isArray(segs) || segs.length === 0) missing.push('customer_segments');
  }
  if (spec.dealer_type !== 'SS' && spec.dealer_type !== 'SM') missing.push('dealer_type');
  if (!spec.parent) missing.push('parent');

  if (missing.length) {
    console.error('✗ The JSON is not complete enough to submit. Fill these in:');
    for (const m of missing) console.error(`    · ${m}`);
    process.exit(2);
  }

  // ---- Log in ----------------------------------------------------------
  const login = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (login.status !== 200 || !login.body?.token) explain('Login', login);
  token = login.body.token;
  if (login.body.user?.role !== 'director') {
    console.error(`✗ ${login.body.user?.email} is '${login.body.user?.role}', not a director.`);
    console.error('  Partner onboarding is director-only.');
    process.exit(1);
  }
  console.log(`✔ logged in as ${login.body.user.name} (director)`);

  // ---- Resolve the distributor ----------------------------------------
  // By name, not by a hardcoded id: ids differ between environments and a
  // wrong one would silently hang the dealer under the wrong distributor,
  // which decides their code, their pricing and who can see them.
  const ref = await call('/partners/reference');
  if (ref.status !== 200) explain('Loading distributors', ref);
  const distributors: { id: number; code: string; legal_name: string }[] =
    ref.body?.data?.distributors ?? [];

  const needle = spec.parent.toLowerCase().trim();
  const matches = distributors.filter(d =>
    d.legal_name.toLowerCase().includes(needle) || d.code.toLowerCase() === needle);

  if (matches.length === 0) {
    console.error(`✗ No active distributor matches "${spec.parent}". Known distributors:`);
    for (const d of distributors) console.error(`    · ${d.code}  ${d.legal_name}`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`✗ "${spec.parent}" matches more than one distributor — be more specific:`);
    for (const d of matches) console.error(`    · ${d.code}  ${d.legal_name}`);
    process.exit(1);
  }
  const parent = matches[0];
  console.log(`✔ distributor: ${parent.legal_name} (${parent.code})`);

  // ---- Create the draft ------------------------------------------------
  const created = await call('/partners/registrations', {
    method: 'POST',
    body: JSON.stringify({ partner_type: 'dealer', legal_name: spec.legal_name }),
  });
  if (created.status !== 201) explain('Creating the draft', created);
  const regId = created.body.data.id;
  console.log(`✔ draft registration #${regId}`);

  // ---- Fill it in ------------------------------------------------------
  // `parent` is ours, not a column; everything else is passed through and
  // the server ignores any key outside its own WRITABLE list.
  const { parent: _parent, ...fields } = spec;
  const patched = await call(`/partners/registrations/${regId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...fields,
      partner_type: 'dealer',
      parent_org_id: parent.id,
    }),
  });
  if (patched.status !== 200) explain('Saving the draft', patched);
  console.log('✔ details saved');

  // ---- Submit ----------------------------------------------------------
  const submitted = await call(`/partners/registrations/${regId}/submit`, { method: 'POST' });
  if (submitted.status !== 200) {
    console.error(`\n  The draft was created as #${regId} and still exists.`);
    console.error('  Fix the JSON and re-run, or finish it on the Partner onboarding screen.');
    explain('Submitting', submitted);
  }
  console.log('✔ submitted and validated');

  const r = submitted.body.data;
  console.log('\n--- what will be created -------------------------------');
  console.log(`  ${r.legal_name}`);
  console.log(`  dealer (${spec.dealer_type}) under ${parent.legal_name} (${parent.code})`);
  console.log(`  GSTIN ${r.gstin ?? '—'}   PAN ${r.pan ?? '—'}`);
  console.log(`  ${[r.address_line1, r.address_line2, r.city, r.state, r.pincode].filter(Boolean).join(', ')}`);
  console.log(`  contact ${r.contact_name ?? '—'} · ${r.contact_mobile ?? '—'} · ${r.contact_email ?? 'no email'}`);
  console.log(`  bank ${r.bank_name ?? '—'} ${r.bank_account_number ?? '—'} ${r.bank_ifsc ?? ''}`);
  console.log('--------------------------------------------------------');

  if (!APPROVE) {
    console.log(`\n■ Stopped before approval. Registration #${regId} is submitted, not approved.`);
    console.log('  Nothing irreversible has happened — no code minted, no login created.');
    console.log(`  Re-run with --approve to allot the code, or reopen it on the screen.`);
    return;
  }

  // ---- Approve — this is the irreversible step -------------------------
  const approved = await call(`/partners/registrations/${regId}/approve`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (approved.status !== 200) explain('Approving', approved);

  console.log(`\n✔ APPROVED — code ${approved.body.code}`);
  console.log(`  org id ${approved.body.org?.id}  ·  ${approved.body.org?.legal_name}`);

  const lg = approved.body.login;
  if (lg?.created) {
    console.log('\n  Portal login — SHOWN ONCE, copy it now:');
    console.log(`    email    ${lg.email}`);
    console.log(`    password ${lg.password}`);
    console.log('  It cannot be read back. If lost, reset it on the Logins screen.');
  } else {
    console.log(`\n  No login created: ${lg?.reason ?? 'unknown reason'}`);
    console.log('  Create one from the Logins screen when you have an email for them.');
  }
}

main().catch(err => {
  console.error('✗ onboard_dealer failed —', err);
  process.exit(1);
});

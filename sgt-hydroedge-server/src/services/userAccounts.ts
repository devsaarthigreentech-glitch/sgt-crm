// =====================================================================
// services/userAccounts.ts — creating and managing logins.
//
// The rules here are lifted from src/db/create-partner-user.ts rather
// than rewritten, and that script now has a twin it must agree with. The
// checks that matter:
//
//   · an EXTERNAL login must carry an external role. A partner account
//     with an internal role reaches the whole CRM — see auth/policy.ts.
//   · a role must have an entry in EXTERNAL_ROLE_ALLOW, or the account
//     can reach nothing at all and the user is left staring at a 403.
//   · the role must match what the org IS. A 'dealer' login on a
//     distributor org hides the dealer-registration screen it should
//     have, and a 'distributor' login on a dealer org grants a scope
//     the partner was never given.
//
// WHO MAY CREATE ONE
// SGT only, deliberately. A login reaches customer master data and
// raises priced documents in SGT's name, which puts it in the same class
// as a partner code — and codes are SGT's to allot. Letting a
// distributor mint logins needs scoping to their own subtree, an invite
// flow so passwords are not emailed in plaintext, and an offboarding
// path. None of that is built, so none of it is offered.
//
// PASSWORDS ARE NEVER STORED OR RETURNED IN THE CLEAR. One is generated,
// hashed, and handed back exactly once — on creation or on reset. If it
// is lost, it is reset, not recovered.
// =====================================================================

import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { query, pool } from '../db/pool.js';
import { INTERNAL_ROLES, EXTERNAL_ROLE_ALLOW } from '../auth/policy.js';

export interface AccountRow {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
  orgId: number | null;
  orgCode: string | null;
  orgName: string | null;
  orgType: string | null;
}

export type AccountResult =
  | { ok: true; account: AccountRow; password?: string }
  | { ok: false; code: number; message: string; field?: string };

/** Which org_type a partner role must be attached to. */
const ROLE_ORG_TYPE: Record<string, string> = {
  distributor: 'distributor',
  dealer: 'dealer',
};

/**
 * Unambiguous alphabet — no O/0, l/1/I. These get read off a screen and
 * typed into a phone, and a password nobody can transcribe is a support
 * call, not security.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generatePassword(length = 16): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/**
 * A password that is RECOGNISABLE without being guessable.
 *
 *   Gen.Tech Engineers  ->  GenTech@K7m2Pq9x
 *   AKS GEN SERVICES    ->  AKS@4rTn8Wd2
 *
 * The company prefix is there because these get read down a phone and
 * copied between two people, and "which one was this again" is a real
 * problem when you have handed out six.
 *
 * WHAT IT IS NOT is the pattern <Company>@123. That was asked for and is
 * not safe to build: the shape is visible in the UI, so one example
 * teaches an attacker the rest, and every dealer login on the system
 * becomes guessable from the partner list alone. The prefix here adds
 * familiarity; the eight random characters after it are what actually
 * defend the account.
 */
export function brandedPassword(companyName: string): string {
  const token = String(companyName ?? '')
    .split(/\s+/)[0]
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 12);
  const slug = token
    ? token[0].toUpperCase() + token.slice(1)
    : 'Partner';
  let rand = '';
  for (let i = 0; i < 8; i++) rand += ALPHABET[randomInt(ALPHABET.length)];
  return `${slug}@${rand}`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function listAccounts(): Promise<AccountRow[]> {
  const { rows } = await query(
    `select u.id, u.email, u.name, u.role, u.active, u.created_at,
            u.org_id, o.code as org_code, o.legal_name as org_name, o.org_type
       from lead_service.app_user u
       left join quote_service.org o on o.id = u.org_id
      order by u.active desc, o.code nulls first, u.name`);
  return rows.map(r => ({
    id: String(r.id),
    email: r.email,
    name: r.name,
    role: r.role,
    active: r.active,
    createdAt: r.created_at,
    orgId: r.org_id ?? null,
    orgCode: r.org_code ?? null,
    orgName: r.org_name ?? null,
    orgType: r.org_type ?? null,
  }));
}

async function readAccount(id: string | number): Promise<AccountRow | null> {
  const { rows } = await query(
    `select u.id, u.email, u.name, u.role, u.active, u.created_at,
            u.org_id, o.code as org_code, o.legal_name as org_name, o.org_type
       from lead_service.app_user u
       left join quote_service.org o on o.id = u.org_id
      where u.id = $1`, [id]);
  const r = rows[0];
  if (!r) return null;
  return {
    id: String(r.id), email: r.email, name: r.name, role: r.role,
    active: r.active, createdAt: r.created_at,
    orgId: r.org_id ?? null, orgCode: r.org_code ?? null,
    orgName: r.org_name ?? null, orgType: r.org_type ?? null,
  };
}

export interface NewAccount {
  email?: string;
  name?: string;
  role?: string;
  /** Partner code. Required for an external role, refused for an internal one. */
  orgCode?: string | null;
  /** Omit to have one generated, which is the intended path. */
  password?: string | null;
}

export async function createAccount(input: NewAccount): Promise<AccountResult> {
  const email = String(input.email ?? '').trim().toLowerCase();
  const name = String(input.name ?? '').trim();
  const role = String(input.role ?? '').trim();
  const orgCode = String(input.orgCode ?? '').trim().toUpperCase();

  if (!EMAIL.test(email)) {
    return { ok: false, code: 422, field: 'email', message: 'Enter a valid email address' };
  }
  if (!name) {
    return { ok: false, code: 422, field: 'name', message: 'A name is required' };
  }
  if (!role) {
    return { ok: false, code: 422, field: 'role', message: 'Choose a role' };
  }

  const internal = INTERNAL_ROLES.has(role);
  if (!internal && !EXTERNAL_ROLE_ALLOW[role]) {
    return {
      ok: false, code: 422, field: 'role',
      message: `'${role}' is neither an internal role nor one the portal grants access to. ` +
               `Known partner roles: ${Object.keys(EXTERNAL_ROLE_ALLOW).join(', ')}.`,
    };
  }

  // An internal account attached to a partner org would be a staff login
  // that the portal also scopes — a combination nothing in the codebase
  // expects, so it is refused rather than half-supported.
  if (internal && orgCode) {
    return {
      ok: false, code: 422, field: 'orgCode',
      message: `'${role}' is an SGT role and is not attached to a partner.`,
    };
  }
  if (!internal && !orgCode) {
    return {
      ok: false, code: 422, field: 'orgCode',
      message: 'A partner login must be attached to a partner code.',
    };
  }

  const password = String(input.password ?? '').trim() || generatePassword();
  if (password.length < 10) {
    return {
      ok: false, code: 422, field: 'password',
      message: 'Use at least 10 characters, or leave it blank to have one generated.',
    };
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    let orgId: number | null = null;
    if (orgCode) {
      const { rows: orgs } = await client.query(
        `select id, code, legal_name, org_type, is_active
           from quote_service.org where code = $1`, [orgCode]);
      if (!orgs.length) {
        await client.query('rollback');
        return { ok: false, code: 422, field: 'orgCode', message: `No partner with code '${orgCode}'` };
      }
      const org = orgs[0];
      if (!org.is_active) {
        await client.query('rollback');
        return { ok: false, code: 422, field: 'orgCode', message: `${org.code} is not active` };
      }
      const expected = ROLE_ORG_TYPE[role];
      if (expected && org.org_type !== expected) {
        await client.query('rollback');
        return {
          ok: false, code: 422, field: 'role',
          message: `${org.code} is a ${org.org_type}, so it cannot take a '${role}' login.`,
        };
      }
      orgId = org.id;
    }

    const { rows: existing } = await client.query(
      `select id from lead_service.app_user where email = $1`, [email]);
    if (existing.length) {
      await client.query('rollback');
      return {
        ok: false, code: 409, field: 'email',
        message: `${email} already has a login. Reset its password instead of creating a second one.`,
      };
    }

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await client.query(
      `insert into lead_service.app_user (email, name, password_hash, role, org_id, active)
       values ($1, $2, $3, $4, $5, true) returning id`,
      [email, name, hash, role, orgId]);

    await client.query('commit');
    const account = await readAccount(rows[0].id);
    return { ok: true, account: account!, password };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

/** New password, generated unless one is supplied. Returned once. */
export async function resetPassword(
  id: string, supplied?: string | null,
): Promise<AccountResult> {
  const account = await readAccount(id);
  if (!account) return { ok: false, code: 404, message: 'No such account' };

  const password = String(supplied ?? '').trim() || generatePassword();
  if (password.length < 10) {
    return { ok: false, code: 422, field: 'password', message: 'Use at least 10 characters' };
  }
  const hash = await bcrypt.hash(password, 12);
  await query(
    `update lead_service.app_user set password_hash = $2 where id = $1`, [id, hash]);
  return { ok: true, account, password };
}

/**
 * Accounts are deactivated, never deleted.
 *
 * Quotations carry raised_by; leads carry owner_id. Deleting the row
 * would orphan every one of them and make "who raised this" permanently
 * unanswerable. Deactivating stops the login and keeps the history.
 */
export async function setActive(
  id: string, active: boolean, actingUserId: string | null,
): Promise<AccountResult> {
  const account = await readAccount(id);
  if (!account) return { ok: false, code: 404, message: 'No such account' };

  // Locking yourself out of the only director account is not recoverable
  // from the UI that just did it.
  if (!active && actingUserId && String(actingUserId) === String(id)) {
    return { ok: false, code: 409, message: 'You cannot deactivate the account you are signed in with.' };
  }
  if (!active && account.role === 'director') {
    const { rows } = await query(
      `select count(*)::int as n from lead_service.app_user
        where role = 'director' and active and id <> $1`, [id]);
    if (!rows[0].n) {
      return {
        ok: false, code: 409,
        message: 'That is the last active director. Create another before deactivating this one.',
      };
    }
  }

  await query(`update lead_service.app_user set active = $2 where id = $1`, [id, active]);
  return { ok: true, account: { ...account, active } };
}

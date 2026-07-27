// =====================================================================
// create-partner-user.ts — create an EXTERNAL login attached to a partner org.
//
// Separate from create-user.ts on purpose. That script creates SGT staff
// and defaults role to 'sales'; an external account must never be created
// by accident with an internal role, so this one refuses to run without
// an explicit partner code and validates the pairing before writing.
//
// Usage:
//   npx tsx src/db/create-partner-user.ts <email> <name> <password> <ORG_CODE> [role]
//
// Example — the login for Continental Power System:
//   npx tsx src/db/create-partner-user.ts alok@continental.example "Alok Sharma" 'S0meStr0ngPass' EDINGX001 distributor
//
// The role must be external (see src/auth/policy.ts). Creating a partner
// login with an internal role would hand them the full CRM, so it is
// rejected here rather than left to review.
// =====================================================================

import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { pool } from './pool.js'
import { INTERNAL_ROLES, EXTERNAL_ROLE_ALLOW } from '../auth/policy.js'

async function main() {
  const [, , email, name, password, orgCode, role = 'distributor'] = process.argv
  if (!email || !name || !password || !orgCode) {
    console.error('usage: tsx src/db/create-partner-user.ts <email> <name> <password> <ORG_CODE> [role]')
    console.error('   eg: tsx src/db/create-partner-user.ts a@b.com "A B" \'pass\' EDINGX001 distributor')
    process.exit(1)
  }

  if (INTERNAL_ROLES.has(role)) {
    console.error(`✗ '${role}' is an INTERNAL role. A partner login with an internal role would`)
    console.error(`  reach the whole CRM. Use one of: ${Object.keys(EXTERNAL_ROLE_ALLOW).join(', ')}`)
    process.exit(1)
  }
  if (!EXTERNAL_ROLE_ALLOW[role]) {
    console.error(`✗ '${role}' has no entry in EXTERNAL_ROLE_ALLOW, so it can reach nothing at all.`)
    console.error(`  Add it to src/auth/policy.ts first. Known: ${Object.keys(EXTERNAL_ROLE_ALLOW).join(', ')}`)
    process.exit(1)
  }
  if (password.length < 10) {
    console.error('✗ Use a password of at least 10 characters for an external account.')
    process.exit(1)
  }

  const client = await pool.connect()
  try {
    await client.query('begin')

    const { rows: orgs } = await client.query(
      `select id, code, legal_name, org_type, is_active
         from quote_service.org where code = $1`, [orgCode])
    if (!orgs.length) {
      throw new Error(`no org with code '${orgCode}'`)
    }
    const org = orgs[0]
    if (!org.is_active) throw new Error(`org '${orgCode}' is not active`)

    // A distributor login must actually point at a distributor, or the
    // portal's scoping would be describing something it is not.
    if (role === 'distributor' && org.org_type !== 'distributor') {
      throw new Error(
        `org '${orgCode}' is org_type='${org.org_type}', not 'distributor' — refusing to attach a distributor login to it`)
    }

    const hash = await bcrypt.hash(password, 12)
    const { rows } = await client.query(
      `insert into lead_service.app_user (email, name, password_hash, role, org_id, active)
       values ($1, $2, $3, $4, $5, true)
       on conflict (email) do update
         set name = excluded.name, password_hash = excluded.password_hash,
             role = excluded.role, org_id = excluded.org_id, active = true
       returning id, email, role, org_id`,
      [email.toLowerCase(), name, hash, role, org.id])

    // Confirm the scoping actually resolves before committing, rather
    // than discovering at login that the account sees nothing.
    const { rows: visible } = await client.query(
      `select org_id from quote_service.visible_org_ids($1)`, [org.id])

    await client.query('commit')
    console.log(`✔ ${rows[0].email}  role=${rows[0].role}  org=${org.code} (${org.legal_name})`)
    console.log(`  scope: ${visible.length} org(s) visible — itself plus ${visible.length - 1} descendant(s)`)
    console.log(`  reachable API: ${EXTERNAL_ROLE_ALLOW[role].join(', ')} — everything else is 403`)
  } catch (err) {
    await client.query('rollback')
    console.error('✗ create-partner-user failed —', err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })

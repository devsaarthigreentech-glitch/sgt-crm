import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { pool } from './pool.js'

async function main() {
  const [, , email, name, password, role = 'sales'] = process.argv
  if (!email || !password) {
    console.error('usage: tsx src/db/create-user.ts <email> <name> <password> [role]')
    process.exit(1)
  }
  const hash = await bcrypt.hash(password, 12)
  await pool.query(
    `INSERT INTO lead_service.app_user (email, name, password_hash, role)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (email) DO UPDATE SET name=$2, password_hash=$3, role=$4, active=TRUE`,
    [email.toLowerCase(), name, hash, role]
  )
  console.log('upserted', email, `(${role})`)
  await pool.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
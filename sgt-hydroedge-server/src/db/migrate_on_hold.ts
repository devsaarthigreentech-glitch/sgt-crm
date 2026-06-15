// Adds the on_hold flag to leads. Run once on the VPS:
//   npx tsx src/db/migrate_on_hold.ts
import 'dotenv/config'
import { pool } from './pool.js'

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`
      ALTER TABLE lead_service.leads
        ADD COLUMN IF NOT EXISTS on_hold BOOLEAN NOT NULL DEFAULT FALSE;
    `)
    await client.query('COMMIT')
    console.log('✓ on_hold column ready')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Migration failed:', err)
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
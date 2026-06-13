// Standalone migration: income target settings.
// Run once on the VPS:  npx tsx src/db/migrate_targets.ts
import 'dotenv/config'
import { pool } from './pool.js'

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // One row per fiscal year. quarters jsonb holds the 4 editable quarter targets
    // (in RUPEES). total_target is the annual ceiling (default 6 crore).
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_service.income_target (
        fiscal_year   text PRIMARY KEY,            -- e.g. '2026-2027' (ERPNext FY name)
        total_target  bigint NOT NULL DEFAULT 60000000,   -- ₹6,00,00,000
        quarters      jsonb  NOT NULL DEFAULT '{"Q1":15000000,"Q2":15000000,"Q3":15000000,"Q4":15000000}'::jsonb,
        updated_by    text,
        updated_at    timestamptz NOT NULL DEFAULT now()
      );
    `)

    await client.query('COMMIT')
    console.log('✓ income_target table ready')
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
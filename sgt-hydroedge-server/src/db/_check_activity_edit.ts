import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const cols = await pool.query(
    `select column_name from information_schema.columns
      where table_schema='lead_service' and table_name='lead_activities'
      order by ordinal_position`);
  console.log('columns:', cols.rows.map(r => r.column_name).join(', '));

  const counts = await pool.query(
    `select count(*) as total,
            count(*) filter (where actor_id is null) as no_actor,
            count(*) filter (where actor_id is not null) as with_actor
       from lead_service.lead_activities`);
  console.log('counts:', counts.rows[0]);

  const recent = await pool.query(
    `select id, actor_id, actor_name, actor_type, type, occurred_at, created_at
       from lead_service.lead_activities
      order by created_at desc nulls last limit 15`);
  console.table(recent.rows);

  const users = await pool.query(`select id, name, email, role from lead_service.users order by id limit 20`)
    .catch(async () => await pool.query(`select id, name, email, role from users order by id limit 20`));
  console.table(users.rows);

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });

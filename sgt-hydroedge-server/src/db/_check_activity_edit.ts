// Read-only. Can the NULL actor_id rows on lead_activities be attributed
// to exactly one app_user by name? Prints the answer; changes nothing.
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const users = await pool.query(
    `select id, name, email, role, active from lead_service.app_user order by id`);
  console.table(users.rows);

  const match = await pool.query(/* sql */ `
    select a.actor_name,
           count(*)                                as activities,
           count(distinct u.id)                    as matching_users,
           coalesce(string_agg(distinct u.id::text, ', '), '—') as user_ids
      from lead_service.lead_activities a
      left join lead_service.app_user u
             on lower(btrim(u.name)) = lower(btrim(a.actor_name))
     where a.actor_id is null
     group by a.actor_name
     order by a.actor_name
  `);
  console.table(match.rows);

  const ok = match.rows.filter(r => Number(r.matching_users) === 1);
  const bad = match.rows.filter(r => Number(r.matching_users) !== 1);
  const n = (rs: any[]) => rs.reduce((s, r) => s + Number(r.activities), 0);
  console.log(`\nUnambiguous : ${n(ok)} activities across ${ok.length} name(s)`);
  console.log(`Unattributable: ${n(bad)} activities across ${bad.length} name(s)`);
  if (bad.length) console.log('  ->', bad.map(r => `${r.actor_name} (${r.matching_users} matches)`).join('; '));

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });

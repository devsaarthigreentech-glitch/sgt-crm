// =====================================================================
// link-sister-orgs.ts — let one partner login work in both networks.
//
// A firm in both GreenX and GreenDrive has one org row per line (its own
// code, Sales Partner, agreement). This ties the two rows together so the
// firm's existing portal login gets a GreenX / GreenDrive switch.
//
// Usage:
//   npx tsx src/db/link-sister-orgs.ts <GREENX_CODE> <GREENDRIVE_CODE>              # dry run
//   CONFIRM=1 npx tsx src/db/link-sister-orgs.ts <GREENX_CODE> <GREENDRIVE_CODE>
//   CONFIRM=1 npx tsx src/db/link-sister-orgs.ts --unlink <EITHER_CODE>
//
// Refuses unless both orgs exist, are active, are in different lines, are
// the same kind of partner (dealer/dealer, distributor/distributor — the
// login's role has to fit both) and neither is linked elsewhere. Warns,
// but goes ahead, when the GSTINs differ.
//
// Prerequisite: run migrate_partner_08_sister_org.ts first.
// =====================================================================

import 'dotenv/config';
import { pool } from './pool.js';

const CONFIRMED = process.env.CONFIRM === '1';

async function main() {
  const args = process.argv.slice(2);
  const client = await pool.connect();
  try {
    await client.query('begin');

    if (args[0] === '--unlink') {
      const code = args[1];
      if (!code) throw new Error('usage: link-sister-orgs.ts --unlink <ORG_CODE>');
      const { rows } = await client.query(
        `select id, code, sister_org_id from quote_service.org where code = $1`, [code]);
      if (!rows.length) throw new Error(`no org with code '${code}'`);
      if (!rows[0].sister_org_id) { console.log(`${code} is not linked — nothing to do.`); await client.query('rollback'); return; }
      await client.query(
        `update quote_service.org set sister_org_id = null where id in ($1, $2)`,
        [rows[0].id, rows[0].sister_org_id]);
      if (!CONFIRMED) { await client.query('rollback'); console.log(`DRY RUN — would unlink ${code}. Re-run with CONFIRM=1.`); return; }
      await client.query('commit');
      console.log(`✔ unlinked ${code}`);
      return;
    }

    const [codeA, codeB] = args;
    if (!codeA || !codeB) {
      throw new Error('usage: link-sister-orgs.ts <GREENX_CODE> <GREENDRIVE_CODE>');
    }
    const { rows } = await client.query(
      `select id, code, legal_name, trade_name, org_type, product_line, gstin,
              is_active, sister_org_id
         from quote_service.org where code = any($1) for update`, [[codeA, codeB]]);
    const a = rows.find((r: any) => r.code === codeA);
    const b = rows.find((r: any) => r.code === codeB);
    if (!a) throw new Error(`no org with code '${codeA}'`);
    if (!b) throw new Error(`no org with code '${codeB}'`);

    for (const o of [a, b]) {
      if (!o.is_active) throw new Error(`${o.code} is not active`);
      if (o.org_type === 'sgt') throw new Error(`${o.code} is SGT, not a partner`);
      if (o.sister_org_id && o.sister_org_id !== (o === a ? b.id : a.id)) {
        throw new Error(`${o.code} is already linked to another org — unlink it first`);
      }
    }
    if (a.product_line === b.product_line) {
      throw new Error(`both are ${a.product_line} partners — a sister must be in the other line`);
    }
    if (a.org_type !== b.org_type) {
      throw new Error(
        `${a.code} is a ${a.org_type} but ${b.code} is a ${b.org_type}. One login has one role, ` +
        `so it cannot be both — give the second network its own login instead.`);
    }

    const { rows: logins } = await client.query(
      `select email, role from lead_service.app_user where org_id = any($1) and active`, [[a.id, b.id]]);

    console.log(`  ${a.code.padEnd(16)} ${a.product_line.padEnd(10)} ${a.org_type.padEnd(12)} ${a.trade_name || a.legal_name}  GSTIN ${a.gstin ?? '—'}`);
    console.log(`  ${b.code.padEnd(16)} ${b.product_line.padEnd(10)} ${b.org_type.padEnd(12)} ${b.trade_name || b.legal_name}  GSTIN ${b.gstin ?? '—'}`);
    if (String(a.gstin ?? '').toUpperCase() !== String(b.gstin ?? '').toUpperCase()) {
      console.log('  ⚠ the GSTINs differ — make sure these really are the same firm.');
    }
    console.log(`  logins that will get the switch: ${logins.map((l: any) => `${l.email} (${l.role})`).join(', ') || 'none yet'}`);

    await client.query(`update quote_service.org set sister_org_id = $2 where id = $1`, [a.id, b.id]);
    await client.query(`update quote_service.org set sister_org_id = $2 where id = $1`, [b.id, a.id]);

    if (!CONFIRMED) {
      await client.query('rollback');
      console.log('\nDRY RUN — nothing saved. Re-run with CONFIRM=1 to link.');
      return;
    }
    await client.query('commit');
    console.log('\n✔ linked. The login(s) above now see a GreenX / GreenDrive switch in the portal.');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    console.error('✗ link-sister-orgs failed —', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

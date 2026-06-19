/**
 * erp-financials.ts  — Fastify route plugin
 *
 * GET /erp/financials?fy=:fyName
 *   Returns { income, expense, margin, marginPct, incomeBreakdown[], expenseBreakdown[] }
 *   pulled from ERPNext GL entries for the selected fiscal year.
 *
 * Register in your route bootstrap alongside the other erp routes:
 *   import erpFinancialsRoute from './erp-financials.js';
 *   app.register(erpFinancialsRoute, { prefix: '/api' });
 *
 * Auth: requireRole('accounts', 'director') guard assumed on the route.
 */

import { FastifyInstance, FastifyRequest } from 'fastify';

const ERP_BASE  = process.env.ERP_BASE_URL   ?? 'https://saarthi.frappe.cloud';
const ERP_TOKEN = process.env.ERP_API_TOKEN  ?? '';   // "token KEY:SECRET"

// ── helpers ──────────────────────────────────────────────────────────────────

function erpHeaders() {
  return {
    Authorization: ERP_TOKEN,
    'Content-Type': 'application/json',
  };
}

async function erpGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${ERP_BASE}${path}`, { headers: erpHeaders() });
  if (!res.ok) throw new Error(`ERPNext ${res.status}: ${await res.text()}`);
  const json = await res.json() as { data: T };
  return json.data;
}

// ── route ────────────────────────────────────────────────────────────────────

export default async function erpFinancialsRoute(app: FastifyInstance) {
  app.get(
    '/erp/financials',
    { preHandler: [(app as any).requireRole('accounts', 'director', 'sales')] },
    async (req: FastifyRequest<{ Querystring: { fy?: string } }>, reply) => {

      const fy = req.query.fy;
      if (!fy) return reply.code(400).send({ error: 'fy param required' });

      // 1. Resolve fiscal year date range
      const fyList = await erpGet<Array<{ name: string; year_start_date: string; year_end_date: string }>>(
        `/api/resource/Fiscal Year?filters=[["name","=","${encodeURIComponent(fy)}"]]\
&fields=["name","year_start_date","year_end_date"]&limit=1`
      );

      if (!fyList.length) return reply.code(404).send({ error: 'Fiscal year not found' });
      const { year_start_date: fromDate, year_end_date: toDate } = fyList[0];

      // 2. Fetch GL entries for this period — we want account + debit + credit
      //    ERPNext GL: credit = income-side posting, debit = expense-side posting
      //    We group by account and root_type
      const glEntries = await erpGet<Array<{
        account:    string;
        root_type:  string; // 'Income' | 'Expense' | 'Asset' | 'Liability' | 'Equity'
        debit:      number;
        credit:     number;
      }>>(
        `/api/resource/GL Entry?` +
        `filters=[["posting_date",">=","${fromDate}"],["posting_date","<=","${toDate}"],` +
        `["is_cancelled","=",0],["voucher_type","!=","Period Closing Voucher"]]` +
        `&fields=["account","root_type","debit","credit"]&limit=5000`
      );

      // 3. Aggregate by account + root_type
      const accountMap = new Map<string, { root_type: string; net: number }>();

      for (const entry of glEntries) {
        if (!['Income', 'Expense'].includes(entry.root_type)) continue;
        const key = entry.account;
        const existing = accountMap.get(key) ?? { root_type: entry.root_type, net: 0 };
        // For Income accounts: net = credit - debit (normal credit balance)
        // For Expense accounts: net = debit - credit (normal debit balance)
        const contrib =
          entry.root_type === 'Income'
            ? entry.credit - entry.debit
            : entry.debit - entry.credit;
        existing.net += contrib;
        accountMap.set(key, existing);
      }

      // 4. Build breakdowns — sort descending by absolute amount
      const incomeRows: { account: string; amount: number }[] = [];
      const expenseRows: { account: string; amount: number }[] = [];

      for (const [account, { root_type, net }] of accountMap.entries()) {
        if (net <= 0) continue; // skip negative or zero entries
        if (root_type === 'Income')  incomeRows.push({ account, amount: net });
        if (root_type === 'Expense') expenseRows.push({ account, amount: net });
      }

      incomeRows.sort((a, b)  => b.amount - a.amount);
      expenseRows.sort((a, b) => b.amount - a.amount);

      const income  = incomeRows.reduce((s, r) => s + r.amount, 0);
      const expense = expenseRows.reduce((s, r) => s + r.amount, 0);
      const margin  = income - expense;
      const marginPct = income > 0 ? (margin / income) * 100 : 0;

      return reply.send({
        fy,
        fromDate,
        toDate,
        income,
        expense,
        margin,
        marginPct,
        incomeBreakdown:  incomeRows,
        expenseBreakdown: expenseRows,
      });
    }
  );
}
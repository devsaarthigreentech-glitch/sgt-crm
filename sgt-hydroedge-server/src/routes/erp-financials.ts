import { FastifyInstance, FastifyRequest } from 'fastify'
import { requireRole } from '../auth/guard.js'

const ERP_BASE  = process.env.ERP_BASE_URL  ?? 'https://saarthi.frappe.cloud'
const ERP_TOKEN = process.env.ERP_API_TOKEN ?? ''

function erpHeaders() {
  return { Authorization: ERP_TOKEN, 'Content-Type': 'application/json' }
}

async function erpGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${ERP_BASE}${path}`, { headers: erpHeaders() })
  if (!res.ok) throw new Error(`ERPNext ${res.status}: ${await res.text()}`)
  const json = await res.json() as { data: T }
  return json.data
}

export default async function erpFinancialsRoute(app: FastifyInstance) {
  app.get('/api/erp/financials', { preHandler: [requireRole('accounts', 'director', 'sales')] },
    async (req: FastifyRequest, reply) => {

      const { fy } = req.query as { fy?: string }
      if (!fy) return reply.code(400).send({ error: 'fy param required' })

      const fyList = await erpGet<Array<{ name: string; year_start_date: string; year_end_date: string }>>(
        `/api/resource/Fiscal Year?filters=[["name","=","${encodeURIComponent(fy)}"]]\
&fields=["name","year_start_date","year_end_date"]&limit=1`
      )

      if (!fyList.length) return reply.code(404).send({ error: 'Fiscal year not found' })
      const { year_start_date: fromDate, year_end_date: toDate } = fyList[0]

      const glEntries = await erpGet<Array<{
        account:   string
        root_type: string
        debit:     number
        credit:    number
      }>>(
        `/api/resource/GL Entry?` +
        `filters=[["posting_date",">=","${fromDate}"],["posting_date","<=","${toDate}"],` +
        `["is_cancelled","=",0],["voucher_type","!=","Period Closing Voucher"]]` +
        `&fields=["account","root_type","debit","credit"]&limit=5000`
      )

      const accountMap = new Map<string, { root_type: string; net: number }>()

      for (const entry of glEntries) {
        if (!['Income', 'Expense'].includes(entry.root_type)) continue
        const existing = accountMap.get(entry.account) ?? { root_type: entry.root_type, net: 0 }
        const contrib = entry.root_type === 'Income'
          ? entry.credit - entry.debit
          : entry.debit - entry.credit
        existing.net += contrib
        accountMap.set(entry.account, existing)
      }

      const incomeRows:  { account: string; amount: number }[] = []
      const expenseRows: { account: string; amount: number }[] = []

      for (const [account, { root_type, net }] of accountMap.entries()) {
        if (net <= 0) continue
        if (root_type === 'Income')  incomeRows.push({ account, amount: net })
        if (root_type === 'Expense') expenseRows.push({ account, amount: net })
      }

      incomeRows.sort((a, b)  => b.amount - a.amount)
      expenseRows.sort((a, b) => b.amount - a.amount)

      const income    = incomeRows.reduce((s, r)  => s + r.amount, 0)
      const expense   = expenseRows.reduce((s, r) => s + r.amount, 0)
      const margin    = income - expense
      const marginPct = income > 0 ? (margin / income) * 100 : 0

      return reply.send({
        fy, fromDate, toDate,
        income, expense, margin, marginPct,
        incomeBreakdown:  incomeRows,
        expenseBreakdown: expenseRows,
      })
    }
  )
}
// Income target tracking — quarter-wise targets with carry-forward of shortfall,
// plus an editable annual total (default ₹6cr). Director-only writes.
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query } from '../db/pool'
import { requireRole } from '../auth/guard.js'
import { getQuarterlyIncome, getFiscalYears } from '../services/erpnext.js'

const DEFAULT_TOTAL = 60000000 // ₹6,00,00,000
const DEFAULT_QUARTERS = { Q1: 15000000, Q2: 15000000, Q3: 15000000, Q4: 15000000 }

type Quarters = { Q1: number; Q2: number; Q3: number; Q4: number }

async function loadTarget(fy: string): Promise<{ total: number; quarters: Quarters; updatedBy: string | null; updatedAt: string | null }> {
  const r = await query(
    `SELECT total_target, quarters, updated_by, updated_at
       FROM lead_service.income_target WHERE fiscal_year = $1`,
    [fy]
  )
  if (r.rows.length === 0) {
    return { total: DEFAULT_TOTAL, quarters: { ...DEFAULT_QUARTERS }, updatedBy: null, updatedAt: null }
  }
  const row = r.rows[0]
  const q = row.quarters || {}
  return {
    total: Number(row.total_target),
    quarters: {
      Q1: Number(q.Q1 ?? DEFAULT_QUARTERS.Q1),
      Q2: Number(q.Q2 ?? DEFAULT_QUARTERS.Q2),
      Q3: Number(q.Q3 ?? DEFAULT_QUARTERS.Q3),
      Q4: Number(q.Q4 ?? DEFAULT_QUARTERS.Q4),
    },
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }
}

export default async function targetRoutes(app: FastifyInstance) {

  // GET /targets/income?fy=2026-2027  — target + quarter-wise actuals + carry-forward
  app.get('/targets/income', async (req, reply) => {
    let { fy } = req.query as { fy?: string }
    try {
      if (!fy) {
        // default to the current fiscal year from ERPNext
        const years = await getFiscalYears()
        const today = new Date().toISOString().slice(0, 10)
        const cur = years.find((y: any) => y.from <= today && today <= y.to)
        fy = cur?.name ?? years[0]?.name
      }
      if (!fy) return reply.code(400).send({ error: 'No fiscal year available' })

      const target = await loadTarget(fy)
      const fyRow = (await getFiscalYears()).find((y: any) => y.name === fy)
      if (!fyRow) return reply.code(404).send({ error: `Fiscal year ${fy} not found in ERPNext` })

      // actual income per quarter (in rupees) for this FY
      const actuals = await getQuarterlyIncome(fyRow.from, fyRow.to)

      // Carry-forward: any shortfall in a quarter rolls onto the next quarter's
      // effective target. Surplus does NOT reduce the next quarter's base target,
      // but it reduces the carried debt (so an over-performing quarter wipes out
      // earlier slippage).
      const order: (keyof Quarters)[] = ['Q1', 'Q2', 'Q3', 'Q4']
      let carry = 0
      const quarters = order.map((q) => {
        const base = target.quarters[q]
        const effectiveTarget = base + carry
        const actual = actuals[q] ?? 0
        const shortfall = effectiveTarget - actual // +ve = behind, -ve = ahead
        const carriedIn = carry
        carry = Math.max(0, shortfall) // only debt carries forward, never credit
        return {
          quarter: q,
          baseTarget: base,
          carriedIn,
          effectiveTarget,
          actual,
          shortfall,
          met: actual >= effectiveTarget,
          pct: effectiveTarget > 0 ? actual / effectiveTarget : 1,
        }
      })

      const totalActual = order.reduce((s, q) => s + (actuals[q] ?? 0), 0)

      return reply.send({
        fiscalYear: fy,
        totalTarget: target.total,
        totalActual,
        totalPct: target.total > 0 ? totalActual / target.total : 0,
        totalShortfall: target.total - totalActual,
        carryForwardOutstanding: carry, // debt still unfulfilled after Q4
        quarters,
        updatedBy: target.updatedBy,
        updatedAt: target.updatedAt,
        isDefault: target.updatedAt === null,
      })
    } catch (e: any) {
      reply.code(502)
      return { error: e.message }
    }
  })

  // PUT /targets/income — director only. Upsert total + per-quarter targets.
  const Body = z.object({
    fiscalYear: z.string().min(4),
    totalTarget: z.number().min(0),
    quarters: z.object({
      Q1: z.number().min(0),
      Q2: z.number().min(0),
      Q3: z.number().min(0),
      Q4: z.number().min(0),
    }),
  })

  app.put('/targets/income', { preHandler: requireRole('director') }, async (req, reply) => {
    const parsed = Body.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() })
    }
    const b = parsed.data
    const editor = (req.user as any)?.name ?? 'director'

    await query(
      `INSERT INTO lead_service.income_target (fiscal_year, total_target, quarters, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (fiscal_year)
       DO UPDATE SET total_target = $2, quarters = $3, updated_by = $4, updated_at = now()`,
      [b.fiscalYear, Math.round(b.totalTarget), JSON.stringify(b.quarters), editor]
    )

    return reply.send({ data: { fiscalYear: b.fiscalYear, totalTarget: b.totalTarget, quarters: b.quarters } })
  })
}
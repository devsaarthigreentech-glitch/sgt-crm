// src/services/erpCustomer.ts
// ---------------------------------------------------------------------------
// Two ERPNext integrations:
//   1. ensureErpCustomer()  — on close-won, create a Customer in ERPNext if one
//      doesn't already exist (matched by name). Stores the ERPNext id back on
//      lead_service.accounts.erpnext_id for idempotency.
//   2. getStockValuation()  — total stock value + warehouse-wise breakdown for
//      the Director view.
//
// Self-contained ERPNext access. Best-effort: a failure here must never break
// the caller (close-won still succeeds even if ERPNext is unreachable).
// ---------------------------------------------------------------------------

import { query } from '../db/pool.js'

const BASE = process.env.ERPNEXT_URL!
const KEY = process.env.ERPNEXT_API_KEY!
const SECRET = process.env.ERPNEXT_API_SECRET!
const DEFAULT_CUSTOMER_GROUP = process.env.ERP_DEFAULT_CUSTOMER_GROUP ?? 'Commercial'
const DEFAULT_TERRITORY = process.env.ERP_DEFAULT_TERRITORY ?? 'India'

function authHeaders() {
  return { Authorization: `token ${KEY}:${SECRET}`, Accept: 'application/json' }
}

async function frappeGet(path: string, params: Record<string, unknown> = {}) {
  const url = new URL(`${BASE}${path}`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  }
  const res = await fetch(url.toString(), { headers: authHeaders() })
  if (!res.ok) throw new Error(`ERPNext ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()).data
}

async function frappePost(doctype: string, doc: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/resource/${encodeURIComponent(doctype)}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  })
  if (!res.ok) throw new Error(`ERPNext ${res.status} create ${doctype}: ${(await res.text()).slice(0, 300)}`)
  return (await res.json()).data
}

// ---------------------------------------------------------------------------
// 1. Ensure ERPNext Customer for a won account
// ---------------------------------------------------------------------------

export type EnsureCustomerResult =
  | { status: 'linked' | 'found' | 'created'; erpnextId: string }
  | { status: 'skipped' | 'error'; reason: string }

/**
 * Make sure the given account has a matching ERPNext Customer.
 * - If accounts.erpnext_id is already set -> skip.
 * - Else search ERPNext by exact customer_name -> if found, link it.
 * - Else create a new Customer -> link it.
 * Always best-effort; never throws.
 */
export async function ensureErpCustomer(accountId: string): Promise<EnsureCustomerResult> {
  try {
    const acc = await query(
      `SELECT id, name, gstin, location, erpnext_id
         FROM lead_service.accounts
        WHERE id = $1 AND deleted_at IS NULL`,
      [accountId],
    )
    if (acc.rows.length === 0) return { status: 'error', reason: 'account not found' }
    const a = acc.rows[0] as { name: string; gstin: string | null; location: string | null; erpnext_id: string | null }

    // already linked
    if (a.erpnext_id) return { status: 'linked', erpnextId: a.erpnext_id }

    const customerName = (a.name || '').trim()
    if (!customerName) return { status: 'error', reason: 'account has no name' }

    // search ERPNext for an existing customer by exact name
    const existing = await frappeGet('/api/resource/Customer', {
      filters: [['customer_name', '=', customerName]],
      fields: ['name'],
      limit_page_length: 1,
    })
    if (Array.isArray(existing) && existing.length > 0) {
      const erpId = existing[0].name as string
      await linkErpId(accountId, erpId)
      return { status: 'found', erpnextId: erpId }
    }

    // create a new customer
    const doc: Record<string, unknown> = {
      customer_name: customerName,
      customer_type: 'Company',
      customer_group: DEFAULT_CUSTOMER_GROUP,
      territory: DEFAULT_TERRITORY,
    }
    if (a.gstin) { doc.tax_id = a.gstin; doc.gstin = a.gstin }
    const created = await frappePost('Customer', doc)
    const erpId = created.name as string
    await linkErpId(accountId, erpId)
    return { status: 'created', erpnextId: erpId }
  } catch (e: any) {
    // never break the close — just report
    return { status: 'error', reason: String(e?.message ?? e).slice(0, 200) }
  }
}

async function linkErpId(accountId: string, erpnextId: string) {
  await query(
    `UPDATE lead_service.accounts SET erpnext_id = $1, updated_at = NOW() WHERE id = $2`,
    [erpnextId, accountId],
  )
}

// ---------------------------------------------------------------------------
// 3. Customers with billing + gross-margin profitability (FY-filterable)
// ---------------------------------------------------------------------------

export type CustomerRow = {
  name: string
  customer_name: string
  customer_group: string
  territory: string
  customer_type: string
  mobile_no: string | null
  email_id: string | null
  tax_id: string | null
  disabled: number
  billing_total: number   // revenue, net of tax (sum of SI base_net_total)
  cogs: number            // cost of goods sold to this customer
  gross_profit: number    // billing_total - cogs
  margin_pct: number      // gross_profit / billing_total * 100  (0 if no revenue)
  invoice_count: number
}

/**
 * Customers enriched with revenue + gross margin, optionally limited to a
 * fiscal-year date window (posting_date between from..to, inclusive).
 *
 * Revenue = sum of submitted Sales Invoice base_net_total (net of tax).
 * COGS    = per Sales Invoice Item: prefer the SI Item `gross_profit` field
 *           (amount - cost) when ERPNext has populated it; otherwise fall back
 *           to qty * valuation_rate. COGS = amount - grossProfit.
 * Gross profit is revenue - COGS. This is gross margin, NOT net profit
 * (overheads/freight aren't attributable per-customer in ERPNext).
 */
export async function getCustomersWithProfitability(from?: string, to?: string): Promise<CustomerRow[]> {
  // 1. customers
  const customers: any[] = await frappeGet('/api/resource/Customer', {
    fields: ['name', 'customer_name', 'customer_group', 'territory',
             'customer_type', 'mobile_no', 'email_id', 'tax_id', 'disabled'],
    filters: [['disabled', '=', 0]],
    limit_page_length: 0,
    order_by: 'customer_name asc',
  })

  // 2. submitted Sales Invoices in window → customer + net revenue, keyed by invoice name
  const siFilters: unknown[] = [['docstatus', '=', 1]]
  if (from) siFilters.push(['posting_date', '>=', from])
  if (to)   siFilters.push(['posting_date', '<=', to])

  const invoices: any[] = await frappeGet('/api/resource/Sales Invoice', {
    fields: ['name', 'customer', 'base_net_total', 'base_grand_total'],
    filters: siFilters,
    limit_page_length: 0,
  }).catch(() => [])

  const revenueByCust: Record<string, number> = {}
  const countByCust: Record<string, number> = {}
  const invToCust: Record<string, string> = {}
  for (const inv of invoices) {
    const cust = inv.customer as string
    if (!cust) continue
    invToCust[inv.name] = cust
    // net revenue (excl tax) is the right base for margin; fall back to grand total
    revenueByCust[cust] = (revenueByCust[cust] ?? 0) + Number(inv.base_net_total || inv.base_grand_total || 0)
    countByCust[cust] = (countByCust[cust] ?? 0) + 1
  }

  // 3. COGS per customer from Sales Invoice Item lines of those invoices.
  // Query the parent Sales Invoice with a child-table filter so we don't need
  // extra permissions on the child doctype, then read each invoice's items.
  const cogsByCust: Record<string, number> = {}
  const invoiceNames = Object.keys(invToCust)

  for (const chunk of chunk20(invoiceNames, 20)) {
    if (!chunk.length) continue
    // fetch each invoice doc (items child table carries valuation + gross_profit)
    const docs = await Promise.all(
      chunk.map((n) => frappeGet(`/api/resource/Sales Invoice/${encodeURIComponent(n)}`).catch(() => null)),
    )
    for (const doc of docs) {
      if (!doc) continue
      const cust = invToCust[doc.name]
      if (!cust) continue
      for (const it of doc.items ?? []) {
        const amount = Number(it.base_net_amount || it.base_amount || it.amount || 0)
        // Prefer the SI Item gross_profit field when populated; else qty*valuation_rate
        let lineCogs: number
        const gp = it.gross_profit
        if (gp !== undefined && gp !== null && Number(gp) !== 0) {
          lineCogs = amount - Number(gp)
        } else {
          const valuation = Number(it.valuation_rate || it.incoming_rate || 0)
          const qty = Number(it.stock_qty || it.qty || 0)
          lineCogs = valuation * qty
        }
        if (lineCogs < 0) lineCogs = 0
        cogsByCust[cust] = (cogsByCust[cust] ?? 0) + lineCogs
      }
    }
  }

  // 4. merge
  return customers.map((c) => {
    const revenue = Math.round(revenueByCust[c.name] ?? 0)
    const cogs = Math.round(cogsByCust[c.name] ?? 0)
    const grossProfit = revenue - cogs
    const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
    return {
      ...c,
      billing_total: revenue,
      cogs,
      gross_profit: grossProfit,
      margin_pct: Math.round(margin * 10) / 10,
      invoice_count: countByCust[c.name] ?? 0,
    } as CustomerRow
  })
}

function* chunk20<T>(arr: T[], size: number) {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size)
}

// ---------------------------------------------------------------------------
// 2. Stock valuation (total + warehouse-wise)
// ---------------------------------------------------------------------------

export type WarehouseStock = { warehouse: string; value: number; itemCount: number }
export type StockValuation = { totalValue: number; warehouses: WarehouseStock[] }

let stockCache: { exp: number; val: StockValuation } | null = null

export async function getStockValuation(): Promise<StockValuation> {
  if (stockCache && stockCache.exp > Date.now()) return stockCache.val

  // Bin holds per-item, per-warehouse stock. stock_value is the valuation ERPNext
  // maintains for that bin. Sum it grouped by warehouse.
  const bins: any[] = await frappeGet('/api/resource/Bin', {
    fields: ['warehouse', 'stock_value', 'item_code', 'actual_qty'],
    filters: [['actual_qty', '!=', 0]],
    limit_page_length: 0,
  })

  const byWh: Record<string, { value: number; items: Set<string> }> = {}
  let totalValue = 0
  for (const b of bins) {
    const wh = b.warehouse || 'Unspecified'
    const val = Number(b.stock_value || 0)
    const m = (byWh[wh] ??= { value: 0, items: new Set() })
    m.value += val
    if (b.item_code) m.items.add(b.item_code)
    totalValue += val
  }

  const warehouses: WarehouseStock[] = Object.entries(byWh)
    .map(([warehouse, v]) => ({ warehouse, value: Math.round(v.value), itemCount: v.items.size }))
    .sort((x, y) => y.value - x.value)

  const result: StockValuation = { totalValue: Math.round(totalValue), warehouses }
  stockCache = { exp: Date.now() + 5 * 60_000, val: result }
  return result
}
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

// Per-item-code: default-BOM cost per unit, and whether it's a stock item.
// Cached together so the margin maths can resolve cost without re-fetching.
type ItemCostMeta = { isStockItem: boolean; itemGroup: string; bomCostPerUnit: number }
const itemCostCache = new Map<string, { exp: number; val: ItemCostMeta }>()

async function itemCostMeta(codes: string[]): Promise<Record<string, ItemCostMeta>> {
  const out: Record<string, ItemCostMeta> = {}
  const need: string[] = []
  for (const code of codes) {
    const hit = itemCostCache.get(code)
    if (hit && hit.exp > Date.now()) out[code] = hit.val
    else need.push(code)
  }
  if (!need.length) return out

  // 1. item flags (is_stock_item, item_group) in bulk
  const flags: Record<string, { isStockItem: boolean; itemGroup: string }> = {}
  for (const grp of chunk20(need, 50)) {
    const items: any[] = await frappeGet('/api/resource/Item', {
      fields: ['item_code', 'is_stock_item', 'item_group'],
      filters: [['item_code', 'in', grp]],
      limit_page_length: 0,
    }).catch(() => [])
    for (const it of items) {
      flags[it.item_code] = { isStockItem: Number(it.is_stock_item) === 1, itemGroup: it.item_group || '' }
    }
  }

  // 2. default-BOM cost per unit, only worth fetching for stock items
  const bomCost: Record<string, number> = {}
  const stockCodes = need.filter((c) => flags[c]?.isStockItem)
  for (const grp of chunk20(stockCodes, 40)) {
    const boms: any[] = await frappeGet('/api/resource/BOM', {
      fields: ['item', 'total_cost', 'quantity'],
      filters: [['item', 'in', grp], ['is_default', '=', 1], ['is_active', '=', 1]],
      limit_page_length: 0,
    }).catch(() => [])
    for (const b of boms) {
      const q = Number(b.quantity || 1) || 1
      bomCost[b.item] = Number(b.total_cost || 0) / q
    }
  }

  for (const code of need) {
    const f = flags[code] ?? { isStockItem: false, itemGroup: '' }
    const val: ItemCostMeta = { isStockItem: f.isStockItem, itemGroup: f.itemGroup, bomCostPerUnit: bomCost[code] ?? 0 }
    itemCostCache.set(code, { exp: Date.now() + 5 * 60_000, val })
    out[code] = val
  }
  return out
}

// Resolve the cost of one Sales Invoice line, in priority order:
//   1. SI Item gross_profit (if ERPNext set it)
//   2. valuation_rate / incoming_rate (live stock cost)
//   3. default-BOM total_cost per unit  (manufactured items w/o valuation)
//   4. service / non-stock item -> no cost is correct (not "missing")
//   5. otherwise genuinely missing
type LineCost = { cost: number; source: 'gross_profit' | 'valuation' | 'bom' | 'service' | 'missing' }
function resolveLineCost(it: any, qty: number, revenue: number, meta?: ItemCostMeta): LineCost {
  const gp = it.gross_profit
  if (gp !== undefined && gp !== null && Number(gp) !== 0) {
    return { cost: Math.max(0, revenue - Number(gp)), source: 'gross_profit' }
  }
  const valuation = Number(it.valuation_rate || it.incoming_rate || 0)
  if (valuation > 0) return { cost: valuation * qty, source: 'valuation' }

  if (meta && meta.bomCostPerUnit > 0) return { cost: meta.bomCostPerUnit * qty, source: 'bom' }

  // No valuation and no BOM cost. If it's a non-stock item (service/labour),
  // having no cost of goods is correct — don't flag it.
  if (meta && !meta.isStockItem) return { cost: 0, source: 'service' }

  return { cost: 0, source: 'missing' }
}

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
  const cogsByCust: Record<string, number> = {}
  const invoiceNames = Object.keys(invToCust)

  // First pass: collect all docs + the item codes we'll need cost meta for.
  const allDocs: any[] = []
  const codesNeedingCost = new Set<string>()
  for (const chunk of chunk20(invoiceNames, 20)) {
    if (!chunk.length) continue
    const docs = await Promise.all(
      chunk.map((n) => frappeGet(`/api/resource/Sales Invoice/${encodeURIComponent(n)}`).catch(() => null)),
    )
    for (const doc of docs) {
      if (!doc) continue
      allDocs.push(doc)
      for (const it of doc.items ?? []) {
        const valuation = Number(it.valuation_rate || it.incoming_rate || 0)
        const gp = it.gross_profit
        const hasGp = gp !== undefined && gp !== null && Number(gp) !== 0
        if (!hasGp && valuation === 0 && it.item_code) codesNeedingCost.add(it.item_code)
      }
    }
  }
  const costMeta = await itemCostMeta([...codesNeedingCost])

  for (const doc of allDocs) {
    const cust = invToCust[doc.name]
    if (!cust) continue
    for (const it of doc.items ?? []) {
      const amount = Number(it.base_net_amount || it.base_amount || it.amount || 0)
      const qty = Number(it.stock_qty || it.qty || 0)
      const { cost } = resolveLineCost(it, qty, amount, costMeta[it.item_code])
      cogsByCust[cust] = (cogsByCust[cust] ?? 0) + cost
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
// 4. Per-customer margin breakdown (on-demand, when a row is clicked)
// ---------------------------------------------------------------------------

export type MarginLineItem = {
  itemCode: string
  itemName: string
  qty: number
  revenue: number       // base_net_amount
  cost: number          // resolved cost (valuation / BOM / gross_profit)
  margin: number        // %
  costMissing: boolean  // true only when a STOCK item has no cost anywhere
  costSource: 'gross_profit' | 'valuation' | 'bom' | 'service' | 'missing'
}
export type MarginInvoice = {
  invoice: string
  date: string
  revenue: number
  cost: number
  margin: number
  items: MarginLineItem[]
}
export type CustomerMargin = {
  customer: string
  customerName: string
  revenue: number
  cost: number
  grossProfit: number
  margin: number
  missingCostCount: number  // STOCK items with no cost (real misconfig)
  serviceCount: number      // non-stock/service lines (legitimately no cost)
  invoices: MarginInvoice[]
}

export async function getCustomerMargin(customer: string, from?: string, to?: string): Promise<CustomerMargin> {
  const siFilters: unknown[] = [['docstatus', '=', 1], ['customer', '=', customer]]
  if (from) siFilters.push(['posting_date', '>=', from])
  if (to)   siFilters.push(['posting_date', '<=', to])

  const heads: any[] = await frappeGet('/api/resource/Sales Invoice', {
    fields: ['name', 'customer_name', 'posting_date'],
    filters: siFilters,
    limit_page_length: 0,
    order_by: 'posting_date desc',
  })

  let customerName = customer
  const invoices: MarginInvoice[] = []
  let totalRevenue = 0
  let totalCost = 0
  let missingCostCount = 0
  let serviceCount = 0

  const names = heads.map((h) => h.name)
  const dateByName: Record<string, string> = {}
  for (const h of heads) { dateByName[h.name] = h.posting_date || ''; if (h.customer_name) customerName = h.customer_name }

  // gather docs first, then resolve cost meta for items that need it
  const docs: any[] = []
  for (const grp of chunk20(names, 20)) {
    const batch = await Promise.all(
      grp.map((n) => frappeGet(`/api/resource/Sales Invoice/${encodeURIComponent(n)}`).catch(() => null)),
    )
    for (const d of batch) if (d) docs.push(d)
  }
  const codesNeedingCost = new Set<string>()
  for (const doc of docs) {
    for (const it of doc.items ?? []) {
      const valuation = Number(it.valuation_rate || it.incoming_rate || 0)
      const gp = it.gross_profit
      const hasGp = gp !== undefined && gp !== null && Number(gp) !== 0
      if (!hasGp && valuation === 0 && it.item_code) codesNeedingCost.add(it.item_code)
    }
  }
  const costMeta = await itemCostMeta([...codesNeedingCost])

  for (const doc of docs) {
    const items: MarginLineItem[] = []
    let invRevenue = 0
    let invCost = 0
    for (const it of doc.items ?? []) {
      const revenue = Number(it.base_net_amount || it.base_amount || it.amount || 0)
      const qty = Number(it.stock_qty || it.qty || 0)
      const { cost, source } = resolveLineCost(it, qty, revenue, costMeta[it.item_code])
      if (source === 'missing') missingCostCount++
      if (source === 'service') serviceCount++
      const margin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0
      items.push({
        itemCode: it.item_code,
        itemName: it.item_name || it.item_code,
        qty,
        revenue: Math.round(revenue),
        cost: Math.round(cost),
        margin: Math.round(margin * 10) / 10,
        costMissing: source === 'missing',
        costSource: source,
      })
      invRevenue += revenue
      invCost += cost
    }
    const invMargin = invRevenue > 0 ? ((invRevenue - invCost) / invRevenue) * 100 : 0
    invoices.push({
      invoice: doc.name,
      date: dateByName[doc.name] || doc.posting_date || '',
      revenue: Math.round(invRevenue),
      cost: Math.round(invCost),
      margin: Math.round(invMargin * 10) / 10,
      items,
    })
    totalRevenue += invRevenue
    totalCost += invCost
  }

  const grossProfit = Math.round(totalRevenue - totalCost)
  const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
  return {
    customer,
    customerName,
    revenue: Math.round(totalRevenue),
    cost: Math.round(totalCost),
    grossProfit,
    margin: Math.round(margin * 10) / 10,
    missingCostCount,
    serviceCount,
    invoices,
  }
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
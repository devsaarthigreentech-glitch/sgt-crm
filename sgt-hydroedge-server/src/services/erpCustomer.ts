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
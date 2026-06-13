// // src/services/erpnext.ts
// // Server-side ERPNext read-through. Credentials never leave the backend.

// const BASE = process.env.ERPNEXT_URL!;
// const KEY = process.env.ERPNEXT_API_KEY!;
// const SECRET = process.env.ERPNEXT_API_SECRET!;
// const DEFAULT_ASSEMBLY_DAYS = Number(process.env.ERP_DEFAULT_ASSEMBLY_DAYS ?? 7);
// const FINAL_ITEM_GROUPS = (process.env.ERP_FINAL_ITEM_GROUP ?? 'Final Assembly')
//     .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

// function authHeaders() {
//     return { Authorization: `token ${KEY}:${SECRET}`, Accept: 'application/json' };
// }

// export async function getFiscalYears() {
//     const rows = await getList('Fiscal Year', {
//         fields: ['name', 'year_start_date', 'year_end_date'],
//     });
//     return rows
//         .map((r: any) => ({ name: r.name, from: r.year_start_date, to: r.year_end_date }))
//         .sort((a: any, b: any) => (a.from < b.from ? 1 : -1)); // newest first
// }

// async function frappeGet(path: string, params: Record<string, unknown> = {}) {
//     const url = new URL(`${BASE}${path}`);
//     for (const [k, v] of Object.entries(params)) {
//         url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
//     }
//     let res: Response | undefined;
//     for (let attempt = 1; ; attempt++) {
//         try { res = await fetch(url.toString(), { headers: authHeaders() }); break; }
//         catch (e) {
//             if (attempt >= 3) throw e;                       // only retries network throws
//             await new Promise((r) => setTimeout(r, 300 * attempt));
//         }
//     }
//     if (!res.ok) {
//         const body = await res.text();
//         throw new Error(`ERPNext ${res.status} ${path}: ${body.slice(0, 300)}`);
//     }
//     return (await res.json()).data;
// }
// function getList(doctype: string, opts: { filters?: unknown[]; fields?: string[] } = {}) {
//     return frappeGet(`/api/resource/${encodeURIComponent(doctype)}`, {
//         filters: opts.filters ?? [],
//         fields: opts.fields ?? ['name'],
//         limit_page_length: 0, // no limit
//     });
// }

// function getDoc(doctype: string, name: string) {
//     return frappeGet(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
// }

// function* chunked<T>(arr: T[], size: number) {
//     for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
// }

// function addDays(d: Date, days: number): string {
//     return new Date(d.getTime() + days * 86400000).toISOString().slice(0, 10);
// }

// // ---- tiny TTL cache (GL queries are heavy) ----
// const cache = new Map<string, { exp: number; val: unknown }>();
// async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
//     const hit = cache.get(key);
//     if (hit && hit.exp > Date.now()) return hit.val as T;
//     const val = await fn();
//     cache.set(key, { exp: Date.now() + ttlMs, val });
//     return val;
// }

// // ---- stock summed across all warehouses ----
// async function sumStock(codes: string[]) {
//     const map: Record<string, { actual: number; reserved: number }> = {};
//     for (const chunk of chunked(codes, 100)) {
//         const bins = await getList('Bin', {
//             filters: [['item_code', 'in', chunk]],
//             fields: ['item_code', 'actual_qty', 'reserved_qty'],
//         });
//         for (const b of bins) {
//             const m = (map[b.item_code] ??= { actual: 0, reserved: 0 });
//             m.actual += Number(b.actual_qty || 0);
//             m.reserved += Number(b.reserved_qty || 0);
//         }
//     }
//     return map;
// }

// // ---- lead times + item group (the "family" label) ----
// async function itemMeta(codes: string[]) {
//     const map: Record<string, { leadTimeDays: number; itemGroup: string; itemName: string }> = {};
//     for (const chunk of chunked(codes, 100)) {
//         const items = await getList('Item', {
//             filters: [['item_code', 'in', chunk]],
//             fields: ['item_code', 'lead_time_days', 'item_group', 'item_name'],
//         });
//         for (const it of items) {
//             map[it.item_code] = {
//                 leadTimeDays: Number(it.lead_time_days || 0),
//                 itemGroup: it.item_group || 'Other',
//                 itemName: it.item_name || it.item_code,
//             };
//         }
//     }
//     return map;
// }

// export async function getBuildable() {
//     return cached('buildable', 5 * 60_000, async () => {
//         const boms = await getList('BOM', {
//             filters: [['is_active', '=', 1], ['is_default', '=', 1]],
//             fields: ['name', 'item', 'item_name', 'quantity'],
//         });
//         if (!boms.length) return [];

//         const docs = await Promise.all(boms.map((b: any) => getDoc('BOM', b.name)));

//         const componentCodes = new Set<string>();
//         const fgCodes = new Set<string>();
//         for (const d of docs) {
//             fgCodes.add(d.item);
//             for (const ex of d.exploded_items ?? []) componentCodes.add(ex.item_code);
//         }

//         const stock = await sumStock([...componentCodes]);
//         const meta = await itemMeta([...new Set([...componentCodes, ...fgCodes])]);

//         const today = new Date();
//         const products = docs.map((d: any) => {
//             const divisor = Number(d.quantity || 1) || 1;
//             const components = (d.exploded_items ?? []).map((ex: any) => {
//                 const requiredPerUnit = Number(ex.stock_qty || 0) / divisor;
//                 const s = stock[ex.item_code] ?? { actual: 0, reserved: 0 };
//                 const m = meta[ex.item_code];
//                 const maxUnits = requiredPerUnit > 0 ? Math.floor(s.actual / requiredPerUnit) : Infinity;
//                 return {
//                     itemCode: ex.item_code,
//                     itemName: m?.itemName ?? ex.item_name ?? ex.item_code,
//                     requiredPerUnit,
//                     available: s.actual,
//                     reserved: s.reserved,
//                     leadTimeDays: m?.leadTimeDays ?? 0,
//                     maxUnits,
//                 };
//             });
//             const minUnits = components.length ? Math.min(...components.map((c) => c.maxUnits)) : 0;
//             const buildableNow = isFinite(minUnits) ? Math.max(0, minUnits) : 0;
//             const bottleneck = components
//                 .filter((c) => isFinite(c.maxUnits))
//                 .reduce((a, b) => (a && a.maxUnits <= b.maxUnits ? a : b), null as any);
//             const fg = meta[d.item];
//             const assemblyLeadDays = fg?.leadTimeDays && fg.leadTimeDays > 0 ? fg.leadTimeDays : DEFAULT_ASSEMBLY_DAYS;
//             return {
//                 bom: d.name,
//                 itemCode: d.item,
//                 itemName: fg?.itemName ?? d.item_name ?? d.item,
//                 family: fg?.itemGroup ?? 'Other',
//                 buildableNow,
//                 assemblyLeadDays,
//                 readyDateForBuildable: addDays(today, assemblyLeadDays),
//                 bottleneck: bottleneck
//                     ? { itemCode: bottleneck.itemCode, itemName: bottleneck.itemName, available: bottleneck.available }
//                     : null,
//                 components,
//             };
//         });

//         // keep only final-assembly finished goods (by ERPNext item group)
//         return products.filter((p) => FINAL_ITEM_GROUPS.includes(p.family.toLowerCase()));
//     });
// }

// export async function getPnl(from?: string, to?: string) {
//     return cached(`pnl:${from ?? 'all'}:${to ?? 'all'}`, 10 * 60_000, async () => {
//       const accounts = await getList('Account', {
//         filters: [['root_type', 'in', ['Income', 'Expense']]],
//         fields: ['name', 'root_type'],
//       });
//       const rootBy: Record<string, string> = {};
//       for (const a of accounts) rootBy[a.name] = a.root_type;
  
//       const filters: unknown[] = [['is_cancelled', '=', 0]];
//       if (from && to) filters.push(['posting_date', 'between', [from, to]]);
  
//       const gl = await getList('GL Entry', { filters, fields: ['account', 'debit', 'credit'] });
  
//       let income = 0, expense = 0;
//       for (const e of gl) {
//         const rt = rootBy[e.account];
//         if (rt === 'Income') income += Number(e.credit || 0) - Number(e.debit || 0);
//         else if (rt === 'Expense') expense += Number(e.debit || 0) - Number(e.credit || 0);
//       }
//       const netProfit = income - expense;
//       return { from: from ?? null, to: to ?? null, income, expense, netProfit, margin: income ? netProfit / income : 0 };
//     });
//   }

//   // ---- income broken down by account (mirrors getPnl's income math exactly) ----
// export async function getIncomeBreakdown(from?: string, to?: string) {
//     return cached(`income-breakdown:${from ?? 'all'}:${to ?? 'all'}`, 10 * 60_000, async () => {
//       const accounts = await getList('Account', {
//         filters: [['root_type', '=', 'Income']],
//         fields: ['name', 'account_name'],
//       });
//       const isIncome = new Set<string>();
//       const labelBy: Record<string, string> = {};
//       for (const a of accounts) { isIncome.add(a.name); labelBy[a.name] = a.account_name || a.name; }
  
//       const filters: unknown[] = [['is_cancelled', '=', 0]];
//       if (from && to) filters.push(['posting_date', 'between', [from, to]]);
  
//       const gl = await getList('GL Entry', { filters, fields: ['account', 'debit', 'credit'] });
  
//       const byAccount: Record<string, number> = {};
//       let total = 0;
//       for (const e of gl) {
//         if (!isIncome.has(e.account)) continue;
//         const amt = Number(e.credit || 0) - Number(e.debit || 0);
//         byAccount[e.account] = (byAccount[e.account] || 0) + amt;
//         total += amt;
//       }
  
//       const rows = Object.entries(byAccount)
//         .filter(([, amt]) => Math.abs(amt) > 0.005)
//         .map(([account, amount]) => ({
//           account,
//           label: labelBy[account] ?? account,
//           amount,
//           pct: total ? amount / total : 0,
//         }))
//         .sort((a, b) => b.amount - a.amount);
  
//       return { from: from ?? null, to: to ?? null, total, accounts: rows };
//     });
//   }
  
//   // ---- upcoming orders: most recent placed + next expected deliveries ----
//   export async function getUpcomingOrders(limit = 5) {
//     return cached(`upcoming-orders:${limit}`, 5 * 60_000, async () => {
//       const today = new Date().toISOString().slice(0, 10);
//       const SO = `/api/resource/${encodeURIComponent('Sales Order')}`;
  
//       // submitted, not closed, not fully delivered, delivery date today or later
//       const upcoming = await frappeGet(SO, {
//         filters: [
//           ['docstatus', '=', 1],
//           ['status', '!=', 'Closed'],
//           ['per_delivered', '<', 100],
//           ['delivery_date', '>=', today],
//         ],
//         fields: ['name', 'customer', 'customer_name', 'transaction_date',
//                  'delivery_date', 'status', 'grand_total', 'per_delivered'],
//         order_by: 'delivery_date asc',
//         limit_page_length: limit,
//       });
  
//       // most recently placed submitted order
//       const recent = await frappeGet(SO, {
//         filters: [['docstatus', '=', 1]],
//         fields: ['name', 'customer', 'customer_name', 'transaction_date',
//                  'delivery_date', 'status', 'grand_total'],
//         order_by: 'transaction_date desc',
//         limit_page_length: 1,
//       });
  
//       const norm = (o: any) => ({
//         id: o.name,
//         customer: o.customer_name || o.customer,
//         placedOn: o.transaction_date,
//         deliveryDate: o.delivery_date ?? null,
//         status: o.status,
//         total: Number(o.grand_total || 0),
//         delivered: Number(o.per_delivered || 0),
//       });
  
//       return {
//         lastOrder: recent?.length ? norm(recent[0]) : null,
//         upcoming: (upcoming ?? []).map(norm),
//       };
//     });
//   }
//   // ---- income drill-down: party + item sold + amount, from Sales Invoices ----
//   // Mirrors what you see in ERPNext when you open the Sales ledger and click
//   // into an invoice: each row is one invoice line (party · item · amount).
//   export async function getIncomeInvoiceItems(from?: string, to?: string) {
//     return cached(`income-items:${from ?? 'all'}:${to ?? 'all'}`, 10 * 60_000, async () => {
//       const filters: unknown[] = [['docstatus', '=', 1]];
//       if (from && to) filters.push(['posting_date', 'between', [from, to]]);

//       const invoices = await getList('Sales Invoice', {
//         filters,
//         fields: ['name', 'customer', 'customer_name', 'posting_date', 'is_return'],
//       });
//       if (!invoices.length) return { from: from ?? null, to: to ?? null, total: 0, rows: [] };

//       const partyBy: Record<string, string> = {};
//       const dateBy: Record<string, string> = {};
//       for (const inv of invoices) {
//         partyBy[inv.name] = inv.customer_name || inv.customer;
//         dateBy[inv.name] = inv.posting_date;
//       }

//       // Child table query: Frappe requires the `parent` doctype param.
//       const rows: { invoice: string; date: string; party: string; item: string; qty: number; amount: number }[] = [];
//       for (const chunk of chunked(invoices.map((i: any) => i.name), 50)) {
//         const items = await frappeGet(`/api/resource/${encodeURIComponent('Sales Invoice Item')}`, {
//           parent: 'Sales Invoice',
//           filters: [['parent', 'in', chunk]],
//           fields: ['parent', 'item_code', 'item_name', 'qty', 'base_net_amount'],
//           limit_page_length: 0,
//         });
//         for (const it of items ?? []) {
//           rows.push({
//             invoice: it.parent,
//             date: dateBy[it.parent] ?? '',
//             party: partyBy[it.parent] ?? it.parent,
//             item: it.item_name || it.item_code,
//             qty: Number(it.qty || 0),
//             amount: Number(it.base_net_amount || 0),
//           });
//         }
//       }
//       rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
//       const total = rows.reduce((s, r) => s + r.amount, 0);
//       return { from: from ?? null, to: to ?? null, total, rows };
//     });
//   }

//   // ---- expense drill-down: one tree level at a time ----
//   // Loads the Expense account tree + GL once per period (cached), then answers
//   // "direct children of X with subtree totals" cheaply for any node.
//   async function expenseLedger(from?: string, to?: string) {
//     return cached(`expense-ledger:${from ?? 'all'}:${to ?? 'all'}`, 10 * 60_000, async () => {
//       const accounts = await getList('Account', {
//         filters: [['root_type', '=', 'Expense']],
//         fields: ['name', 'account_name', 'parent_account', 'is_group'],
//       });

//       const filters: unknown[] = [['is_cancelled', '=', 0]];
//       if (from && to) filters.push(['posting_date', 'between', [from, to]]);
//       const gl = await getList('GL Entry', { filters, fields: ['account', 'debit', 'credit'] });

//       const inSet = new Set(accounts.map((a: any) => a.name));
//       const direct: Record<string, number> = {};
//       for (const e of gl) {
//         if (!inSet.has(e.account)) continue;
//         direct[e.account] = (direct[e.account] || 0) + Number(e.debit || 0) - Number(e.credit || 0);
//       }

//       const children: Record<string, string[]> = {};
//       const meta: Record<string, { account_name: string; parent_account: string | null; is_group: number }> = {};
//       for (const a of accounts) {
//         meta[a.name] = a;
//         if (a.parent_account) (children[a.parent_account] ??= []).push(a.name);
//       }

//       // subtree totals (group nodes roll up their descendants)
//       const subtotal: Record<string, number> = {};
//       const calc = (name: string): number => {
//         if (subtotal[name] !== undefined) return subtotal[name];
//         let t = direct[name] || 0;
//         for (const c of children[name] ?? []) t += calc(c);
//         return (subtotal[name] = t);
//       };
//       for (const a of accounts) calc(a.name);

//       // roots = expense accounts whose parent is not itself an expense account
//       const roots = accounts
//         .filter((a: any) => !a.parent_account || !inSet.has(a.parent_account))
//         .map((a: any) => a.name);

//       return { children, meta, subtotal, roots };
//     });
//   }

//   /**
//    * Direct children of `parent` only (no grandchildren), each with its rolled-up
//    * subtree amount. No parent => children of the root Expenses account, so the
//    * first click shows e.g. Direct Expenses / Indirect Expenses and nothing deeper.
//    */
//   export async function getExpenseChildren(parent: string | undefined, from?: string, to?: string) {
//     const { children, meta, subtotal, roots } = await expenseLedger(from, to);

//     let parentName = parent;
//     if (!parentName) {
//       if (roots.length === 1) {
//         parentName = roots[0];
//       } else {
//         // unusual: multiple roots — show them as the first level
//         const rows = roots
//           .map((n: string) => ({
//             account: n,
//             label: meta[n]?.account_name || n,
//             amount: subtotal[n] || 0,
//             isGroup: !!meta[n]?.is_group,
//           }))
//           .filter((r: any) => Math.abs(r.amount) > 0.005)
//           .sort((a: any, b: any) => b.amount - a.amount);
//         return {
//           parent: null, parentLabel: 'Expenses',
//           total: rows.reduce((s: number, r: any) => s + r.amount, 0),
//           rows,
//         };
//       }
//     }

//     const rows = (children[parentName!] ?? [])
//       .map((n) => ({
//         account: n,
//         label: meta[n]?.account_name || n,
//         amount: subtotal[n] || 0,
//         isGroup: !!meta[n]?.is_group && (children[n]?.length ?? 0) > 0,
//       }))
//       .filter((r) => Math.abs(r.amount) > 0.005)
//       .sort((a, b) => b.amount - a.amount);

//     return {
//       parent: parentName,
//       parentLabel: meta[parentName!]?.account_name ?? parentName,
//       total: subtotal[parentName!] ?? 0,
//       rows,
//     };
//   }
// src/services/erpnext.ts
// Server-side ERPNext read-through. Credentials never leave the backend.

const BASE = process.env.ERPNEXT_URL!;
const KEY = process.env.ERPNEXT_API_KEY!;
const SECRET = process.env.ERPNEXT_API_SECRET!;
const DEFAULT_ASSEMBLY_DAYS = Number(process.env.ERP_DEFAULT_ASSEMBLY_DAYS ?? 7);
const FINAL_ITEM_GROUPS = (process.env.ERP_FINAL_ITEM_GROUP ?? 'Final Assembly')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

function authHeaders() {
    return { Authorization: `token ${KEY}:${SECRET}`, Accept: 'application/json' };
}

export async function getFiscalYears() {
    const rows = await getList('Fiscal Year', {
        fields: ['name', 'year_start_date', 'year_end_date'],
    });
    return rows
        .map((r: any) => ({ name: r.name, from: r.year_start_date, to: r.year_end_date }))
        .sort((a: any, b: any) => (a.from < b.from ? 1 : -1)); // newest first
}

async function frappeGet(path: string, params: Record<string, unknown> = {}) {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    let res: Response | undefined;
    for (let attempt = 1; ; attempt++) {
        try { res = await fetch(url.toString(), { headers: authHeaders() }); break; }
        catch (e) {
            if (attempt >= 3) throw e;                       // only retries network throws
            await new Promise((r) => setTimeout(r, 300 * attempt));
        }
    }
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`ERPNext ${res.status} ${path}: ${body.slice(0, 300)}`);
    }
    return (await res.json()).data;
}
function getList(doctype: string, opts: { filters?: unknown[]; fields?: string[] } = {}) {
    return frappeGet(`/api/resource/${encodeURIComponent(doctype)}`, {
        filters: opts.filters ?? [],
        fields: opts.fields ?? ['name'],
        limit_page_length: 0, // no limit
    });
}

function getDoc(doctype: string, name: string) {
    return frappeGet(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
}

function* chunked<T>(arr: T[], size: number) {
    for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}

function addDays(d: Date, days: number): string {
    return new Date(d.getTime() + days * 86400000).toISOString().slice(0, 10);
}

// ---- tiny TTL cache (GL queries are heavy) ----
const cache = new Map<string, { exp: number; val: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now()) return hit.val as T;
    const val = await fn();
    cache.set(key, { exp: Date.now() + ttlMs, val });
    return val;
}

// ---- stock summed across all warehouses ----
async function sumStock(codes: string[]) {
    const map: Record<string, { actual: number; reserved: number }> = {};
    for (const chunk of chunked(codes, 100)) {
        const bins = await getList('Bin', {
            filters: [['item_code', 'in', chunk]],
            fields: ['item_code', 'actual_qty', 'reserved_qty'],
        });
        for (const b of bins) {
            const m = (map[b.item_code] ??= { actual: 0, reserved: 0 });
            m.actual += Number(b.actual_qty || 0);
            m.reserved += Number(b.reserved_qty || 0);
        }
    }
    return map;
}

// ---- lead times + item group (the "family" label) ----
async function itemMeta(codes: string[]) {
    const map: Record<string, { leadTimeDays: number; itemGroup: string; itemName: string }> = {};
    for (const chunk of chunked(codes, 100)) {
        const items = await getList('Item', {
            filters: [['item_code', 'in', chunk]],
            fields: ['item_code', 'lead_time_days', 'item_group', 'item_name'],
        });
        for (const it of items) {
            map[it.item_code] = {
                leadTimeDays: Number(it.lead_time_days || 0),
                itemGroup: it.item_group || 'Other',
                itemName: it.item_name || it.item_code,
            };
        }
    }
    return map;
}

export async function getBuildable() {
    return cached('buildable', 5 * 60_000, async () => {
        const boms = await getList('BOM', {
            filters: [['is_active', '=', 1], ['is_default', '=', 1]],
            fields: ['name', 'item', 'item_name', 'quantity'],
        });
        if (!boms.length) return [];

        const docs = await Promise.all(boms.map((b: any) => getDoc('BOM', b.name)));

        const componentCodes = new Set<string>();
        const fgCodes = new Set<string>();
        for (const d of docs) {
            fgCodes.add(d.item);
            for (const ex of d.exploded_items ?? []) componentCodes.add(ex.item_code);
        }

        const stock = await sumStock([...componentCodes]);
        const meta = await itemMeta([...new Set([...componentCodes, ...fgCodes])]);

        const today = new Date();
        const products = docs.map((d: any) => {
            const divisor = Number(d.quantity || 1) || 1;
            const components = (d.exploded_items ?? []).map((ex: any) => {
                const requiredPerUnit = Number(ex.stock_qty || 0) / divisor;
                const s = stock[ex.item_code] ?? { actual: 0, reserved: 0 };
                const m = meta[ex.item_code];
                const maxUnits = requiredPerUnit > 0 ? Math.floor(s.actual / requiredPerUnit) : Infinity;
                return {
                    itemCode: ex.item_code,
                    itemName: m?.itemName ?? ex.item_name ?? ex.item_code,
                    requiredPerUnit,
                    available: s.actual,
                    reserved: s.reserved,
                    leadTimeDays: m?.leadTimeDays ?? 0,
                    maxUnits,
                };
            });
            const minUnits = components.length ? Math.min(...components.map((c) => c.maxUnits)) : 0;
            const buildableNow = isFinite(minUnits) ? Math.max(0, minUnits) : 0;
            const bottleneck = components
                .filter((c) => isFinite(c.maxUnits))
                .reduce((a, b) => (a && a.maxUnits <= b.maxUnits ? a : b), null as any);
            const fg = meta[d.item];
            const assemblyLeadDays = fg?.leadTimeDays && fg.leadTimeDays > 0 ? fg.leadTimeDays : DEFAULT_ASSEMBLY_DAYS;
            return {
                bom: d.name,
                itemCode: d.item,
                itemName: fg?.itemName ?? d.item_name ?? d.item,
                family: fg?.itemGroup ?? 'Other',
                buildableNow,
                assemblyLeadDays,
                readyDateForBuildable: addDays(today, assemblyLeadDays),
                bottleneck: bottleneck
                    ? { itemCode: bottleneck.itemCode, itemName: bottleneck.itemName, available: bottleneck.available }
                    : null,
                components,
            };
        });

        // keep only final-assembly finished goods (by ERPNext item group)
        return products.filter((p) => FINAL_ITEM_GROUPS.includes(p.family.toLowerCase()));
    });
}

export async function getPnl(from?: string, to?: string) {
    return cached(`pnl:${from ?? 'all'}:${to ?? 'all'}`, 10 * 60_000, async () => {
      const accounts = await getList('Account', {
        filters: [['root_type', 'in', ['Income', 'Expense']]],
        fields: ['name', 'root_type'],
      });
      const rootBy: Record<string, string> = {};
      for (const a of accounts) rootBy[a.name] = a.root_type;
  
      const filters: unknown[] = [['is_cancelled', '=', 0]];
      if (from && to) filters.push(['posting_date', 'between', [from, to]]);
  
      const gl = await getList('GL Entry', { filters, fields: ['account', 'debit', 'credit'] });
  
      let income = 0, expense = 0;
      for (const e of gl) {
        const rt = rootBy[e.account];
        if (rt === 'Income') income += Number(e.credit || 0) - Number(e.debit || 0);
        else if (rt === 'Expense') expense += Number(e.debit || 0) - Number(e.credit || 0);
      }
      const netProfit = income - expense;
      return { from: from ?? null, to: to ?? null, income, expense, netProfit, margin: income ? netProfit / income : 0 };
    });
  }

  // ---- income broken down by account (mirrors getPnl's income math exactly) ----
export async function getIncomeBreakdown(from?: string, to?: string) {
    return cached(`income-breakdown:${from ?? 'all'}:${to ?? 'all'}`, 10 * 60_000, async () => {
      const accounts = await getList('Account', {
        filters: [['root_type', '=', 'Income']],
        fields: ['name', 'account_name'],
      });
      const isIncome = new Set<string>();
      const labelBy: Record<string, string> = {};
      for (const a of accounts) { isIncome.add(a.name); labelBy[a.name] = a.account_name || a.name; }
  
      const filters: unknown[] = [['is_cancelled', '=', 0]];
      if (from && to) filters.push(['posting_date', 'between', [from, to]]);
  
      const gl = await getList('GL Entry', { filters, fields: ['account', 'debit', 'credit'] });
  
      const byAccount: Record<string, number> = {};
      let total = 0;
      for (const e of gl) {
        if (!isIncome.has(e.account)) continue;
        const amt = Number(e.credit || 0) - Number(e.debit || 0);
        byAccount[e.account] = (byAccount[e.account] || 0) + amt;
        total += amt;
      }
  
      const rows = Object.entries(byAccount)
        .filter(([, amt]) => Math.abs(amt) > 0.005)
        .map(([account, amount]) => ({
          account,
          label: labelBy[account] ?? account,
          amount,
          pct: total ? amount / total : 0,
        }))
        .sort((a, b) => b.amount - a.amount);
  
      return { from: from ?? null, to: to ?? null, total, accounts: rows };
    });
  }
  
  // ---- upcoming orders: most recent placed + next expected deliveries ----
  export async function getUpcomingOrders(limit = 5) {
    return cached(`upcoming-orders:${limit}`, 5 * 60_000, async () => {
      const today = new Date().toISOString().slice(0, 10);
      const SO = `/api/resource/${encodeURIComponent('Sales Order')}`;
  
      // submitted, not closed, not fully delivered, delivery date today or later
      const upcoming = await frappeGet(SO, {
        filters: [
          ['docstatus', '=', 1],
          ['status', '!=', 'Closed'],
          ['per_delivered', '<', 100],
          ['delivery_date', '>=', today],
        ],
        fields: ['name', 'customer', 'customer_name', 'transaction_date',
                 'delivery_date', 'status', 'grand_total', 'per_delivered'],
        order_by: 'delivery_date asc',
        limit_page_length: limit,
      });
  
      // most recently placed submitted order
      const recent = await frappeGet(SO, {
        filters: [['docstatus', '=', 1]],
        fields: ['name', 'customer', 'customer_name', 'transaction_date',
                 'delivery_date', 'status', 'grand_total'],
        order_by: 'transaction_date desc',
        limit_page_length: 1,
      });
  
      const norm = (o: any) => ({
        id: o.name,
        customer: o.customer_name || o.customer,
        placedOn: o.transaction_date,
        deliveryDate: o.delivery_date ?? null,
        status: o.status,
        total: Number(o.grand_total || 0),
        delivered: Number(o.per_delivered || 0),
      });
  
      return {
        lastOrder: recent?.length ? norm(recent[0]) : null,
        upcoming: (upcoming ?? []).map(norm),
      };
    });
  }
  // ---- income drill-down: party + item sold + amount, from Sales Invoices ----
  // Mirrors what you see in ERPNext when you open the Sales ledger and click
  // into an invoice: each row is one invoice line (party · item · amount).
  export async function getIncomeInvoiceItems(from?: string, to?: string) {
    return cached(`income-items:${from ?? 'all'}:${to ?? 'all'}`, 10 * 60_000, async () => {
      const filters: unknown[] = [['docstatus', '=', 1]];
      if (from && to) filters.push(['posting_date', 'between', [from, to]]);

      const invoices = await getList('Sales Invoice', {
        filters,
        fields: ['name', 'customer', 'customer_name', 'posting_date', 'is_return'],
      });
      if (!invoices.length) return { from: from ?? null, to: to ?? null, total: 0, rows: [] };

      const partyBy: Record<string, string> = {};
      const dateBy: Record<string, string> = {};
      for (const inv of invoices) {
        partyBy[inv.name] = inv.customer_name || inv.customer;
        dateBy[inv.name] = inv.posting_date;
      }

      // Child table query: Frappe requires the `parent` doctype param.
      const rows: { invoice: string; date: string; party: string; item: string; qty: number; amount: number }[] = [];
      for (const chunk of chunked(invoices.map((i: any) => i.name), 50)) {
        const items = await frappeGet(`/api/resource/${encodeURIComponent('Sales Invoice Item')}`, {
          parent: 'Sales Invoice',
          filters: [['parent', 'in', chunk]],
          fields: ['parent', 'item_code', 'item_name', 'qty', 'base_net_amount'],
          limit_page_length: 0,
        });
        for (const it of items ?? []) {
          rows.push({
            invoice: it.parent,
            date: dateBy[it.parent] ?? '',
            party: partyBy[it.parent] ?? it.parent,
            item: it.item_name || it.item_code,
            qty: Number(it.qty || 0),
            amount: Number(it.base_net_amount || 0),
          });
        }
      }
      rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      const total = rows.reduce((s, r) => s + r.amount, 0);
      return { from: from ?? null, to: to ?? null, total, rows };
    });
  }

  // ---- expense drill-down: one tree level at a time ----
  // Loads the Expense account tree + GL once per period (cached), then answers
  // "direct children of X with subtree totals" cheaply for any node.
  async function expenseLedger(from?: string, to?: string) {
    return cached(`expense-ledger:${from ?? 'all'}:${to ?? 'all'}`, 10 * 60_000, async () => {
      const accounts = await getList('Account', {
        filters: [['root_type', '=', 'Expense']],
        fields: ['name', 'account_name', 'parent_account', 'is_group'],
      });

      const filters: unknown[] = [['is_cancelled', '=', 0]];
      if (from && to) filters.push(['posting_date', 'between', [from, to]]);
      const gl = await getList('GL Entry', { filters, fields: ['account', 'debit', 'credit'] });

      const inSet = new Set(accounts.map((a: any) => a.name));
      const direct: Record<string, number> = {};
      for (const e of gl) {
        if (!inSet.has(e.account)) continue;
        direct[e.account] = (direct[e.account] || 0) + Number(e.debit || 0) - Number(e.credit || 0);
      }

      const children: Record<string, string[]> = {};
      const meta: Record<string, { account_name: string; parent_account: string | null; is_group: number }> = {};
      for (const a of accounts) {
        meta[a.name] = a;
        if (a.parent_account) (children[a.parent_account] ??= []).push(a.name);
      }

      // subtree totals (group nodes roll up their descendants)
      const subtotal: Record<string, number> = {};
      const calc = (name: string): number => {
        if (subtotal[name] !== undefined) return subtotal[name];
        let t = direct[name] || 0;
        for (const c of children[name] ?? []) t += calc(c);
        return (subtotal[name] = t);
      };
      for (const a of accounts) calc(a.name);

      // roots = expense accounts whose parent is not itself an expense account
      const roots = accounts
        .filter((a: any) => !a.parent_account || !inSet.has(a.parent_account))
        .map((a: any) => a.name);

      return { children, meta, subtotal, roots };
    });
  }

  /**
   * Direct children of `parent` only (no grandchildren), each with its rolled-up
   * subtree amount. No parent => children of the root Expenses account, so the
   * first click shows e.g. Direct Expenses / Indirect Expenses and nothing deeper.
   */
  export async function getExpenseChildren(parent: string | undefined, from?: string, to?: string) {
    const { children, meta, subtotal, roots } = await expenseLedger(from, to);

    let parentName = parent;
    if (!parentName) {
      if (roots.length === 1) {
        parentName = roots[0];
      } else {
        // unusual: multiple roots — show them as the first level
        const rows = roots
          .map((n: string) => ({
            account: n,
            label: meta[n]?.account_name || n,
            amount: subtotal[n] || 0,
            isGroup: !!meta[n]?.is_group,
          }))
          .filter((r: any) => Math.abs(r.amount) > 0.005)
          .sort((a: any, b: any) => b.amount - a.amount);
        return {
          parent: null, parentLabel: 'Expenses',
          total: rows.reduce((s: number, r: any) => s + r.amount, 0),
          rows,
        };
      }
    }

    const rows = (children[parentName!] ?? [])
      .map((n) => ({
        account: n,
        label: meta[n]?.account_name || n,
        amount: subtotal[n] || 0,
        isGroup: !!meta[n]?.is_group && (children[n]?.length ?? 0) > 0,
      }))
      .filter((r) => Math.abs(r.amount) > 0.005)
      .sort((a, b) => b.amount - a.amount);

    return {
      parent: parentName,
      parentLabel: meta[parentName!]?.account_name ?? parentName,
      total: subtotal[parentName!] ?? 0,
      rows,
    };
  }

  // ---- income grouped into the 4 fiscal quarters (rupees) ----
  // Q1 = first 3 months of the fiscal year, Q2 = next 3, etc. Uses the same
  // income math as getPnl/getIncomeBreakdown (credit - debit on Income accounts).
  export async function getQuarterlyIncome(fyFrom: string, fyTo: string) {
    return cached(`quarterly-income:${fyFrom}:${fyTo}`, 10 * 60_000, async () => {
      const accounts = await getList('Account', {
        filters: [['root_type', '=', 'Income']],
        fields: ['name'],
      });
      const isIncome = new Set(accounts.map((a: any) => a.name));

      const gl = await getList('GL Entry', {
        filters: [['is_cancelled', '=', 0], ['posting_date', 'between', [fyFrom, fyTo]]],
        fields: ['account', 'debit', 'credit', 'posting_date'],
      });

      // quarter boundaries derived from the FY start date
      const start = new Date(fyFrom + 'T00:00:00');
      const bounds: Date[] = [0, 3, 6, 9, 12].map((m) => {
        const d = new Date(start);
        d.setMonth(d.getMonth() + m);
        return d;
      });
      const q: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
      const keys: ('Q1' | 'Q2' | 'Q3' | 'Q4')[] = ['Q1', 'Q2', 'Q3', 'Q4'];

      for (const e of gl) {
        if (!isIncome.has(e.account)) continue;
        const amt = Number(e.credit || 0) - Number(e.debit || 0);
        const d = new Date(e.posting_date + 'T00:00:00');
        let idx = 0;
        for (let i = 0; i < 4; i++) {
          if (d >= bounds[i] && d < bounds[i + 1]) { idx = i; break; }
          if (i === 3 && d >= bounds[3]) idx = 3; // clamp anything in/after Q4
        }
        q[keys[idx]] += amt;
      }
      return q;
    });
  }

  // ---- outstanding (open) Sales Orders + fulfilment time on delivered ones ----
  // "Outstanding" = submitted, not Closed, not 100% delivered.
  // For delivered orders we measure days from order date to the last Delivery Note.
  export async function getOutstandingOrders(limit = 50) {
    return cached(`outstanding-orders:${limit}`, 5 * 60_000, async () => {
      const SO = `/api/resource/${encodeURIComponent('Sales Order')}`;

      const open = await frappeGet(SO, {
        filters: [
          ['docstatus', '=', 1],
          ['status', 'not in', ['Closed', 'Completed', 'Cancelled']],
          ['per_delivered', '<', 100],
        ],
        fields: ['name', 'customer', 'customer_name', 'transaction_date',
                 'delivery_date', 'status', 'grand_total', 'per_delivered'],
        order_by: 'transaction_date asc',
        limit_page_length: limit,
      });

      const today = new Date();
      const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

      const orders = (open ?? []).map((o: any) => {
        const placed = o.transaction_date ? new Date(o.transaction_date) : null;
        const ageDays = placed ? Math.max(0, Math.round((startOfDay(today) - startOfDay(placed)) / 86400000)) : null;
        return {
          id: o.name,
          customer: o.customer_name || o.customer,
          placedOn: o.transaction_date ?? null,
          deliveryDate: o.delivery_date ?? null,
          status: o.status,
          total: Number(o.grand_total || 0),
          delivered: Number(o.per_delivered || 0),
          ageDays, // days since the order was placed (still open)
        };
      });

      const outstandingValue = orders.reduce((s: number, o: any) => s + o.total, 0);

      // Fulfilment time on recently delivered orders: order date -> last Delivery Note date.
      const delivered = await frappeGet(SO, {
        filters: [['docstatus', '=', 1], ['per_delivered', '>=', 100]],
        fields: ['name', 'transaction_date'],
        order_by: 'transaction_date desc',
        limit_page_length: 30,
      });

      let fulfilment: { id: string; days: number }[] = [];
      if (delivered?.length) {
        const dnItems = await frappeGet(`/api/resource/${encodeURIComponent('Delivery Note Item')}`, {
          parent: 'Delivery Note',
          filters: [['against_sales_order', 'in', delivered.map((d: any) => d.name)], ['docstatus', '=', 1]],
          fields: ['against_sales_order', 'creation'],
          limit_page_length: 0,
        });
        const lastDNBy: Record<string, string> = {};
        for (const it of dnItems ?? []) {
          const so = it.against_sales_order;
          if (!so) continue;
          if (!lastDNBy[so] || it.creation > lastDNBy[so]) lastDNBy[so] = it.creation;
        }
        for (const d of delivered) {
          const dn = lastDNBy[d.name];
          if (!dn || !d.transaction_date) continue;
          const days = Math.max(0, Math.round(
            (startOfDay(new Date(dn)) - startOfDay(new Date(d.transaction_date))) / 86400000
          ));
          fulfilment.push({ id: d.name, days });
        }
      }
      const avgFulfilmentDays = fulfilment.length
        ? Math.round(fulfilment.reduce((s, f) => s + f.days, 0) / fulfilment.length)
        : null;

      return {
        count: orders.length,
        outstandingValue,
        orders,
        avgFulfilmentDays,
        fulfilmentSamples: fulfilment.length,
      };
    });
  }
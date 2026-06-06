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
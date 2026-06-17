// src/services/buildable.ts
// ---------------------------------------------------------------------------
// Multi-level buildable-unit calculation + draft Purchase Order procurement.
// ---------------------------------------------------------------------------

const BASE = process.env.ERPNEXT_URL!;
const KEY = process.env.ERPNEXT_API_KEY!;
const SECRET = process.env.ERPNEXT_API_SECRET!;
const DEFAULT_ASSEMBLY_DAYS = Number(process.env.ERP_DEFAULT_ASSEMBLY_DAYS ?? 7);
const FINAL_ITEM_GROUPS = (process.env.ERP_FINAL_ITEM_GROUP ?? 'Final Assembly')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

function authHeaders() {
    return { Authorization: `token ${KEY}:${SECRET}`, Accept: 'application/json' };
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
            if (attempt >= 3) throw e;
            await new Promise((r) => setTimeout(r, 300 * attempt));
        }
    }
    if (!res!.ok) {
        const body = await res!.text();
        throw new Error(`ERPNext ${res!.status} ${path}: ${body.slice(0, 300)}`);
    }
    return (await res!.json()).data;
}

async function frappePost(doctype: string, doc: Record<string, unknown>) {
    const url = `${BASE}/api/resource/${encodeURIComponent(doctype)}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`ERPNext ${res.status} create ${doctype}: ${body.slice(0, 400)}`);
    }
    return (await res.json()).data;
}

function getList(doctype: string, opts: { filters?: unknown[]; fields?: string[]; limit?: number } = {}) {
    return frappeGet(`/api/resource/${encodeURIComponent(doctype)}`, {
        filters: opts.filters ?? [],
        fields: opts.fields ?? ['name'],
        limit_page_length: opts.limit ?? 0,
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

const cache = new Map<string, { exp: number; val: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now()) return hit.val as T;
    const val = await fn();
    cache.set(key, { exp: Date.now() + ttlMs, val });
    return val;
}

async function sumStock(codes: string[]) {
    const map: Record<string, { actual: number; reserved: number }> = {};
    for (const chunk of chunked(codes, 100)) {
        if (!chunk.length) continue;
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

type Meta = { leadTimeDays: number; itemGroup: string; itemName: string; rate: number; stockUom: string };

async function itemMeta(codes: string[]) {
    const map: Record<string, Meta> = {};
    for (const chunk of chunked(codes, 100)) {
        if (!chunk.length) continue;
        const items = await getList('Item', {
            filters: [['item_code', 'in', chunk]],
            fields: ['item_code', 'lead_time_days', 'item_group', 'item_name',
                     'last_purchase_rate', 'valuation_rate', 'stock_uom'],
        });
        for (const it of items) {
            const rate = Number(it.last_purchase_rate || 0) || Number(it.valuation_rate || 0) || 0;
            map[it.item_code] = {
                leadTimeDays: Number(it.lead_time_days || 0),
                itemGroup: it.item_group || 'Other',
                itemName: it.item_name || it.item_code,
                rate,
                stockUom: it.stock_uom || 'Nos',
            };
        }
    }
    return map;
}

// raw-material-per-1-sub-assembly, fully exploded, memoised by the sub's BOM name
const subRawCache = new Map<string, Record<string, number>>();
async function rawPerSub(bomNo: string): Promise<Record<string, number>> {
    const hit = subRawCache.get(bomNo);
    if (hit) return hit;
    const d = await getDoc('BOM', bomNo);
    const div = Number(d.quantity || 1) || 1;
    const out: Record<string, number> = {};
    for (const ex of d.exploded_items ?? []) {
        out[ex.item_code] = (out[ex.item_code] ?? 0) + Number(ex.stock_qty || 0) / div;
    }
    subRawCache.set(bomNo, out);
    return out;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

// A raw material shortage underneath a sub-assembly (or at the direct level)
export type RawShortage = {
    itemCode: string;
    itemName: string;
    need: number;       // total needed for target qty
    available: number;  // on-hand raw (not crediting sub-stock — that's the sub's job)
    short: number;
    rate: number;
    cost: number;
    leadTimeDays: number;
    uom: string;
};

// A sub-assembly that is itself short (not enough pre-built stock)
// Its rawShortages are the raw materials that are ALSO short (need to buy).
// rawShortages can be empty if the raw materials are all in stock — meaning
// you just need to BUILD the sub-assembly from available raws, not buy anything.
export type SubShortage = {
    itemCode: string;
    itemName: string;
    perUnit: number;            // sub-assemblies needed per finished unit
    available: number;          // on-hand pre-built sub-assemblies
    need: number;               // total sub-assemblies needed
    short: number;              // how many pre-built sub-assemblies are missing
    leadTimeDays: number;
    rawShortages: RawShortage[];// raw materials that need purchasing
};

export type BuildComponent = {
    itemCode: string; itemName: string; requiredPerUnit: number;
    available: number; reserved: number; leadTimeDays: number; maxUnits: number;
    rate: number;
};

export type BuildProduct = {
    bom: string; itemCode: string; itemName: string; family: string;
    buildableNow: number; assemblyLeadDays: number; readyDateForBuildable: string;
    bottleneck: { itemCode: string; itemName: string; available: number } | null;
    components: BuildComponent[];
    // New: structured shortage tree for display. Only populated when qty > buildableNow.
    // Built client-side from components + subAssemblyMap using readyFor().
    // We expose the sub-assembly map so the frontend can build the tree per user-chosen target.
    subAssemblyMap: {
        itemCode: string;
        itemName: string;
        perUnit: number;        // per finished unit
        available: number;      // on-hand pre-built
        leadTimeDays: number;
        rawCodes: string[];     // which raw item_codes belong to this sub
    }[];
};

async function computeProducts(): Promise<BuildProduct[]> {
    const boms = await getList('BOM', {
        filters: [['is_active', '=', 1], ['is_default', '=', 1]],
        fields: ['name', 'item', 'item_name', 'quantity'],
    });
    if (!boms.length) return [];

    const docs: any[] = await Promise.all(boms.map((b: any) => getDoc('BOM', b.name)));

    const rawCodes = new Set<string>();
    const subCodes = new Set<string>();
    const fgCodes = new Set<string>();

    const perDoc = docs.map((d: any) => {
        fgCodes.add(d.item);
        const divisor = Number(d.quantity || 1) || 1;
        for (const ex of d.exploded_items ?? []) rawCodes.add(ex.item_code);
        const subs = (d.items ?? [])
            .filter((it: any) => it.bom_no)
            .map((it: any) => {
                subCodes.add(it.item_code);
                return {
                    itemCode: it.item_code as string,
                    bomNo: it.bom_no as string,
                    perUnit: Number(it.stock_qty || 0) / divisor,
                };
            });
        return { d, divisor, subs };
    });

    const subBomNos = new Set<string>();
    perDoc.forEach((pd) => pd.subs.forEach((s: any) => subBomNos.add(s.bomNo)));
    const subRaw: Record<string, Record<string, number>> = {};
    for (const bn of subBomNos) {
        subRaw[bn] = await rawPerSub(bn);
        for (const code of Object.keys(subRaw[bn])) rawCodes.add(code);
    }

    const stock = await sumStock([...new Set([...rawCodes, ...subCodes])]);
    const meta = await itemMeta([...new Set([...rawCodes, ...fgCodes, ...subCodes])]);
    const today = new Date();

    const products: BuildProduct[] = perDoc.map(({ d, divisor, subs }) => {
        // Credit raw materials with the raw embodied in on-hand sub-assemblies
        const credit: Record<string, number> = {};
        const subAssemblyMap: BuildProduct['subAssemblyMap'] = subs.map((s: any) => {
            const onhand = stock[s.itemCode]?.actual ?? 0;
            const rp = subRaw[s.bomNo] ?? {};
            for (const [code, per] of Object.entries(rp)) {
                credit[code] = (credit[code] ?? 0) + onhand * per;
            }
            const m = meta[s.itemCode];
            return {
                itemCode: s.itemCode,
                itemName: m?.itemName ?? s.itemCode,
                perUnit: s.perUnit,
                available: onhand,
                leadTimeDays: m?.leadTimeDays ?? 0,
                rawCodes: Object.keys(rp),
            };
        });

        const components: BuildComponent[] = (d.exploded_items ?? []).map((ex: any) => {
            const requiredPerUnit = Number(ex.stock_qty || 0) / divisor;
            const rawOnhand = stock[ex.item_code]?.actual ?? 0;
            const available = rawOnhand + (credit[ex.item_code] ?? 0);
            const m = meta[ex.item_code];
            const maxUnits = requiredPerUnit > 0 ? Math.floor(available / requiredPerUnit) : Infinity;
            return {
                itemCode: ex.item_code,
                itemName: m?.itemName ?? ex.item_name ?? ex.item_code,
                requiredPerUnit,
                available,
                reserved: stock[ex.item_code]?.reserved ?? 0,
                leadTimeDays: m?.leadTimeDays ?? 0,
                rate: m?.rate ?? 0,
                maxUnits,
            };
        });

        const minUnits = components.length ? Math.min(...components.map((c) => c.maxUnits)) : 0;
        const buildableNow = isFinite(minUnits) ? Math.max(0, minUnits) : 0;
        const bottleneck = components
            .filter((c) => isFinite(c.maxUnits))
            .reduce((a, b) => (a && a.maxUnits <= b.maxUnits ? a : b), null as BuildComponent | null);
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
            subAssemblyMap,
        };
    });

    return products.filter((p) => FINAL_ITEM_GROUPS.includes(p.family.toLowerCase()));
}

export async function getBuildable(): Promise<BuildProduct[]> {
    return cached('buildable_v3', 5 * 60_000, computeProducts);
}

// ---------------------------------------------------------------------------
// PROCUREMENT
// ---------------------------------------------------------------------------

// Resolve each item's supplier from the LAST Purchase Invoice it appeared on.
// FIX: query the PARENT Purchase Invoice doctype with a child-table filter instead
// of querying Purchase Invoice Item directly (which requires extra permission grants).
async function lastInvoiceSupplier(
    codes: string[],
): Promise<Record<string, { supplier: string; supplierName: string }>> {
    if (!codes.length) return {};

    // Query Purchase Invoice (parent) filtering on its items child table.
    // This uses normal Purchase Invoice read permission — no extra grants needed.
    const best: Record<string, { supplier: string; supplierName: string; date: string }> = {};

    for (const chunk of chunked(codes, 40)) {
        // Frappe supports child-table filters: [["ChildDoctype","field","op","value"]]
        const invoices = await getList('Purchase Invoice', {
            filters: [
                ['Purchase Invoice Item', 'item_code', 'in', chunk],
                ['docstatus', '=', 1],
            ] as unknown[],
            fields: ['name', 'supplier', 'supplier_name', 'posting_date'],
        });

        if (!invoices.length) continue;

        // Fetch each invoice doc to get its items child table
        const docs: any[] = await Promise.all(
            invoices.map((inv: any) => getDoc('Purchase Invoice', inv.name))
        );

        for (const doc of docs) {
            const im = { supplier: doc.supplier, supplierName: doc.supplier_name || doc.supplier, date: doc.posting_date || '' };
            if (!im.supplier) continue;
            for (const row of doc.items ?? []) {
                if (!chunk.includes(row.item_code)) continue;
                const prev = best[row.item_code];
                if (!prev || im.date > prev.date) {
                    best[row.item_code] = im;
                }
            }
        }
    }

    const out: Record<string, { supplier: string; supplierName: string }> = {};
    for (const [code, v] of Object.entries(best)) out[code] = { supplier: v.supplier, supplierName: v.supplierName };
    return out;
}

export type PoLine = { itemCode: string; itemName: string; qty: number; rate: number; uom: string; lineValue: number };
export type PoGroup = { supplier: string; supplierName: string; items: PoLine[]; subtotal: number };
export type PoPlan = {
    bom: string; itemName: string; qty: number;
    groups: PoGroup[];
    unresolved: { itemCode: string; itemName: string; qty: number }[];
    poCount: number; grandTotal: number;
};

async function buildPlan(bomName: string, qty: number): Promise<PoPlan> {
    const products = await getBuildable();
    const p = products.find((x) => x.bom === bomName);
    if (!p) throw new Error(`BOM ${bomName} is not a known final-assembly product`);

    // Shortage = raw materials that are still short after netting
    const short = p.components
        .map((c) => ({
            itemCode: c.itemCode,
            itemName: c.itemName,
            short: qty * c.requiredPerUnit - c.available,
            rate: c.rate,
            leadTimeDays: c.leadTimeDays,
        }))
        .filter((c) => c.short > 0)
        .map((c) => ({ ...c, qty: Math.ceil(c.short) }));

    const codes = short.map((s) => s.itemCode);
    const meta = await itemMeta(codes);
    const supplierOf = await lastInvoiceSupplier(codes);

    const groupsMap: Record<string, PoGroup> = {};
    const unresolved: { itemCode: string; itemName: string; qty: number }[] = [];

    for (const s of short) {
        const sup = supplierOf[s.itemCode];
        if (!sup) {
            unresolved.push({ itemCode: s.itemCode, itemName: s.itemName, qty: s.qty });
            continue;
        }
        const rate = meta[s.itemCode]?.rate || s.rate || 0;
        const uom = meta[s.itemCode]?.stockUom || 'Nos';
        const line: PoLine = { itemCode: s.itemCode, itemName: s.itemName, qty: s.qty, rate, uom, lineValue: s.qty * rate };
        const g = (groupsMap[sup.supplier] ??= { supplier: sup.supplier, supplierName: sup.supplierName, items: [], subtotal: 0 });
        g.items.push(line);
        g.subtotal += line.lineValue;
    }

    const groups = Object.values(groupsMap);
    const grandTotal = groups.reduce((a, g) => a + g.subtotal, 0);
    return { bom: bomName, itemName: p.itemName, qty, groups, unresolved, poCount: groups.length, grandTotal };
}

export async function getPurchasePlan(bomName: string, qty: number): Promise<PoPlan> {
    return buildPlan(bomName, Math.max(1, Math.floor(qty) || 1));
}

let companyCache: string | null = null;
async function defaultCompany(): Promise<string> {
    if (companyCache) return companyCache;
    const rows = await getList('Company', { fields: ['name'], limit: 1 });
    companyCache = rows?.[0]?.name ?? '';
    if (!companyCache) throw new Error('No Company record found in ERPNext');
    return companyCache;
}

export type PoResult = {
    created: { name: string; supplier: string; supplierName: string; itemCount: number; value: number }[];
    errors: { supplier: string; supplierName: string; message: string }[];
    unresolved: { itemCode: string; itemName: string; qty: number }[];
};

export async function createDraftPurchaseOrders(bomName: string, qty: number): Promise<PoResult> {
    const plan = await buildPlan(bomName, Math.max(1, Math.floor(qty) || 1));
    const company = await defaultCompany();
    const today = new Date();

    const allCodes = plan.groups.flatMap((g) => g.items.map((i) => i.itemCode));
    const meta = await itemMeta(allCodes);

    const created: PoResult['created'] = [];
    const errors: PoResult['errors'] = [];

    for (const g of plan.groups) {
        try {
            const items = g.items.map((it) => {
                // Use item's own lead time; fall back to default assembly days
                const lead = meta[it.itemCode]?.leadTimeDays || DEFAULT_ASSEMBLY_DAYS;
                return {
                    item_code: it.itemCode,
                    qty: it.qty,
                    rate: it.rate,
                    uom: it.uom,
                    conversion_factor: 1,
                    schedule_date: addDays(today, lead),
                };
            });
            const doc = await frappePost('Purchase Order', {
                supplier: g.supplier,
                company,
                series: 'PUR-ORD-.{custom_short_fiscal_year}.-.####.',
                transaction_date: addDays(today, 0),
                schedule_date: addDays(today, DEFAULT_ASSEMBLY_DAYS),
                items,
            });
            created.push({ name: doc.name, supplier: g.supplier, supplierName: g.supplierName, itemCount: g.items.length, value: g.subtotal });
        } catch (e: any) {
            errors.push({ supplier: g.supplier, supplierName: g.supplierName, message: String(e?.message ?? e).slice(0, 300) });
        }
    }

    return { created, errors, unresolved: plan.unresolved };
}
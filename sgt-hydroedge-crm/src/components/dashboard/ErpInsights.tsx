// src/components/dashboard/ErpInsights.tsx
import { useEffect, useMemo, useState } from 'react';
import { authFetch } from '../../lib/auth';

const C = {
  forest: '#1F4E2E', green2: '#2D7A4F', gold: '#C9A24E',
  off: '#FAFAF7', red: '#C84A3A', healthy: '#3B9D6E',
};
const API = import.meta.env.VITE_API_URL ?? '/api/v1';
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

// Role straight off the JWT in localStorage — used only to gate the PO button.
// The API enforces the same rule, so this is purely a UI affordance.
function roleFromToken(): string | null {
  const t = localStorage.getItem('sgt_token');
  if (!t) return null;
  try {
    const part = t.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(json)?.role as string) ?? null;
  } catch { return null; }
}

type SubAssembly = {
  itemCode: string; itemName: string; perUnit: number; available: number; coversUnits: number;
};
type Component = {
  itemCode: string; itemName: string; requiredPerUnit: number;
  available: number; reserved: number; leadTimeDays: number; maxUnits: number;
  rate: number; // last purchase rate (₹) per unit, for shortage costing
};
type Product = {
  bom: string; itemCode: string; itemName: string; family: string;
  buildableNow: number; assemblyLeadDays: number; readyDateForBuildable: string;
  bottleneck: { itemName: string; available: number } | null;
  components: Component[];
  subAssemblies?: SubAssembly[];
};
type Pnl = { income: number; expense: number; netProfit: number; margin: number };

type IncomeItemRow = { invoice: string; date: string; party: string; item: string; qty: number; amount: number };
type ExpenseRow = { account: string; label: string; amount: number; isGroup: boolean };
type ExpenseLevel = { parent: string | null; parentLabel: string; total: number; rows: ExpenseRow[] };

// ---- PO plan/result shapes (mirror server src/services/buildable.ts) ----
type PoLine = { itemCode: string; itemName: string; qty: number; rate: number; uom: string; lineValue: number };
type PoGroup = { supplier: string; supplierName: string; items: PoLine[]; subtotal: number };
type PoPlan = {
  bom: string; itemName: string; qty: number;
  groups: PoGroup[];
  unresolved: { itemCode: string; itemName: string; qty: number }[];
  poCount: number; grandTotal: number;
};
type PoResult = {
  created: { name: string; supplier: string; supplierName: string; itemCount: number; value: number }[];
  errors: { supplier: string; supplierName: string; message: string }[];
  unresolved: { itemCode: string; itemName: string; qty: number }[];
};

function readyFor(p: Product, target: number) {
    const shortages: { itemName: string; need: number; available: number; short: number; leadTimeDays: number; rate: number; cost: number }[] = [];
    let procureDays = 0;
    let shortageCost = 0;
    for (const c of p.components) {
      const need = target * c.requiredPerUnit;
      const short = need - c.available;
      if (short > 0) {
        procureDays = Math.max(procureDays, c.leadTimeDays || 0);
        const cost = short * (c.rate || 0);
        shortageCost += cost;
        shortages.push({ itemName: c.itemName, need, available: c.available, short, leadTimeDays: c.leadTimeDays || 0, rate: c.rate || 0, cost });
      }
    }
    const days = (shortages.length ? procureDays : 0) + p.assemblyLeadDays;
    const date = new Date(Date.now() + days * 86400000).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    return { days, date, shortages, shortageCost };
  }

  export default function ErpInsights({ mode = 'full' }: { mode?: 'full' | 'capacity' } = {}) {
    const capacityOnly = mode === 'capacity';
    const [products, setProducts] = useState<Product[] | null>(null);
    const [pnl, setPnl] = useState<Pnl | null>(null);
    const [years, setYears] = useState<{ name: string; from: string; to: string }[]>([]);
    const [period, setPeriod] = useState<string>(''); // FY name or '__all__'
    const [err, setErr] = useState<string | null>(null);

    // Collapsible Final Assembly / capacity calculator. In capacity-only mode
    // (supply chain dashboard) it's expanded by default and the financials are hidden.
    const [capacityOpen, setCapacityOpen] = useState(capacityOnly);

    // Income drill-down (invoice line items)
    const [incomeOpen, setIncomeOpen] = useState(false);
    const [incomeItems, setIncomeItems] = useState<{ total: number; rows: IncomeItemRow[] } | null>(null);
    const [incLoading, setIncLoading] = useState(false);
    const [incErr, setIncErr] = useState<string | null>(null);

    // Expense drill-down (one tree level at a time)
    const [expenseOpen, setExpenseOpen] = useState(false);
    const [expStack, setExpStack] = useState<ExpenseLevel[]>([]); // breadcrumb of levels
    const [expLoading, setExpLoading] = useState(false);
    const [expErr, setExpErr] = useState<string | null>(null);

    // load buildable + fiscal years once
    useEffect(() => {
      let ignore = false;
      fetch(`${API}/erp/buildable`).then((r) => r.json())
        .then((d) => { if (ignore) return; if (d.error) setErr(d.error); else { setProducts(d); setErr(null); } })
        .catch((e) => { if (!ignore) setErr(String(e)); });

      // Financials aren't shown in capacity-only mode — skip the FY fetch.
      if (!capacityOnly) {
        fetch(`${API}/erp/fiscal-years`).then((r) => r.json())
          .then((d) => {
            if (ignore || !Array.isArray(d)) return;
            setYears(d);
            const today = new Date().toISOString().slice(0, 10);
            const cur = d.find((y: any) => y.from <= today && today <= y.to);
            setPeriod(cur ? cur.name : d[0]?.name ?? '__all__');
          })
          .catch(() => { if (!ignore) setPeriod('__all__'); });
      }
      return () => { ignore = true; };
    }, []);

    // (re)load P&L whenever the selected period changes (not in capacity-only mode)
    useEffect(() => {
      if (capacityOnly || !period) return;
      let url = `${API}/erp/pnl`;
      if (period !== '__all__') {
        const y = years.find((y) => y.name === period);
        if (y) url += `?from=${y.from}&to=${y.to}`;
      }
      let ignore = false;
      fetch(url).then((r) => r.json())
        .then((d) => { if (!ignore && !d.error) setPnl(d); })
        .catch(() => {});
      return () => { ignore = true; };
    }, [period, years]);

    const periodRange = () => {
      if (period && period !== '__all__') {
        const y = years.find((y) => y.name === period);
        if (y) return { from: y.from, to: y.to };
      }
      return null;
    };
    const rangeQS = () => {
      const rng = periodRange();
      return rng ? `?from=${rng.from}&to=${rng.to}` : '';
    };

    // ── Income: open modal, load invoice line items ──
    const openIncome = () => {
      setIncomeOpen(true);
      setIncLoading(true); setIncErr(null); setIncomeItems(null);
      fetch(`${API}/erp/pnl/income-items${rangeQS()}`).then((r) => r.json())
        .then((d) => { if (d.error) setIncErr(d.error); else setIncomeItems(d); })
        .catch((e) => setIncErr(String(e)))
        .finally(() => setIncLoading(false));
    };

    // ── Expense: load direct children of a node (null = root Expenses) ──
    const loadExpenseLevel = (parent: string | null, replaceStack?: boolean) => {
      setExpLoading(true); setExpErr(null);
      const sep = rangeQS() ? '&' : '?';
      const url = `${API}/erp/pnl/expense-children${rangeQS()}${parent ? `${sep}parent=${encodeURIComponent(parent)}` : ''}`;
      fetch(url).then((r) => r.json())
        .then((d) => {
          if (d.error) { setExpErr(d.error); return; }
          setExpStack((prev) => (replaceStack ? [d] : [...prev, d]));
        })
        .catch((e) => setExpErr(String(e)))
        .finally(() => setExpLoading(false));
    };

    const openExpense = () => {
      setExpenseOpen(true);
      setExpStack([]);
      loadExpenseLevel(null, true);
    };

    const families = useMemo(() => {
      const m: Record<string, Product[]> = {};
      (products ?? []).forEach((p) => (m[p.family] ??= []).push(p));
      return m;
    }, [products]);

    const expLevel = expStack[expStack.length - 1] ?? null;

    return (
      <div style={{ background: C.off, padding: 20, borderRadius: 14, fontFamily: 'system-ui, sans-serif' }}>
        {!capacityOnly && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ color: C.forest, margin: 0, fontSize: 18 }}>Production Capacity &amp; Financials</h2>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}
              style={{ padding: '6px 10px', border: `1px solid ${C.green2}`, borderRadius: 8, fontSize: 13, color: C.forest, background: '#fff' }}>
              {years.map((y) => <option key={y.name} value={y.name}>{y.name}</option>)}
              <option value="__all__">Total (all time)</option>
            </select>
          </div>
        )}

        {!capacityOnly && pnl && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div onClick={openIncome} title="View income by party & item" style={{ cursor: 'pointer' }}>
              <Stat label="Income" value={inr(pnl.income)} color={C.green2} />
            </div>
            <div onClick={openExpense} title="Drill into expense heads" style={{ cursor: 'pointer' }}>
              <Stat label="Expense" value={inr(pnl.expense)} color={C.gold} />
            </div>
            <Stat label="Net P&L" value={inr(pnl.netProfit)} color={pnl.netProfit >= 0 ? C.healthy : C.red} />
            <Stat label="Margin" value={(pnl.margin * 100).toFixed(1) + '%'} color={pnl.margin >= 0 ? C.healthy : C.red} />
          </div>
        )}

        {err && <div style={{ color: C.red, fontSize: 13 }}>ERPNext: {err}</div>}

        {/* Collapsible production-capacity calculator (always open in capacity mode) */}
        <div style={capacityOnly ? undefined : { borderTop: '1px solid #ece9df', marginTop: 6, paddingTop: 14 }}>
          {!capacityOnly && (
            <button
              onClick={() => setCapacityOpen((o) => !o)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                textAlign: 'left',
              }}
            >
              <span style={{
                display: 'inline-flex', transform: capacityOpen ? 'rotate(90deg)' : 'none',
                transition: 'transform 150ms', color: C.gold, fontSize: 14, fontWeight: 700,
              }}>▸</span>
              <span style={{ color: C.forest, fontSize: 14, fontWeight: 700 }}>
                Final assembly · buildable-unit calculator
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#999' }}>
                {products ? `${products.length} product${products.length !== 1 ? 's' : ''}` : ''}
                {capacityOpen ? '  · hide' : '  · show'}
              </span>
            </button>
          )}

          {capacityOnly && (
            <h2 style={{ color: C.forest, margin: '0 0 4px', fontSize: 18 }}>Final assembly · buildable-unit calculator</h2>
          )}

          {capacityOpen && (
            <div style={{ marginTop: 14 }}>
              {!products && !err && <div style={{ color: C.green2, fontSize: 13 }}>Loading capacity…</div>}
              {products && products.length === 0 && (
                <div style={{ color: C.green2, fontSize: 13 }}>No final-assembly BOMs found in ERPNext.</div>
              )}
              {Object.entries(families).map(([family, items]) => (
                <div key={family} style={{ marginBottom: 18 }}>
                  <div style={{ color: C.gold, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>{family}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                    {items.map((p) => <ProductCard key={p.bom} p={p} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>


        {/* ── Income modal: party · item · amount per invoice line ── */}
        {incomeOpen && (
          <div onClick={() => setIncomeOpen(false)} style={bdOverlay}>
            <div onClick={(e) => e.stopPropagation()} style={{ ...bdModal, maxWidth: 640 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: 16, color: C.forest }}>Income · what was sold</h3>
                <button onClick={() => setIncomeOpen(false)} style={bdClose}>✕</button>
              </div>
              <div style={{ fontSize: 12, color: '#777', margin: '4px 0 14px' }}>
                {period === '__all__' ? 'All time' : period}
                {incomeItems ? ` · ${incomeItems.rows.length} invoice lines · total ${inr(incomeItems.total)}` : ''}
              </div>
              {incLoading ? (
                <div style={{ color: C.green2, fontSize: 13 }}>Loading invoice items…</div>
              ) : incErr ? (
                <div style={{ color: C.red, fontSize: 13 }}>ERPNext: {incErr}</div>
              ) : !incomeItems || incomeItems.rows.length === 0 ? (
                <div style={{ color: '#777', fontSize: 13 }}>No sales invoices in this period.</div>
              ) : (
                <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                  {/* header row */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1.2fr 1.4fr auto',
                    gap: 10, padding: '6px 8px', position: 'sticky', top: 0, background: '#fff',
                    fontSize: 10.5, fontWeight: 700, color: '#999', letterSpacing: 0.5,
                    textTransform: 'uppercase', borderBottom: `1.5px solid ${C.forest}`,
                  }}>
                    <span>Party</span><span>Item sold</span><span style={{ textAlign: 'right' }}>Amount</span>
                  </div>
                  {incomeItems.rows.map((r, i) => (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '1.2fr 1.4fr auto',
                      gap: 10, padding: '8px 8px', borderBottom: '1px solid #f0efe8',
                      fontSize: 12.5, alignItems: 'start',
                    }}>
                      <div>
                        <div style={{ color: C.forest, fontWeight: 600 }}>{r.party}</div>
                        <div style={{ fontSize: 10.5, color: '#aaa', marginTop: 2 }}>
                          {r.invoice}{r.date ? ` · ${new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}` : ''}
                        </div>
                      </div>
                      <div style={{ color: '#444' }}>
                        {r.item}
                        {r.qty ? <span style={{ color: '#999', fontSize: 11 }}> × {Number(r.qty.toFixed(2))}</span> : null}
                      </div>
                      <div style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: r.amount >= 0 ? C.green2 : C.red }}>
                        {inr(r.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Expense modal: one tree level at a time ── */}
        {expenseOpen && (
          <div onClick={() => setExpenseOpen(false)} style={bdOverlay}>
            <div onClick={(e) => e.stopPropagation()} style={{ ...bdModal, maxWidth: 520 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {expStack.length > 1 && (
                    <button
                      onClick={() => setExpStack((s) => s.slice(0, -1))}
                      title="Back"
                      style={{ border: 'none', background: '#f0efe8', borderRadius: 6, cursor: 'pointer', padding: '4px 9px', fontSize: 13, color: C.forest, fontWeight: 700 }}
                    >←</button>
                  )}
                  <h3 style={{ margin: 0, fontSize: 16, color: C.forest, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {expLevel ? expLevel.parentLabel : 'Expenses'}
                  </h3>
                </div>
                <button onClick={() => setExpenseOpen(false)} style={bdClose}>✕</button>
              </div>
              <div style={{ fontSize: 12, color: '#777', margin: '4px 0 14px' }}>
                {period === '__all__' ? 'All time' : period}
                {expLevel ? ` · total ${inr(expLevel.total)}` : ''}
                {expStack.length > 1 && (
                  <span style={{ color: '#bbb' }}> · {expStack.map((l) => l.parentLabel).join(' › ')}</span>
                )}
              </div>

              {expLoading ? (
                <div style={{ color: C.green2, fontSize: 13 }}>Loading…</div>
              ) : expErr ? (
                <div style={{ color: C.red, fontSize: 13 }}>ERPNext: {expErr}</div>
              ) : !expLevel || expLevel.rows.length === 0 ? (
                <div style={{ color: '#777', fontSize: 13 }}>No expense postings under this head.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '55vh', overflowY: 'auto' }}>
                  {expLevel.rows.map((r) => {
                    const pct = expLevel.total ? Math.abs(r.amount) / Math.abs(expLevel.total) : 0;
                    return (
                      <div
                        key={r.account}
                        onClick={() => { if (r.isGroup) loadExpenseLevel(r.account); }}
                        style={{
                          cursor: r.isGroup ? 'pointer' : 'default',
                          padding: '8px 10px', borderRadius: 8,
                          border: '1px solid #f0efe8',
                          background: r.isGroup ? '#FCFBF6' : '#fff',
                        }}
                        title={r.isGroup ? 'Click to see the heads under this' : undefined}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, marginBottom: 5 }}>
                          <span style={{ color: C.forest, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {r.label}
                            {r.isGroup && <span style={{ color: C.gold, fontSize: 12 }}>▸</span>}
                          </span>
                          <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: r.amount >= 0 ? C.forest : C.healthy }}>
                            {inr(r.amount)} <span style={{ color: '#999', fontWeight: 500, fontSize: 11 }}>{(pct * 100).toFixed(1)}%</span>
                          </span>
                        </div>
                        <div style={{ height: 6, background: '#f0efe8', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct * 100))}%`, background: C.gold, borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '12px 16px', minWidth: 130 }}>
      <div style={{ fontSize: 11, color: '#777', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function ProductCard({ p }: { p: Product }) {
    // Keep the raw string so the user can clear the field and type multi-digit
    // numbers (e.g. backspace to empty, then type "20"). We only clamp to a valid
    // number for the calculation and on blur — never on every keystroke.
    const [targetText, setTargetText] = useState<string>(String(p.buildableNow || 1));
    const target = Math.max(1, Number(targetText) || 1);
    const [open, setOpen] = useState(false);
    const r = readyFor(p, target);
    const hasShortage = r.shortages.length > 0;
    const fmt = (n: number) => Number(n.toFixed(2)).toLocaleString('en-IN');

    // Sub-assemblies on hand worth surfacing (those with stock > 0).
    const heldSubs = (p.subAssemblies ?? []).filter((s) => s.available > 0);

    // ── Draft-PO flow (supply_chain only) ──
    const role = roleFromToken();
    const canRaisePo = role === 'supply_chain';
    const [poOpen, setPoOpen] = useState(false);
    const [poPlan, setPoPlan] = useState<PoPlan | null>(null);
    const [poLoading, setPoLoading] = useState(false);
    const [poBusy, setPoBusy] = useState(false);
    const [poErr, setPoErr] = useState<string | null>(null);
    const [poResult, setPoResult] = useState<PoResult | null>(null);

    const openPo = async () => {
      setPoOpen(true); setPoPlan(null); setPoResult(null); setPoErr(null); setPoLoading(true);
      try {
        const res = await authFetch(`${API}/erp/purchase/plan`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bom: p.bom, qty: target }),
        });
        const d = await res.json();
        if (!res.ok || d.error) setPoErr(d.error || `Error ${res.status}`);
        else setPoPlan(d);
      } catch (e) { setPoErr(String(e)); }
      finally { setPoLoading(false); }
    };

    const confirmPo = async () => {
      setPoBusy(true); setPoErr(null);
      try {
        const res = await authFetch(`${API}/erp/purchase/orders`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bom: p.bom, qty: target }),
        });
        const d = await res.json();
        if (!res.ok || d.error) setPoErr(d.error || `Error ${res.status}`);
        else setPoResult(d);
      } catch (e) { setPoErr(String(e)); }
      finally { setPoBusy(false); }
    };

    return (
      <div style={{ background: '#fff', border: '1px solid #e8e8e0', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.forest, marginBottom: 2 }}>{p.itemName}</div>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 10 }}>{p.itemCode}</div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 34, fontWeight: 800, color: C.green2 }}>{p.buildableNow}</span>
          <span style={{ fontSize: 12, color: '#777' }}>buildable now</span>
        </div>
        <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
          Ready by <b>{p.readyDateForBuildable}</b> ({p.assemblyLeadDays}d assembly)
        </div>

        {/* Sub-assemblies already on the shelf (these are netted into the count above) */}
        {heldSubs.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 10.5, color: '#8a8676', lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700, color: C.gold, letterSpacing: 0.4, textTransform: 'uppercase', fontSize: 9.5 }}>
              Sub-assemblies on hand
            </span>
            {heldSubs.map((s) => (
              <div key={s.itemCode}>
                {s.itemName}: <b style={{ color: '#6A675F' }}>{fmt(s.available)}</b> on hand
                {s.coversUnits > 0 ? ` · covers ${s.coversUnits} unit${s.coversUnits !== 1 ? 's' : ''}` : ''}
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: '1px solid #f0f0ea', marginTop: 12, paddingTop: 12 }}>
          <label style={{ fontSize: 11, color: '#777' }}>If I want&nbsp;
            <input
              type="number" min={1} value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
              onBlur={() => setTargetText(String(Math.max(1, Number(targetText) || 1)))}
              onFocus={(e) => e.currentTarget.select()}
              style={{ width: 64, padding: '3px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }} /> units →
          </label>

          <div style={{ marginTop: 6, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            {hasShortage ? (
              <>
                <span style={{ color: C.gold }}>
                  Short on {r.shortages.length} item(s) · ready by <b style={{ color: C.forest }}>{r.date}</b> ({r.days}d)
                </span>
                <button onClick={() => setOpen((o) => !o)} title="Show shortage items"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.red, fontSize: 14, padding: 0, lineHeight: 1 }}>
                  {open ? '▾' : '▸'}
                </button>
              </>
            ) : (
              <span style={{ color: C.healthy }}>All in stock · ready by <b style={{ color: C.forest }}>{r.date}</b> ({r.days}d)</span>
            )}
          </div>

          {hasShortage && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#555' }}>
              Shortage cost to procure:{' '}
              <b style={{ color: C.red }}>{r.shortageCost > 0 ? inr(r.shortageCost) : '—'}</b>
              <span style={{ color: '#999', fontSize: 10.5 }}> · at last purchase rate</span>
            </div>
          )}

          {hasShortage && open && (
            <div style={{ marginTop: 8, background: '#FCF6EE', border: '1px solid #efe3cd', borderRadius: 8, padding: 10 }}>
              {r.shortages.map((s, i) => (
                <div key={i} style={{ fontSize: 11, color: '#555', display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0', borderBottom: i < r.shortages.length - 1 ? '1px solid #f0e6d2' : 'none' }}>
                  <span style={{ color: C.forest, flex: 1, minWidth: 0 }}>{s.itemName}</span>
                  <span style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    need {fmt(s.need)} · have {fmt(s.available)} · <b style={{ color: C.red }}>short {fmt(s.short)}</b>
                    {s.leadTimeDays ? ` · ${s.leadTimeDays}d lead` : ''}
                    <br />
                    <span style={{ color: '#888' }}>
                      {s.rate > 0
                        ? <>@ {inr(s.rate)} = <b style={{ color: '#7A4A0E' }}>{inr(s.cost)}</b></>
                        : 'no purchase rate on file'}
                    </span>
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700, color: C.forest, paddingTop: 7, marginTop: 3, borderTop: '1.5px solid #e3d4b3' }}>
                <span>Total shortage cost</span>
                <span style={{ color: C.red }}>{r.shortageCost > 0 ? inr(r.shortageCost) : '—'}</span>
              </div>
            </div>
          )}

          {/* Supply-chain only: raise draft POs for the missing material */}
          {hasShortage && canRaisePo && (
            <button
              onClick={openPo}
              style={{
                marginTop: 12, width: '100%', cursor: 'pointer',
                background: C.forest, color: '#fff', border: 'none', borderRadius: 8,
                padding: '9px 12px', fontSize: 12.5, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              Raise draft PO{r.shortages.length > 1 ? 's' : ''} for missing material
            </button>
          )}
        </div>

        {/* ── PO confirm / result modal ── */}
        {poOpen && (
          <div onClick={() => !poBusy && setPoOpen(false)} style={bdOverlay}>
            <div onClick={(e) => e.stopPropagation()} style={{ ...bdModal, maxWidth: 520 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: 16, color: C.forest }}>
                  {poResult ? 'Draft POs created' : 'Raise draft purchase orders'}
                </h3>
                <button onClick={() => !poBusy && setPoOpen(false)} style={bdClose}>✕</button>
              </div>
              <div style={{ fontSize: 12, color: '#777', margin: '4px 0 14px' }}>
                {p.itemName} · {target} unit{target !== 1 ? 's' : ''}
              </div>

              {poErr && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>ERPNext: {poErr}</div>}

              {/* RESULT VIEW */}
              {poResult ? (
                <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                  {poResult.created.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {poResult.created.map((c) => (
                        <div key={c.name} style={{ border: `1px solid ${C.healthy}`, background: '#F2FAF5', borderRadius: 8, padding: '8px 10px', fontSize: 12.5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <b style={{ color: C.forest }}>{c.name}</b>
                            <span style={{ color: C.healthy, fontWeight: 700 }}>draft</span>
                          </div>
                          <div style={{ color: '#555', marginTop: 3 }}>
                            {c.supplierName} · {c.itemCount} item{c.itemCount !== 1 ? 's' : ''} · {inr(c.value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: '#777', fontSize: 13 }}>No purchase orders were created.</div>
                  )}

                  {poResult.errors.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 6 }}>Failed</div>
                      {poResult.errors.map((e, i) => (
                        <div key={i} style={{ fontSize: 11.5, color: '#7a4a0e', background: '#FCF6EE', border: '1px solid #efe3cd', borderRadius: 6, padding: '6px 8px', marginBottom: 6 }}>
                          <b>{e.supplierName}</b>: {e.message}
                        </div>
                      ))}
                    </div>
                  )}

                  {poResult.unresolved.length > 0 && (
                    <div style={{ marginTop: 12, fontSize: 11.5, color: '#777' }}>
                      <b style={{ color: C.gold }}>No supplier on file</b> (add to a PO by hand):{' '}
                      {poResult.unresolved.map((u) => `${u.itemName} ×${u.qty}`).join(', ')}
                    </div>
                  )}

                  <div style={{ marginTop: 14, fontSize: 11, color: '#999' }}>
                    Open these in ERPNext to review rates and submit when ready — nothing has been submitted.
                  </div>
                  <button onClick={() => setPoOpen(false)}
                    style={{ marginTop: 12, width: '100%', cursor: 'pointer', background: C.forest, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, fontWeight: 700 }}>
                    Done
                  </button>
                </div>

              /* PLAN / CONFIRM VIEW */
              ) : poLoading ? (
                <div style={{ color: C.green2, fontSize: 13 }}>Resolving suppliers…</div>
              ) : poPlan ? (
                <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                  {poPlan.groups.length === 0 ? (
                    <div style={{ color: '#777', fontSize: 13 }}>
                      Nothing to order — no shortage item could be traced to a supplier.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {poPlan.groups.map((g) => (
                        <div key={g.supplier} style={{ border: '1px solid #e8e8e0', borderRadius: 8, padding: '8px 10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                            <b style={{ color: C.forest, fontSize: 13 }}>{g.supplierName}</b>
                            <span style={{ color: C.red, fontWeight: 700, fontSize: 12.5 }}>{inr(g.subtotal)}</span>
                          </div>
                          {g.items.map((it) => (
                            <div key={it.itemCode} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11.5, color: '#555', padding: '2px 0' }}>
                              <span style={{ color: C.forest, flex: 1, minWidth: 0 }}>{it.itemName}</span>
                              <span style={{ whiteSpace: 'nowrap' }}>
                                {fmt(it.qty)} {it.uom} {it.rate > 0 ? <>@ {inr(it.rate)} = <b style={{ color: '#7A4A0E' }}>{inr(it.lineValue)}</b></> : <span style={{ color: '#999' }}>no rate</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {poPlan.unresolved.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 11.5, color: '#777' }}>
                      <b style={{ color: C.gold }}>No supplier on file</b> — left out, add by hand:{' '}
                      {poPlan.unresolved.map((u) => `${u.itemName} ×${u.qty}`).join(', ')}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 700, color: C.forest, marginTop: 12, paddingTop: 8, borderTop: '1.5px solid #e3d4b3' }}>
                    <span>{poPlan.poCount} draft PO{poPlan.poCount !== 1 ? 's' : ''} · qty rounded up</span>
                    <span style={{ color: C.red }}>{inr(poPlan.grandTotal)}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button onClick={() => setPoOpen(false)} disabled={poBusy}
                      style={{ flex: 1, cursor: poBusy ? 'default' : 'pointer', background: '#f0efe8', color: '#555', border: 'none', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, fontWeight: 700 }}>
                      Cancel
                    </button>
                    <button onClick={confirmPo} disabled={poBusy || poPlan.poCount === 0}
                      style={{ flex: 2, cursor: poBusy || poPlan.poCount === 0 ? 'default' : 'pointer', background: poPlan.poCount === 0 ? '#bbb' : C.forest, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, fontWeight: 700 }}>
                      {poBusy ? 'Creating…' : `Create ${poPlan.poCount} draft PO${poPlan.poCount !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    );
  }

  const bdOverlay = {
    position: 'fixed', inset: 0, background: 'rgba(20,20,18,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100,
  } as const;
  const bdModal = {
    background: '#fff', borderRadius: 14, padding: '18px 20px',
    width: '100%', maxWidth: 440, boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
  } as const;
  const bdClose = {
    border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: '#999', lineHeight: 1,
  } as const;
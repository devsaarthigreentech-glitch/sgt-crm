// src/components/dashboard/ErpInsights.tsx
import { useEffect, useMemo, useState } from 'react';

const C = {
  forest: '#1F4E2E', green2: '#2D7A4F', gold: '#C9A24E',
  off: '#FAFAF7', red: '#C84A3A', healthy: '#3B9D6E',
};
const API = import.meta.env.VITE_API_URL ?? '/api/v1';
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

type Component = {
  itemCode: string; itemName: string; requiredPerUnit: number;
  available: number; reserved: number; leadTimeDays: number; maxUnits: number;
};
type Product = {
  bom: string; itemCode: string; itemName: string; family: string;
  buildableNow: number; assemblyLeadDays: number; readyDateForBuildable: string;
  bottleneck: { itemName: string; available: number } | null;
  components: Component[];
};
type Pnl = { income: number; expense: number; netProfit: number; margin: number };

function readyFor(p: Product, target: number) {
    const shortages: { itemName: string; need: number; available: number; short: number; leadTimeDays: number }[] = [];
    let procureDays = 0;
    for (const c of p.components) {
      const need = target * c.requiredPerUnit;
      const short = need - c.available;
      if (short > 0) {
        procureDays = Math.max(procureDays, c.leadTimeDays || 0);
        shortages.push({ itemName: c.itemName, need, available: c.available, short, leadTimeDays: c.leadTimeDays || 0 });
      }
    }
    const days = (shortages.length ? procureDays : 0) + p.assemblyLeadDays;
    const date = new Date(Date.now() + days * 86400000).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    return { days, date, shortages };
  }

  export default function ErpInsights() {
    const [products, setProducts] = useState<Product[] | null>(null);
    const [pnl, setPnl] = useState<Pnl | null>(null);
    const [years, setYears] = useState<{ name: string; from: string; to: string }[]>([]);
    const [period, setPeriod] = useState<string>(''); // FY name or '__all__'
    const [err, setErr] = useState<string | null>(null);
    const [incomeOpen, setIncomeOpen] = useState(false);
    const [breakdown, setBreakdown] = useState<{ total: number; accounts: { account: string; label: string; amount: number; pct: number }[] } | null>(null);
    const [bdLoading, setBdLoading] = useState(false);
    const [bdErr, setBdErr] = useState<string | null>(null);
  
    // load buildable + fiscal years once
    useEffect(() => {
      let ignore = false;
      fetch(`${API}/erp/buildable`).then((r) => r.json())
        .then((d) => { if (ignore) return; if (d.error) setErr(d.error); else { setProducts(d); setErr(null); } })
        .catch((e) => { if (!ignore) setErr(String(e)); });
  
      fetch(`${API}/erp/fiscal-years`).then((r) => r.json())
        .then((d) => {
          if (ignore || !Array.isArray(d)) return;
          setYears(d);
          const today = new Date().toISOString().slice(0, 10);
          const cur = d.find((y: any) => y.from <= today && today <= y.to);
          setPeriod(cur ? cur.name : d[0]?.name ?? '__all__');
        })
        .catch(() => { if (!ignore) setPeriod('__all__'); });
      return () => { ignore = true; };
    }, []);
  
    // (re)load P&L whenever the selected period changes
    useEffect(() => {
      if (!period) return;
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

    const openIncome = () => {
      setIncomeOpen(true);
      setBdLoading(true); setBdErr(null); setBreakdown(null);
      const rng = periodRange();
      let url = `${API}/erp/pnl/income-breakdown`;
      if (rng) url += `?from=${rng.from}&to=${rng.to}`;
      fetch(url).then((r) => r.json())
        .then((d) => { if (d.error) setBdErr(d.error); else setBreakdown(d); })
        .catch((e) => setBdErr(String(e)))
        .finally(() => setBdLoading(false));
    };
  
    const families = useMemo(() => {
      const m: Record<string, Product[]> = {};
      (products ?? []).forEach((p) => (m[p.family] ??= []).push(p));
      return m;
    }, [products]);
  
    return (
      <div style={{ background: C.off, padding: 20, borderRadius: 14, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ color: C.forest, margin: 0, fontSize: 18 }}>Production Capacity &amp; Financials</h2>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}
            style={{ padding: '6px 10px', border: `1px solid ${C.green2}`, borderRadius: 8, fontSize: 13, color: C.forest, background: '#fff' }}>
            {years.map((y) => <option key={y.name} value={y.name}>{y.name}</option>)}
            <option value="__all__">Total (all time)</option>
          </select>
        </div>
  
        {pnl && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div onClick={openIncome} title="View income by account" style={{ cursor: 'pointer' }}>
              <Stat label="Income" value={inr(pnl.income)} color={C.green2} />
            </div>
            <Stat label="Expense" value={inr(pnl.expense)} color={C.gold} />
            <Stat label="Net P&L" value={inr(pnl.netProfit)} color={pnl.netProfit >= 0 ? C.healthy : C.red} />
            <Stat label="Margin" value={(pnl.margin * 100).toFixed(1) + '%'} color={pnl.margin >= 0 ? C.healthy : C.red} />
          </div>
        )}
  
        {err && <div style={{ color: C.red, fontSize: 13 }}>ERPNext: {err}</div>}
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

{incomeOpen && (
          <div onClick={() => setIncomeOpen(false)} style={bdOverlay}>
            <div onClick={(e) => e.stopPropagation()} style={bdModal}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: 16, color: C.forest }}>Income by account</h3>
                <button onClick={() => setIncomeOpen(false)} style={bdClose}>✕</button>
              </div>
              <div style={{ fontSize: 12, color: '#777', margin: '4px 0 14px' }}>
                {period === '__all__' ? 'All time' : period}
                {breakdown ? ` · total ${inr(breakdown.total)}` : ''}
              </div>
              {bdLoading ? (
                <div style={{ color: C.green2, fontSize: 13 }}>Loading…</div>
              ) : bdErr ? (
                <div style={{ color: C.red, fontSize: 13 }}>ERPNext: {bdErr}</div>
              ) : !breakdown || breakdown.accounts.length === 0 ? (
                <div style={{ color: '#777', fontSize: 13 }}>No income postings in this period.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '55vh', overflowY: 'auto' }}>
                  {breakdown.accounts.map((a) => (
                    <div key={a.account}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, marginBottom: 4 }}>
                        <span style={{ color: C.forest, fontWeight: 600 }}>{a.label}</span>
                        <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: a.amount >= 0 ? C.green2 : C.red }}>
                          {inr(a.amount)} <span style={{ color: '#999', fontWeight: 500, fontSize: 11 }}>{(a.pct * 100).toFixed(1)}%</span>
                        </span>
                      </div>
                      <div style={{ height: 6, background: '#f0efe8', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, a.pct * 100))}%`, background: C.green2, borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
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
    const [target, setTarget] = useState<number>(p.buildableNow || 1);
    const [open, setOpen] = useState(false);
    const r = readyFor(p, target);
    const hasShortage = r.shortages.length > 0;
    const fmt = (n: number) => Number(n.toFixed(2)).toLocaleString('en-IN');
  
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
  
        <div style={{ borderTop: '1px solid #f0f0ea', marginTop: 12, paddingTop: 12 }}>
          <label style={{ fontSize: 11, color: '#777' }}>If I want&nbsp;
            <input type="number" min={1} value={target}
              onChange={(e) => setTarget(Math.max(1, Number(e.target.value) || 1))}
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
  
          {hasShortage && open && (
            <div style={{ marginTop: 8, background: '#FCF6EE', border: '1px solid #efe3cd', borderRadius: 8, padding: 10 }}>
              {r.shortages.map((s, i) => (
                <div key={i} style={{ fontSize: 11, color: '#555', display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 0' }}>
                  <span style={{ color: C.forest }}>{s.itemName}</span>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    need {fmt(s.need)} · have {fmt(s.available)} · <b style={{ color: C.red }}>short {fmt(s.short)}</b>
                    {s.leadTimeDays ? ` · ${s.leadTimeDays}d lead` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
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
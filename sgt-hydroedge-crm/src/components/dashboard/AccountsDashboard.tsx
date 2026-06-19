/**
 * AccountsDashboard.tsx
 * Role: accounts
 * Two panels:
 *   1. FinancialSnapshot  — Income / Expense / Margin from ERPNext GL, with FY selector
 *   2. UpcomingOrdersPanel — Outstanding Sales Orders from ERPNext (reuses /erp/outstanding-orders)
 */

import { useEffect, useState, useCallback } from 'react';

// ─── palette (matches SGT brand) ────────────────────────────────────────────
const C = {
  paper:   '#ECE8DA',
  navy:    '#1A2E44',
  teal:    '#2D7A4F',
  tealLt:  '#EAF4EF',
  gold:    '#C9A24E',
  goldLt:  '#FDF6E8',
  red:     '#C84A3A',
  redLt:   '#FDECEA',
  ink:     '#1F2D3D',
  muted:   '#6B7A8D',
  border:  '#D8D2C2',
  white:   '#FAFAF7',
};

// ─── types ───────────────────────────────────────────────────────────────────
interface FYOption { name: string; start: string; end: string }

interface FinancialData {
  income:  number;
  expense: number;
  margin:  number;
  marginPct: number;
  incomeBreakdown:  { account: string; amount: number }[];
  expenseBreakdown: { account: string; amount: number }[];
}

interface SalesOrder {
  name:           string;
  customer:       string;
  transaction_date: string;
  delivery_date:  string | null;
  grand_total:    number;
  currency:       string;
  status:         string;
  per_delivered:  number;
  overdue:        boolean;
  overdueDays:    number;
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const authFetch = (url: string, opts: RequestInit = {}) => {
  const token = localStorage.getItem('sgt_token');
  return fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
  });
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const fmtShort = (n: number) => {
  if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (Math.abs(n) >= 1_000)       return `₹${(n / 1_000).toFixed(0)}K`;
  return `₹${n.toFixed(0)}`;
};

const dayLabel = (days: number) =>
  days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`;

// ─── sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent, onClick, clickable,
}: {
  label: string; value: string; sub?: string;
  accent?: 'green' | 'red' | 'gold'; onClick?: () => void; clickable?: boolean;
}) {
  const accMap = {
    green: { bg: C.tealLt, val: C.teal,  border: '#B2DACC' },
    red:   { bg: C.redLt,  val: C.red,   border: '#F4C1BB' },
    gold:  { bg: C.goldLt, val: '#A07830', border: '#EDD89A' },
  };
  const a = accent ? accMap[accent] : { bg: C.white, val: C.ink, border: C.border };

  return (
    <div
      onClick={onClick}
      style={{
        background: a.bg,
        border: `1px solid ${a.border}`,
        borderRadius: 12,
        padding: '20px 24px',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'box-shadow .15s',
        flex: '1 1 180px',
        minWidth: 0,
      }}
      onMouseEnter={e => clickable && ((e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.08)')}
      onMouseLeave={e => clickable && ((e.currentTarget as HTMLDivElement).style.boxShadow = 'none')}
    >
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: a.val, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function BreakdownDrawer({
  title, rows, onClose,
}: {
  title: string; rows: { account: string; amount: number }[]; onClose: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.white, borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 640,
          maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: C.ink }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.muted }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '12px 24px 24px' }}>
          {rows.length === 0 && <p style={{ color: C.muted, textAlign: 'center', paddingTop: 20 }}>No entries found</p>}
          {rows.map((r, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none',
            }}>
              <span style={{ fontSize: 13, color: C.ink, flex: 1, paddingRight: 12 }}>{r.account}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{fmtShort(r.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Financial Snapshot Panel ─────────────────────────────────────────────────
function FinancialSnapshot() {
  const [fyList,    setFyList]    = useState<FYOption[]>([]);
  const [selectedFy, setSelectedFy] = useState<string>('');
  const [data,      setData]      = useState<FinancialData | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [drawer,    setDrawer]    = useState<'income' | 'expense' | null>(null);

  // Load FY list
  useEffect(() => {
    authFetch('/api/erp/fiscal-years')
      .then(r => r.json())
      .then(d => {
        const list: FYOption[] = d.fiscalYears ?? [];
        setFyList(list);
        if (list.length) setSelectedFy(list[0].name);
      })
      .catch(() => setError('Could not load fiscal years'));
  }, []);

  // Load financials when FY changes
  useEffect(() => {
    if (!selectedFy) return;
    setLoading(true);
    setError('');
    authFetch(`/api/erp/financials?fy=${encodeURIComponent(selectedFy)}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError('Failed to load financials'); setLoading(false); });
  }, [selectedFy]);

  const marginColor = (data?.margin ?? 0) >= 0 ? 'green' : 'red';

  return (
    <section style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: C.muted, textTransform: 'uppercase' }}>Financial Overview</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginTop: 2 }}>Income · Expense · Margin</div>
        </div>
        <select
          value={selectedFy}
          onChange={e => setSelectedFy(e.target.value)}
          style={{
            border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px',
            fontSize: 13, color: C.ink, background: C.paper, cursor: 'pointer', outline: 'none',
          }}
        >
          {fyList.map(fy => (
            <option key={fy.name} value={fy.name}>{fy.name}</option>
          ))}
        </select>
      </div>

      {/* Body */}
      <div style={{ padding: '20px 24px' }}>
        {loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: C.muted, fontSize: 13, padding: '20px 0' }}>
            <div style={{ width: 16, height: 16, border: `2px solid ${C.border}`, borderTopColor: C.teal, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
            Loading financials…
          </div>
        )}
        {error && !loading && <p style={{ color: C.red, fontSize: 13 }}>{error}</p>}

        {data && !loading && (
          <>
            {/* Stat cards row */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              <StatCard
                label="Total Income"
                value={fmtShort(data.income)}
                sub={`${fmt(data.income)} · tap to break down`}
                accent="green"
                clickable
                onClick={() => setDrawer('income')}
              />
              <StatCard
                label="Total Expense"
                value={fmtShort(data.expense)}
                sub={`${fmt(data.expense)} · tap to break down`}
                accent="red"
                clickable
                onClick={() => setDrawer('expense')}
              />
              <StatCard
                label="Net Margin"
                value={fmtShort(data.margin)}
                sub={`${data.marginPct.toFixed(1)}% of income`}
                accent={marginColor}
              />
            </div>

            {/* Simple visual bar */}
            {data.income > 0 && (
              <div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8 }}>Income vs Expense</div>
                <div style={{ height: 10, background: C.paper, borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, (data.expense / data.income) * 100).toFixed(1)}%`,
                    background: data.expense > data.income ? C.red : C.teal,
                    borderRadius: 99,
                    transition: 'width .6s ease',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: C.teal }}>Expense: {((data.expense / data.income) * 100).toFixed(1)}%</span>
                  <span style={{ fontSize: 11, color: C.muted }}>Income: {fmtShort(data.income)}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Drawers */}
      {drawer === 'income' && data && (
        <BreakdownDrawer title="Income Breakdown" rows={data.incomeBreakdown} onClose={() => setDrawer(null)} />
      )}
      {drawer === 'expense' && data && (
        <BreakdownDrawer title="Expense Breakdown" rows={data.expenseBreakdown} onClose={() => setDrawer(null)} />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </section>
  );
}

// ─── Upcoming / Outstanding Orders Panel ─────────────────────────────────────
function UpcomingOrdersPanel() {
  const [orders,  setOrders]  = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter,   setFilter]   = useState<'all' | 'overdue' | 'pending'>('all');

  const load = useCallback(() => {
    setLoading(true);
    authFetch('/api/erp/outstanding-orders')
      .then(r => r.json())
      .then(d => { setOrders(d.orders ?? []); setLoading(false); })
      .catch(() => { setError('Failed to load orders'); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = orders.filter(o =>
    filter === 'overdue'  ? o.overdue :
    filter === 'pending'  ? !o.overdue :
    true
  );

  const overdueCnt = orders.filter(o => o.overdue).length;
  const totalValue = orders.reduce((s, o) => s + o.grand_total, 0);

  const statusColor = (o: SalesOrder) =>
    o.overdue ? C.red :
    o.status === 'To Deliver and Bill' ? C.gold :
    C.teal;

  const statusLabel = (o: SalesOrder) =>
    o.overdue        ? `Overdue ${dayLabel(o.overdueDays)}` :
    o.status === 'To Deliver and Bill' ? 'To Deliver' :
    o.status;

  return (
    <section style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: C.muted, textTransform: 'uppercase' }}>Sales Pipeline</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginTop: 2 }}>Outstanding Orders</div>
          </div>
          <button onClick={load} style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer', color: C.ink }}>
            Refresh
          </button>
        </div>

        {/* Summary tiles */}
        {!loading && !error && (
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <div style={{ background: C.paper, borderRadius: 10, padding: '10px 16px', flex: '1 1 100px', minWidth: 0 }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Open</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.ink }}>{orders.length}</div>
            </div>
            <div style={{ background: overdueCnt > 0 ? C.redLt : C.paper, border: overdueCnt > 0 ? `1px solid #F4C1BB` : `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px', flex: '1 1 100px', minWidth: 0 }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Overdue</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: overdueCnt > 0 ? C.red : C.ink }}>{overdueCnt}</div>
            </div>
            <div style={{ background: C.goldLt, border: `1px solid #EDD89A`, borderRadius: 10, padding: '10px 16px', flex: '1 1 120px', minWidth: 0 }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Total Value</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#A07830' }}>{fmtShort(totalValue)}</div>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        {!loading && !error && (
          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            {(['all', 'overdue', 'pending'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: 'none',
                  background: filter === f ? C.navy : C.paper,
                  color: filter === f ? '#fff' : C.muted,
                  textTransform: 'capitalize',
                }}
              >
                {f === 'all' ? `All (${orders.length})` : f === 'overdue' ? `Overdue (${overdueCnt})` : `On Track (${orders.length - overdueCnt})`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Order list */}
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: C.muted, fontSize: 13, padding: '24px' }}>
            <div style={{ width: 16, height: 16, border: `2px solid ${C.border}`, borderTopColor: C.teal, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
            Loading orders…
          </div>
        )}
        {error && <p style={{ color: C.red, padding: 24, fontSize: 13 }}>{error}</p>}
        {!loading && !error && visible.length === 0 && (
          <p style={{ color: C.muted, padding: 24, fontSize: 13, textAlign: 'center' }}>No orders match this filter</p>
        )}

        {!loading && !error && visible.map((order, i) => {
          const isOpen = expanded === order.name;
          const sc = statusColor(order);
          return (
            <div
              key={order.name}
              style={{ borderBottom: i < visible.length - 1 ? `1px solid ${C.border}` : 'none' }}
            >
              {/* Row */}
              <div
                onClick={() => setExpanded(isOpen ? null : order.name)}
                style={{
                  display: 'flex', alignItems: 'center', padding: '14px 24px',
                  cursor: 'pointer', gap: 12,
                  background: isOpen ? C.paper : 'transparent',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => !isOpen && ((e.currentTarget as HTMLDivElement).style.background = '#F5F3EE')}
                onMouseLeave={e => !isOpen && ((e.currentTarget as HTMLDivElement).style.background = 'transparent')}
              >
                {/* Status dot */}
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: sc, flexShrink: 0 }} />

                {/* Main info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{order.customer}</span>
                    <span style={{ fontSize: 11, color: C.muted }}>{order.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: sc,
                      background: sc + '18', padding: '2px 8px', borderRadius: 20,
                    }}>
                      {statusLabel(order)}
                    </span>
                    {order.delivery_date && !order.overdue && (
                      <span style={{ fontSize: 11, color: C.muted }}>
                        Due {new Date(order.delivery_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Value + chevron */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{fmtShort(order.grand_total)}</div>
                  {order.currency !== 'INR' && (
                    <div style={{ fontSize: 10, color: C.muted }}>{order.currency}</div>
                  )}
                </div>
                <div style={{ color: C.muted, fontSize: 14, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▾</div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ background: C.paper, padding: '16px 24px 20px 48px', borderTop: `1px solid ${C.border}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
                    <DetailCell label="Order ID"       value={order.name} />
                    <DetailCell label="Placed"         value={new Date(order.transaction_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
                    <DetailCell label="Delivery Date"  value={order.delivery_date ? new Date(order.delivery_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} />
                    <DetailCell label="Value"          value={fmt(order.grand_total)} sub={order.currency !== 'INR' ? order.currency : undefined} />
                    <DetailCell label="Delivered"      value={`${order.per_delivered.toFixed(0)}%`} accent={order.per_delivered === 100 ? C.teal : undefined} />
                    <DetailCell label="Status"         value={order.status} />
                  </div>

                  {/* Delivery progress bar */}
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>Delivery progress</div>
                    <div style={{ height: 6, background: C.border, borderRadius: 99 }}>
                      <div style={{ height: '100%', width: `${order.per_delivered}%`, background: order.per_delivered === 100 ? C.teal : C.gold, borderRadius: 99, transition: 'width .4s' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DetailCell({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.07em', color: C.muted, textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: accent ?? C.ink }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>}
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
export default function AccountsDashboard() {
  const name = (() => {
    try {
      const raw = localStorage.getItem('sgt_user');
      return raw ? JSON.parse(raw).name?.split(' ')[0] : 'Accountant';
    } catch { return 'Accountant'; }
  })();

  return (
    <div style={{ padding: '28px 24px 48px', maxWidth: 900, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>
          Accounts — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: C.ink, letterSpacing: '-.02em' }}>
          Good {hour()} {name} 👋
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
          Your financial snapshot and order book
        </div>
      </div>

      {/* Panels stacked */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <FinancialSnapshot />
        <UpcomingOrdersPanel />
      </div>
    </div>
  );
}

function hour() {
  const h = new Date().getHours();
  return h < 12 ? 'morning,' : h < 17 ? 'afternoon,' : 'evening,';
}
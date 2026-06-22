// rentalModel.ts  (frontend: src/lib/rentalModel.ts  ·  backend: src/domain/rental.ts)
// SGT HydroEdge CRM — DaaS rental engagement model + corrected outstanding/overdue logic.
// Pure, dependency-free. Matches the ERPNext Sales Order shape your /erp/orders route returns.
//
// Two jobs:
//   1) detectDaaSEngagements(orders)  -> collapses the upfront SO + rental SO that share a
//      quotation (custom_reference_no) into ONE engagement, with MRR / TCV / tenure.
//   2) classifyOrder(order)           -> stops rental SOs and billed-but-undelivered SOs
//      from being counted as "overdue" receivables.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SalesOrderItem {
    item_code: string;
    item_name?: string;
    item_group?: string;
    gst_hsn_code?: string;
    qty: number;
    rate: number;
    amount: number;
    cgst_rate?: number;
    sgst_rate?: number;
    igst_rate?: number;
  }
  
  export interface PaymentScheduleRow {
    due_date: string; // YYYY-MM-DD
    outstanding: number;
  }
  
  export interface SalesOrder {
    name: string;
    customer_name: string;
    custom_reference_no?: string | null;
    transaction_date?: string;
    delivery_date?: string;
    status?: string;
    per_billed?: number;
    per_delivered?: number;
    delivery_status?: string;
    billing_status?: string;
    base_grand_total?: number;
    base_rounded_total?: number;
    advance_paid?: number;
    items: SalesOrderItem[];
    payment_schedule?: PaymentScheduleRow[];
  }
  
  // ---------------------------------------------------------------------------
  // Item classification
  // Extend these sets — or, cleaner long-term, set a custom_deal_model flag on the SO
  // and key off that. HSN 997319 + item_group "Services" is the secondary signal.
  // ---------------------------------------------------------------------------
  const UPFRONT_ITEM_CODES = new Set<string>(['Upfront Payment']);
  const RENTAL_ITEM_CODES = new Set<string>(['Rent on DaaS Model']);
  
  // Exported for backend services that query ERPNext by these codes (keep the
  // single source of truth here rather than re-declaring item codes in routes).
  export const UPFRONT_CODES: string[] = [...UPFRONT_ITEM_CODES];
  export const RENTAL_CODES: string[] = [...RENTAL_ITEM_CODES];
  export const DAAS_ITEM_CODES: string[] = [...UPFRONT_CODES, ...RENTAL_CODES];
  
  export const isUpfrontLine = (i: SalesOrderItem) => UPFRONT_ITEM_CODES.has(i.item_code);
  export const isRentalLine = (i: SalesOrderItem) => RENTAL_ITEM_CODES.has(i.item_code);
  
  export const orderHasRental = (o: SalesOrder) => o.items.some(isRentalLine);
  export const orderHasUpfront = (o: SalesOrder) => o.items.some(isUpfrontLine);
  export const isDaaSOrder = (o: SalesOrder) => orderHasRental(o) || orderHasUpfront(o);
  
  const lineGstPct = (i: SalesOrderItem) =>
    (i.cgst_rate ?? 0) + (i.sgst_rate ?? 0) + (i.igst_rate ?? 0);
  
  const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
  
  // ---------------------------------------------------------------------------
  // Engagement model
  // ---------------------------------------------------------------------------
  export interface DaaSEngagement {
    key: string;                    // custom_reference_no (falls back to customer name)
    customerName: string;
    machines: number | null;        // from upfront line qty
    upfrontOrders: SalesOrder[];
    rentalOrders: SalesOrder[];
    upfrontNet: number;
    upfrontGross: number;
    monthlyNet: number | null;      // whole fleet, per month (per-machine rate * machines)
    monthlyGross: number | null;
    gstPct: number;
    bookedMonths: number | null;    // rental qty / machines  (SO-004 = 24/2 = 12)
    contractTenureMonths?: number;  // pass 36 if known — tenure isn't in SO structured data
    tcvNet: number;
    upfrontStatus: 'billed' | 'partial' | 'unbilled';
  }
  
  export interface EngagementOptions {
    // Known contract tenure per engagement key (e.g. 36 from the signed DaaS agreement).
    contractTenureByKey?: Record<string, number>;
  }
  
  const engagementKey = (o: SalesOrder) =>
    (o.custom_reference_no && o.custom_reference_no.trim()) || `cust:${o.customer_name}`;
  
  export function detectDaaSEngagements(
    orders: SalesOrder[],
    opts: EngagementOptions = {},
  ): DaaSEngagement[] {
    const groups = new Map<string, SalesOrder[]>();
    for (const o of orders) {
      if (!isDaaSOrder(o)) continue;
      const k = engagementKey(o);
      const arr = groups.get(k);
      if (arr) arr.push(o);
      else groups.set(k, [o]);
    }
  
    const out: DaaSEngagement[] = [];
    for (const [key, grp] of groups) {
      const upfrontOrders = grp.filter(orderHasUpfront);
      const rentalOrders = grp.filter(orderHasRental);
  
      const upfrontLines = upfrontOrders.flatMap((o) => o.items.filter(isUpfrontLine));
      const rentalLines = rentalOrders.flatMap((o) => o.items.filter(isRentalLine));
  
      const machines = upfrontLines.length ? sum(upfrontLines.map((l) => l.qty)) : null;
  
      const upfrontNet = sum(upfrontLines.map((l) => l.amount));
      const upfrontGross = sum(
        upfrontOrders.map((o) => o.base_rounded_total ?? o.base_grand_total ?? 0),
      );
  
      const gstPct = rentalLines.length
        ? lineGstPct(rentalLines[0])
        : upfrontLines.length
        ? lineGstPct(upfrontLines[0])
        : 18;
  
      // Per-machine monthly rate (assumes one rental rate across lines).
      const perMachineMonthly = rentalLines.length ? rentalLines[0].rate : null;
      const monthlyNet =
        machines != null && perMachineMonthly != null ? perMachineMonthly * machines : null;
      const monthlyGross = monthlyNet != null ? monthlyNet * (1 + gstPct / 100) : null;
  
      const rentalQty = sum(rentalLines.map((l) => l.qty));
      const bookedMonths =
        machines != null && machines > 0 ? Math.round(rentalQty / machines) : null;
  
      const contractTenureMonths = opts.contractTenureByKey?.[key];
      const tenureForTcv = contractTenureMonths ?? bookedMonths ?? 0;
      const tcvNet = upfrontNet + (monthlyNet ?? 0) * tenureForTcv;
  
      const billedPct = upfrontOrders.length
        ? Math.min(...upfrontOrders.map((o) => o.per_billed ?? 0))
        : 0;
      const upfrontStatus: DaaSEngagement['upfrontStatus'] =
        billedPct >= 100 ? 'billed' : billedPct > 0 ? 'partial' : 'unbilled';
  
      out.push({
        key,
        customerName: grp[0].customer_name,
        machines,
        upfrontOrders,
        rentalOrders,
        upfrontNet,
        upfrontGross,
        monthlyNet,
        monthlyGross,
        gstPct,
        bookedMonths,
        contractTenureMonths,
        tcvNet,
        upfrontStatus,
      });
    }
    return out;
  }
  
  // ---------------------------------------------------------------------------
  // Outstanding / overdue classification  (available for AR-style views)
  // ---------------------------------------------------------------------------
  export type OutstandingClass =
    | { kind: 'recurring_rental' } // rental billed monthly by Subscription — never overdue here
    | { kind: 'awaiting_installation'; amount: number } // fully billed, delivery pending
    | { kind: 'overdue'; daysOverdue: number; amount: number }
    | { kind: 'due'; amount: number; dueDate: string }
    | { kind: 'normal'; amount: number };
  
  const daysBetween = (a: Date, b: Date) =>
    Math.floor((a.getTime() - b.getTime()) / 86_400_000);
  
  const receivable = (o: SalesOrder) => {
    const sched = o.payment_schedule ?? [];
    if (sched.length) return sum(sched.map((r) => r.outstanding ?? 0));
    return o.base_rounded_total ?? o.base_grand_total ?? 0;
  };
  
  export function classifyOrder(o: SalesOrder, today = new Date()): OutstandingClass {
    if (orderHasRental(o) && !orderHasUpfront(o)) return { kind: 'recurring_rental' };
  
    const billed = o.per_billed ?? 0;
    const delivered = o.per_delivered ?? 0;
  
    if (billed >= 100) {
      if (delivered < 100) return { kind: 'awaiting_installation', amount: receivable(o) };
      return { kind: 'normal', amount: 0 };
    }
  
    const sched = (o.payment_schedule ?? []).filter((r) => r.due_date);
    const overdueRows = sched.filter(
      (r) => new Date(r.due_date) < today && (r.outstanding ?? 0) > 0,
    );
    if (overdueRows.length) {
      const daysOverdue = Math.max(
        ...overdueRows.map((r) => daysBetween(today, new Date(r.due_date))),
      );
      return {
        kind: 'overdue',
        daysOverdue,
        amount: sum(overdueRows.map((r) => r.outstanding ?? 0)),
      };
    }
    const nextDue = sched.find((r) => (r.outstanding ?? 0) > 0);
    if (nextDue) return { kind: 'due', amount: nextDue.outstanding, dueDate: nextDue.due_date };
  
    return { kind: 'normal', amount: receivable(o) };
  }
  
  // ---------------------------------------------------------------------------
  // INR formatting (matches your "₹2.1L" lakh style)
  // ---------------------------------------------------------------------------
  export function formatINRShort(n: number): string {
    const a = Math.abs(n);
    if (a >= 1e7) return `₹${(n / 1e7).toFixed(a % 1e7 === 0 ? 0 : 1)}Cr`;
    if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
    if (a >= 1e3) return `₹${Math.round(n / 1e3)}K`;
    return `₹${Math.round(n)}`;
  }
  
  export function formatINR(n: number): string {
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
  }
// src/routes/erp.ts
import { FastifyInstance } from 'fastify';
import {
  getFiscalYears, getIncomeBreakdown, getPnl, getUpcomingOrders,
  getIncomeInvoiceItems, getExpenseChildren, getOutstandingOrders,
} from '../services/erpnext.js';
import {
  getBuildable, getPurchasePlan, createDraftPurchaseOrders,
} from '../services/buildable.js';
import { requireRole } from '../auth/guard.js';

export default async function erpRoutes(app: FastifyInstance) {
  app.get('/erp/buildable', async (_req, reply) => {
    try { return await getBuildable(); }
    catch (e: any) { reply.code(502); return { error: e.message }; }
  });

  // --- Procurement: raise draft POs for the missing material ----------------
  // Both endpoints are restricted to the supply_chain role. requireRole returns
  // 403 for every other role (directors included), enforced at the API itself —
  // not just hidden in the UI.

  // Preview: grouped-by-supplier plan for a finished BOM at a target qty.
  app.post('/erp/purchase/plan', { preHandler: requireRole('supply_chain') }, async (req, reply) => {
    const { bom, qty } = req.body as { bom?: string; qty?: number };
    if (!bom) { reply.code(400); return { error: 'bom is required' }; }
    try { return await getPurchasePlan(bom, Number(qty) || 1); }
    catch (e: any) { reply.code(502); return { error: e.message }; }
  });

  // Create: one DRAFT Purchase Order per supplier in ERPNext. Nothing submitted.
  app.post('/erp/purchase/orders', { preHandler: requireRole('supply_chain') }, async (req, reply) => {
    const { bom, qty } = req.body as { bom?: string; qty?: number };
    if (!bom) { reply.code(400); return { error: 'bom is required' }; }
    try { return await createDraftPurchaseOrders(bom, Number(qty) || 1); }
    catch (e: any) { reply.code(502); return { error: e.message }; }
  });

  // Customer list from ERPNext with total billing — director and sales only.
  // Returns Customer[] each enriched with billing_total (sum of submitted Sales Invoice amounts).
  app.get('/erp/customers', { preHandler: requireRole('director', 'sales') }, async (_req, reply) => {
    try {
      const BASE = process.env.ERPNEXT_URL!;
      const KEY  = process.env.ERPNEXT_API_KEY!;
      const SEC  = process.env.ERPNEXT_API_SECRET!;
      const headers = { Authorization: `token ${KEY}:${SEC}`, Accept: 'application/json' };

      // Fetch customers + submitted Sales Invoices in parallel
      const custParams = new URLSearchParams({
        fields: JSON.stringify(['name','customer_name','customer_group','territory',
                                'customer_type','mobile_no','email_id','tax_id','disabled']),
        filters: JSON.stringify([['disabled','=',0]]),
        limit_page_length: '0',
        order_by: 'customer_name asc',
      });
      const siParams = new URLSearchParams({
        fields: JSON.stringify(['customer','base_grand_total']),
        filters: JSON.stringify([['docstatus','=',1]]),
        limit_page_length: '0',
      });

      const [custRes, siRes] = await Promise.all([
        fetch(`${BASE}/api/resource/Customer?${custParams}`, { headers }),
        fetch(`${BASE}/api/resource/Sales%20Invoice?${siParams}`, { headers }),
      ]);

      if (!custRes.ok) { reply.code(502); return { error: `ERPNext customers ${custRes.status}` }; }

      const customers: any[] = (await custRes.json()).data ?? [];

      // Aggregate billing per customer (best-effort; if SI fetch fails, totals are 0)
      const billingMap: Record<string, number> = {};
      if (siRes.ok) {
        const invoices: any[] = (await siRes.json()).data ?? [];
        for (const inv of invoices) {
          const key = inv.customer as string;
          if (key) billingMap[key] = (billingMap[key] ?? 0) + Number(inv.base_grand_total || 0);
        }
      }

      return customers.map(c => ({ ...c, billing_total: Math.round(billingMap[c.name] ?? 0) }));
    } catch (e: any) { reply.code(502); return { error: e.message }; }
  });

  app.get('/erp/fiscal-years', async (_req, reply) => {
    try { return await getFiscalYears(); }
    catch (e: any) { reply.code(502); return { error: e.message }; }
  });

  app.get('/erp/pnl', async (req, reply) => {
    const { from, to } = req.query as { from?: string; to?: string };
    try { return await getPnl(from, to); } // no from/to => all-time
    catch (e: any) { reply.code(502); return { error: e.message }; }
  });

  app.get('/erp/_whoami', async () => {
    const headers = {
      Authorization: process.env.ERPNEXT_AUTH_HEADER ??
        `token ${process.env.ERPNEXT_API_KEY}:${process.env.ERPNEXT_API_SECRET}`,
      Accept: 'application/json',
    };
    const r = await fetch(`${process.env.ERPNEXT_URL}/api/method/frappe.auth.get_logged_user`, { headers });
    return { status: r.status, sentPrefix: headers.Authorization.slice(0, 14), body: await r.text() };
  });

  app.get('/erp/pnl/income-breakdown', async (req, reply) => {
    const { from, to } = req.query as { from?: string; to?: string };
    try { return await getIncomeBreakdown(from, to); }
    catch (e: any) { reply.code(502); return { error: e.message }; }
  });

  // Income drill-down: every Sales Invoice line in the period — party, item, amount
  app.get('/erp/pnl/income-items', async (req, reply) => {
    const { from, to } = req.query as { from?: string; to?: string };
    try { return await getIncomeInvoiceItems(from, to); }
    catch (e: any) { reply.code(502); return { error: e.message }; }
  });

  // Expense drill-down: direct children of `parent` only, with rolled-up totals.
  // No parent => children of the root Expenses account.
  app.get('/erp/pnl/expense-children', async (req, reply) => {
    const { from, to, parent } = req.query as { from?: string; to?: string; parent?: string };
    try { return await getExpenseChildren(parent || undefined, from, to); }
    catch (e: any) { reply.code(502); return { error: e.message }; }
  });

  app.get('/erp/orders/upcoming', async (req, reply) => {
    const { limit } = req.query as { limit?: string };
    try { return await getUpcomingOrders(limit ? Number(limit) : undefined); }
    catch (e: any) { reply.code(502); return { error: e.message }; }
  });

  // Outstanding (open) Sales Orders + average fulfilment time on delivered ones
  app.get('/erp/orders/outstanding', async (req, reply) => {
    const { limit } = req.query as { limit?: string };
    try { return await getOutstandingOrders(limit ? Number(limit) : undefined); }
    catch (e: any) { reply.code(502); return { error: e.message }; }
  });
}
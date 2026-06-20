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
import { getStockValuation, getCustomersWithProfitability, getCustomerMargin } from '../services/erpCustomer.js';

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

  // Customer list from ERPNext with billing + gross-margin profitability.
  // Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD limits to a fiscal-year window.
  // Director and sales only.
  app.get('/erp/customers', { preHandler: requireRole('director', 'sales') }, async (req, reply) => {
    const { from, to } = req.query as { from?: string; to?: string };
    try { return await getCustomersWithProfitability(from, to); }
    catch (e: any) { reply.code(502); return { error: e.message }; }
  });

  // Margin breakdown for one customer (per-invoice, per-line). On-demand on click.
  // ?customer=<id>&from=&to=  (customer passed as a query param — names have spaces)
  app.get('/erp/customers/margin', { preHandler: requireRole('director', 'sales') }, async (req, reply) => {
    const { customer, from, to } = req.query as { customer?: string; from?: string; to?: string };
    if (!customer) { reply.code(400); return { error: 'customer is required' }; }
    try { return await getCustomerMargin(customer, from, to); }
    catch (e: any) { reply.code(502); return { error: e.message }; }
  });

  // Total stock valuation + warehouse-wise breakdown (Director view)
  app.get('/erp/stock-valuation', async (_req, reply) => {
    try { return await getStockValuation(); }
    catch (e: any) { reply.code(502); return { error: e.message }; }
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
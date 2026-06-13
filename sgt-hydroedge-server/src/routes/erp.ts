// // src/routes/erp.ts
// import { FastifyInstance } from 'fastify';
// import {
//   getBuildable, getFiscalYears, getIncomeBreakdown, getPnl, getUpcomingOrders,
//   getIncomeInvoiceItems, getExpenseChildren,
// } from '../services/erpnext.js';

// export default async function erpRoutes(app: FastifyInstance) {
//   app.get('/erp/buildable', async (_req, reply) => {
//     try { return await getBuildable(); }
//     catch (e: any) { reply.code(502); return { error: e.message }; }
//   });

//   app.get('/erp/fiscal-years', async (_req, reply) => {
//     try { return await getFiscalYears(); }
//     catch (e: any) { reply.code(502); return { error: e.message }; }
//   });

//   app.get('/erp/pnl', async (req, reply) => {
//     const { from, to } = req.query as { from?: string; to?: string };
//     try { return await getPnl(from, to); } // no from/to => all-time
//     catch (e: any) { reply.code(502); return { error: e.message }; }
//   });

//   app.get('/erp/_whoami', async () => {
//     const headers = {
//       Authorization: process.env.ERPNEXT_AUTH_HEADER ??
//         `token ${process.env.ERPNEXT_API_KEY}:${process.env.ERPNEXT_API_SECRET}`,
//       Accept: 'application/json',
//     };
//     const r = await fetch(`${process.env.ERPNEXT_URL}/api/method/frappe.auth.get_logged_user`, { headers });
//     return { status: r.status, sentPrefix: headers.Authorization.slice(0, 14), body: await r.text() };
//   });

//   app.get('/erp/pnl/income-breakdown', async (req, reply) => {
//     const { from, to } = req.query as { from?: string; to?: string };
//     try { return await getIncomeBreakdown(from, to); }
//     catch (e: any) { reply.code(502); return { error: e.message }; }
//   });

//   // Income drill-down: every Sales Invoice line in the period — party, item, amount
//   app.get('/erp/pnl/income-items', async (req, reply) => {
//     const { from, to } = req.query as { from?: string; to?: string };
//     try { return await getIncomeInvoiceItems(from, to); }
//     catch (e: any) { reply.code(502); return { error: e.message }; }
//   });

//   // Expense drill-down: direct children of `parent` only, with rolled-up totals.
//   // No parent => children of the root Expenses account.
//   app.get('/erp/pnl/expense-children', async (req, reply) => {
//     const { from, to, parent } = req.query as { from?: string; to?: string; parent?: string };
//     try { return await getExpenseChildren(parent || undefined, from, to); }
//     catch (e: any) { reply.code(502); return { error: e.message }; }
//   });

//   app.get('/erp/orders/upcoming', async (req, reply) => {
//     const { limit } = req.query as { limit?: string };
//     try { return await getUpcomingOrders(limit ? Number(limit) : undefined); }
//     catch (e: any) { reply.code(502); return { error: e.message }; }
//   });
// }
// src/routes/erp.ts
import { FastifyInstance } from 'fastify';
import {
  getBuildable, getFiscalYears, getIncomeBreakdown, getPnl, getUpcomingOrders,
  getIncomeInvoiceItems, getExpenseChildren, getOutstandingOrders,
} from '../services/erpnext.js';

export default async function erpRoutes(app: FastifyInstance) {
  app.get('/erp/buildable', async (_req, reply) => {
    try { return await getBuildable(); }
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
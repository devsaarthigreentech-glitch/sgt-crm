// src/routes/erp.ts
import { FastifyInstance } from 'fastify';
import { getBuildable, getFiscalYears, getPnl } from '../services/erpnext.js';

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
}
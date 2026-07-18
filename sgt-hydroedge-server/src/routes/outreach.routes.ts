// =====================================================================
// routes/outreach.routes.ts   (wiring only — SQL lives in services/outreach.ts)
// Registered as: await app.register(outreachRoutes, { prefix: '/api/v1' })
// =====================================================================

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guard';
import * as svc from '../services/outreach';
import * as companies from '../services/companies';

function currentUser(req: any): string | null {
  return req?.user?.name ?? req?.user?.email ?? null;
}

export async function outreachRoutes(app: FastifyInstance) {
  // GET /api/v1/outreach/contacts?company=&status=&search=&vertical=&promoted=
  // Returns a flat list; the desk groups by company client-side.
  // `stats` are scoped to the selected vertical; `verticals` always spans all
  // of them so the pills keep their counts while one is selected.
  app.get('/outreach/contacts', { preHandler: [requireAuth] }, async (req) => {
    const q = req.query as Record<string, string>;
    const [contacts, stats, verticals] = await Promise.all([
      svc.listContacts({ company: q.company, status: q.status, search: q.search, vertical: q.vertical, promoted: q.promoted }),
      svc.contactStats(q.vertical),
      svc.verticalStats(),
    ]);
    return { contacts, stats, verticals };
  });

  // POST /api/v1/outreach/import   body: { rows: IncomingRow[], sourceFile?: string }
  app.post('/outreach/import', { preHandler: [requireAuth] }, async (req) => {
    const body = (req.body ?? {}) as { rows?: svc.IncomingRow[]; sourceFile?: string };
    return svc.importContacts(body.rows ?? [], {
      sourceFile: body.sourceFile ?? null,
      user: currentUser(req),
    });
  });

  // PATCH /api/v1/outreach/contacts/:id  { status?, mail_status?, phone?, email?, linkedin?, layer?, title?, vertical? }
  app.patch('/outreach/contacts/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const updated = await svc.updateContact(Number(id), (req.body ?? {}) as Record<string, unknown>, currentUser(req));
    if (!updated) return reply.code(404).send({ error: 'not found' });
    return updated;
  });

  // DELETE /api/v1/outreach/contacts/:id — soft delete (GAP placeholder rows)
  app.delete('/outreach/contacts/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = await svc.deleteContact(Number(id), currentUser(req));
    if (!ok) return reply.code(404).send({ error: 'not found' });
    return { data: { id: Number(id), deleted: true } };
  });

  // POST /api/v1/outreach/contacts/:id/restore — undo a delete
  app.post('/outreach/contacts/:id/restore', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = await svc.restoreContact(Number(id), currentUser(req));
    if (!ok) return reply.code(404).send({ error: 'not found' });
    return { data: { id: Number(id), restored: true } };
  });

  // ---- Company intel -------------------------------------------------
  // GET /api/v1/outreach/companies?vertical=  → { companies: { name_key: {...} } }
  // The desk fetches this once and looks intel up per group, no N+1.
  app.get('/outreach/companies', { preHandler: [requireAuth] }, async (req) => {
    const q = req.query as Record<string, string>;
    return { companies: await companies.companyMap(q.vertical) };
  });

  // GET /api/v1/outreach/companies/:name  → one profile (or null)
  app.get('/outreach/companies/:name', { preHandler: [requireAuth] }, async (req) => {
    const { name } = req.params as { name: string };
    return { company: await companies.getCompany(decodeURIComponent(name)) };
  });

  // POST /api/v1/outreach/companies/import  { rows: IncomingCompany[] }
  app.post('/outreach/companies/import', { preHandler: [requireAuth] }, async (req) => {
    const body = (req.body ?? {}) as { rows?: companies.IncomingCompany[] };
    return companies.importCompanies(body.rows ?? [], currentUser(req));
  });

  // POST /api/v1/outreach/companies/ensure  { name, vertical }  → empty shell for "add intel"
  app.post('/outreach/companies/ensure', { preHandler: [requireAuth] }, async (req, reply) => {
    const b = (req.body ?? {}) as { name?: string; vertical?: string };
    if (!b.name) return reply.code(400).send({ error: 'name required' });
    return { company: await companies.ensureCompany(b.name, b.vertical ?? '', currentUser(req)) };
  });

  // PATCH /api/v1/outreach/companies/:id  { headline?, thesis?, entry_path?, …, facts? }
  app.patch('/outreach/companies/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const updated = await companies.updateCompany(Number(id), (req.body ?? {}) as Record<string, unknown>, currentUser(req));
    if (!updated) return reply.code(404).send({ error: 'not found' });
    return { company: updated };
  });

  // POST /api/v1/outreach/contacts/:id/promote → creates a lead (Green only)
  app.post('/outreach/contacts/:id/promote', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await svc.promoteContact(Number(id), currentUser(req));
    if (!result.ok) {
      const code = result.reason === 'not_found' ? 404 : 422;
      return reply.code(code).send({ error: result.message });
    }
    return reply.code(201).send({ data: result });
  });
}
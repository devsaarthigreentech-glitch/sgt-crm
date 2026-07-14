// =====================================================================
// routes/outreach.routes.ts   (wiring only — SQL lives in services/outreach.ts)
//
// Registered in index.ts as:  await app.register(outreachRoutes, { prefix: '/api/v1' })
// …so paths here are RELATIVE to that prefix, exactly like leadsRoutes /
// erpRoutes / usersRoutes. Final URLs resolve to /api/v1/outreach/...
// =====================================================================

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guard';
import * as svc from '../services/outreach';

// pull a user identifier off the request set by requireAuth
function currentUser(req: any): string | null {
  return req?.user?.email ?? req?.user?.id ?? req?.user?.name ?? null;
}

export async function outreachRoutes(app: FastifyInstance) {
  // GET /api/v1/outreach/contacts?company=&status=&search=
  app.get('/outreach/contacts', { preHandler: [requireAuth] }, async (req) => {
    const q = req.query as Record<string, string>;
    const [contacts, stats] = await Promise.all([
      svc.listContacts({ company: q.company, status: q.status, search: q.search }),
      svc.contactStats(),
    ]);
    return { contacts, stats };
  });

  // POST /api/v1/outreach/import   body: { rows: IncomingRow[], sourceFile?: string }
  app.post('/outreach/import', { preHandler: [requireAuth] }, async (req) => {
    const body = (req.body ?? {}) as { rows?: svc.IncomingRow[]; sourceFile?: string };
    return svc.importContacts(body.rows ?? [], {
      sourceFile: body.sourceFile ?? null,
      user: currentUser(req),
    });
  });

  // PATCH /api/v1/outreach/contacts/:id   body: { status?, mail_status? }
  app.patch('/outreach/contacts/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const updated = await svc.updateContact(
      Number(id),
      (req.body ?? {}) as Record<string, unknown>,
      currentUser(req),
    );
    if (!updated) return reply.code(404).send({ error: 'not found' });
    return updated;
  });
}
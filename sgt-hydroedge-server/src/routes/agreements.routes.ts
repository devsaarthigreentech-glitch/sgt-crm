// =====================================================================
// routes/agreements.routes.ts — dealer agreements.
//
// Mounted TWICE, at two prefixes, from one set of handlers:
//
//   /api/v1/agreements         SGT staff. Sees every agreement.
//   /api/v1/portal/agreements  a distributor. Bounded to its own subtree
//                              by quote_service.visible_org_ids().
//
// Registering the same plugin twice rather than writing the routes out
// again is deliberate. The two surfaces produce the SAME legal document;
// two implementations would drift, and what drifts is a contract.
//
// The ONLY difference between them is `scope()`, which returns null for
// staff (meaning unbounded) and a list of visible org ids for a partner.
// Every query takes that list. There is no third behaviour to get wrong.
//
// No route here accepts an org id from an external caller for anything
// other than the dealer being appointed, and that one is checked against
// the visible set before it is used.
// =====================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/guard.js';
import {
  resolveForDealer, createAgreement, listAgreements, getAgreement, isVisible,
  agreementPdf, agreementHistory, draftFor, sendAgreementTo, storeSignedCopy,
  readSignedCopy, dealersWithoutAgreement, SIGNED_MAX_BYTES,
  type Actor, type AgreementRow,
} from '../services/agreements.js';
import { agreementMailProvider } from '../services/agreementMail.js';
import { AGREEMENT_DOCTYPE } from '../services/erpAgreement.js';

export interface AgreementRoutesOptions {
  /** 'staff' sees everything; 'portal' is bounded to the caller's subtree. */
  surface: 'staff' | 'portal';
}

interface Caller extends Actor {
  /** null = unbounded (staff). A list = exactly what this caller may touch. */
  orgIds: number[] | null;
}

const staffGuard = requireRole('director', 'sales');

/**
 * Who is calling and what they may see.
 *
 * The org is resolved from the DATABASE every request, keyed on the JWT
 * subject — never read off the token. A token is a claim about identity,
 * not about scope: someone moved to another org or deactivated must lose
 * access on the next request, not whenever their token expires. Same rule
 * portal.routes.ts states and follows.
 */
async function resolveCaller(
  req: FastifyRequest, reply: FastifyReply, surface: 'staff' | 'portal',
): Promise<Caller | null> {
  const sub = (req.user as { sub?: string } | undefined)?.sub;
  if (!sub) {
    reply.code(401).send({ error: { code: 'unauthorized', message: 'Login required' } });
    return null;
  }

  const { rows } = await query(
    `select u.id, u.name, u.org_id, u.active,
            o.code, o.org_type, o.is_active as org_active
       from lead_service.app_user u
       left join quote_service.org o on o.id = u.org_id
      where u.id = $1`, [sub]);
  const row = rows[0];
  if (!row || !row.active) {
    reply.code(403).send({ error: { code: 'forbidden', message: 'Account is not active' } });
    return null;
  }

  const name = String(row.name ?? '').trim() || 'Unknown';

  if (surface === 'staff') {
    // Staff act AS SGT. Their org code is not stamped on the document —
    // raised_by_org means "which partner raised this", and SGT is not a
    // partner. Leaving it blank is what makes an SGT-raised agreement
    // distinguishable from a distributor-raised one.
    return { userId: String(row.id), name, orgCode: null, via: 'crm', orgIds: null };
  }

  if (!row.org_id || !row.org_active) {
    reply.code(403).send({
      error: { code: 'no_org', message: 'This account is not linked to an active partner' },
    });
    return null;
  }

  const { rows: vis } = await query(
    `select org_id from quote_service.visible_org_ids($1)`, [row.org_id]);
  return {
    userId: String(row.id), name, orgCode: row.code, via: 'portal',
    orgIds: vis.map((v: { org_id: number }) => v.org_id),
  };
}

/** Load an agreement and confirm the caller may touch it. */
async function loadScoped(
  idRaw: string, me: Caller, reply: FastifyReply,
): Promise<AgreementRow | null> {
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    reply.code(400).send({ error: { code: 'bad_id', message: 'Invalid agreement id' } });
    return null;
  }
  const row = await getAgreement(id);
  // A row the caller may not see is reported as absent, not as forbidden:
  // "403" on a specific id confirms that id exists.
  if (!row || !isVisible(row, me.orgIds)) {
    reply.code(404).send({ error: { code: 'not_found', message: 'No such agreement' } });
    return null;
  }
  return row;
}

const fail = (reply: FastifyReply, code: number, kind: string, e: unknown) =>
  reply.code(code).send({
    error: { code: kind, message: String((e as Error)?.message ?? e).slice(0, 400) },
  });

export default function agreementRoutes(opts: AgreementRoutesOptions) {
  const guard = opts.surface === 'staff' ? staffGuard : requireAuth;

  return async function (app: FastifyInstance) {
    // ---- Config the screen needs before it can render anything --------
    app.get('/meta', { preHandler: guard }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      return reply.send({
        data: {
          provider: agreementMailProvider(),
          doctype: AGREEMENT_DOCTYPE,
          signedMaxMb: Math.round(SIGNED_MAX_BYTES / 1048576),
          surface: opts.surface,
        },
      });
    });

    // ---- Dealers that could be appointed -------------------------------
    // Drives the picker. `pending` is the useful default view: the dealers
    // who have no agreement yet are exactly the ones someone is looking
    // for when they open this screen.
    app.get('/dealers', { preHandler: guard }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      const all = String((req.query as { all?: string })?.all ?? '') === '1';

      if (!all) {
        return reply.send({ data: await dealersWithoutAgreement(me.orgIds) });
      }
      const { rows } = me.orgIds
        ? await query(
            `select o.id, o.code, o.legal_name, o.dealer_type, o.territory,
                    p.code as distributor_code, p.legal_name as distributor_name,
                    (select count(*) from quote_service.agreement_ref a
                      where a.dealer_org_id = o.id and a.status <> 'cancelled') as agreements
               from quote_service.org o
               left join quote_service.org p on p.id = o.parent_id
              where o.org_type = 'dealer' and o.is_active and o.id = any($1::int[])
              order by o.code`, [me.orgIds])
        : await query(
            `select o.id, o.code, o.legal_name, o.dealer_type, o.territory,
                    p.code as distributor_code, p.legal_name as distributor_name,
                    (select count(*) from quote_service.agreement_ref a
                      where a.dealer_org_id = o.id and a.status <> 'cancelled') as agreements
               from quote_service.org o
               left join quote_service.org p on p.id = o.parent_id
              where o.org_type = 'dealer' and o.is_active
              order by o.code`);
      return reply.send({ data: rows });
    });

    // ---- The one click -------------------------------------------------
    // Everything the agreement will say, derived, WITHOUT creating
    // anything. The screen shows it, the user reads it, and only then
    // does POST / commit it. Separating these two is what makes the
    // warnings useful — after creation they are an autopsy.
    app.get('/resolve/:dealerOrgId', { preHandler: guard }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      const dealerOrgId = Number((req.params as { dealerOrgId: string }).dealerOrgId);
      if (!Number.isInteger(dealerOrgId)) {
        return reply.code(400).send({ error: { code: 'bad_id', message: 'Invalid dealer id' } });
      }
      if (me.orgIds && !me.orgIds.includes(dealerOrgId)) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'No such dealer' } });
      }
      try {
        return reply.send({ data: await resolveForDealer(dealerOrgId) });
      } catch (e) {
        return fail(reply, 400, 'resolve_failed', e);
      }
    });

    // ---- Create ---------------------------------------------------------
    app.post('/', { preHandler: guard }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      const body = (req.body ?? {}) as { dealerOrgId?: number; overrides?: Record<string, any> };
      const dealerOrgId = Number(body.dealerOrgId);
      if (!Number.isInteger(dealerOrgId)) {
        return reply.code(400).send({
          error: { code: 'bad_request', message: 'dealerOrgId is required' },
        });
      }
      if (me.orgIds && !me.orgIds.includes(dealerOrgId)) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'No such dealer' } });
      }
      try {
        const row = await createAgreement(dealerOrgId, me, body.overrides ?? {});
        return reply.code(201).send({ data: row });
      } catch (e) {
        req.log.error({ err: e, dealerOrgId }, 'agreement creation failed');
        return fail(reply, 502, 'create_failed', e);
      }
    });

    // ---- List / read -----------------------------------------------------
    app.get('/', { preHandler: guard }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      return reply.send({ data: await listAgreements(me.orgIds) });
    });

    app.get('/:id', { preHandler: guard }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      const row = await loadScoped((req.params as { id: string }).id, me, reply);
      if (!row) return;
      return reply.send({ data: row });
    });

    app.get('/:id/history', { preHandler: guard }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      const row = await loadScoped((req.params as { id: string }).id, me, reply);
      if (!row) return;
      return reply.send({ data: await agreementHistory(row.id) });
    });

    // ---- The PDF ---------------------------------------------------------
    // Proxied, never linked: the browser must not hold an ERPNext
    // credential, and the caller has been scoped above.
    app.get('/:id/pdf', { preHandler: guard }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      const row = await loadScoped((req.params as { id: string }).id, me, reply);
      if (!row) return;
      try {
        const pdf = await agreementPdf(row);
        const disp = String((req.query as { download?: string })?.download ?? '') === '1'
          ? 'attachment' : 'inline';
        reply.header('Content-Type', 'application/pdf');
        reply.header('Content-Disposition', `${disp}; filename="${row.erp_name}.pdf"`);
        return reply.send(Buffer.from(pdf));
      } catch (e) {
        req.log.error({ err: e, erpName: row.erp_name }, 'agreement pdf render failed');
        return fail(reply, 502, 'pdf_failed', e);
      }
    });

    // ---- Send -------------------------------------------------------------
    app.get('/:id/draft', { preHandler: guard }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      const row = await loadScoped((req.params as { id: string }).id, me, reply);
      if (!row) return;
      const draft = await draftFor(row, me.name);
      return reply.send({ data: { ...draft, provider: agreementMailProvider() } });
    });

    app.post('/:id/send', { preHandler: guard }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      const row = await loadScoped((req.params as { id: string }).id, me, reply);
      if (!row) return;
      try {
        const result = await sendAgreementTo(row, me, (req.body ?? {}) as any);
        return reply.send({ data: result });
      } catch (e) {
        req.log.error({ err: e, erpName: row.erp_name }, 'agreement send failed');
        return fail(reply, 502, 'send_failed', e);
      }
    });

    // ---- The countersigned copy -------------------------------------------
    app.post('/:id/signed', {
      preHandler: guard,
      // Base64 inflates by a third, and Fastify's default cap is 1 MB.
      bodyLimit: SIGNED_MAX_BYTES * 2,
    }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      const row = await loadScoped((req.params as { id: string }).id, me, reply);
      if (!row) return;

      const body = (req.body ?? {}) as { filename?: string; mime?: string; base64?: string };
      const b64 = String(body.base64 ?? '').replace(/^data:[^;]+;base64,/, '');
      if (!b64) {
        return reply.code(400).send({
          error: { code: 'bad_request', message: 'base64 file content is required' },
        });
      }
      let bytes: Buffer;
      try { bytes = Buffer.from(b64, 'base64'); }
      catch { return fail(reply, 400, 'bad_base64', 'Could not decode the file'); }

      try {
        const r = await storeSignedCopy(row, me, {
          filename: String(body.filename ?? `${row.erp_name}-signed.pdf`),
          mime: String(body.mime ?? 'application/pdf'),
          bytes,
        });
        return reply.code(201).send({ data: r });
      } catch (e) {
        return fail(reply, 400, 'upload_failed', e);
      }
    });

    app.get('/:id/signed', { preHandler: guard }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      const row = await loadScoped((req.params as { id: string }).id, me, reply);
      if (!row) return;
      try {
        const f = await readSignedCopy(row);
        if (!f) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'No signed copy has been uploaded' },
          });
        }
        reply.header('Content-Type', f.mime);
        reply.header('Content-Disposition',
          `attachment; filename="${f.filename.replace(/"/g, '')}"`);
        return reply.send(f.bytes);
      } catch (e) {
        return fail(reply, 502, 'read_failed', e);
      }
    });
  };
}

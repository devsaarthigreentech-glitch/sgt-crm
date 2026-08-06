// =====================================================================
// routes/dealerPo.routes.ts — dealer purchase orders.
//
// Mounted TWICE, at two prefixes, from one set of handlers:
//
//   /api/v1/pos         SGT staff. Sees every PO.
//   /api/v1/portal/pos  a partner. Bounded to their own subtree by
//                       quote_service.visible_org_ids().
//
// Registering the same plugin twice rather than writing the routes out
// again is deliberate, and copied from agreements.routes.ts: the two
// surfaces must produce the SAME document. Two implementations drift.
//
// The ONLY difference between them is `scope()`, which returns null for
// staff (unbounded) and a list of visible org ids for a partner. Every
// query takes that list.
//
// The portal mount sits UNDER /api/v1/portal on purpose: that prefix is
// the only one EXTERNAL_ROLE_ALLOW grants an external role, so POs become
// reachable without widening the policy in src/auth/policy.ts.
// =====================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/guard.js';
import {
  resolveFromQuotation, createFromQuotation, listPos, posForQuotation,
  getPo, isVisible, poPdf, deletePo, cancelPo, PoLineError,
  type Actor, type PoRow, type PoLineBody,
} from '../services/dealerPo.js';
import {
  PO_DISCOUNT_CAPS, AMC_TERMS, RATE_CARD_MARGIN_PCT, actorFor,
} from '../domain/quoteDiscount.js';
import { PO_DOCTYPE } from '../services/erpDealerPo.js';

export interface PoRoutesOptions {
  /** 'staff' sees everything; 'portal' is bounded to the caller's subtree. */
  surface: 'staff' | 'portal';
}

interface Caller extends Actor {
  /** null = unbounded (staff). A list = exactly what this caller may touch. */
  orgIds: number[] | null;
  /** For the indicative cap on /meta. Null for staff. */
  orgType: string | null;
}

const staffGuard = requireRole('director', 'sales');

/**
 * Who is calling and what they may see.
 *
 * The org is resolved from the DATABASE every request, keyed on the JWT
 * subject — never read off the token. A token is a claim about identity,
 * not about scope: someone moved to another org or deactivated must lose
 * access on the next request, not whenever their token expires.
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
    // "raised by org" means "which partner raised this", and SGT is not a
    // partner. Blank is what makes an SGT-raised PO distinguishable.
    return { userId: String(row.id), name, orgCode: null, via: 'crm', orgIds: null, orgType: null };
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
    orgType: row.org_type ?? null,
  };
}

/** Load a PO and confirm the caller may touch it. */
async function loadScoped(
  idRaw: string, me: Caller, reply: FastifyReply,
): Promise<PoRow | null> {
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    reply.code(400).send({ error: { code: 'bad_id', message: 'Invalid PO id' } });
    return null;
  }
  const row = await getPo(id);
  // A row the caller may not see is reported as absent, not as forbidden:
  // a 403 on a specific id confirms that id exists.
  if (!row || !isVisible(row, me.orgIds)) {
    reply.code(404).send({ error: { code: 'not_found', message: 'No such PO' } });
    return null;
  }
  return row;
}

/**
 * May this caller raise a PO against this quotation?
 *
 * Staff may raise one against any quotation the CRM knows. A partner may
 * only raise one against a quotation in their own org tree — the same
 * check ownsQuotation() makes in portal.routes.ts, and for the same
 * reason: the quotation name is supplied by the client.
 */
async function quotationInScope(quotationErpName: string, me: Caller): Promise<boolean> {
  if (me.orgIds === null) {
    const { rows } = await query(
      `select 1 from quote_service.quotation_ref where erp_name = $1`, [quotationErpName]);
    return rows.length > 0;
  }
  const { rows } = await query(
    `select 1 from quote_service.quotation_ref
      where erp_name = $1 and org_id = any($2::int[])`,
    [quotationErpName, me.orgIds]);
  return rows.length > 0;
}

const fail = (reply: FastifyReply, code: number, kind: string, e: unknown) =>
  reply.code(code).send({
    error: { code: kind, message: String((e as Error)?.message ?? e).slice(0, 400) },
  });

export default function dealerPoRoutes(opts: PoRoutesOptions) {
  const guard = opts.surface === 'staff' ? staffGuard : requireAuth;

  return async function (app: FastifyInstance) {
    // ---- Config the screen needs before it can render anything --------
    app.get('/meta', { preHandler: guard }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      return reply.send({
        data: {
          doctype: PO_DOCTYPE,
          termsTemplate: process.env.ERP_DEALER_PO_TERMS ?? 'GreenX Dealer PO Terms',
          surface: opts.surface,
          // INDICATIVE only — the cap that is actually enforced follows
          // the org the QUOTATION belongs to, and /resolve returns that
          // one. This is for labelling a field before a quotation has
          // been picked.
          //
          // The PO caps are deliberately looser than the quote caps: the
          // price is negotiated after the quotation goes out. A partner
          // is told only their own, because what a distributor may give
          // is none of a dealer's business.
          discountCaps: me.orgIds === null
            ? PO_DISCOUNT_CAPS
            : { [actorFor(me.orgType)]: PO_DISCOUNT_CAPS[actorFor(me.orgType)] },
          rateCardMarginPct: RATE_CARD_MARGIN_PCT,
          amcTerms: AMC_TERMS,
        },
      });
    });

    // ---- What a PO for this quotation WOULD say ------------------------
    // No side effects, so the screen can show the warnings before anything
    // is written. Afterwards they are an autopsy.
    app.get('/resolve/:quotationErpName', { preHandler: guard }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      const { quotationErpName } = req.params as { quotationErpName: string };
      if (!await quotationInScope(quotationErpName, me)) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'No such quotation' } });
      }
      try {
        const r = await resolveFromQuotation(quotationErpName);
        return reply.send({
          data: {
            quotationErpName: r.quotationErpName,
            summary: r.summary,
            warnings: r.warnings,
            // Everything the negotiation dialog opens with: the quoted
            // lines to edit, the cap that applies, and whether the tax on
            // this quotation can be recomputed at all.
            lines: r.editorLines,
            discount: r.discount,
            taxRules: r.taxRules,
            taxBlocker: r.taxBlocker,
            existing: await posForQuotation(quotationErpName),
          },
        });
      } catch (e) {
        return fail(reply, 502, 'resolve_failed', e);
      }
    });

    // ---- Raise it -------------------------------------------------------
    app.post('/', { preHandler: guard }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      const body = (req.body ?? {}) as { quotationErpName?: string; lines?: PoLineBody[] };
      const quotationErpName = String(body.quotationErpName ?? '').trim();
      if (!quotationErpName) {
        return reply.code(400).send({
          error: { code: 'bad_request', message: 'quotationErpName is required' },
        });
      }
      if (!await quotationInScope(quotationErpName, me)) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'No such quotation' } });
      }
      // Absent `lines` means "raise it exactly as quoted". An empty array
      // is NOT the same thing and is refused below — it would mean a PO
      // with no machines on it.
      const lines = Array.isArray(body.lines) ? body.lines : undefined;
      try {
        const { row, warnings } = await createFromQuotation(quotationErpName, me, lines);
        return reply.code(201).send({ data: { ...row, warnings } });
      } catch (e) {
        // Anything the person can fix on the form — a discount over the
        // cap, a kVA above the catalogue, an AMC with no price — is a 422
        // with the message on it, not a 502. They did nothing wrong.
        if (e instanceof PoLineError) {
          return reply.code(422).send({
            error: { code: 'line_rejected', message: e.message },
            lineIndex: e.lineIndex,
          });
        }
        req.log.error({ err: e, quotationErpName }, 'dealer PO creation failed');
        return fail(reply, 502, 'create_failed', e);
      }
    });

    // ---- List / read -----------------------------------------------------
    app.get('/', { preHandler: guard }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      return reply.send({ data: await listPos(me.orgIds) });
    });

    app.get('/:id', { preHandler: guard }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      const row = await loadScoped((req.params as { id: string }).id, me, reply);
      if (!row) return;
      return reply.send({ data: row });
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
        const pdf = await poPdf(row);
        const disp = String((req.query as { download?: string })?.download ?? '') === '1'
          ? 'attachment' : 'inline';
        reply.header('Content-Type', 'application/pdf');
        reply.header('Content-Disposition', `${disp}; filename="${row.erp_name}.pdf"`);
        return reply.send(Buffer.from(pdf));
      } catch (e) {
        req.log.error({ err: e, erpName: row.erp_name }, 'dealer PO pdf render failed');
        return fail(reply, 502, 'pdf_failed', e);
      }
    });

    // ---- Undo -------------------------------------------------------------
    app.delete('/:id', { preHandler: guard }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      const row = await loadScoped((req.params as { id: string }).id, me, reply);
      if (!row) return;
      try {
        await deletePo(row);
        return reply.send({ data: { deleted: row.erp_name } });
      } catch (e) {
        req.log.error({ err: e, erpName: row.erp_name }, 'dealer PO delete failed');
        return fail(reply, 409, 'delete_failed', e);
      }
    });

    app.post('/:id/cancel', { preHandler: guard }, async (req, reply) => {
      const me = await resolveCaller(req, reply, opts.surface);
      if (!me) return;
      const row = await loadScoped((req.params as { id: string }).id, me, reply);
      if (!row) return;
      const reason = String((req.body as { reason?: string })?.reason ?? '').slice(0, 500);
      try {
        return reply.send({ data: await cancelPo(row, reason) });
      } catch (e) {
        return fail(reply, 502, 'cancel_failed', e);
      }
    });
  };
}

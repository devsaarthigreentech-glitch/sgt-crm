// =============================================================================
// routes/portal.routes.ts — the distributor's own view.
// -----------------------------------------------------------------------------
// Mounted at /api/v1/portal. This is the ONLY prefix an external role can
// reach; see src/auth/policy.ts, which denies everything else by default.
//
//     GET /portal/me        the caller's own org
//     GET /portal/dealers   the dealers beneath them
//
// Scoping rules this file obeys without exception:
//
//  1. The caller's org is resolved from the DATABASE on every request,
//     keyed on the JWT's subject — never read from the token itself.
//     A token is a claim about identity, not about scope. If someone is
//     moved to a different org or deactivated, that must take effect on
//     the next request, not whenever their token happens to expire.
//
//  2. Every query is bounded by quote_service.visible_org_ids(theirOrg),
//     which walks strictly downwards. A distributor therefore cannot see
//     SGT, cannot see a sibling distributor, and cannot see that
//     distributor's dealers.
//
//  3. No route here accepts an org id from the client. Not as a param,
//     not as a query string, not in a body. The only org that can be
//     asked about is the one the caller is attached to, so there is
//     nothing to tamper with.
//
//  4. Nothing here exposes price books. A distributor seeing dealer_net
//     would be a Clause 17 breach, so pricing simply is not reachable
//     from this file.
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../db/pool.js'
import { requireAuth } from '../auth/guard.js'

interface Caller {
  userId: string
  orgId: number
  orgCode: string
  orgType: string
  legalName: string
}

/**
 * Resolve the caller's org from the database. Returns null and sends the
 * response when the account is not usable, so handlers can simply bail.
 */
async function resolveCaller(
  req: FastifyRequest, reply: FastifyReply,
): Promise<Caller | null> {
  const sub = (req.user as { sub?: string } | undefined)?.sub
  if (!sub) {
    reply.code(401).send({ error: { code: 'unauthorized', message: 'Login required' } })
    return null
  }
  const { rows } = await query(
    `select u.id, u.org_id, u.active,
            o.code, o.org_type, o.legal_name, o.is_active as org_active
       from lead_service.app_user u
       left join quote_service.org o on o.id = u.org_id
      where u.id = $1`, [sub])

  const row = rows[0]
  if (!row || !row.active) {
    reply.code(403).send({ error: { code: 'forbidden', message: 'Account is not active' } })
    return null
  }
  if (!row.org_id || !row.org_active) {
    reply.code(403).send({
      error: { code: 'no_org', message: 'This account is not linked to an active partner' },
    })
    return null
  }
  return {
    userId: String(row.id),
    orgId: row.org_id,
    orgCode: row.code,
    orgType: row.org_type,
    legalName: row.legal_name,
  }
}

export default async function portalRoutes(app: FastifyInstance) {
  // ---- Who am I ---------------------------------------------------------
  app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return

    const { rows } = await query(
      `select code, legal_name, trade_name, org_type, dealer_type,
              territory, gstin, created_at
         from quote_service.org
        where id = $1`, [me.orgId])

    const { rows: [counts] } = await query(
      `select count(*) filter (where org_type = 'dealer')     as dealers,
              count(*) filter (where org_type = 'sub_dealer') as sub_dealers
         from quote_service.org
        where id in (select org_id from quote_service.visible_org_ids($1))
          and id <> $1`, [me.orgId])

    return reply.send({
      data: {
        user: { id: me.userId, name: (req.user as any)?.name, email: (req.user as any)?.email },
        org: rows[0],
        counts,
      },
    })
  })

  // ---- The dealers I manage ---------------------------------------------
  // Bounded by visible_org_ids and excludes the caller's own row, so this
  // returns descendants only. No client-supplied org id anywhere.
  app.get('/dealers', { preHandler: requireAuth }, async (req, reply) => {
    const me = await resolveCaller(req, reply)
    if (!me) return

    const { rows } = await query(
      `select o.id, o.code, o.legal_name, o.trade_name, o.org_type,
              o.dealer_type, o.territory, o.gstin, o.is_active, o.created_at,
              p.code as parent_code
         from quote_service.org o
         left join quote_service.org p on p.id = o.parent_id
        where o.id in (select org_id from quote_service.visible_org_ids($1))
          and o.id <> $1
        order by case when o.org_type = 'dealer' then 0 else 1 end, o.code`,
      [me.orgId])

    return reply.send({ data: rows })
  })
}

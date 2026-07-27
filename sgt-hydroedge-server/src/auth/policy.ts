// =====================================================================
// auth/policy.ts — deny-by-default route access for EXTERNAL roles.
//
// Why this exists
// ---------------
// Most routes in this API are guarded with `requireAuth`, which answers
// "are you logged in?" and nothing else. That was fine while every account
// belonged to SGT. It stops being fine the moment an account belongs to
// someone outside the company.
//
// A distributor is external. Without this hook, a distributor token can
// read /leads, /pipeline, the customer vault, POCs, outreach and the staff
// roster — every one of those is `requireAuth`-only. Hiding sidebar items
// changes nothing: the API is the boundary, not the UI.
//
// How it works
// ------------
// A global onRequest hook. Roles fall into two camps:
//
//   INTERNAL  — director, sales, accounts, supply_chain, pipeline_owner.
//               Unchanged. Existing per-route guards still apply. This
//               hook deliberately does not touch them, so it cannot break
//               the live CRM.
//
//   EXTERNAL  — everyone else. Denied by default. They reach ONLY the
//               paths explicitly allowed below.
//
// Deny-by-default is the whole point: a route added next month is closed
// to external users until someone opts it in. The opposite arrangement —
// a blocklist — fails open, and the failure is silent.
//
// An unknown role (typo, hand-edited DB row, a role added without
// thought) is treated as external and therefore gets nothing. That is the
// safe direction to fail.
// =====================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

/** SGT staff. Existing behaviour preserved exactly. */
export const INTERNAL_ROLES = new Set([
  'director',
  'sales',
  'accounts',
  'supply_chain',
  'pipeline_owner',
])

/**
 * Paths each external role may reach, as prefixes. Everything else is 403.
 * Keep these narrow — a prefix is a promise about every route under it,
 * including ones that do not exist yet.
 */
export const EXTERNAL_ROLE_ALLOW: Record<string, string[]> = {
  // A distributor sees their own org and the dealers beneath it. Nothing else.
  distributor: [
    '/api/v1/portal',
  ],
}

/** Reachable without any token at all. */
const PUBLIC_PREFIXES = [
  '/api/v1/auth/login',
  '/health',
]

function pathOf(url: string): string {
  const q = url.indexOf('?')
  return q === -1 ? url : url.slice(0, q)
}

const allowed = (path: string, prefixes: string[]): boolean =>
  prefixes.some(p => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`))

/**
 * Register on the Fastify instance BEFORE the route plugins, so it runs
 * ahead of every handler.
 */
export function registerRoutePolicy(app: FastifyInstance) {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const path = pathOf(req.url)
    if (allowed(path, PUBLIC_PREFIXES)) return

    // Decode the token if there is one. A missing or invalid token is NOT
    // this hook's problem — the per-route requireAuth still returns 401.
    // Verifying here only tells us which role we are dealing with.
    let role: string | undefined
    try {
      await req.jwtVerify()
      role = (req.user as { role?: string } | undefined)?.role
    } catch {
      return
    }

    if (!role || INTERNAL_ROLES.has(role)) return

    const grants = EXTERNAL_ROLE_ALLOW[role] ?? []
    if (allowed(path, grants)) return

    req.log.warn(
      { role, path, sub: (req.user as { sub?: string } | undefined)?.sub },
      'route policy: external role denied',
    )
    return reply.code(403).send({
      error: { code: 'forbidden', message: 'Not allowed' },
    })
  })
}

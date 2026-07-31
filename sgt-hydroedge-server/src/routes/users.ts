// GET /users — active employees from lead_service.app_user.
// Powers owner dropdowns (triage assignment, future task assignment).
import { FastifyInstance, FastifyRequest } from 'fastify'
import { query } from '../db/pool'
import { requireAuth, requireRole } from '../auth/guard.js'
import {
  listAccounts, createAccount, resetPassword, setActive,
} from '../services/userAccounts.js'
import { INTERNAL_ROLES, EXTERNAL_ROLE_ALLOW } from '../auth/policy.js'

export async function usersRoutes(fastify: FastifyInstance) {
  // Was unauthenticated until 2026-07-27, which exposed the full staff roster
  // (name, email, role) to anyone who could reach the API. The frontend already
  // sends the bearer token on every call, so guarding this changed no caller.
  fastify.get('/users', { preHandler: requireAuth }, async (_request, reply) => {
    const result = await query(
      `SELECT id, name, email, role
         FROM lead_service.app_user
        WHERE active = TRUE
        ORDER BY name ASC`
    )
    return reply.send({
      data: result.rows.map(r => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
      })),
    })
  })

  // =====================================================================
  // Account administration — DIRECTOR ONLY.
  //
  // Deliberately not offered to a distributor, even for the dealers
  // beneath them. A login reaches customer master data and raises priced
  // documents in SGT's name, which puts it in the same class as a partner
  // code — and codes are SGT's to allot. See services/userAccounts.ts.
  //
  // Kept on /users rather than a new prefix so auth/policy.ts needs no
  // change: external roles already reach nothing outside /portal.
  // =====================================================================
  const director = requireRole('director')

  const actingUser = (req: FastifyRequest) => req.user?.sub ?? null

  /** The roles the screen may offer, described rather than hardcoded there. */
  fastify.get('/users/roles', { preHandler: director }, async (_req, reply) => {
    return reply.send({
      data: {
        internal: [...INTERNAL_ROLES].map(r => ({ value: r, partner: false })),
        external: Object.keys(EXTERNAL_ROLE_ALLOW).map(r => ({ value: r, partner: true })),
      },
    })
  })

  fastify.get('/users/accounts', { preHandler: director }, async (_req, reply) => {
    return reply.send({ data: await listAccounts() })
  })

  fastify.post('/users/accounts', { preHandler: director }, async (req, reply) => {
    const r = await createAccount((req.body ?? {}) as Record<string, string>)
    if (!r.ok) {
      return reply.code(r.code).send({
        error: { code: 'validation_failed', message: r.message },
        ...(r.field ? { fields: { [r.field]: r.message } } : {}),
      })
    }
    // The only time the password is ever readable. It is not stored, and
    // there is no endpoint that can return it again.
    return reply.code(201).send({ data: { ...r.account, password: r.password } })
  })

  fastify.post('/users/accounts/:id/password', { preHandler: director }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { password } = (req.body ?? {}) as { password?: string }
    const r = await resetPassword(id, password)
    if (!r.ok) {
      return reply.code(r.code).send({ error: { code: 'reset_failed', message: r.message } })
    }
    return reply.send({ data: { ...r.account, password: r.password } })
  })

  fastify.post('/users/accounts/:id/status', { preHandler: director }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { active } = (req.body ?? {}) as { active?: boolean }
    const r = await setActive(id, active !== false, actingUser(req))
    if (!r.ok) {
      return reply.code(r.code).send({ error: { code: 'status_failed', message: r.message } })
    }
    return reply.send({ data: r.account })
  })
}
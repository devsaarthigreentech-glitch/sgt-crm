// GET /users — active employees from lead_service.app_user.
// Powers owner dropdowns (triage assignment, future task assignment).
import { FastifyInstance } from 'fastify'
import { query } from '../db/pool'
import { requireAuth } from '../auth/guard.js'

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
}
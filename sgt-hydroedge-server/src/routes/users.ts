// GET /users — active employees from lead_service.app_user.
// Powers owner dropdowns (triage assignment, future task assignment).
import { FastifyInstance } from 'fastify'
import { query } from '../db/pool'

export async function usersRoutes(fastify: FastifyInstance) {
  fastify.get('/users', async (_request, reply) => {
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
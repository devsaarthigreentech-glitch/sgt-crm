import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { pool } from '../db/pool.js'             // ⬅️ your pg pool
import { requireAuth } from '../auth/guard.js'

export default async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (req, reply) => {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string }
    if (!email || !password) { reply.code(400); return { error: { code: 'bad_request', message: 'email and password required' } } }

    const { rows } = await pool.query(
      `SELECT id, email, name, role, password_hash, active
         FROM lead_service.app_user WHERE email = $1`, [email.toLowerCase()]
    )
    const u = rows[0]
    if (!u || !u.active || !(await bcrypt.compare(password, u.password_hash))) {
      reply.code(401); return { error: { code: 'invalid_credentials', message: 'Wrong email or password' } }
    }
    const token = await reply.jwtSign(
      { sub: String(u.id), role: u.role, name: u.name, email: u.email },
      { expiresIn: '12h' }
    )
    return { token, user: { id: u.id, email: u.email, name: u.name, role: u.role } }
  })

  app.get('/auth/me', { preHandler: requireAuth }, async (req) => {
    const c = req.user as any
    return { user: { id: Number(c.sub), email: c.email, name: c.name, role: c.role } }
  })
}
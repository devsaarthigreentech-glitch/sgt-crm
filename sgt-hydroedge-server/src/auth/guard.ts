import type { FastifyRequest, FastifyReply } from 'fastify'
import '@fastify/jwt'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: string; name: string; email: string }
    user: { sub: string; role: string; name: string; email: string }
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try { await req.jwtVerify() }
  catch { return reply.code(401).send({ error: { code: 'unauthorized', message: 'Login required' } }) }
}

export function requireRole(...roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try { await req.jwtVerify() }
    catch { return reply.code(401).send({ error: { code: 'unauthorized', message: 'Login required' } }) }
    if (!roles.includes(req.user.role)) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Not allowed' } })
    }
  }
}
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import dotenv from 'dotenv'
import { leadsRoutes } from './routes/leads'
import partnerRegistrationRoutes from './routes/partnerRegistration.routes.js'
import portalRoutes from './routes/portal.routes.js'
import quotesRoutes from './routes/quotes.routes.js'
import { registerRoutePolicy } from './auth/policy.js'
import erpRoutes from './routes/erp';
import jwt from '@fastify/jwt'
import authRoutes from './routes/auth.js'
import { usersRoutes } from './routes/users.js'
import targetRoutes from './routes/targets.js'
import { vaultRoutes } from './routes/vault.js'
import vaultPocRoutes from './routes/vaultPoc.routes.js'
import { outreachRoutes } from './routes/outreach.routes.js'

dotenv.config()

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  },
})

async function start() {
  // Plugins
  await app.register(helmet)
  const origins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',').map((s) => s.trim()).filter(Boolean)

  await app.register(cors, {
    origin: origins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    service: 'sgt-hydroedge-server',
    time: new Date().toISOString(),
  }))
  app.register(jwt, { secret: process.env.JWT_SECRET! })

  // Deny-by-default access for EXTERNAL roles (distributors, partners).
  // Must be registered before the route plugins so it runs ahead of every
  // handler — including any route added later that forgets its own guard.
  registerRoutePolicy(app)

  // Routes
  await app.register(leadsRoutes, { prefix: '/api/v1' })
  await app.register(partnerRegistrationRoutes, { prefix: '/api/v1/partners' })
  await app.register(portalRoutes, { prefix: '/api/v1/portal' })
  await app.register(quotesRoutes, { prefix: '/api/v1/quotes' })
  app.register(erpRoutes, { prefix: '/api/v1' });
  await app.register(authRoutes,   { prefix: '/api/v1' })
  await app.register(usersRoutes, { prefix: '/api/v1' })
  await app.register(targetRoutes, {prefix: '/api/v1'})
  await app.register(vaultRoutes, { prefix: '/api/v1/vault' })
  await app.register(vaultPocRoutes, { prefix: '/api/v1/vault' })
  await app.register(outreachRoutes, { prefix: '/api/v1' })

  // Global error handler
  app.setErrorHandler((error: any, request, reply) => {
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        error: 'Validation failed',
        details: JSON.parse(error.message),
      })
    }
    app.log.error(error)
    return reply.status(500).send({ error: 'Internal server error' })
  })

  // Start
  const port = parseInt(process.env.PORT ?? '3004')
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`Server running on http://localhost:${port}`)
}

start().catch(err => {
  console.error(err)
  process.exit(1)
})
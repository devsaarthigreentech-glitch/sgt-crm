import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import dotenv from 'dotenv'
import { leadsRoutes } from './routes/leads'
import partnerRoutes from './routes/partner.routes'
import erpRoutes from './routes/erp';
import jwt from '@fastify/jwt'
import authRoutes from './routes/auth.js'
import { usersRoutes } from './routes/users.js'

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

  // Routes
  await app.register(leadsRoutes, { prefix: '/api/v1' })
  await app.register(partnerRoutes, { prefix: '/api/v1/partners/me' })
  app.register(erpRoutes, { prefix: '/api/v1' });
  await app.register(authRoutes,   { prefix: '/api/v1' })
  await app.register(usersRoutes, { prefix: '/api/v1' })

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
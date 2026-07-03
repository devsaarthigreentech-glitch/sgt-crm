// =============================================================================
// routes/vaultPoc.routes.ts — POC endpoints for the Customer Knowledge Vault.
// -----------------------------------------------------------------------------
// Sibling plugin registered under the SAME prefix as vaultRoutes
// (/api/v1/vault), so paths line up with vaultApi:
//     GET  /api/v1/vault/accounts/:accountId/pocs   -> list by account
//     GET  /api/v1/vault/pocs/:id                    -> one POC (detail)
//     POST /api/v1/vault/pocs                         -> create
//
// The SQL/mapping lives canonically in services/vault.ts; this file is wiring
// only. Registering as a sibling (rather than inside vaultRoutes) also keeps us
// clear of the document routes' catch-all content-type parser, which is scoped
// to that plugin's encapsulation — JSON bodies here parse with Fastify's default.
//
// Readings / observations / issues will add routes here later; they hang off
// poc_id and won't touch these three.
// =============================================================================
import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../auth/guard.js'
import {
  createPoc,
  listPocsByAccount,
  getPocById,
  type CreatePocInput,
} from '../services/vault.js'

export default async function vaultPocRoutes(app: FastifyInstance) {
  // List all POCs for one account (newest first).
  app.get('/accounts/:accountId/pocs', { preHandler: requireAuth }, async (req, reply) => {
    const { accountId } = req.params as { accountId: string }
    const data = await listPocsByAccount(accountId)
    return reply.send({ data })
  })

  // Single POC — the detail view.
  app.get('/pocs/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const poc = await getPocById(id)
    if (!poc) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'POC not found' } })
    }
    return reply.send({ data: poc })
  })

  // Create a POC. account_id + product are the only hard requirements; the rest
  // is optional and nullable in-schema.
  app.post('/pocs', { preHandler: requireAuth }, async (req, reply) => {
    const body = (req.body ?? {}) as Partial<CreatePocInput>
    if (!body.accountId || !String(body.accountId).trim()) {
      return reply.code(400).send({ error: { code: 'bad_request', message: 'accountId is required' } })
    }
    if (!body.product || !String(body.product).trim()) {
      return reply.code(400).send({ error: { code: 'bad_request', message: 'product is required' } })
    }
    // Stamp the creator from the verified JWT (populated by requireAuth).
    const actor = { id: req.user.sub, name: req.user.name }
    const data = await createPoc(body as CreatePocInput, actor)
    return reply.code(201).send({ data })
  })
}
// =============================================================================
// routes/vault.ts — Customer Knowledge Vault read endpoints.
// Registered under /api/v1/vault in index.ts (distinct prefix to avoid clashing
// with /erp/customers).
//
//   GET /vault/customers                      -> vault account list
//   GET /vault/customers/:id/workspace        -> full 360 workspace by account UUID
//   GET /vault/by-erp/workspace?erpId=&name=  -> workspace resolved from an ERPNext
//                                                customer (what the customer list has)
// All require a logged-in user (any role).
// =============================================================================
import { FastifyInstance } from 'fastify'
import { requireAuth } from '../auth/guard.js'
import {
  getCustomerList, getCustomerWorkspace, getWorkspaceByErp, resolveAccountByErp,
} from '../services/vault.js'

export async function vaultRoutes(fastify: FastifyInstance) {
  fastify.get('/customers', { preHandler: requireAuth }, async (_req, reply) => {
    const data = await getCustomerList()
    return reply.send({ data })
  })

  fastify.get<{ Params: { id: string } }>(
    '/customers/:id/workspace',
    { preHandler: requireAuth },
    async (req, reply) => {
      const ws = await getCustomerWorkspace(req.params.id)
      if (!ws) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'Customer not found' } })
      }
      return reply.send({ data: ws })
    }
  )

  // Resolve from an ERPNext customer (id + optional name) to the vault workspace.
  // Returns { data: ws } when linked, or { data: null, linked: false } when this
  // ERPNext customer has no vault account yet (so the UI can show an empty state).
  fastify.get<{ Querystring: { erpId?: string; name?: string } }>(
    '/by-erp/workspace',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { erpId, name } = req.query
      if (!erpId) {
        return reply.code(400).send({ error: { code: 'bad_request', message: 'erpId is required' } })
      }
      const accountId = await resolveAccountByErp(erpId, name)
      if (!accountId) {
        return reply.send({ data: null, linked: false })
      }
      const ws = await getWorkspaceByErp(erpId, name)
      return reply.send({ data: ws, linked: true })
    }
  )
}
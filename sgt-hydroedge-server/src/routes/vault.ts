// =============================================================================
// routes/vault.ts — Customer Knowledge Vault endpoints (read + document write).
// Mounted at /api/v1/vault in index.ts.
//
// READ
//   GET  /customers                       -> vault account list
//   GET  /customers/:id/workspace         -> full 360 workspace by account UUID
//   GET  /by-erp/workspace?erpId=&name=    -> workspace resolved from ERPNext
//
// DOCUMENTS (write)
//   GET    /documents/meta                  -> category + confidentiality lists
//   GET    /accounts/:accountId/documents   -> list documents for a customer
//   POST   /documents/initiate              -> create rows, return upload target
//   POST   /documents/:id/complete          -> finalize (size/checksum)
//   GET    /documents/:id/download          -> { url, fileName } to fetch bytes
//   DELETE /documents/:id                   -> soft delete
//
// LOCAL-DISK BLOB I/O (only used when VAULT_STORAGE=local)
//   PUT  /blob/:key  -> store raw bytes on disk
//   GET  /blob/:key  -> stream bytes back
// =============================================================================
import { FastifyInstance } from 'fastify'
import { requireAuth } from '../auth/guard.js'
import {
  getCustomerList, getCustomerWorkspace, getWorkspaceByErp, resolveAccountByErp,
} from '../services/vault.js'
import {
  initiateUpload, completeUpload, listDocuments, getDownloadUrl, deleteDocument,
  DOCUMENT_CATEGORIES, CONFIDENTIALITY_LEVELS,
} from '../services/vaultDocuments.js'
import { localStorage } from '../services/storage.js'

export async function vaultRoutes(fastify: FastifyInstance) {
  // Raw-body parser for octet-stream so the local blob PUT can collect bytes
  // without any multipart dependency. Only matters for VAULT_STORAGE=local.
  fastify.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  )

  // ---- READ -----------------------------------------------------------------
  fastify.get('/customers', { preHandler: requireAuth }, async (_req, reply) => {
    return reply.send({ data: await getCustomerList() })
  })

  fastify.get<{ Params: { id: string } }>(
    '/customers/:id/workspace',
    { preHandler: requireAuth },
    async (req, reply) => {
      const ws = await getCustomerWorkspace(req.params.id)
      if (!ws) return reply.code(404).send({ error: { code: 'not_found', message: 'Customer not found' } })
      return reply.send({ data: ws })
    },
  )

  fastify.get<{ Querystring: { erpId?: string; name?: string } }>(
    '/by-erp/workspace',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { erpId, name } = req.query
      if (!erpId) return reply.code(400).send({ error: { code: 'bad_request', message: 'erpId is required' } })
      const accountId = await resolveAccountByErp(erpId, name)
      if (!accountId) return reply.send({ data: null, linked: false })
      const ws = await getWorkspaceByErp(erpId, name)
      return reply.send({ data: ws, linked: true })
    },
  )

  // ---- DOCUMENT META --------------------------------------------------------
  fastify.get('/documents/meta', { preHandler: requireAuth }, async (_req, reply) => {
    return reply.send({ data: { categories: DOCUMENT_CATEGORIES, confidentiality: CONFIDENTIALITY_LEVELS } })
  })

  fastify.get<{ Params: { accountId: string } }>(
    '/accounts/:accountId/documents',
    { preHandler: requireAuth },
    async (req, reply) => {
      return reply.send({ data: await listDocuments(req.params.accountId) })
    },
  )

  // initiate: create rows + return where to PUT the bytes
  fastify.post<{
    Body: {
      accountId: string; category: string; title: string; description?: string
      confidentiality?: string; tags?: string[]
      fileName: string; mimeType: string; sizeBytes?: number
      refType?: string; refId?: string
    }
  }>('/documents/initiate', { preHandler: requireAuth }, async (req, reply) => {
    const b = req.body
    if (!b?.accountId || !b?.fileName) {
      return reply.code(400).send({ error: { code: 'bad_request', message: 'accountId and fileName are required' } })
    }
    try {
      const result = await initiateUpload({
        accountId: b.accountId,
        category: b.category,
        title: b.title,
        description: b.description ?? null,
        confidentiality: b.confidentiality,
        tags: b.tags,
        fileName: b.fileName,
        mimeType: b.mimeType,
        sizeBytes: b.sizeBytes ?? null,
        refType: b.refType ?? null,
        refId: b.refId ?? null,
        uploadedBy: req.user.sub,
        uploadedByName: req.user.name,
      })
      return reply.send({ data: result })
    } catch (e: any) {
      return reply.code(400).send({ error: { code: 'initiate_failed', message: e.message } })
    }
  })

  // complete: finalize the version
  fastify.post<{ Params: { id: string }; Body: { sizeBytes?: number; checksum?: string } }>(
    '/documents/:id/complete',
    { preHandler: requireAuth },
    async (req, reply) => {
      try {
        await completeUpload(req.params.id, {
          sizeBytes: req.body?.sizeBytes ?? null,
          checksum: req.body?.checksum ?? null,
        })
        return reply.send({ data: { ok: true } })
      } catch (e: any) {
        return reply.code(400).send({ error: { code: 'complete_failed', message: e.message } })
      }
    },
  )

  // download url
  fastify.get<{ Params: { id: string } }>(
    '/documents/:id/download',
    { preHandler: requireAuth },
    async (req, reply) => {
      const r = await getDownloadUrl(req.params.id)
      if (!r) return reply.code(404).send({ error: { code: 'not_found', message: 'Document not found' } })
      return reply.send({ data: r })
    },
  )

  // soft delete
  fastify.delete<{ Params: { id: string } }>(
    '/documents/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      await deleteDocument(req.params.id)
      return reply.send({ data: { ok: true } })
    },
  )

  // ---- LOCAL-DISK BLOB I/O --------------------------------------------------
  fastify.put<{ Params: { key: string } }>(
    '/blob/:key',
    { preHandler: requireAuth },
    async (req, reply) => {
      const local = localStorage()
      if (!local) return reply.code(400).send({ error: { code: 'not_local', message: 'Storage is not local' } })
      const key = decodeURIComponent(req.params.key)
      const body = req.body as Buffer
      if (!Buffer.isBuffer(body)) {
        return reply.code(400).send({ error: { code: 'bad_body', message: 'Expected raw octet-stream body' } })
      }
      await local.writeStream(key, body)
      return reply.send({ data: { ok: true, size: body.length } })
    },
  )

  fastify.get<{ Params: { key: string }; Querystring: { name?: string } }>(
    '/blob/:key',
    { preHandler: requireAuth },
    async (req, reply) => {
      const local = localStorage()
      if (!local) return reply.code(400).send({ error: { code: 'not_local', message: 'Storage is not local' } })
      const key = decodeURIComponent(req.params.key)
      const stat = await local.stat(key)
      if (!stat) return reply.code(404).send({ error: { code: 'not_found', message: 'File not found' } })
      const name = req.query.name ?? key.split('/').pop() ?? 'download'
      reply.header('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`)
      reply.header('Content-Length', String(stat.size))
      return reply.send(local.readStream(key))
    },
  )
}
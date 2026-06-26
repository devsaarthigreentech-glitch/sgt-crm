// src/services/vaultDocuments.ts
// ---------------------------------------------------------------------------
// Write side of the Customer Vault — documents.
//
// Upload is a 3-step, presigned-style flow so it works the same for local disk
// now and MinIO later:
//   1. initiateUpload()  -> creates document + document_version (v1) rows and
//      returns an UploadTarget telling the client where to PUT the bytes.
//   2. (client PUTs bytes to the target)
//   3. completeUpload()  -> records the final size/checksum, sets current_version
//      and latest_version_id, and writes a timeline event.
//
// Categories / confidentiality values mirror the migrate_vault_03 schema.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { query } from '../db/pool.js'
import { storage, type UploadTarget } from './storage.js'

export const DOCUMENT_CATEGORIES = [
  'nda', 'proposal', 'poc_proposal', 'site_survey', 'installation_report',
  'test_data', 'fuel_log', 'emission_report', 'nabl_report', 'customer_report',
  'commercial_proposal', 'purchase_order', 'invoice', 'service_report',
  'case_study', 'meeting_notes', 'customer_feedback', 'internal_review',
  'legal_compliance', 'other',
] as const
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

export const CONFIDENTIALITY_LEVELS = ['public', 'internal', 'confidential', 'restricted'] as const
export type Confidentiality = (typeof CONFIDENTIALITY_LEVELS)[number]

export interface InitiateInput {
  accountId: string
  category: string
  title: string
  description?: string | null
  confidentiality?: string
  tags?: string[]
  fileName: string
  mimeType: string
  sizeBytes?: number | null
  refType?: string | null
  refId?: string | null
  uploadedBy?: string | null
  uploadedByName?: string | null
}

export interface InitiateResult {
  documentId: string
  displayId: string
  versionId: string
  upload: UploadTarget
}

function safeExt(fileName: string): string {
  const ext = path.extname(fileName || '').replace(/[^.A-Za-z0-9]/g, '').slice(0, 12)
  return ext || ''
}

function validCategory(c: string): DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(c) ? (c as DocumentCategory) : 'other'
}
function validConfidentiality(c?: string): Confidentiality {
  return (CONFIDENTIALITY_LEVELS as readonly string[]).includes(c ?? '') ? (c as Confidentiality) : 'internal'
}

// ---- 1. initiate ------------------------------------------------------------
export async function initiateUpload(input: InitiateInput): Promise<InitiateResult> {
  // account must exist
  const acc = await query(
    `SELECT id FROM lead_service.accounts WHERE id = $1 AND deleted_at IS NULL`,
    [input.accountId],
  )
  if (acc.rowCount === 0) throw new Error('account not found')

  const category = validCategory(input.category)
  const confidentiality = validConfidentiality(input.confidentiality)
  const title = (input.title || input.fileName || 'Untitled').trim().slice(0, 300)

  const documentId = randomUUID()
  const versionId = randomUUID()
  const store = storage()
  const key = `${input.accountId}/${documentId}${safeExt(input.fileName)}`

  // create the document (current_version stays 0 until completeUpload)
  const doc = await query(
    `INSERT INTO document_service.document
       (id, account_id, ref_type, ref_id, category, title, description,
        confidentiality, tags, uploaded_by, uploaded_by_name, upload_source, current_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'web',0)
     RETURNING display_id`,
    [
      documentId, input.accountId, input.refType ?? null, input.refId ?? null,
      category, title, input.description ?? null, confidentiality,
      input.tags ?? [], input.uploadedBy ?? null, input.uploadedByName ?? null,
    ],
  )

  // create version 1 row (size/checksum filled in on complete)
  await query(
    `INSERT INTO document_service.document_version
       (id, document_id, version_no, storage_bucket, storage_key, file_name,
        mime_type, size_bytes, uploaded_by, uploaded_by_name)
     VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9)`,
    [
      versionId, documentId, store.bucket, key, input.fileName,
      input.mimeType || 'application/octet-stream',
      input.sizeBytes ?? null, input.uploadedBy ?? null, input.uploadedByName ?? null,
    ],
  )

  const upload = await store.presignUpload(key, input.mimeType)
  return { documentId, displayId: doc.rows[0].display_id, versionId, upload }
}

// ---- 3. complete ------------------------------------------------------------
export async function completeUpload(
  documentId: string,
  opts: { sizeBytes?: number | null; checksum?: string | null } = {},
): Promise<{ ok: true }> {
  const v = await query(
    `SELECT id, document_id FROM document_service.document_version
      WHERE document_id = $1 AND version_no = 1`,
    [documentId],
  )
  if (v.rowCount === 0) throw new Error('version not found')
  const versionId = v.rows[0].id

  if (opts.sizeBytes != null || opts.checksum != null) {
    await query(
      `UPDATE document_service.document_version
          SET size_bytes = COALESCE($2, size_bytes),
              checksum_sha256 = COALESCE($3, checksum_sha256)
        WHERE id = $1`,
      [versionId, opts.sizeBytes ?? null, opts.checksum ?? null],
    )
  }

  // mark the document live: current_version = 1, latest_version_id set
  const doc = await query(
    `UPDATE document_service.document
        SET current_version = 1, latest_version_id = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING account_id, title, category, uploaded_by_name`,
    [documentId, versionId],
  )
  if (doc.rowCount === 0) throw new Error('document not found')

  // timeline event (best-effort)
  const d = doc.rows[0]
  await query(
    `INSERT INTO customer_service.customer_timeline_event
       (account_id, event_type, title, body, source, actor_name)
     VALUES ($1,'document_added',$2,$3,'web',$4)`,
    [
      d.account_id,
      `Document added: ${d.title}`,
      `Category: ${d.category}`,
      d.uploaded_by_name ?? null,
    ],
  ).catch(() => {})

  return { ok: true }
}

// ---- list (for a customer) --------------------------------------------------
export interface DocListItem {
  id: string
  displayId: string
  category: string
  title: string
  description: string | null
  confidentiality: string
  tags: string[]
  currentVersion: number
  fileName: string | null
  mimeType: string | null
  sizeBytes: number | null
  uploadedByName: string | null
  createdAt: string
  ready: boolean
}

export async function listDocuments(accountId: string): Promise<DocListItem[]> {
  const { rows } = await query(
    `SELECT d.id, d.display_id, d.category, d.title, d.description, d.confidentiality,
            d.tags, d.current_version, d.uploaded_by_name, d.created_at,
            v.file_name, v.mime_type, v.size_bytes
       FROM document_service.document d
       LEFT JOIN document_service.document_version v
              ON v.document_id = d.id AND v.version_no = GREATEST(d.current_version, 1)
      WHERE d.account_id = $1 AND d.deleted_at IS NULL
      ORDER BY d.created_at DESC`,
    [accountId],
  )
  return rows.map((r) => ({
    id: r.id,
    displayId: r.display_id,
    category: r.category,
    title: r.title,
    description: r.description,
    confidentiality: r.confidentiality,
    tags: r.tags ?? [],
    currentVersion: r.current_version,
    fileName: r.file_name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes != null ? Number(r.size_bytes) : null,
    uploadedByName: r.uploaded_by_name,
    createdAt: r.created_at,
    ready: r.current_version >= 1,
  }))
}

// ---- download URL -----------------------------------------------------------
export async function getDownloadUrl(documentId: string): Promise<{ url: string; fileName: string } | null> {
  const { rows } = await query(
    `SELECT v.storage_key, v.file_name
       FROM document_service.document d
       JOIN document_service.document_version v
         ON v.document_id = d.id AND v.version_no = GREATEST(d.current_version, 1)
      WHERE d.id = $1 AND d.deleted_at IS NULL`,
    [documentId],
  )
  if (rows.length === 0) return null
  const url = await storage().presignDownload(rows[0].storage_key, rows[0].file_name)
  return { url, fileName: rows[0].file_name }
}

// ---- soft delete ------------------------------------------------------------
export async function deleteDocument(documentId: string): Promise<{ ok: true }> {
  await query(
    `UPDATE document_service.document SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL`,
    [documentId],
  )
  return { ok: true }
}
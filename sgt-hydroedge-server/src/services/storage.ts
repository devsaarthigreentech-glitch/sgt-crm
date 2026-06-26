// src/services/storage.ts
// ---------------------------------------------------------------------------
// Storage abstraction for the Customer Vault.
//
// The whole upload flow is "presigned style": the client asks the server to
// initiate an upload, the server hands back a URL the client PUTs bytes to, then
// the client tells the server it's done. This shape works for BOTH:
//
//   • LocalDiskProvider (now)  — the upload URL points back at our own backend
//     (`PUT /vault/blob/:key`), which streams the body to disk. Zero infra.
//   • S3Provider (later)       — the upload URL is a real presigned PUT to MinIO
//     on the Hostinger VPS; bytes go straight there, never touching this box.
//
// Swapping is a config change (VAULT_STORAGE=local | s3), no code change in the
// routes or the frontend.
// ---------------------------------------------------------------------------

import { promises as fs } from 'node:fs'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import type { Readable } from 'node:stream'

export interface UploadTarget {
  uploadUrl: string                 // where the client PUTs the bytes
  method: 'PUT'
  headers: Record<string, string>   // headers the client must send with the PUT
  bucket: string
  key: string
}

export interface StorageProvider {
  readonly bucket: string
  /** Build the destination for a new object and tell the client how to upload. */
  presignUpload(key: string, mimeType: string): Promise<UploadTarget>
  /** A URL the client can GET to download the object. */
  presignDownload(key: string, fileName?: string): Promise<string>
  /** Remove an object (best-effort). */
  remove(key: string): Promise<void>
}

// ---- Local disk -------------------------------------------------------------
// Files live under VAULT_LOCAL_DIR (default /var/www/vault-files). The client
// uploads/downloads through our own backend routes (registered in vault.ts).

class LocalDiskProvider implements StorageProvider {
  readonly bucket: string
  private root: string
  private apiBase: string

  constructor() {
    this.bucket = process.env.VAULT_BUCKET ?? 'sgt-vault'
    this.root = process.env.VAULT_LOCAL_DIR ?? '/var/www/vault-files'
    // Public base the browser can reach the backend at (for the blob routes).
    this.apiBase = process.env.VAULT_PUBLIC_API_BASE ?? process.env.PUBLIC_API_BASE ?? '/api/v1'
  }

  private filePath(key: string) {
    // keys look like "accountId/uuid.ext"; keep them flat-safe under root
    return path.join(this.root, key)
  }

  async presignUpload(key: string, mimeType: string): Promise<UploadTarget> {
    // ensure the directory exists ahead of the client's PUT
    await fs.mkdir(path.dirname(this.filePath(key)), { recursive: true })
    return {
      uploadUrl: `${this.apiBase}/vault/blob/${encodeURIComponent(key)}`,
      method: 'PUT',
      headers: { 'Content-Type': mimeType || 'application/octet-stream' },
      bucket: this.bucket,
      key,
    }
  }

  async presignDownload(key: string, fileName?: string): Promise<string> {
    const q = fileName ? `?name=${encodeURIComponent(fileName)}` : ''
    return `${this.apiBase}/vault/blob/${encodeURIComponent(key)}${q}`
  }

  async remove(key: string): Promise<void> {
    await fs.unlink(this.filePath(key)).catch(() => {})
  }

  // ---- local-only helpers used by the blob routes ----
  async writeStream(key: string, data: Buffer): Promise<void> {
    const p = this.filePath(key)
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, data)
  }

  async stat(key: string): Promise<{ size: number } | null> {
    try { const s = await fs.stat(this.filePath(key)); return { size: s.size } }
    catch { return null }
  }

  readStream(key: string): Readable {
    return createReadStream(this.filePath(key))
  }
}

// ---- S3 / MinIO (stub for now; filled in when Hostinger MinIO is live) -------
// Intentionally not implemented yet — selecting it throws a clear message so we
// never silently fall back. When MinIO is ready we implement presignUpload/
// presignDownload with the AWS SDK v3 (S3Client + getSignedUrl), endpoint set to
// https://files.<hostinger-domain>, forcePathStyle: true.

class S3ProviderNotConfigured implements StorageProvider {
  readonly bucket = process.env.VAULT_BUCKET ?? 'sgt-vault'
  private fail(): never {
    throw new Error(
      'VAULT_STORAGE=s3 but the S3/MinIO provider is not wired yet. ' +
      'Set VAULT_STORAGE=local for now, or implement S3Provider once MinIO is live.',
    )
  }
  async presignUpload(): Promise<UploadTarget> { this.fail() }
  async presignDownload(): Promise<string> { this.fail() }
  async remove(): Promise<void> { this.fail() }
}

// ---- Selection --------------------------------------------------------------

let _provider: StorageProvider | null = null
let _local: LocalDiskProvider | null = null

export function storage(): StorageProvider {
  if (_provider) return _provider
  const kind = (process.env.VAULT_STORAGE ?? 'local').toLowerCase()
  if (kind === 's3' || kind === 'minio') {
    _provider = new S3ProviderNotConfigured()
  } else {
    _local = new LocalDiskProvider()
    _provider = _local
  }
  return _provider
}

/** The local provider, when active — used by the raw blob routes. null under s3. */
export function localStorage(): LocalDiskProvider | null {
  storage()
  return _local
}
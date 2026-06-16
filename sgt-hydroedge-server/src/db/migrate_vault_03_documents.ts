// =============================================================================
// VAULT PHASE 0/1 · Migration 03 · document_service module (repo + versioning)
// -----------------------------------------------------------------------------
// Run once on the VPS:  cd sgt-hydroedge-server && npx tsx src/db/migrate_vault_03_documents.ts
//
// The structured document repository. document = logical file (metadata, category,
// confidentiality, tags, links). document_version = the actual stored object
// (S3 / DigitalOcean Spaces key) + OCR text + AI-extracted fields. Versioning is
// first-class: one document, many versions.
//
// No pgvector here — embeddings are a separate, optional migration (04) so this
// deploys even before pgvector is installed on the box.
// =============================================================================
import 'dotenv/config'
import { pool } from './pool.js'

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)
    await client.query(`CREATE SCHEMA IF NOT EXISTS document_service;`)
    await client.query(`CREATE SEQUENCE IF NOT EXISTS document_service.doc_id_seq START 1001 INCREMENT 1;`)

    // Document (logical) ------------------------------------------------------
    // ref_type/ref_id is a loose polymorphic link to what the doc is about.
    // related_contact_ids / related_team_ids capture the people connection
    // (Vault requirement) as uuid arrays — cheap and GIN-indexable.
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_service.document (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        display_id          TEXT UNIQUE NOT NULL
                              DEFAULT ('DOC-' || nextval('document_service.doc_id_seq')),
        account_id          UUID NOT NULL REFERENCES lead_service.accounts(id),
        site_id             UUID,                    -- loose ref
        ref_type            TEXT,                    -- poc | asset | lead | account | none
        ref_id              UUID,

        category            TEXT NOT NULL,           -- nda | proposal | poc_proposal | site_survey |
                                                     -- installation_report | test_data | fuel_log |
                                                     -- emission_report | nabl_report | customer_report |
                                                     -- commercial_proposal | purchase_order | invoice |
                                                     -- service_report | case_study | meeting_notes |
                                                     -- customer_feedback | internal_review |
                                                     -- legal_compliance | other
        title               TEXT NOT NULL,
        description         TEXT,
        confidentiality     TEXT NOT NULL DEFAULT 'internal', -- public | internal | confidential | restricted
        tags                TEXT[] DEFAULT '{}',
        related_contact_ids UUID[] DEFAULT '{}',     -- customer_service.customer_contact ids
        related_team_ids    UUID[] DEFAULT '{}',     -- customer_service.account_team ids

        current_version     INT DEFAULT 0,
        latest_version_id   UUID,                    -- set to newest document_version.id (loose, same schema)

        uploaded_by         TEXT,
        uploaded_by_name    TEXT,
        upload_source       TEXT DEFAULT 'web',      -- web | mobile | whatsapp | email
        metadata            JSONB DEFAULT '{}',
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW(),
        deleted_at          TIMESTAMPTZ
      );
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_doc_account  ON document_service.document(account_id);`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_doc_category ON document_service.document(category);`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_doc_ref      ON document_service.document(ref_type, ref_id);`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_doc_tags     ON document_service.document USING GIN(tags);`)

    // Document version (the actual stored object) -----------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_service.document_version (
        id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        document_id      UUID NOT NULL REFERENCES document_service.document(id),
        version_no       INT NOT NULL,
        storage_bucket   TEXT,                       -- e.g. sgt-vault (DO Spaces / S3)
        storage_key      TEXT NOT NULL,              -- object key
        file_name        TEXT NOT NULL,
        mime_type        TEXT,
        size_bytes       BIGINT,
        checksum_sha256  TEXT,
        ocr_text         TEXT,                       -- extracted text (AI step) for full-text search
        extracted        JSONB DEFAULT '{}',         -- AI-extracted fields: dates, readings, savings, contacts...
        gps_lat          NUMERIC(9,6),               -- field-capture geotag
        gps_lng          NUMERIC(9,6),
        captured_at      TIMESTAMPTZ,
        uploaded_by      TEXT,
        uploaded_by_name TEXT,
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (document_id, version_no)
      );
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_docver_document ON document_service.document_version(document_id);`)
    // Postgres full-text over OCR text — carries AI search for Phase 1/2 before pgvector.
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_docver_ocr_fts
        ON document_service.document_version
        USING GIN (to_tsvector('english', COALESCE(ocr_text, '')));
    `)

    await client.query('COMMIT')
    console.log('✓ Vault 03: document_service schema ready')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Migration failed:', err)
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
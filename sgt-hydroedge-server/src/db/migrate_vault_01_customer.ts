// =============================================================================
// VAULT PHASE 0 · Migration 01 · Customer master + customer_service module
// -----------------------------------------------------------------------------
// Run once on the VPS:  cd sgt-hydroedge-server && npx tsx src/db/migrate_vault_01_customer.ts
//
// What this does:
//   1. Extends the EXISTING lead_service.accounts (the customer/account spine)
//      with the couple of profile fields the Vault needs. accounts already has
//      id (uuid), name, name_normalized, pan, gstin, website, erpnext_id,
//      metadata, soft-delete — so we do NOT create a second customer table.
//   2. Creates the customer_service schema: sites, contact memory (customer-side
//      people), SGT account team memory, and the unified customer timeline.
//
// FK rule used across all Vault migrations:
//   • Real FK  -> within the same schema, and to the shared spine lead_service.accounts(id).
//   • Loose ref (UUID column, app-enforced, no FK) -> across module schemas
//     (e.g. poc -> site, document -> poc). Keeps modules independently deployable.
//
// User references follow your existing convention: TEXT columns (id + name),
// never a hard FK to lead_service.app_user.
// =============================================================================
import 'dotenv/config'
import { pool } from './pool.js'

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)

    // --- 1. Extend the customer master (accounts) -----------------------------
    // industry        -> for customer profile + AI filtering
    // customer_status -> lifecycle, distinct from accounts.reserved_status
    //                    (which is about lead reservation, not the customer)
    await client.query(`
      ALTER TABLE lead_service.accounts
        ADD COLUMN IF NOT EXISTS industry        TEXT,
        ADD COLUMN IF NOT EXISTS customer_status TEXT DEFAULT 'prospect';
    `)
    // prospect | active | inactive | churned

    // --- 2. customer_service schema ------------------------------------------
    await client.query(`CREATE SCHEMA IF NOT EXISTS customer_service;`)

    // Sites / locations -------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_service.customer_site (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        account_id      UUID NOT NULL REFERENCES lead_service.accounts(id),
        name            TEXT NOT NULL,
        site_type       TEXT,                       -- plant | office | dg_yard | marine | warehouse | other
        address         TEXT,
        city            TEXT,
        state           TEXT,
        country         TEXT DEFAULT 'India',
        pincode         TEXT,
        latitude        NUMERIC(9,6),               -- GPS (mobile capture)
        longitude       NUMERIC(9,6),
        status          TEXT DEFAULT 'active',       -- active | inactive
        notes           TEXT,
        metadata        JSONB DEFAULT '{}',
        created_by      TEXT,
        created_by_name TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW(),
        deleted_at      TIMESTAMPTZ
      );
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_site_account ON customer_service.customer_site(account_id);`)

    // Customer-side contact memory -------------------------------------------
    // NEVER hard-deleted. Lifecycle is via status. (No deleted_at by design.)
    // source_contact_id optionally links to the existing lead_service.contacts row.
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_service.customer_contact (
        id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        account_id        UUID NOT NULL REFERENCES lead_service.accounts(id),
        source_contact_id UUID,                     -- loose link to lead_service.contacts(id)
        name              TEXT NOT NULL,
        designation       TEXT,
        department        TEXT,
        email             TEXT,
        phone             TEXT,
        whatsapp          TEXT,
        role_in_project   TEXT,                      -- decision_maker | influencer | technical_evaluator |
                                                     -- procurement | finance | plant_head | sustainability |
                                                     -- operations | champion | blocker
        status            TEXT NOT NULL DEFAULT 'active', -- active | inactive | transferred | retired | unknown
        period_from       DATE,
        period_to         DATE,
        notes             TEXT,
        metadata          JSONB DEFAULT '{}',
        created_by        TEXT,
        created_by_name   TEXT,
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        updated_at        TIMESTAMPTZ DEFAULT NOW()
      );
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ccontact_account ON customer_service.customer_contact(account_id);`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ccontact_status  ON customer_service.customer_contact(account_id, status);`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ccontact_email   ON customer_service.customer_contact(email);`)

    // SGT-side account team memory -------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_service.account_team (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        account_id   UUID NOT NULL REFERENCES lead_service.accounts(id),
        app_user_id  TEXT,                           -- loose ref to lead_service.app_user (TEXT, per convention)
        member_name  TEXT NOT NULL,
        team_role    TEXT NOT NULL,                  -- executive_sponsor | sales_owner | technical_owner |
                                                     -- field_engineer | greenvision_owner | operations_owner |
                                                     -- service_owner | proposal_owner | reporting_owner
        period_from  DATE,
        period_to    DATE,
        active       BOOLEAN DEFAULT TRUE,
        notes        TEXT,
        metadata     JSONB DEFAULT '{}',
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      );
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_team_account ON customer_service.account_team(account_id);`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_team_role    ON customer_service.account_team(account_id, team_role);`)

    // Unified customer timeline (append-only) --------------------------------
    // Every meaningful event lands here. ref_type/ref_id is a loose polymorphic
    // pointer back to the originating record (lead | poc | asset | document | issue | contact).
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_service.customer_timeline_event (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        account_id  UUID NOT NULL REFERENCES lead_service.accounts(id),
        site_id     UUID,                            -- loose ref to customer_site
        event_type  TEXT NOT NULL,                   -- lead_created | nda_sent | nda_signed | technical_meeting |
                                                     -- site_survey | poc_proposal_sent | poc_approved |
                                                     -- installation_started | installation_completed |
                                                     -- monitoring_started | report_submitted |
                                                     -- customer_feedback_received | commercial_proposal_sent |
                                                     -- order_received | asset_commissioned | service_visit |
                                                     -- issue_raised | issue_closed | note | other
        title       TEXT NOT NULL,
        body        TEXT,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        source      TEXT DEFAULT 'manual',           -- manual | crm | greenvision | whatsapp | mobile | system
        source_ref  TEXT,
        ref_type    TEXT,                            -- lead | poc | asset | document | issue | contact | none
        ref_id      UUID,
        actor_id    TEXT,
        actor_name  TEXT,
        metadata    JSONB DEFAULT '{}',
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_timeline_account ON customer_service.customer_timeline_event(account_id, occurred_at DESC);`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_timeline_type    ON customer_service.customer_timeline_event(event_type);`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_timeline_ref     ON customer_service.customer_timeline_event(ref_type, ref_id);`)

    await client.query('COMMIT')
    console.log('✓ Vault 01: accounts extended + customer_service schema ready')
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
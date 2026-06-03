import { pool } from './pool'

async function migrate() {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    console.log('Running migrations...')

    // Enable UUID extension
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    `)

    // Accounts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_service.accounts (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name            TEXT NOT NULL,
        name_normalized TEXT NOT NULL,
        location        TEXT,
        pan             TEXT UNIQUE,
        gstin           TEXT,
        website         TEXT,
        anchor_account  BOOLEAN DEFAULT FALSE,
        reserved_status TEXT DEFAULT 'OPEN',
        erpnext_id      TEXT,
        metadata        JSONB DEFAULT '{}',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW(),
        deleted_at      TIMESTAMPTZ
      );
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_accounts_name_normalized
        ON lead_service.accounts(name_normalized);
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_accounts_pan
        ON lead_service.accounts(pan);
    `)

    // Contacts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_service.contacts (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        account_id  UUID REFERENCES lead_service.accounts(id),
        name        TEXT NOT NULL,
        role        TEXT,
        email       TEXT,
        phone       TEXT,
        whatsapp    TEXT,
        is_primary  BOOLEAN DEFAULT FALSE,
        source      TEXT DEFAULT 'MANUAL',
        metadata    JSONB DEFAULT '{}',
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW(),
        deleted_at  TIMESTAMPTZ
      );
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_account_id
        ON lead_service.contacts(account_id);
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_email
        ON lead_service.contacts(email);
    `)

    // Sequence for human-readable lead IDs (L-1001, L-1002...)
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS lead_service.lead_id_seq
        START 1001
        INCREMENT 1;
    `)

    // Leads table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_service.leads (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        display_id          TEXT UNIQUE NOT NULL,
        account_id          UUID NOT NULL REFERENCES lead_service.accounts(id),
        primary_contact_id  UUID REFERENCES lead_service.contacts(id),

        -- Five-axis classification
        vertical            TEXT NOT NULL,
        commercial_model    TEXT NOT NULL,
        origin              TEXT NOT NULL,
        division            TEXT NOT NULL DEFAULT 'GREENEDGE',

        -- Ownership
        owner_name          TEXT,
        owner_id            TEXT,
        partner_id          TEXT,

        -- Pipeline
        stage               TEXT NOT NULL DEFAULT 'New',
        stage_changed_at    TIMESTAMPTZ DEFAULT NOW(),
        sla_state           TEXT DEFAULT 'ok',
        days_in_stage       INT DEFAULT 0,

        -- Deal
        estimated_value     BIGINT,
        currency            TEXT DEFAULT 'INR',
        estimated_close_date DATE,
        actual_close_date   DATE,

        -- Close outcome
        close_outcome       TEXT,
        close_reason        TEXT,
        competitor_name     TEXT,

        -- Source
        capture_source      TEXT DEFAULT 'INTERNAL',
        source_ref          TEXT,
        initial_notes       TEXT,

        -- ERPNext link
        erpnext_lead_id     TEXT,
        erpnext_order_id    TEXT,

        -- Flexible metadata for future fields
        metadata            JSONB DEFAULT '{}',

        -- Concurrency
        version             INT DEFAULT 0,

        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW(),
        deleted_at          TIMESTAMPTZ
      );
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_account_id
        ON lead_service.leads(account_id);
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_stage
        ON lead_service.leads(stage);
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_vertical_stage
        ON lead_service.leads(vertical, stage);
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_owner_id
        ON lead_service.leads(owner_id);
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_created_at
        ON lead_service.leads(created_at);
    `)

    // Lead activities table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_service.lead_activities (
        id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        lead_id               UUID NOT NULL REFERENCES lead_service.leads(id),
        actor_name            TEXT NOT NULL,
        actor_id              TEXT,
        actor_type            TEXT DEFAULT 'USER',
        type                  TEXT NOT NULL,
        channel               TEXT,
        summary               TEXT NOT NULL,
        outcome               TEXT,
        direction             TEXT,
        duration_min          INT,
        next_step_description TEXT,
        next_step_due_date    DATE,
        occurred_at           TIMESTAMPTZ DEFAULT NOW(),
        attachment_count      INT DEFAULT 0,
        metadata              JSONB DEFAULT '{}',
        created_at            TIMESTAMPTZ DEFAULT NOW()
      );
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_activities_lead_id
        ON lead_service.lead_activities(lead_id);
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_activities_occurred_at
        ON lead_service.lead_activities(lead_id, occurred_at DESC);
    `)

    // Lead protections table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_service.lead_protections (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        lead_id             UUID UNIQUE NOT NULL REFERENCES lead_service.leads(id),
        partner_id          TEXT NOT NULL,
        partner_name        TEXT,
        status              TEXT DEFAULT 'ACTIVE',
        started_at          TIMESTAMPTZ DEFAULT NOW(),
        expires_at          TIMESTAMPTZ NOT NULL,
        lapse_reason        TEXT,
        lapse_at            TIMESTAMPTZ,
        fcfs_timestamp      TIMESTAMPTZ DEFAULT NOW(),
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
      );
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_protections_lead_id
        ON lead_service.lead_protections(lead_id);
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_protections_expires_at
        ON lead_service.lead_protections(expires_at);
    `)

    // Audit log — immutable, append only
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_service.lead_audit_log (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        lead_id     UUID NOT NULL REFERENCES lead_service.leads(id),
        actor_name  TEXT,
        actor_id    TEXT,
        actor_type  TEXT DEFAULT 'USER',
        action      TEXT NOT NULL,
        from_state  JSONB,
        to_state    JSONB,
        reason      TEXT,
        occurred_at TIMESTAMPTZ DEFAULT NOW()
      );
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_lead_id
        ON lead_service.lead_audit_log(lead_id, occurred_at DESC);
    `)

    await client.query('COMMIT')
    console.log('✓ All tables created successfully')

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Migration failed:', err)
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()
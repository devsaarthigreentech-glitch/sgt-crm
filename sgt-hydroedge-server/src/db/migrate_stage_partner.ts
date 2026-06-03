// Additive, idempotent migration for Stage Management + Partner Portal.
// Safe to run repeatedly. Run once with:  npx tsx src/db/migrate_stage_partner.ts
import { pool } from './pool'

const SQL = `
SET search_path TO lead_service;

-- ── Stage Management: extend leads ───────────────────────────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage             text NOT NULL DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage_entered_at  timestamptz NOT NULL DEFAULT now();
ALTER TABLE leads ADD COLUMN IF NOT EXISTS days_in_stage     int  NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS probability       int;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sla_state         text NOT NULL DEFAULT 'ok';   -- ok | at_risk | breached
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source            text DEFAULT 'direct';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS account_norm      text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_phone     text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS decision_authority text;            -- decision_maker | influencer | gatekeeper
ALTER TABLE leads ADD COLUMN IF NOT EXISTS protection_id     text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_contact_at  timestamptz;      -- when SLA clock started

CREATE TABLE IF NOT EXISTS lead_stage_transitions (
  id          text PRIMARY KEY,
  lead_id     text NOT NULL,
  from_stage  text,
  to_stage    text NOT NULL,
  actor_type  text NOT NULL DEFAULT 'user',
  actor_id    text,
  reason      text,
  meta        jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transitions_lead ON lead_stage_transitions(lead_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS lead_protections (
  id              text PRIMARY KEY,
  lead_id         uuid NOT NULL,            -- matches leads.id (uuid)
  account_norm    text NOT NULL,
  partner_id      text NOT NULL,
  status          text NOT NULL DEFAULT 'active',  -- active | extended | expired | released
  opened_at       timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now()
);
-- lead_protections may already exist from earlier scaffolding with a different
-- shape; bring it up to spec so the index + seed work either way.
ALTER TABLE lead_protections ADD COLUMN IF NOT EXISTS lead_id          uuid;
ALTER TABLE lead_protections ADD COLUMN IF NOT EXISTS account_norm     text;
ALTER TABLE lead_protections ADD COLUMN IF NOT EXISTS partner_id       text;
ALTER TABLE lead_protections ADD COLUMN IF NOT EXISTS status           text NOT NULL DEFAULT 'active';
ALTER TABLE lead_protections ADD COLUMN IF NOT EXISTS opened_at        timestamptz NOT NULL DEFAULT now();
ALTER TABLE lead_protections ADD COLUMN IF NOT EXISTS expires_at       timestamptz;
ALTER TABLE lead_protections ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_protection_account ON lead_protections(account_norm) WHERE status IN ('active','extended');

CREATE TABLE IF NOT EXISTS stage_sla_config (
  division        text NOT NULL,
  stage           text NOT NULL,
  threshold_hours int  NOT NULL,
  PRIMARY KEY (division, stage)
);

CREATE TABLE IF NOT EXISTS reserved_accounts (
  account_norm text PRIMARY KEY,
  label        text NOT NULL,
  reason       text
);

-- Outbox = stand-in for the Kafka event bus. A later worker drains 'published=false'.
CREATE TABLE IF NOT EXISTS outbox (
  id            text PRIMARY KEY,
  event_type    text NOT NULL,
  event_version text NOT NULL DEFAULT '1.0',
  aggregate_id  text,
  division      text,
  actor         jsonb NOT NULL DEFAULT '{}',
  payload       jsonb NOT NULL DEFAULT '{}',
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  published     boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_outbox_unpublished ON outbox(occurred_at) WHERE published = false;

-- ── Partner Portal: Module 06 read models the portal reads from ───────────────
CREATE TABLE IF NOT EXISTS partners (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  archetype  text NOT NULL,            -- oem_t1 | oem_t2 | oem_t3 | daas_l1 | daas_l2 | channel
  portal     text NOT NULL,            -- full | lite
  tier_rank  int  NOT NULL DEFAULT 1,  -- used for document gating
  division   text NOT NULL DEFAULT 'corporate',
  status     text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_users (
  id         text PRIMARY KEY,
  partner_id text NOT NULL REFERENCES partners(id),
  email      text NOT NULL UNIQUE,
  name       text NOT NULL,
  role       text NOT NULL DEFAULT 'principal'  -- principal | user
);

CREATE TABLE IF NOT EXISTS partner_scorecards (
  partner_id        text PRIMARY KEY REFERENCES partners(id),
  period            text NOT NULL,
  metrics           jsonb NOT NULL DEFAULT '[]',   -- [{label,value,target,unit}]
  elevation_eligible boolean NOT NULL DEFAULT false,
  generated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_statements (
  id          text PRIMARY KEY,
  partner_id  text NOT NULL REFERENCES partners(id),
  type        text NOT NULL,           -- commission | carbon | margin
  period      text NOT NULL,
  amount      numeric,
  currency    text NOT NULL DEFAULT 'INR',
  status      text NOT NULL DEFAULT 'ready',  -- draft | ready | paid
  url         text,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_documents (
  id          text PRIMARY KEY,
  partner_id  text REFERENCES partners(id),   -- null = shared
  scope       text NOT NULL DEFAULT 'shared', -- shared | partner | brand | training
  title       text NOT NULL,
  doc_class   text NOT NULL,                  -- legal | kit | brand | technical | statement
  min_portal  text NOT NULL DEFAULT 'lite',   -- lite | full
  version     text NOT NULL DEFAULT 'v1',
  url         text,
  status      text NOT NULL DEFAULT 'approved'
);

CREATE TABLE IF NOT EXISTS training_assignments (
  id          text PRIMARY KEY,
  partner_id  text NOT NULL REFERENCES partners(id),
  module      text NOT NULL,
  status      text NOT NULL DEFAULT 'assigned', -- assigned | in_progress | completed
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS partner_customer_health (
  id            text PRIMARY KEY,
  partner_id    text NOT NULL REFERENCES partners(id),
  account       text NOT NULL,
  health_score  int  NOT NULL DEFAULT 70,
  churn_risk    text NOT NULL DEFAULT 'low',   -- low | medium | high
  expansion     text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_tickets (
  id          text PRIMARY KEY,
  partner_id  text NOT NULL REFERENCES partners(id),
  subject     text NOT NULL,
  priority    text NOT NULL DEFAULT 'P3',
  status      text NOT NULL DEFAULT 'open',  -- open | in_progress | resolved
  created_at  timestamptz NOT NULL DEFAULT now()
);
`

// Seed only if empty — gives the portal something to render and wires the
// three conflict-check test cases from the spec.
const SEED = `
SET search_path TO lead_service;

INSERT INTO stage_sla_config(division, stage, threshold_hours) VALUES
  ('greenedge','contacted',48),('greenedge','qualified',168),('greenedge','new',24),
  ('marine','contacted',48),('marine','qualified',168),('marine','new',24)
ON CONFLICT (division,stage) DO NOTHING;

INSERT INTO reserved_accounts(account_norm,label,reason) VALUES
  ('reliance','Reliance','Direct SGT anchor account')
ON CONFLICT (account_norm) DO NOTHING;

INSERT INTO partners(id,name,archetype,portal,tier_rank,division) VALUES
  ('P-DEMO','Pune EnergyTech LLP','oem_t2','full',2,'greenedge'),
  ('P-OTHER','Coastal Marine Services','daas_l2','full',2,'marine')
ON CONFLICT (id) DO NOTHING;

INSERT INTO partner_users(id,partner_id,email,name,role) VALUES
  ('PU-DEMO','P-DEMO','principal@puneenergytech.example','Aarti Deshpande','principal')
ON CONFLICT (id) DO NOTHING;

-- A live protection held by ANOTHER partner on Cochin Shipyard -> conflict for P-DEMO.
-- lead_id is a throwaway uuid (this seed represents another partner's hold, not a
-- visible lead in your pipeline). conflict-check keys off account_norm + partner_id.
INSERT INTO lead_protections(id,lead_id,account_norm,partner_id,status,expires_at)
SELECT 'PROT-SEED', gen_random_uuid(), 'cochinshipyard','P-OTHER','active', now() + interval '60 days'
WHERE NOT EXISTS (SELECT 1 FROM lead_protections WHERE id = 'PROT-SEED');

INSERT INTO partner_scorecards(partner_id,period,metrics,elevation_eligible) VALUES
  ('P-DEMO','Q2 FY26',
   '[{"label":"Units off-take","value":118,"target":120,"unit":""},
     {"label":"ASP certified techs","value":4,"target":3,"unit":""},
     {"label":"Customer NPS","value":62,"target":50,"unit":""},
     {"label":"Reporting compliance","value":100,"target":100,"unit":"%"}]', true)
ON CONFLICT (partner_id) DO NOTHING;

INSERT INTO partner_statements(id,partner_id,type,period,amount,status) VALUES
  ('ST-1','P-DEMO','carbon','Q1 FY26',412000,'ready'),
  ('ST-2','P-DEMO','margin','Apr FY26',286500,'paid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO partner_documents(id,partner_id,scope,title,doc_class,min_portal,url) VALUES
  ('D-1',NULL,'shared','OEM Master Partner Agreement (template)','legal','full','#'),
  ('D-2',NULL,'brand','White-Label Brand Guide','brand','lite','#'),
  ('D-3','P-DEMO','partner','Executed Schedule B — Pune EnergyTech','legal','full','#'),
  ('D-4',NULL,'training','ASP Certification Material','technical','lite','#')
ON CONFLICT (id) DO NOTHING;

INSERT INTO training_assignments(id,partner_id,module,status,completed_at) VALUES
  ('TR-1','P-DEMO','Product theory — GreenDrive',  'completed', now() - interval '20 days'),
  ('TR-2','P-DEMO','ASP certification (hands-on)', 'in_progress', NULL),
  ('TR-3','P-DEMO','GreenVision dashboards',       'assigned', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO partner_customer_health(id,partner_id,account,health_score,churn_risk,expansion) VALUES
  ('H-1','P-DEMO','Bhilai Steel Works',82,'low','Boiler fleet expansion likely'),
  ('H-2','P-DEMO','Nagpur Cement',58,'medium','Renewal at risk — schedule QBR')
ON CONFLICT (id) DO NOTHING;
`

async function main() {
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    await c.query(SQL)
    await c.query(SEED)
    await c.query('COMMIT')
    console.log('✓ stage + partner migration applied (with seed)')
  } catch (e) {
    await c.query('ROLLBACK')
    console.error('migration failed:', e)
    process.exitCode = 1
  } finally {
    c.release()
    await pool.end()
  }
}
main()
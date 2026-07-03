// =============================================================================
// services/vault.ts — read side of the Customer Knowledge Vault.
// Assembles the customer list and the full 360 "workspace" object from the
// accounts spine (lead_service) + customer_service + poc_service + document_service.
// Read-only for now; write endpoints come in the next round.
// =============================================================================
import { query } from '../db/pool.js'
import { erpFetch } from './erpLimit.js'
import { normaliseAccountName } from '../domain/leads.js'

// ---- Shapes returned to the frontend (camelCase) ----------------------------
export interface CustomerListItem {
  id: string
  name: string
  industry: string | null
  customerStatus: string
  location: string | null
  pocCount: number
  docCount: number
  lastActivityAt: string | null
}

export interface Workspace {
  account: {
    id: string
    name: string
    industry: string | null
    customerStatus: string
    location: string | null
    website: string | null
    erpnextId: string | null
    gstin: string | null
  }
  stats: {
    pocs: number
    activePocs: number
    documents: number
    openIssues: number
    contacts: number
    sites: number
    lastActivityAt: string | null
  }
  sites: any[]
  contacts: any[]
  team: any[]
  pocs: any[]
  documents: any[]
  timeline: any[]
}

// ---- Customer list ----------------------------------------------------------
export async function getCustomerList(): Promise<CustomerListItem[]> {
  const { rows } = await query(
    `SELECT a.id, a.name, a.industry, a.customer_status, a.location,
            (SELECT count(*) FROM poc_service.poc p
              WHERE p.account_id = a.id AND p.deleted_at IS NULL)               AS poc_count,
            (SELECT count(*) FROM document_service.document d
              WHERE d.account_id = a.id AND d.deleted_at IS NULL)              AS doc_count,
            (SELECT max(occurred_at) FROM customer_service.customer_timeline_event te
              WHERE te.account_id = a.id)                                       AS last_activity
       FROM lead_service.accounts a
      WHERE a.deleted_at IS NULL
      ORDER BY last_activity DESC NULLS LAST, a.name ASC`
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    industry: r.industry,
    customerStatus: r.customer_status,
    location: r.location,
    pocCount: Number(r.poc_count),
    docCount: Number(r.doc_count),
    lastActivityAt: r.last_activity,
  }))
}

// ---- Full workspace (one customer) -----------------------------------------
export async function getCustomerWorkspace(accountId: string): Promise<Workspace | null> {
  const acc = await query(
    `SELECT id, name, industry, customer_status, location, website, erpnext_id, gstin
       FROM lead_service.accounts
      WHERE id = $1 AND deleted_at IS NULL`,
    [accountId]
  )
  if (acc.rowCount === 0) return null
  const a = acc.rows[0]

  const [sites, contacts, team, pocs, documents, timeline, issues] = await Promise.all([
    query(
      `SELECT id, name, site_type, address, city, state, country, status, latitude, longitude
         FROM customer_service.customer_site
        WHERE account_id = $1 AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [accountId]
    ),
    query(
      `SELECT id, name, designation, department, email, phone, role_in_project,
              status, period_from, period_to, notes
         FROM customer_service.customer_contact
        WHERE account_id = $1
        ORDER BY (status = 'active') DESC, name ASC`,
      [accountId]
    ),
    query(
      `SELECT id, member_name, team_role, active, period_from, period_to, notes
         FROM customer_service.account_team
        WHERE account_id = $1
        ORDER BY active DESC, team_role ASC`,
      [accountId]
    ),
    query(
      `SELECT id, display_id, product, application, equipment_make, equipment_model,
              rating_value, rating_unit, fuel_type, status, savings_pct,
              start_date, end_date, final_result, recommended_next_step
         FROM poc_service.poc
        WHERE account_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC`,
      [accountId]
    ),
    query(
      `SELECT d.id, d.display_id, d.category, d.title, d.confidentiality,
              d.current_version, d.uploaded_by_name, d.created_at,
              v.file_name, v.size_bytes
         FROM document_service.document d
         LEFT JOIN document_service.document_version v
                ON v.document_id = d.id AND v.version_no = d.current_version
        WHERE d.account_id = $1 AND d.deleted_at IS NULL
        ORDER BY d.created_at DESC`,
      [accountId]
    ),
    query(
      `SELECT id, event_type, title, body, occurred_at, source, actor_name
         FROM customer_service.customer_timeline_event
        WHERE account_id = $1
        ORDER BY occurred_at DESC
        LIMIT 60`,
      [accountId]
    ),
    query(
      `SELECT count(*) AS open_issues
         FROM poc_service.poc_issue
        WHERE account_id = $1 AND status IN ('open', 'in_progress')`,
      [accountId]
    ),
  ])

  const pocRows = pocs.rows.map((p) => ({
    id: p.id,
    displayId: p.display_id,
    product: p.product,
    application: p.application,
    equipmentMake: p.equipment_make,
    equipmentModel: p.equipment_model,
    ratingValue: p.rating_value != null ? Number(p.rating_value) : null,
    ratingUnit: p.rating_unit,
    fuelType: p.fuel_type,
    status: p.status,
    savingsPct: p.savings_pct != null ? Number(p.savings_pct) : null,
    startDate: p.start_date,
    endDate: p.end_date,
    finalResult: p.final_result,
    recommendedNextStep: p.recommended_next_step,
  }))

  return {
    account: {
      id: a.id,
      name: a.name,
      industry: a.industry,
      customerStatus: a.customer_status,
      location: a.location,
      website: a.website,
      erpnextId: a.erpnext_id,
      gstin: a.gstin,
    },
    stats: {
      pocs: pocRows.length,
      activePocs: pocRows.filter((p) => p.status === 'installing' || p.status === 'monitoring').length,
      documents: documents.rowCount ?? 0,
      openIssues: Number(issues.rows[0]?.open_issues ?? 0),
      contacts: contacts.rowCount ?? 0,
      sites: sites.rowCount ?? 0,
      lastActivityAt: timeline.rows[0]?.occurred_at ?? null,
    },
    sites: sites.rows.map((s) => ({
      id: s.id, name: s.name, siteType: s.site_type, address: s.address,
      city: s.city, state: s.state, country: s.country, status: s.status,
      latitude: s.latitude != null ? Number(s.latitude) : null,
      longitude: s.longitude != null ? Number(s.longitude) : null,
    })),
    contacts: contacts.rows.map((c) => ({
      id: c.id, name: c.name, designation: c.designation, department: c.department,
      email: c.email, phone: c.phone, roleInProject: c.role_in_project,
      status: c.status, periodFrom: c.period_from, periodTo: c.period_to, notes: c.notes,
    })),
    team: team.rows.map((m) => ({
      id: m.id, memberName: m.member_name, teamRole: m.team_role,
      active: m.active, periodFrom: m.period_from, periodTo: m.period_to, notes: m.notes,
    })),
    pocs: pocRows,
    documents: documents.rows.map((d) => ({
      id: d.id, displayId: d.display_id, category: d.category, title: d.title,
      confidentiality: d.confidentiality, currentVersion: d.current_version,
      uploadedByName: d.uploaded_by_name, createdAt: d.created_at,
      fileName: d.file_name, sizeBytes: d.size_bytes != null ? Number(d.size_bytes) : null,
    })),
    timeline: timeline.rows.map((e) => ({
      id: e.id, eventType: e.event_type, title: e.title, body: e.body,
      occurredAt: e.occurred_at, source: e.source, actorName: e.actor_name,
    })),
  }
}


// ---- Resolve an ERPNext customer to its vault account, then load workspace ----
export async function resolveAccountByErp(erpId: string, erpName?: string): Promise<string | null> {
  const byId = await query(
    `SELECT id FROM lead_service.accounts
      WHERE erpnext_id = $1 AND deleted_at IS NULL
      LIMIT 1`,
    [erpId]
  )
  if (byId.rowCount && byId.rows[0]) return byId.rows[0].id

  const nameToMatch = (erpName ?? erpId).trim()
  if (!nameToMatch) return null
  const norm = normaliseAccountName(nameToMatch)
  const byName = await query(
    `SELECT id FROM lead_service.accounts
      WHERE (name_normalized = $1 OR lower(name) = lower($2)) AND deleted_at IS NULL
      ORDER BY (erpnext_id IS NOT NULL) DESC
      LIMIT 1`,
    [norm, nameToMatch]
  )
  if (byName.rowCount && byName.rows[0]) return byName.rows[0].id
  return null
}

export async function getWorkspaceByErp(erpId: string, erpName?: string): Promise<Workspace | null> {
  const accountId = await resolveAccountByErp(erpId, erpName)
  if (!accountId) return null
  return getCustomerWorkspace(accountId)
}

// ---- Create a vault account FROM an ERPNext customer (reverse of close-won) ----
export async function createAccountFromErp(erpId: string, erpName?: string): Promise<{ accountId: string; created: boolean }> {
  const existing = await resolveAccountByErp(erpId, erpName)
  if (existing) return { accountId: existing, created: false }

  const BASE = process.env.ERPNEXT_URL!
  const KEY = process.env.ERPNEXT_API_KEY!
  const SECRET = process.env.ERPNEXT_API_SECRET!
  let name = (erpName ?? erpId).trim()
  let gstin: string | null = null
  let location: string | null = null
  try {
    const res = await erpFetch(`${BASE}/api/resource/Customer/${encodeURIComponent(erpId)}`, {
      headers: { Authorization: `token ${KEY}:${SECRET}`, Accept: 'application/json' },
    })
    if (res.ok) {
      const doc = (await res.json()).data
      name = (doc.customer_name || name).trim()
      gstin = doc.gstin || doc.tax_id || null
      location = doc.territory || null
    }
  } catch { /* best-effort enrichment; fall back to name only */ }

  const ins = await query(
    `INSERT INTO lead_service.accounts (name, name_normalized, gstin, location, erpnext_id, customer_status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     RETURNING id`,
    [name, normaliseAccountName(name), gstin, location, erpId],
  )
  return { accountId: ins.rows[0].id, created: true }
}


// =============================================================================
// POC write/read — poc_service.poc CRUD (create + list-by-account + get-one).
// -----------------------------------------------------------------------------
// Schema note (verified against migrate_vault_02_poc.ts): the ONLY NOT-NULL
// columns without a DB default are account_id and product. display_id
// ('POC-'||nextval) and status ('planned') both default in-schema, so we never
// send display_id and only send status when we have one. Everything else is
// nullable. Cross-module links (site_id, lead_id) are loose UUIDs, app-enforced.
//
// Sub-tables (poc_reading / poc_observation / poc_issue) are intentionally left
// for the next round — VaultPoc carries the parent record only. When they land,
// they hang off poc_id and slot into getPocById()'s detail payload without
// touching create/list here.
// =============================================================================

// Full column projection reused by list + get + create RETURNING, so the row
// shape mapPoc() consumes is identical across all three paths.
const POC_COLS = `
  id, display_id, account_id, site_id, lead_id, product, application,
  equipment_make, equipment_model, rating_value, rating_unit, fuel_type, spec,
  baseline_from, baseline_to, trial_from, trial_to, start_date, end_date,
  status, savings_pct, final_result, recommended_next_step,
  sgt_comments, customer_comments, owner_id, owner_name, created_by_name,
  created_at, updated_at
`

export interface VaultPoc {
  id: string
  displayId: string
  accountId: string
  siteId: string | null
  leadId: string | null
  product: string
  application: string | null
  equipmentMake: string | null
  equipmentModel: string | null
  ratingValue: number | null
  ratingUnit: string | null
  fuelType: string | null
  spec: Record<string, unknown>
  baselineFrom: string | null
  baselineTo: string | null
  trialFrom: string | null
  trialTo: string | null
  startDate: string | null
  endDate: string | null
  status: string
  savingsPct: number | null
  finalResult: string | null
  recommendedNextStep: string | null
  sgtComments: string | null
  customerComments: string | null
  ownerId: string | null
  ownerName: string | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
}

export interface CreatePocInput {
  accountId: string
  product: string
  siteId?: string | null
  leadId?: string | null
  application?: string | null
  equipmentMake?: string | null
  equipmentModel?: string | null
  ratingValue?: number | null
  ratingUnit?: string | null
  fuelType?: string | null
  spec?: Record<string, unknown>
  baselineFrom?: string | null
  baselineTo?: string | null
  trialFrom?: string | null
  trialTo?: string | null
  startDate?: string | null
  endDate?: string | null
  status?: string
  savingsPct?: number | null
  finalResult?: string | null
  recommendedNextStep?: string | null
  sgtComments?: string | null
  customerComments?: string | null
  ownerId?: string | null
  ownerName?: string | null
}

export interface PocActor { id?: string | null; name?: string | null }

function mapPoc(r: any): VaultPoc {
  return {
    id: r.id,
    displayId: r.display_id,
    accountId: r.account_id,
    siteId: r.site_id,
    leadId: r.lead_id,
    product: r.product,
    application: r.application,
    equipmentMake: r.equipment_make,
    equipmentModel: r.equipment_model,
    ratingValue: r.rating_value != null ? Number(r.rating_value) : null,
    ratingUnit: r.rating_unit,
    fuelType: r.fuel_type,
    spec: r.spec ?? {},
    baselineFrom: r.baseline_from,
    baselineTo: r.baseline_to,
    trialFrom: r.trial_from,
    trialTo: r.trial_to,
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status,
    savingsPct: r.savings_pct != null ? Number(r.savings_pct) : null,
    finalResult: r.final_result,
    recommendedNextStep: r.recommended_next_step,
    sgtComments: r.sgt_comments,
    customerComments: r.customer_comments,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listPocsByAccount(accountId: string): Promise<VaultPoc[]> {
  const { rows } = await query(
    `SELECT ${POC_COLS}
       FROM poc_service.poc
      WHERE account_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC`,
    [accountId],
  )
  return rows.map(mapPoc)
}

export async function getPocById(id: string): Promise<VaultPoc | null> {
  const { rows } = await query(
    `SELECT ${POC_COLS}
       FROM poc_service.poc
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1`,
    [id],
  )
  return rows[0] ? mapPoc(rows[0]) : null
}

export async function createPoc(input: CreatePocInput, actor: PocActor = {}): Promise<VaultPoc> {
  const { rows } = await query(
    `INSERT INTO poc_service.poc (
        account_id, site_id, lead_id, product, application,
        equipment_make, equipment_model, rating_value, rating_unit, fuel_type, spec,
        baseline_from, baseline_to, trial_from, trial_to, start_date, end_date,
        status, savings_pct, final_result, recommended_next_step,
        sgt_comments, customer_comments, owner_id, owner_name,
        created_by, created_by_name
     ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,$17,
        $18,$19,$20,$21,
        $22,$23,$24,$25,
        $26,$27
     )
     RETURNING ${POC_COLS}`,
    [
      input.accountId,
      input.siteId ?? null,
      input.leadId ?? null,
      input.product,
      input.application ?? null,
      input.equipmentMake ?? null,
      input.equipmentModel ?? null,
      input.ratingValue ?? null,
      input.ratingUnit ?? null,
      input.fuelType ?? null,
      JSON.stringify(input.spec ?? {}),
      input.baselineFrom ?? null,
      input.baselineTo ?? null,
      input.trialFrom ?? null,
      input.trialTo ?? null,
      input.startDate ?? null,
      input.endDate ?? null,
      input.status ?? 'planned',
      input.savingsPct ?? null,
      input.finalResult ?? null,
      input.recommendedNextStep ?? null,
      input.sgtComments ?? null,
      input.customerComments ?? null,
      input.ownerId ?? null,
      input.ownerName ?? null,
      actor.id ?? null,
      actor.name ?? null,
    ],
  )
  return mapPoc(rows[0])
}
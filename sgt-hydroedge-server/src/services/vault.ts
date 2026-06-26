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
// The customer LIST comes from ERPNext (Customer doctype), but the vault is keyed
// on lead_service.accounts. They're linked by accounts.erpnext_id. We match on
// that first, then fall back to a case-insensitive name match. Returns null when
// no vault account exists yet (customer never went through close-won / no account).
export async function resolveAccountByErp(erpId: string, erpName?: string): Promise<string | null> {
  const byId = await query(
    `SELECT id FROM lead_service.accounts
      WHERE erpnext_id = $1 AND deleted_at IS NULL
      LIMIT 1`,
    [erpId]
  )
  if (byId.rowCount && byId.rows[0]) return byId.rows[0].id

  // fall back to a normalized-name match (catches accounts created via the
  // pipeline, which store name_normalized). Falls back to a raw lower() match too.
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
// Most ERPNext customers were created directly in ERPNext / imported and never
// passed through the CRM pipeline, so they have no lead_service.accounts row.
// This makes one on demand (the "Create vault record" button), pulling name +
// GSTIN + territory from the ERPNext Customer, and links erpnext_id so the vault
// resolver finds it next time. Idempotent: if a link already exists, returns it.
export async function createAccountFromErp(erpId: string, erpName?: string): Promise<{ accountId: string; created: boolean }> {
  // already linked?
  const existing = await resolveAccountByErp(erpId, erpName)
  if (existing) return { accountId: existing, created: false }

  // pull customer detail from ERPNext for a richer account
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
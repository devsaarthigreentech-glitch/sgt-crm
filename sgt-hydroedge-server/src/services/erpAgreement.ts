// =====================================================================
// services/erpAgreement.ts — the ERPNext client for dealer agreements.
//
// The counterpart of erpQuotation.ts, and deliberately as thin. ERPNext
// is here for ONE reason: it renders PDFs, and that renderer is already
// proven in this stack. Everything else about an agreement — who may see
// it, what state it is in, where the signed scan lives — belongs to
// Postgres and is none of ERPNext's business.
//
// The doctype and print format are created by
// src/db/erp_create_agreement_doctype.ts. Nothing here creates schema.
// If that script has not been run, every call in this file fails with a
// 404 from Frappe, so resolveDoctype() checks once and says so plainly
// rather than letting a 404 surface as "could not create agreement".
// =====================================================================

import { erpFetch } from './erpLimit.js';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '') ?? '';
const KEY = process.env.ERPNEXT_API_KEY ?? '';
const SECRET = process.env.ERPNEXT_API_SECRET ?? '';

export const AGREEMENT_DOCTYPE =
  process.env.ERP_AGREEMENT_DOCTYPE ?? 'SGT Dealer Agreement';
export const AGREEMENT_FORMAT =
  process.env.ERP_AGREEMENT_PRINT_FORMAT ?? 'SGT Tripartite Dealer Agreement';

/**
 * Every field the print format reads. Named exactly as the doctype names
 * them, so the mapping from our data to the document is one object
 * literal and there is no translation layer to get wrong.
 */
export interface AgreementFields {
  effective_date?: string | null;
  agreement_status?: string;

  distributor_name?: string | null;
  distributor_code?: string | null;
  distributor_associate?: string | null;
  distributor_region?: string | null;
  distributor_email?: string | null;
  distributor_address?: string | null;
  distributor_signatory?: string | null;
  distributor_signatory_designation?: string | null;
  distributor_sign_name?: string | null;
  distributor_sign_designation?: string | null;
  distributor_signature_url?: string | null;

  dealer_name?: string | null;
  dealer_code?: string | null;
  dealer_type?: string | null;
  dealer_constitution?: string | null;
  dealer_gstin?: string | null;
  dealer_operating_area?: string | null;
  dealer_address?: string | null;
  dealer_signatory?: string | null;
  dealer_signatory_designation?: string | null;
  dealer_email?: string | null;
  dealer_mobile?: string | null;

  sgt_signatory?: string | null;
  sgt_signatory_designation?: string | null;
  sgt_signature_url?: string | null;

  agreement_body?: string | null;

  raised_by?: string | null;
  raised_by_org?: string | null;
  raised_via?: string | null;
}

function authHeaders() {
  return {
    Authorization: `token ${KEY}:${SECRET}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

/** Frappe buries the useful line in a traceback; dig it out. */
function frappeError(text: string): string {
  try {
    const j = JSON.parse(text);
    const msgs = j._server_messages ? JSON.parse(j._server_messages) : null;
    if (Array.isArray(msgs) && msgs.length) {
      try { return JSON.parse(msgs[0]).message ?? String(msgs[0]); }
      catch { return String(msgs[0]); }
    }
    return String(j.exception ?? j.message ?? text);
  } catch {
    return text;
  }
}

const path = (...parts: string[]) =>
  `${BASE}/api/resource/${parts.map(encodeURIComponent).join('/')}`;

/**
 * Confirm the doctype exists, once per process.
 *
 * Without this the first thing anyone sees when the setup script has not
 * been run is a 404 on a POST, which reads like the agreement failed
 * rather than like the module was never installed.
 */
let doctypeChecked = false;
async function assertDoctype(): Promise<void> {
  if (doctypeChecked) return;
  const res = await erpFetch(path('DocType', AGREEMENT_DOCTYPE), { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(
      `The "${AGREEMENT_DOCTYPE}" doctype does not exist in ERPNext. ` +
      'Run: CONFIRM_CREATE=1 npx tsx src/db/erp_create_agreement_doctype.ts');
  }
  doctypeChecked = true;
}

/** Create the ERPNext document. Returns its name, e.g. AG-2026-0001. */
export async function createAgreementDoc(fields: AgreementFields): Promise<string> {
  await assertDoctype();
  const res = await erpFetch(path(AGREEMENT_DOCTYPE), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ doctype: AGREEMENT_DOCTYPE, ...fields }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ERPNext could not create the agreement: ${frappeError(text).slice(0, 300)}`);
  }
  const name = JSON.parse(text)?.data?.name;
  if (!name) throw new Error('ERPNext created the agreement but returned no name');
  return String(name);
}

/** Patch an existing document. Partial — only what is passed is written. */
export async function updateAgreementDoc(
  erpName: string, fields: Partial<AgreementFields>,
): Promise<void> {
  await assertDoctype();
  const res = await erpFetch(path(AGREEMENT_DOCTYPE, erpName), {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    throw new Error(
      `ERPNext could not update ${erpName}: ${frappeError(await res.text()).slice(0, 300)}`);
  }
}

/** The whole document, as ERPNext holds it. */
export async function getAgreementDoc(erpName: string): Promise<Record<string, any> | null> {
  await assertDoctype();
  const res = await erpFetch(path(AGREEMENT_DOCTYPE, erpName), { headers: authHeaders() });
  if (!res.ok) return null;
  return JSON.parse(await res.text())?.data ?? null;
}

/**
 * The rendered PDF, as bytes.
 *
 * Fetched server-side on purpose: a partner must never hold an ERPNext
 * credential, and download_pdf needs one. The CALLER is responsible for
 * having checked that this agreement is theirs to see — this function
 * does no authorisation and cannot, since it knows nothing about orgs.
 *
 * no_letterhead=1 because the print format draws its own masthead. With
 * a letterhead on top the page carries two.
 */
export async function fetchAgreementPdf(erpName: string): Promise<ArrayBuffer> {
  await assertDoctype();
  const url =
    `${BASE}/api/method/frappe.utils.print_format.download_pdf` +
    `?doctype=${encodeURIComponent(AGREEMENT_DOCTYPE)}` +
    `&name=${encodeURIComponent(erpName)}` +
    `&format=${encodeURIComponent(AGREEMENT_FORMAT)}` +
    `&no_letterhead=1`;
  const res = await erpFetch(url, {
    headers: { Authorization: `token ${KEY}:${SECRET}`, Accept: 'application/pdf' },
  });
  if (!res.ok) {
    const why = frappeError(await res.text());
    throw new Error(
      `ERPNext could not render the PDF for ${erpName} (HTTP ${res.status})` +
      (/print format|not found/i.test(why)
        ? ` — the print format "${AGREEMENT_FORMAT}" is missing. Re-run erp_create_agreement_doctype.ts.`
        : `: ${why.slice(0, 200)}`));
  }
  return res.arrayBuffer();
}

/**
 * Log a Communication against the agreement.
 *
 * Best-effort by design, and the caller must treat it that way: failing
 * to write the audit copy must never make a sent agreement look unsent.
 */
export async function logAgreementCommunication(
  erpName: string, subject: string, content: string,
  to: string[], cc: string[], via: string,
): Promise<boolean> {
  try {
    const res = await erpFetch(`${BASE}/api/resource/Communication`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        doctype: 'Communication',
        communication_type: 'Communication',
        communication_medium: 'Email',
        sent_or_received: 'Sent',
        subject,
        content: `${content}<hr><p><em>Sent via ${via}.</em></p>`,
        recipients: to.join(', '),
        cc: cc.join(', '),
        reference_doctype: AGREEMENT_DOCTYPE,
        reference_name: erpName,
        status: 'Linked',
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

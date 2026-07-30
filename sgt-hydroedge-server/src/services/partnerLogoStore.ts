// =====================================================================
// services/partnerLogoStore.ts — reading and writing a partner's logo.
//
// The same three columns hang off two tables: the APPLICATION
// (partner_service.registration) and the approved PARTNER
// (quote_service.org). Approval copies one to the other.
//
// Both the portal and the CRM need to upload, fetch and clear a logo on
// both tables — twelve routes that would otherwise be twelve copies of
// the same four lines of SQL. They are here instead, so the one rule
// that is easy to forget lives in exactly one place:
//
//   CHANGING AN ORG'S LOGO MUST CLEAR erp_logo_url.
//
// That column caches the copy ERPNext holds. Leave it set after a
// re-upload and every future quotation keeps printing the OLD logo,
// with nothing anywhere reporting an error — the worst kind of bug,
// because it looks like it worked.
// =====================================================================

import { query } from '../db/pool.js';
import type { DecodedLogo } from '../domain/partnerLogo.js';

export type LogoTarget = 'registration' | 'org';

/** Whitelist. These strings are interpolated into SQL — never widen this. */
const TABLE: Record<LogoTarget, string> = {
  registration: 'partner_service.registration',
  org: 'quote_service.org',
};

export interface StoredLogo {
  fileName: string;
  contentType: string;
  bytes: Buffer;
}

/** The image itself. Null when the row has none, or the row is gone. */
export async function readLogo(
  target: LogoTarget, id: number | string,
): Promise<StoredLogo | null> {
  const { rows } = await query(
    `select logo_filename, logo_mime, logo_bytes
       from ${TABLE[target]} where id = $1`, [id]);
  const r = rows[0];
  if (!r?.logo_bytes) return null;
  return {
    fileName: r.logo_filename ?? 'logo.png',
    contentType: r.logo_mime ?? 'image/png',
    bytes: r.logo_bytes as Buffer,
  };
}

/** Whether a logo is present, without hauling the bytes out of Postgres. */
export async function hasLogo(
  target: LogoTarget, id: number | string,
): Promise<{ fileName: string | null; sizeBytes: number } | null> {
  const { rows } = await query(
    `select logo_filename, coalesce(octet_length(logo_bytes), 0) as size
       from ${TABLE[target]} where id = $1`, [id]);
  const r = rows[0];
  if (!r || Number(r.size) === 0) return null;
  return { fileName: r.logo_filename ?? null, sizeBytes: Number(r.size) };
}

export async function saveLogo(
  target: LogoTarget, id: number | string, logo: DecodedLogo,
): Promise<void> {
  // On an org, the cached ERPNext URL now points at the PREVIOUS image.
  // Clearing it is what makes the new logo appear on the next quotation.
  const alsoClear = target === 'org' ? ', erp_logo_url = null' : '';
  await query(
    `update ${TABLE[target]}
        set logo_filename = $2, logo_mime = $3, logo_bytes = $4${alsoClear}
      where id = $1`,
    [id, logo.fileName, logo.contentType, logo.bytes]);
}

export async function clearLogo(
  target: LogoTarget, id: number | string,
): Promise<void> {
  const alsoClear = target === 'org' ? ', erp_logo_url = null' : '';
  await query(
    `update ${TABLE[target]}
        set logo_filename = null, logo_mime = null, logo_bytes = null${alsoClear}
      where id = $1`, [id]);
}

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

/**
 * Which image. Signatures arrived later and behave identically — same
 * columns, same rule about clearing the cached ERPNext URL — so they
 * share this module rather than getting a copy of it.
 *
 * Signatures live on `org` ONLY. A logo is collected at application
 * time; a signature is not asked for until a partner is appointed.
 */
export type ImageKind = 'logo' | 'sign';

/** Whitelist. These strings are interpolated into SQL — never widen this. */
const TABLE: Record<LogoTarget, string> = {
  registration: 'partner_service.registration',
  org: 'quote_service.org',
};

/** Column prefixes, also interpolated into SQL. Never widen this either. */
const COLS: Record<ImageKind, { file: string; mime: string; bytes: string; cache: string }> = {
  logo: { file: 'logo_filename', mime: 'logo_mime', bytes: 'logo_bytes', cache: 'erp_logo_url' },
  sign: { file: 'sign_filename', mime: 'sign_mime', bytes: 'sign_bytes', cache: 'erp_sign_url' },
};

export interface StoredLogo {
  fileName: string;
  contentType: string;
  bytes: Buffer;
}

/** The image itself. Null when the row has none, or the row is gone. */
export async function readLogo(
  target: LogoTarget, id: number | string, kind: ImageKind = 'logo',
): Promise<StoredLogo | null> {
  const c = COLS[kind];
  const { rows } = await query(
    `select ${c.file} as file, ${c.mime} as mime, ${c.bytes} as bytes
       from ${TABLE[target]} where id = $1`, [id]);
  const r = rows[0];
  if (!r?.bytes) return null;
  return {
    fileName: r.file ?? `${kind}.png`,
    contentType: r.mime ?? 'image/png',
    bytes: r.bytes as Buffer,
  };
}

/** Whether an image is present, without hauling the bytes out of Postgres. */
export async function hasLogo(
  target: LogoTarget, id: number | string, kind: ImageKind = 'logo',
): Promise<{ fileName: string | null; sizeBytes: number } | null> {
  const c = COLS[kind];
  const { rows } = await query(
    `select ${c.file} as file, coalesce(octet_length(${c.bytes}), 0) as size
       from ${TABLE[target]} where id = $1`, [id]);
  const r = rows[0];
  if (!r || Number(r.size) === 0) return null;
  return { fileName: r.file ?? null, sizeBytes: Number(r.size) };
}

export async function saveLogo(
  target: LogoTarget, id: number | string, logo: DecodedLogo, kind: ImageKind = 'logo',
): Promise<void> {
  const c = COLS[kind];
  // On an org, the cached ERPNext URL now points at the PREVIOUS image.
  // Clearing it is what makes the new one appear on the next document.
  const alsoClear = target === 'org' ? `, ${c.cache} = null` : '';
  await query(
    `update ${TABLE[target]}
        set ${c.file} = $2, ${c.mime} = $3, ${c.bytes} = $4${alsoClear}
      where id = $1`,
    [id, logo.fileName, logo.contentType, logo.bytes]);
}

export async function clearLogo(
  target: LogoTarget, id: number | string, kind: ImageKind = 'logo',
): Promise<void> {
  const c = COLS[kind];
  const alsoClear = target === 'org' ? `, ${c.cache} = null` : '';
  await query(
    `update ${TABLE[target]}
        set ${c.file} = null, ${c.mime} = null, ${c.bytes} = null${alsoClear}
      where id = $1`, [id]);
}

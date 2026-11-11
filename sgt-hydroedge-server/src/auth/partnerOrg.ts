// =====================================================================
// auth/partnerOrg.ts — which org a partner login is acting as.
//
// A login has ONE home org (app_user.org_id). A firm that is in both the
// GreenX and GreenDrive networks has a second org row for the other line,
// linked as its sister (migrate_partner_08_sister_org.ts). The portal asks
// for a line with the X-Product-Line header; if the home org is in another
// line and its sister is in the one asked for, the sister is used.
//
// This keeps the portal's rule that the client never names an org: the
// header names a LINE, and the only orgs it can resolve to are the two
// already tied to this login in the database. Anything else — no header,
// an unknown value, a line the firm is not in — falls back to the home org,
// and every screen keys off the line of the org actually returned.
//
// Read from the DATABASE on every request, never from the token.
// =====================================================================

import type { FastifyRequest } from 'fastify';
import { query } from '../db/pool.js';

export type ProductLine = 'GreenX' | 'GreenDrive';

export interface PartnerOrg {
  id: number;
  code: string;
  orgType: string;
  legalName: string;
  productLine: ProductLine;
}

export interface PartnerLogin {
  userId: string;
  name: string;
  active: boolean;
  /** The org this request acts as. Null when the login has no active org. */
  org: PartnerOrg | null;
  /** Every line this login can switch to, home first. */
  lines: { productLine: ProductLine; code: string }[];
}

function asLine(v: unknown): ProductLine {
  return v === 'GreenDrive' ? 'GreenDrive' : 'GreenX';
}

/** The line the client asked for, or null for "my home org". */
export function requestedLine(req: FastifyRequest): ProductLine | null {
  const raw = req.headers['x-product-line'];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === 'GreenX' || v === 'GreenDrive' ? v : null;
}

export async function resolvePartnerLogin(
  userId: string, wanted: ProductLine | null,
): Promise<PartnerLogin | null> {
  const { rows } = await query(
    `select u.id, u.name, u.active,
            h.id as h_id, h.code as h_code, h.org_type as h_type,
            h.legal_name as h_name, h.product_line as h_line, h.is_active as h_active,
            s.id as s_id, s.code as s_code, s.org_type as s_type,
            s.legal_name as s_name, s.product_line as s_line
       from lead_service.app_user u
       left join quote_service.org h on h.id = u.org_id
       left join quote_service.org s on s.id = h.sister_org_id and s.is_active
      where u.id = $1`, [userId]);
  const r = rows[0];
  if (!r) return null;

  const base = { userId: String(r.id), name: String(r.name ?? '').trim(), active: !!r.active };
  if (!r.h_id || !r.h_active) return { ...base, org: null, lines: [] };

  const home: PartnerOrg = {
    id: r.h_id, code: r.h_code, orgType: r.h_type, legalName: r.h_name,
    productLine: asLine(r.h_line),
  };
  const sister: PartnerOrg | null = r.s_id && asLine(r.s_line) !== home.productLine
    ? { id: r.s_id, code: r.s_code, orgType: r.s_type, legalName: r.s_name, productLine: asLine(r.s_line) }
    : null;

  const org = sister && wanted === sister.productLine ? sister : home;
  const lines = [home, ...(sister ? [sister] : [])]
    .map(o => ({ productLine: o.productLine, code: o.code }));
  return { ...base, org, lines };
}

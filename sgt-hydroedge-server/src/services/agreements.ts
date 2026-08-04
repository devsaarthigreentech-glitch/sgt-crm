// =====================================================================
// services/agreements.ts — the dealer agreement, end to end.
//
// One place for the operations, called by BOTH the staff routes and the
// portal routes, so a distributor raising an agreement produces exactly
// the same document SGT would. Two code paths would drift, and the thing
// that drifts is a legal instrument.
//
// The shape of the flow:
//
//   resolveForDealer()  read the parties off quote_service.org and build
//                       the whole document. This is the "one click"
//                       — nothing is typed, everything is derived.
//   createAgreement()   write it to ERPNext, mirror it locally, audit it.
//   sendAgreement()     mail the rendered PDF to the dealer.
//   storeSignedCopy()   file the countersigned scan against it.
//
// Authorisation is NOT done here. Every function takes org ids the caller
// has already bounded, because this module cannot see a JWT and must
// never be the thing that decides who may act. The routes bound it —
// staff by role, portal by quote_service.visible_org_ids().
// =====================================================================

import { query, pool } from '../db/pool.js';
import { localStorage, storage } from './storage.js';
import {
  createAgreementDoc, updateAgreementDoc, fetchAgreementPdf, deleteAgreementDoc,
  type AgreementFields,
} from './erpAgreement.js';
import {
  sendAgreement as mailAgreement, defaultAgreementSubject,
  defaultAgreementMessageText, isEmail,
} from './agreementMail.js';
import { textToHtml } from './quoteMail.js';
import { defaultAgreementBody } from '../domain/agreementBody.js';
import { shortFiscalYear } from '../domain/fiscalYear.js';

/**
 * People copied on EVERY agreement, on top of the distributor.
 *
 * Comma-separated, e.g.
 *   AGREEMENT_CC=ajinkya@sgthydroedge.com,ritesh@sgthydroedge.com
 *
 * Env rather than a table, matching ERP_TERMS_STAMP_URLS: this is a short
 * list of colleagues that changes when someone joins or leaves, not
 * per-agreement data. Changing it is a config edit and a restart.
 *
 * These are VISIBLE to the dealer and the distributor — it is Cc, not Bcc,
 * deliberately, because on a tripartite agreement the dealer should be able
 * to see who at SGT is on the thread and reply to all of them.
 */
const STANDING_CC = String(process.env.AGREEMENT_CC ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Said once, at import, rather than swallowed per send. A typo'd standing
// recipient is otherwise invisible: it is dropped silently and nobody
// notices until someone asks why they never get copied.
{
  const bad = STANDING_CC.filter(e => !isEmail(e));
  if (bad.length) {
    console.warn(
      `⚠ AGREEMENT_CC contains ${bad.length} malformed address(es), ignored: ${bad.join(', ')}`);
  }
}

/** Who is acting. Stamped onto the document and every audit row. */
export interface Actor {
  userId: string;
  name: string;
  /** The partner code when a partner raised it; null when SGT did. */
  orgCode: string | null;
  via: 'crm' | 'portal';
}

/** One org, as the agreement needs it. */
interface PartyRow {
  id: number;
  code: string;
  legal_name: string;
  trade_name: string | null;
  org_type: string;
  dealer_type: string | null;
  gstin: string | null;
  constitution: string | null;
  associate_name: string | null;
  territory: string | null;
  region: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  contact_name: string | null;
  contact_designation: string | null;
  contact_mobile: string | null;
  contact_email: string | null;
  signatory_name: string | null;
  signatory_designation: string | null;
  sign_name: string | null;
  sign_designation: string | null;
  signature_url: string | null;
  parent_id: number | null;
}

const PARTY_COLS = `
  o.id, o.code, o.legal_name, o.trade_name, o.org_type, o.dealer_type, o.gstin,
  o.constitution, o.associate_name, o.territory, o.region,
  o.address_line1, o.address_line2, o.city, o.state, o.pincode, o.country,
  o.contact_name, o.contact_designation, o.contact_mobile, o.contact_email,
  o.signatory_name, o.signatory_designation, o.sign_name, o.sign_designation,
  o.signature_url, o.parent_id`;

/**
 * One line, the way it reads on a contract.
 *
 * City and pincode sit together ("Jaipur 302039") because that is how an
 * Indian address is written; everything else is comma-separated. Blank
 * parts vanish rather than leaving ", ," behind.
 */
function addressOf(p: PartyRow): string | null {
  const cityLine = [p.city, p.pincode].filter(Boolean).join(' ').trim();
  const parts = [p.address_line1, p.address_line2, cityLine, p.state, p.country]
    .map(s => String(s ?? '').trim())
    .filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

const first = (...vals: Array<string | null | undefined>): string | null => {
  for (const v of vals) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return null;
};

async function loadParty(orgId: number): Promise<PartyRow | null> {
  const { rows } = await query(
    `select ${PARTY_COLS} from quote_service.org o where o.id = $1`, [orgId]);
  return (rows[0] as PartyRow) ?? null;
}

async function loadSgt(): Promise<PartyRow | null> {
  // By TYPE first, code second. org_type is constrained by the schema;
  // 'SGT' is just a string someone could rename.
  const { rows } = await query(
    `select ${PARTY_COLS} from quote_service.org o
      where o.org_type = 'sgt' or o.code = 'SGT'
      order by (o.org_type = 'sgt') desc limit 1`);
  return (rows[0] as PartyRow) ?? null;
}

// ---------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------

export interface ResolvedAgreement {
  dealerOrgId: number;
  distributorOrgId: number | null;
  fields: AgreementFields;
  /** Where the agreement would be emailed. Empty is not an error yet. */
  recipients: string[];
  /**
   * Things that will print as a blank or read oddly. Surfaced so the
   * screen can show them BEFORE the document is created, rather than
   * leaving someone to notice on the PDF.
   */
  warnings: string[];
}

/**
 * Everything needed to raise an agreement for one dealer, derived.
 *
 * Nothing here is typed by a user. That is the point: the hand-filled
 * Word file was wrong precisely because a person had to copy a code, a
 * GSTIN and an address into it every time.
 */
export async function resolveForDealer(dealerOrgId: number): Promise<ResolvedAgreement> {
  const dealer = await loadParty(dealerOrgId);
  if (!dealer) throw new Error('No such partner');
  if (dealer.org_type !== 'dealer') {
    throw new Error(
      `${dealer.legal_name} is a ${dealer.org_type}, not a dealer. ` +
      'This agreement appoints a dealer under a distributor.');
  }

  const distributor = dealer.parent_id ? await loadParty(dealer.parent_id) : null;
  const sgt = await loadSgt();

  const warnings: string[] = [];
  if (!distributor) {
    warnings.push('This dealer has no parent distributor, so the agreement cannot name one.');
  } else if (distributor.org_type !== 'distributor') {
    warnings.push(
      `The parent org ${distributor.code} is a ${distributor.org_type}, not a distributor.`);
  }
  if (!dealer.constitution) {
    warnings.push('No constitution on record — the recital will omit "a … concern".');
  }
  if (!first(dealer.signatory_name, dealer.contact_name)) {
    warnings.push('No signatory on record — the Dealer signature block will print a blank rule.');
  }
  if (!dealer.gstin) warnings.push('No GSTIN on record.');
  if (!dealer.territory) {
    warnings.push('No operating area on record — Annexure A will print a dash.');
  } else if (/^\s*[\d.,]+\s*(cr|crore|lakh|l|k|mn)\b/i.test(dealer.territory)) {
    // Seen in live data: a turnover figure sitting in the territory
    // field. It would print as the Operating Area on a signed contract.
    warnings.push(
      `Operating area reads "${dealer.territory}", which looks like a turnover figure ` +
      'rather than a place. It will print as the Operating Area in Annexure A.');
  }
  if (!sgt) warnings.push('No SGT org row found — the SGT signature block will be blank.');

  // Territory discipline, Clause 8.2. A dealer whose state does not match
  // the distributor's exclusive region is not necessarily an error — the
  // distributor may have an arrangement — but it is never something to
  // discover after the agreement is signed.
  const dealerState = String(dealer.state ?? '').trim().toLowerCase();
  const region = String(distributor?.region ?? '').trim().toLowerCase();
  if (dealerState && region && !dealerState.includes(region) && !region.includes(dealerState)) {
    warnings.push(
      `This dealer is in ${dealer.state}, but ${distributor?.legal_name} is exclusive for ` +
      `${distributor?.region}. Clause 8.2 confines the dealer to the Distributor's Region.`);
  }

  const dealerType = dealer.dealer_type ?? 'SS';

  const fields: AgreementFields = {
    // Today, in ERPNext's date format. The screen may change it before
    // creating; it is not editable afterwards without editing the doc.
    effective_date: new Date().toISOString().slice(0, 10),
    agreement_status: 'Draft',

    distributor_name: distributor?.legal_name ?? null,
    distributor_code: distributor?.code ?? null,
    distributor_associate: distributor?.associate_name ?? null,
    distributor_region: distributor?.region ?? null,
    distributor_email: distributor?.contact_email ?? null,
    distributor_address: distributor ? addressOf(distributor) : null,
    distributor_signatory: first(distributor?.signatory_name, distributor?.contact_name),
    distributor_signatory_designation:
      first(distributor?.signatory_designation, distributor?.contact_designation),
    distributor_sign_name: first(distributor?.sign_name, distributor?.signatory_name,
                                 distributor?.contact_name),
    distributor_sign_designation: first(distributor?.sign_designation, 'Authorised Signatory'),
    distributor_signature_url: distributor?.signature_url ?? null,

    dealer_name: dealer.legal_name,
    dealer_code: dealer.code,
    dealer_type: dealerType,
    dealer_constitution: dealer.constitution,
    dealer_gstin: dealer.gstin,
    dealer_operating_area: dealer.territory,
    dealer_address: addressOf(dealer),
    dealer_signatory: first(dealer.signatory_name, dealer.contact_name),
    dealer_signatory_designation:
      first(dealer.signatory_designation, dealer.contact_designation),
    dealer_email: dealer.contact_email,
    dealer_mobile: dealer.contact_mobile,

    sgt_signatory: first(sgt?.sign_name, sgt?.signatory_name),
    sgt_signatory_designation: first(sgt?.sign_designation, sgt?.signatory_designation),
    sgt_signature_url: sgt?.signature_url ?? null,

    agreement_body: defaultAgreementBody({
      distributorCode: distributor?.code ?? '',
      dealerCode: dealer.code,
      dealerType,
    }),
  };

  return {
    dealerOrgId: dealer.id,
    distributorOrgId: distributor?.id ?? null,
    fields,
    recipients: [dealer.contact_email].filter((e): e is string => !!e && isEmail(e)),
    warnings,
  };
}

// ---------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------

export interface AgreementRow {
  id: number;
  erp_name: string;
  dealer_org_id: number;
  distributor_org_id: number | null;
  effective_date: string | null;
  status: string;
  dealer_code: string | null;
  dealer_name: string | null;
  dealer_type: string | null;
  distributor_code: string | null;
  distributor_name: string | null;
  sent_at: string | null;
  sent_to: string[];
  signed_at: string | null;
  signed_filename: string | null;
  raised_by_name: string | null;
  raised_via: string;
  created_at: string;
}

const ROW_COLS = `
  id, erp_name, dealer_org_id, distributor_org_id, effective_date, status,
  dealer_code, dealer_name, dealer_type, distributor_code, distributor_name,
  sent_at, sent_to, signed_at, signed_filename, raised_by_name, raised_via, created_at`;

async function audit(
  client: { query: (t: string, p?: any[]) => Promise<any> },
  agreementId: number, type: string, actor: Actor,
  fromStatus: string | null, toStatus: string | null, payload: unknown = {},
) {
  await client.query(
    `insert into quote_service.agreement_event
       (agreement_id, event_type, from_status, to_status, actor, actor_name, payload)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [agreementId, type, fromStatus, toStatus, actor.userId, actor.name,
     JSON.stringify(payload ?? {})]);
}

/**
 * Raise the agreement: ERPNext document first, mirror row second.
 *
 * That order matters. If ERPNext fails there is nothing to clean up. The
 * reverse order can leave a local row pointing at a document that was
 * never created, and the list would then show an agreement nobody can
 * print.
 *
 * `overrides` lets the screen correct a derived value — a wrong operating
 * area, a missing signatory — without making the user retype the other
 * thirty fields.
 */
export async function createAgreement(
  dealerOrgId: number, actor: Actor, overrides: Partial<AgreementFields> = {},
): Promise<AgreementRow> {
  const resolved = await resolveForDealer(dealerOrgId);
  const effective = String(overrides.effective_date ?? resolved.fields.effective_date ?? '');
  const fields: AgreementFields = {
    ...resolved.fields,
    ...overrides,
    // Set LAST and never from `overrides`: this feeds the document name
    // through the series, and a hand-supplied value would name the
    // agreement into the wrong financial year. Derived from the effective
    // date rather than today, so an agreement backdated to March lands in
    // the year it takes effect.
    custom_short_fiscal_year: shortFiscalYear(effective || new Date()),
    raised_by: actor.name,
    raised_by_org: actor.orgCode,
    raised_via: actor.via,
  };

  const erpName = await createAgreementDoc(fields);

  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `insert into quote_service.agreement_ref
         (erp_name, dealer_org_id, distributor_org_id, effective_date, status,
          dealer_code, dealer_name, dealer_type, distributor_code, distributor_name,
          raised_by, raised_by_name, raised_via)
       values ($1,$2,$3,$4,'generated',$5,$6,$7,$8,$9,$10,$11,$12)
       returning ${ROW_COLS}`,
      [erpName, resolved.dealerOrgId, resolved.distributorOrgId,
       fields.effective_date ?? null,
       fields.dealer_code ?? null, fields.dealer_name ?? null, fields.dealer_type ?? null,
       fields.distributor_code ?? null, fields.distributor_name ?? null,
       actor.userId, actor.name, actor.via]);

    const row = rows[0] as AgreementRow;
    await audit(client, row.id, 'created', actor, null, 'generated', {
      erpName,
      overrides: Object.keys(overrides),
      warnings: resolved.warnings,
    });
    await client.query('commit');
    return row;
  } catch (err) {
    await client.query('rollback');
    // The ERPNext document exists but is unmirrored. Say so — silently
    // swallowing it leaves an orphan nobody knows to look for.
    throw new Error(
      `The agreement ${erpName} was created in ERPNext but could not be recorded ` +
      `locally: ${(err as Error).message}`);
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------

/**
 * List agreements. `orgIds` bounds it; pass null for "everything", which
 * ONLY a staff route may do.
 */
export async function listAgreements(orgIds: number[] | null): Promise<AgreementRow[]> {
  const { rows } = orgIds
    ? await query(
        `select ${ROW_COLS} from quote_service.agreement_ref
          where dealer_org_id = any($1::int[]) or distributor_org_id = any($1::int[])
          order by created_at desc limit 500`, [orgIds])
    : await query(
        `select ${ROW_COLS} from quote_service.agreement_ref
          order by created_at desc limit 500`);
  return rows as AgreementRow[];
}

export async function getAgreement(id: number): Promise<AgreementRow | null> {
  const { rows } = await query(
    `select ${ROW_COLS} from quote_service.agreement_ref where id = $1`, [id]);
  return (rows[0] as AgreementRow) ?? null;
}

/** True when this agreement is inside the caller's visible set. */
export function isVisible(row: AgreementRow, orgIds: number[] | null): boolean {
  if (orgIds === null) return true;
  return orgIds.includes(row.dealer_org_id) ||
         (row.distributor_org_id !== null && orgIds.includes(row.distributor_org_id));
}

export async function agreementPdf(row: AgreementRow): Promise<ArrayBuffer> {
  return fetchAgreementPdf(row.erp_name);
}

/** The events, newest first. */
export async function agreementHistory(id: number) {
  const { rows } = await query(
    `select event_type, from_status, to_status, actor_name, payload, created_at
       from quote_service.agreement_event
      where agreement_id = $1 order by created_at desc`, [id]);
  return rows;
}

// ---------------------------------------------------------------------
// Undo
//
// Two different acts, deliberately not one:
//
//   DELETE  the agreement never left the building. Nothing exists that
//           references it, so removing it leaves no hole. Used for the
//           ones raised by mistake, or to test.
//
//   CANCEL  it was emailed. The dealer HAS a copy — a PDF sitting in
//           someone's inbox with a document number on it. Making our
//           record vanish does not unsend that, it just means nobody
//           here can explain the number when the dealer quotes it back.
//           So the row and its history stay, marked cancelled.
//
// The cut is at `sent`, not at anyone's judgement about whether it
// mattered.
// ---------------------------------------------------------------------

/** Statuses that never left. Anything else is cancel-only. */
const DELETABLE = new Set(['draft', 'generated', 'cancelled']);

export function canDelete(row: AgreementRow): boolean {
  return DELETABLE.has(row.status) && !row.sent_at && !row.signed_at;
}

/**
 * Remove the agreement entirely — ERPNext document and local row.
 *
 * ERPNext first. If it refuses (something links to the document) nothing
 * local has changed yet and the caller gets a usable error. The reverse
 * order would delete our row and leave an ERPNext document nobody can
 * reach from the CRM.
 */
export async function deleteAgreement(row: AgreementRow, actor: Actor): Promise<void> {
  if (!canDelete(row)) {
    throw new Error(
      row.signed_at
        ? 'This agreement has a signed copy against it and cannot be deleted. Cancel it instead.'
        : 'This agreement has already been sent to the dealer, who has a copy of it. ' +
          'Cancel it instead, so the record of what they were sent survives.');
  }

  await deleteAgreementDoc(row.erp_name);

  // The event rows go with it — `on delete cascade` on agreement_event.
  // That is correct here and only here: nothing was ever sent, so there
  // is no outside record for the audit trail to have to explain.
  await query(`delete from quote_service.agreement_ref where id = $1`, [row.id]);
}

/**
 * Withdraw an agreement that has already gone out.
 *
 * The document and the history stay. The dealer keeps their copy either
 * way; what changes is that this side stops treating the appointment as
 * live, and says when and why it stopped.
 */
export async function cancelAgreement(
  row: AgreementRow, actor: Actor, reason: string,
): Promise<AgreementRow> {
  if (row.status === 'cancelled') return row;

  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `update quote_service.agreement_ref
          set status = 'cancelled', updated_at = now()
        where id = $1 returning ${ROW_COLS}`, [row.id]);
    await audit(client, row.id, 'cancelled', actor, row.status, 'cancelled',
                { reason: reason || null, wasSentTo: row.sent_to });
    await client.query('commit');
    await updateAgreementDoc(row.erp_name, { agreement_status: 'Cancelled' }).catch(() => {});
    return rows[0] as AgreementRow;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------

export interface SendInput {
  to?: string[];
  cc?: string[];
  subject?: string;
  /** Plain text. Converted to HTML here, so both surfaces send one shape. */
  messageText?: string;
}

/** The covering note the send dialog should open with. */
export async function draftFor(row: AgreementRow, senderName: string | null) {
  const dealer = await loadParty(row.dealer_org_id);
  const distributor = row.distributor_org_id
    ? await loadParty(row.distributor_org_id)
    : null;

  const ctx = {
    erpName: row.erp_name,
    dealerName: row.dealer_name,
    dealerCode: row.dealer_code,
    distributorName: row.distributor_name,
    senderName,
  };

  const to = [dealer?.contact_email]
    .filter((e): e is string => !!e && isEmail(e));

  // The distributor is CC'd by default. This is a tripartite agreement —
  // they are a Party to it, not a bystander — so the appointment of a
  // dealer beneath them should never go out without them on the thread.
  //
  // Read live from the org record, like the To address, so correcting an
  // email on the partner record fixes the next send. NOT taken from the
  // agreement's snapshot: the snapshot is what the document SAYS, and this
  // is about where the mail GOES.
  //
  // Distributor first, then the standing SGT list.
  //
  // Deduped against To AND against itself, case-insensitively. Two ways
  // this bites in practice: the distributor's contact email is also the
  // dealer's while a partner is being set up, and someone on AGREEMENT_CC
  // is also the distributor's contact. Either way a duplicate address on a
  // contract email reads as a bug to whoever receives it.
  const seen = new Set(to.map(t => t.toLowerCase()));
  const cc: string[] = [];
  for (const raw of [distributor?.contact_email, ...STANDING_CC]) {
    const e = String(raw ?? '').trim();
    if (!e || !isEmail(e)) continue;
    const k = e.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    cc.push(e);
  }

  return {
    to,
    cc,
    subject: defaultAgreementSubject(ctx),
    messageText: defaultAgreementMessageText(ctx),
  };
}

export async function sendAgreementTo(
  row: AgreementRow, actor: Actor, input: SendInput,
) {
  const draft = await draftFor(row, actor.name);
  const to = (input.to ?? draft.to).map(s => String(s).trim()).filter(isEmail);
  // `?? draft.cc`, not `?? []` — a caller that omits cc entirely gets the
  // default distributor CC. An explicit empty array still means "no CC",
  // because someone who cleared the field on the send form meant it.
  const cc = (input.cc ?? draft.cc).map(s => String(s).trim()).filter(isEmail);
  if (!to.length) {
    throw new Error(
      'No valid recipient. Add an email on the dealer record, or type one on the send form.');
  }

  const subject = String(input.subject ?? draft.subject).trim() || draft.subject;
  const text = String(input.messageText ?? draft.messageText);

  const result = await mailAgreement({
    erpName: row.erp_name, to, cc, subject, message: textToHtml(text),
  });

  const client = await pool.connect();
  try {
    await client.query('begin');
    // 'sent' never goes backwards from 'signed' — resending a countersigned
    // agreement (for a copy, say) must not un-sign it.
    await client.query(
      `update quote_service.agreement_ref
          set status = case when status = 'signed' then 'signed' else 'sent' end,
              sent_at = now(), sent_to = $2, updated_at = now()
        where id = $1`, [row.id, to]);
    await audit(client, row.id, 'sent', actor, row.status,
                row.status === 'signed' ? 'signed' : 'sent',
                { to, cc, subject, provider: result.provider, loggedToErp: result.loggedToErp });
    await client.query('commit');
  } finally {
    client.release();
  }

  // Best-effort, and after the local write: ERPNext showing 'Generated'
  // while we show 'Sent' is cosmetic. The reverse — us failing to record
  // a mail that went out — is not.
  await updateAgreementDoc(row.erp_name, { agreement_status: 'Sent' }).catch(() => {});

  return result;
}

// ---------------------------------------------------------------------
// The countersigned copy
// ---------------------------------------------------------------------

const SIGNED_MAX_BYTES = Number(process.env.AGREEMENT_SIGNED_MAX_BYTES ?? 15 * 1024 * 1024);

export { SIGNED_MAX_BYTES };

/**
 * File the scan the dealer sent back.
 *
 * Through the same StorageProvider as the vault, so the LocalDisk ->
 * MinIO swap stays a config change. The write is direct rather than
 * presigned because the bytes are already on this server — the browser
 * posted them here — and bouncing them back out to be PUT in again would
 * be a round trip for nothing.
 */
export async function storeSignedCopy(
  row: AgreementRow, actor: Actor,
  file: { filename: string; mime: string; bytes: Buffer },
) {
  if (!file.bytes.length) throw new Error('The uploaded file is empty');
  if (file.bytes.length > SIGNED_MAX_BYTES) {
    throw new Error(
      `That file is ${(file.bytes.length / 1048576).toFixed(1)} MB; the limit is ` +
      `${(SIGNED_MAX_BYTES / 1048576).toFixed(0)} MB.`);
  }

  const local = localStorage();
  if (!local) {
    throw new Error(
      'VAULT_STORAGE is not local and the S3 provider is not implemented yet, so the ' +
      'signed copy cannot be stored. See src/services/storage.ts.');
  }

  const ext = (file.filename.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? '.pdf').toLowerCase();
  const key = `agreements/${row.erp_name}/signed-${Date.now()}${ext}`;
  await local.writeStream(key, file.bytes);

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `update quote_service.agreement_ref
          set status = 'signed', signed_at = now(),
              signed_bucket = $2, signed_key = $3, signed_filename = $4,
              signed_mime = $5, signed_size = $6, updated_at = now()
        where id = $1`,
      [row.id, storage().bucket, key, file.filename, file.mime, file.bytes.length]);
    await audit(client, row.id, 'signed_copy_uploaded', actor, row.status, 'signed',
                { filename: file.filename, bytes: file.bytes.length });
    await client.query('commit');
  } finally {
    client.release();
  }

  await updateAgreementDoc(row.erp_name, { agreement_status: 'Signed' }).catch(() => {});
  return { key, size: file.bytes.length };
}

/** The stored scan, as bytes. Null when none has been uploaded. */
export async function readSignedCopy(
  row: AgreementRow,
): Promise<{ bytes: Buffer; filename: string; mime: string } | null> {
  const { rows } = await query(
    `select signed_key, signed_filename, signed_mime
       from quote_service.agreement_ref where id = $1`, [row.id]);
  const r = rows[0];
  if (!r?.signed_key) return null;

  const local = localStorage();
  if (!local) throw new Error('Storage is not local; cannot read the signed copy');

  const chunks: Buffer[] = [];
  for await (const c of local.readStream(r.signed_key)) chunks.push(Buffer.from(c));
  return {
    bytes: Buffer.concat(chunks),
    filename: r.signed_filename ?? `${row.erp_name}-signed.pdf`,
    mime: r.signed_mime ?? 'application/pdf',
  };
}

/** Dealers under `orgIds` that have no agreement yet. Drives the CRM prompt. */
export async function dealersWithoutAgreement(orgIds: number[] | null) {
  const { rows } = orgIds
    ? await query(
        `select o.id, o.code, o.legal_name, o.dealer_type, o.territory,
                p.code as distributor_code, p.legal_name as distributor_name
           from quote_service.org o
           left join quote_service.org p on p.id = o.parent_id
          where o.org_type = 'dealer' and o.is_active
            and o.id = any($1::int[])
            and not exists (select 1 from quote_service.agreement_ref a
                             where a.dealer_org_id = o.id and a.status <> 'cancelled')
          order by o.code`, [orgIds])
    : await query(
        `select o.id, o.code, o.legal_name, o.dealer_type, o.territory,
                p.code as distributor_code, p.legal_name as distributor_name
           from quote_service.org o
           left join quote_service.org p on p.id = o.parent_id
          where o.org_type = 'dealer' and o.is_active
            and not exists (select 1 from quote_service.agreement_ref a
                             where a.dealer_org_id = o.id and a.status <> 'cancelled')
          order by o.code`);
  return rows;
}

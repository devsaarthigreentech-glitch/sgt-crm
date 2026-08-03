// =====================================================================
// services/agreementMail.ts — sending the agreement to the dealer.
//
// The same two providers behind one interface as quoteMail.ts, chosen by
// AGREEMENT_MAIL_PROVIDER (falling back to QUOTE_MAIL_PROVIDER, because
// in practice whoever sends quotations sends agreements the same way and
// nobody wants two mail stacks to keep configured):
//
//   n8n     (default here) — POST the PDF and recipients to a webhook.
//   erpnext                — frappe.core.doctype.communication.email.make,
//                            which renders and attaches the print format
//                            itself. Needs an outgoing Email Account.
//
// The default differs from quoteMail's on purpose. Quotations already
// send through ERPNext in this deployment; the agreement is a new flow
// and the owner asked for it to go out through n8n, as the quotations
// do when QUOTE_MAIL_PROVIDER is set.
//
// Either way the sent copy is logged as a Communication against the
// agreement, so "what did we send them, and when" is answerable from the
// document six months later. That write is best-effort: failing to log
// must not make a sent agreement look unsent.
// =====================================================================

import { erpFetch } from './erpLimit.js';
import {
  AGREEMENT_DOCTYPE, AGREEMENT_FORMAT,
  fetchAgreementPdf, logAgreementCommunication,
} from './erpAgreement.js';
import { textToHtml } from './quoteMail.js';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '') ?? '';
const KEY = process.env.ERPNEXT_API_KEY ?? '';
const SECRET = process.env.ERPNEXT_API_SECRET ?? '';

const PROVIDER = (
  process.env.AGREEMENT_MAIL_PROVIDER ?? process.env.QUOTE_MAIL_PROVIDER ?? 'n8n'
).toLowerCase();
const N8N_URL =
  process.env.AGREEMENT_MAIL_N8N_URL ?? process.env.QUOTE_MAIL_N8N_URL ?? '';
const N8N_TOKEN =
  process.env.AGREEMENT_MAIL_N8N_TOKEN ?? process.env.QUOTE_MAIL_N8N_TOKEN ?? '';

export interface SendAgreementInput {
  erpName: string;
  to: string[];
  cc: string[];
  subject: string;
  /** HTML. Build it from text with textToHtml(). */
  message: string;
}

export interface SendAgreementResult {
  provider: 'erpnext' | 'n8n';
  to: string[];
  cc: string[];
  loggedToErp: boolean;
  note?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v: string) => EMAIL.test(String(v ?? '').trim());

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

async function sendViaErpNext(input: SendAgreementInput): Promise<SendAgreementResult> {
  // Frappe attaches the document PDF ONLY when print_format is truthy.
  // Omit it and the mail goes out with body text and no agreement,
  // silently — the exact bug quoteMail.ts documents. So it is always
  // sent, and it is pinned rather than resolved: the agreement has
  // exactly one correct format.
  const res = await erpFetch(
    `${BASE}/api/method/frappe.core.doctype.communication.email.make`,
    {
      method: 'POST',
      headers: {
        Authorization: `token ${KEY}:${SECRET}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        doctype: AGREEMENT_DOCTYPE,
        name: input.erpName,
        subject: input.subject,
        content: input.message,
        recipients: input.to.join(', '),
        cc: input.cc.join(', '),
        send_email: 1,
        print_format: AGREEMENT_FORMAT,
        // The print format draws its own masthead; a letterhead on top
        // would put two on the page.
        print_letterhead: 0,
        send_me_a_copy: 0,
      }),
    },
  );
  if (!res.ok) {
    const why = frappeError(await res.text());
    const hint = /outgoing|smtp|email account/i.test(why)
      ? ' — no outgoing Email Account is configured in ERPNext. Enable one, ' +
        'or set AGREEMENT_MAIL_PROVIDER=n8n.'
      : '';
    throw new Error(`ERPNext could not send: ${why.slice(0, 300)}${hint}`);
  }
  return { provider: 'erpnext', to: input.to, cc: input.cc, loggedToErp: true };
}

async function sendViaN8n(input: SendAgreementInput): Promise<SendAgreementResult> {
  if (!N8N_URL) {
    throw new Error(
      'AGREEMENT_MAIL_PROVIDER is n8n but neither AGREEMENT_MAIL_N8N_URL nor ' +
      'QUOTE_MAIL_N8N_URL is set.');
  }
  // The PDF is fetched here rather than in n8n: n8n would need an ERPNext
  // credential to render it, and handing one out defeats the point.
  const pdf = await fetchAgreementPdf(input.erpName);

  const res = await fetch(N8N_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(N8N_TOKEN ? { Authorization: `Bearer ${N8N_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      // `agreement` rather than `quotation`, so one webhook can serve both
      // if that is how it ends up wired — the n8n side can branch on which
      // key is present.
      agreement: input.erpName,
      to: input.to,
      cc: input.cc,
      // Comma-joined too: Gmail and most mail nodes want a string, and
      // `{{ $json.body.toCsv }}` is easier to get right in an n8n
      // expression than joining an array inline.
      toCsv: input.to.join(','),
      ccCsv: input.cc.join(','),
      subject: input.subject,
      html: input.message,
      // base64 in JSON, NOT binary. n8n needs a "Convert to File" node to
      // turn this into binary before a mail node will attach it.
      attachment: {
        filename: `${input.erpName}.pdf`,
        contentType: 'application/pdf',
        base64: Buffer.from(pdf).toString('base64'),
      },
    }),
  });
  if (!res.ok) {
    throw new Error(
      `n8n webhook returned ${res.status}: ${(await res.text()).slice(0, 250)}`);
  }
  const logged = await logAgreementCommunication(
    input.erpName, input.subject, input.message, input.to, input.cc, 'n8n');
  return {
    provider: 'n8n',
    to: input.to,
    cc: input.cc,
    loggedToErp: logged,
    note: logged
      ? undefined
      : 'Sent, but the copy could not be logged against the agreement in ERPNext.',
  };
}

export async function sendAgreement(
  input: SendAgreementInput,
): Promise<SendAgreementResult> {
  if (!input.to.length) throw new Error('At least one recipient is required');
  return PROVIDER === 'erpnext' ? sendViaErpNext(input) : sendViaN8n(input);
}

export const agreementMailProvider = (): 'erpnext' | 'n8n' =>
  PROVIDER === 'erpnext' ? 'erpnext' : 'n8n';

// ---------------------------------------------------------------------
// The covering note.
//
// The letter a person would write when sending a dealer their signed
// appointment: says what it is, that SGT has already signed it, and what
// to do next. It is a STARTING POINT — the send dialog loads it into an
// editable field.
// ---------------------------------------------------------------------

export interface AgreementMessageContext {
  erpName: string;
  dealerName?: string | null;
  dealerCode?: string | null;
  distributorName?: string | null;
  /** Who is sending — SGT, or the distributor. Signs the note. */
  senderName?: string | null;
}

export function defaultAgreementSubject(ctx: AgreementMessageContext): string {
  const who = String(ctx.dealerName ?? '').trim();
  return `Dealer Appointment Agreement ${ctx.erpName}` +
         (who ? ` — ${who}` : '') + ' | SGT HydroEdge';
}

/**
 * The covering note as the SENDER sees it: plain text, blank line between
 * paragraphs, `**bold**` where a word should stand out. The HTML that
 * reaches the dealer is derived from it by textToHtml() at send time, so
 * there is one place to edit the letter.
 */
export function defaultAgreementMessageText(ctx: AgreementMessageContext): string {
  const dealer = String(ctx.dealerName ?? '').trim();
  const code = String(ctx.dealerCode ?? '').trim();
  const distributor = String(ctx.distributorName ?? '').trim();
  const signature = String(ctx.senderName ?? '').trim();

  return [
    `Dear ${dealer || 'Sir/Madam'},`,
    ``,
    `We are pleased to confirm your appointment as an authorised GreenX™ Dealer` +
    (distributor ? ` under ${distributor}` : '') +
    (code ? `, with Dealer Code **${code}**` : '') + `.`,
    ``,
    `Please find attached the Tripartite Dealer Appointment Agreement **${ctx.erpName}**, ` +
    `already executed on behalf of SGT HydroEdge` +
    (distributor ? ` and ${distributor}` : '') + `. ` +
    `Kindly review it, sign and stamp the space provided for the Dealer, and return a ` +
    `scanned copy to us. Your Dealer Code is active from the Effective Date shown on the ` +
    `agreement, and should be quoted on every CRM entry and all correspondence with SGT.`,
    ``,
    `Do write back if any detail on the agreement needs correcting before you sign — it is ` +
    `far easier to fix now than after execution.`,
    ``,
    `We look forward to a long and successful association.`,
    ``,
    `Warm regards,`,
    ...(signature ? [signature] : []),
    `SGT HydroEdge Private Limited`,
  ].join('\n');
}

/** The same letter, as HTML. */
export function defaultAgreementMessage(ctx: AgreementMessageContext): string {
  return textToHtml(defaultAgreementMessageText(ctx));
}

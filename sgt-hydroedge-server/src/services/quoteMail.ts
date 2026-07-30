// =====================================================================
// services/quoteMail.ts — sending a quotation to the customer.
//
// Two providers behind one interface, chosen by QUOTE_MAIL_PROVIDER,
// mirroring the StorageProvider pattern already used for the vault:
//
//   erpnext (default) — frappe.core.doctype.communication.email.make.
//                       ERPNext attaches the print format itself and logs
//                       the sent copy as a Communication AGAINST the
//                       Quotation. Six months later "what did we send
//                       them" is answerable from the document.
//                       Needs an Email Account with outgoing enabled.
//
//   n8n              — POST the PDF and recipients to a webhook and let
//                       n8n send. Use when you would rather not put SMTP
//                       credentials in ERPNext, or when the mail needs
//                       sequencing, tracking or a different sending
//                       domain — the things n8n is actually for.
//
// The n8n path still writes a Communication back to ERPNext afterwards,
// so the audit trail on the quotation survives either way. That write is
// best-effort: failing to log must not make a sent email look unsent.
// =====================================================================

import { erpFetch } from './erpLimit.js';
import {
  fetchQuotationPdf, quotePrintFormat, fetchAttachmentBytes, guessContentType,
  type QuotationAttachment,
} from './erpQuotation.js';

const BASE = process.env.ERPNEXT_URL?.replace(/\/+$/, '') ?? '';
const KEY = process.env.ERPNEXT_API_KEY ?? '';
const SECRET = process.env.ERPNEXT_API_SECRET ?? '';
const PROVIDER = (process.env.QUOTE_MAIL_PROVIDER ?? 'erpnext').toLowerCase();
const N8N_URL = process.env.QUOTE_MAIL_N8N_URL ?? '';
const N8N_TOKEN = process.env.QUOTE_MAIL_N8N_TOKEN ?? '';

export interface SendQuoteInput {
  erpName: string;
  to: string[];
  cc: string[];
  subject: string;
  message: string;
  /**
   * Extra documents to send with the quotation PDF — a spec sheet, a
   * drawing. Already attached to the Quotation in ERPNext; this is the
   * subset the sender chose to include on THIS mail.
   */
  attachments?: QuotationAttachment[];
}

export interface SendQuoteResult {
  provider: 'erpnext' | 'n8n';
  to: string[];
  cc: string[];
  /** Best-effort: the n8n path may send successfully but fail to log. */
  loggedToErp: boolean;
  note?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v: string) => EMAIL.test(String(v ?? '').trim());

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

/**
 * Log a Communication against the Quotation WITHOUT sending. Used by the
 * n8n path so the document still shows what went out.
 */
async function logCommunication(input: SendQuoteInput, via: string): Promise<boolean> {
  try {
    const res = await erpFetch(`${BASE}/api/resource/Communication`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        doctype: 'Communication',
        communication_type: 'Communication',
        communication_medium: 'Email',
        sent_or_received: 'Sent',
        subject: input.subject,
        content: `${input.message}<hr><p><em>Sent via ${via}.</em></p>`,
        recipients: input.to.join(', '),
        cc: input.cc.join(', '),
        reference_doctype: 'Quotation',
        reference_name: input.erpName,
        status: 'Linked',
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendViaErpNext(input: SendQuoteInput): Promise<SendQuoteResult> {
  // Frappe attaches the document PDF ONLY when print_format (or print_html)
  // is truthy. Omit it and the mail goes out with body text and no
  // attachment, silently. So resolve one, and refuse to send without it
  // rather than deliver a quotation email containing no quotation.
  const printFormat = await quotePrintFormat();
  if (!printFormat) {
    throw new Error(
      'No print format could be resolved for Quotation, so the PDF would not be ' +
      'attached. Set ERP_QUOTE_PRINT_FORMAT, or enable a Print Format on the ' +
      'Quotation doctype in ERPNext.');
  }

  const res = await erpFetch(
    `${BASE}/api/method/frappe.core.doctype.communication.email.make`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        doctype: 'Quotation',
        name: input.erpName,
        subject: input.subject,
        content: input.message,
        recipients: input.to.join(', '),
        cc: input.cc.join(', '),
        send_email: 1,
        // Always sent: this is what makes Frappe render and attach the PDF,
        // and it is the same format the Preview button shows.
        print_format: printFormat,
        print_letterhead: 1,
        send_me_a_copy: 0,
        // File doctype NAMES, not URLs — that is what email.make resolves.
        // Frappe attaches these on top of the rendered print format.
        ...(input.attachments?.length
          ? { attachments: input.attachments.map(a => a.name) }
          : {}),
      }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    const why = frappeError(text);
    // The most common cause by far, and the message Frappe gives is opaque.
    const hint = /outgoing|smtp|email account/i.test(why)
      ? ' — no outgoing Email Account is configured in ERPNext. Enable one, ' +
        'or set QUOTE_MAIL_PROVIDER=n8n.'
      : '';
    throw new Error(`ERPNext could not send: ${why.slice(0, 300)}${hint}`);
  }
  return {
    provider: 'erpnext',
    to: input.to,
    cc: input.cc,
    loggedToErp: true,
  };
}

async function sendViaN8n(input: SendQuoteInput): Promise<SendQuoteResult> {
  if (!N8N_URL) {
    throw new Error(
      'QUOTE_MAIL_PROVIDER is n8n but QUOTE_MAIL_N8N_URL is not set.');
  }
  // The PDF is fetched here rather than in n8n: n8n would need an ERPNext
  // credential to render it, and handing one out defeats the point. The
  // chosen attachments come the same way, and for the same reason.
  const pdf = await fetchQuotationPdf(input.erpName);
  const extras: { filename: string; contentType: string; base64: string }[] = [];
  for (const a of input.attachments ?? []) {
    try {
      const bytes = await fetchAttachmentBytes(a.fileUrl);
      extras.push({
        filename: a.fileName,
        contentType: guessContentType(a.fileName),
        base64: Buffer.from(bytes).toString('base64'),
      });
    } catch {
      // One unreadable attachment must not block a quotation going out.
      // The caller is told which made it, below.
    }
  }
  const res = await fetch(N8N_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(N8N_TOKEN ? { Authorization: `Bearer ${N8N_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      quotation: input.erpName,
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
      // turn this into binary before a mail node will attach it — a mail
      // node asked for an attachment reads binary off the item, never a
      // string in the JSON.
      attachment: {
        filename: `${input.erpName}.pdf`,
        contentType: 'application/pdf',
        base64: Buffer.from(pdf).toString('base64'),
      },
      // Same encoding as `attachment`, and the same n8n caveat applies:
      // each needs a "Convert to File" node before a mail node will take it.
      attachments: extras,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `n8n webhook returned ${res.status}: ${(await res.text()).slice(0, 250)}`);
  }
  const logged = await logCommunication(input, 'n8n');
  const missed = (input.attachments?.length ?? 0) - extras.length;
  const notes = [
    logged ? null : 'the copy could not be logged against the quotation in ERPNext',
    missed > 0 ? `${missed} attachment(s) could not be read and were not sent` : null,
  ].filter(Boolean);
  return {
    provider: 'n8n',
    to: input.to,
    cc: input.cc,
    loggedToErp: logged,
    note: notes.length ? `Sent, but ${notes.join('; ')}.` : undefined,
  };
}

export async function sendQuotation(input: SendQuoteInput): Promise<SendQuoteResult> {
  if (!input.to.length) throw new Error('At least one recipient is required');
  return PROVIDER === 'n8n' ? sendViaN8n(input) : sendViaErpNext(input);
}

// ---------------------------------------------------------------------
// The covering note.
//
// The old default was three flat lines that read like a system had
// generated them, because one had. This is the letter a salesperson
// would write: thanks them for the enquiry, says what is attached, and
// asks for the business.
//
// It is a STARTING POINT, not a template the sender cannot change — the
// send dialog loads it into an editable field. Both the CRM and the
// portal use this one function so a dealer's covering note reads the
// same as SGT's.
// ---------------------------------------------------------------------

export interface QuoteMessageContext {
  erpName: string;
  customerName?: string | null;
  /** The partner raising it, when one did. Signs the note. */
  partnerName?: string | null;
  /** Extra documents named in the body, so the reader looks for them. */
  attachmentNames?: string[];
}

export function defaultQuoteSubject(ctx: QuoteMessageContext): string {
  return `Quotation ${ctx.erpName} from SGT HydroEdge`;
}

/**
 * The covering note as the SENDER sees it: plain text, blank line between
 * paragraphs, `**bold**` where a word should stand out.
 *
 * This is the authoritative wording. The HTML that reaches the customer is
 * derived from it by textToHtml() at send time, so there is one place to
 * edit the letter and no chance of the two versions drifting apart.
 */
export function defaultQuoteMessageText(ctx: QuoteMessageContext): string {
  const who = String(ctx.customerName ?? '').trim();
  const extras = (ctx.attachmentNames ?? []).filter(Boolean);
  const signature = String(ctx.partnerName ?? '').trim();

  return [
    `Dear ${who || 'Sir/Madam'},`,
    ``,
    `Thank you for your enquiry and for the opportunity to quote.`,
    ``,
    `Please find attached our quotation **${ctx.erpName}** for your kind consideration. ` +
    `It covers the equipment, the commercial terms and the scope of supply in full.` +
    (extras.length ? ` Also attached: ${extras.join(', ')}.` : ''),
    ``,
    `We look forward to being associated with you, and to serving you to your complete ` +
    `satisfaction. Should you need any clarification on the specification, the pricing ` +
    `or the delivery schedule, please do write back or call — we would be glad to help.`,
    ``,
    `We hope to receive your valued order.`,
    ``,
    `Warm regards,`,
    ...(signature ? [signature] : []),
    `SGT HydroEdge Private Limited`,
  ].join('\n');
}

/**
 * Plain text -> the HTML an email client renders.
 *
 * The sender writes and reads plain text; the customer receives HTML.
 * Rules, deliberately few enough to be predictable:
 *
 *   blank line   -> new paragraph
 *   single break -> <br> within the paragraph
 *   **bold**     -> <strong>
 *
 * Everything is escaped FIRST, so an ampersand in a customer's name, or a
 * stray "<" someone typed, cannot break the mail or inject markup.
 */
export function textToHtml(text: string): string {
  const escaped = String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const bolded = escaped.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

  return bolded
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => `<p>${block.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** The same letter, as HTML. Kept for callers that want it ready-made. */
export function defaultQuoteMessage(ctx: QuoteMessageContext): string {
  return textToHtml(defaultQuoteMessageText(ctx));
}

export const mailProvider = (): 'erpnext' | 'n8n' =>
  PROVIDER === 'n8n' ? 'n8n' : 'erpnext';

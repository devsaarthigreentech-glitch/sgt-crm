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
import { fetchQuotationPdf, quotePrintFormat } from './erpQuotation.js';

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
  // credential to render it, and handing one out defeats the point.
  const pdf = await fetchQuotationPdf(input.erpName);
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
    }),
  });
  if (!res.ok) {
    throw new Error(
      `n8n webhook returned ${res.status}: ${(await res.text()).slice(0, 250)}`);
  }
  const logged = await logCommunication(input, 'n8n');
  return {
    provider: 'n8n',
    to: input.to,
    cc: input.cc,
    loggedToErp: logged,
    note: logged
      ? undefined
      : 'Sent, but the copy could not be logged against the quotation in ERPNext.',
  };
}

export async function sendQuotation(input: SendQuoteInput): Promise<SendQuoteResult> {
  if (!input.to.length) throw new Error('At least one recipient is required');
  return PROVIDER === 'n8n' ? sendViaN8n(input) : sendViaErpNext(input);
}

export const mailProvider = (): 'erpnext' | 'n8n' =>
  PROVIDER === 'n8n' ? 'n8n' : 'erpnext';

// =====================================================================
// services/emailEvents.ts
// Ingest one caught email from the CC'd mailbox and record it.
//
// Direction: outbound if the sender is one of OUR domains (a rep sent it),
// inbound otherwise (the prospect replied). That flips which addresses we
// match: outbound → the To/CC recipients; inbound → the From sender.
//
// Status only ever moves FORWARD: Not contacted → Contacted → Replied.
// An outbound email never knocks a Green/Replied contact back to Contacted.
// =====================================================================

import { pool } from '../db/pool';

const s = (v: unknown): string => (v == null ? '' : String(v).trim());

// Domains that count as "us". Comma-separated env, defaults to the one domain.
const OUR_DOMAINS = (process.env.OUTREACH_OWN_DOMAINS || 'sgthydroedge.com')
  .split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);

// Pull bare email addresses out of a "Name <a@b.com>, c@d.com" string.
export function extractAddresses(raw: unknown): string[] {
  const text = s(raw);
  if (!text) return [];
  const out: string[] = [];
  const re = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[0].toLowerCase());
  return Array.from(new Set(out));
}

const isOurs = (addr: string) => {
  const at = addr.lastIndexOf('@');
  if (at < 0) return false;
  return OUR_DOMAINS.includes(addr.slice(at + 1).toLowerCase());
};

// Forward-only rank. A nudge only applies if it moves the contact UP this list.
const RANK: Record<string, number> = {
  '': 0, 'Not contacted': 1, 'Contacted': 2, 'Replied': 3,
};
// Green / Not now / Do not contact are off this ladder — never auto-changed.
const LADDER = new Set(['', 'Not contacted', 'Contacted', 'Replied']);

export type EmailEventInput = {
  messageId?: string;
  threadId?: string;
  from?: string;
  to?: string;
  cc?: string;
  subject?: string;
  date?: string;          // the email's Date header (ISO or RFC2822)
};

export type EmailEventResult = {
  ok: boolean;
  direction: 'outbound' | 'inbound';
  matched: number;
  unmatched: number;
  events: number;
  addresses: { address: string; matched: boolean; contactId: number | null; statusMoved: string }[];
};

export async function ingestEmailEvent(
  input: EmailEventInput,
): Promise<EmailEventResult> {
  const messageId = s(input.messageId);
  if (!messageId) throw new Error('messageId is required');

  const from = extractAddresses(input.from)[0] ?? '';
  const toList = extractAddresses(input.to);
  const ccList = extractAddresses(input.cc);
  const subject = s(input.subject);
  const threadId = s(input.threadId);
  const occurredAt = parseDate(input.date);

  // Direction from the sender.
  const direction: 'outbound' | 'inbound' = from && isOurs(from) ? 'outbound' : 'inbound';

  // Which addresses do we try to match?
  //   outbound  → the recipients (To + CC), minus our own mailbox(es)
  //   inbound   → the sender
  const targets = direction === 'outbound'
    ? [...toList, ...ccList].filter((a) => !isOurs(a))
    : (from ? [from] : []);

  const nudgeTo = direction === 'outbound' ? 'Contacted' : 'Replied';

  const client = await pool.connect();
  const addresses: EmailEventResult['addresses'] = [];
  let matched = 0, unmatched = 0, events = 0;

  try {
    await client.query('begin');

    for (const address of dedupe(targets)) {
      // find the contact by primary or secondary email
      const { rows } = await client.query(
        `select id, status from outreach_service.contacts
          where deleted_at is null and (lower(email) = $1 or lower(email2) = $1)
          order by (lower(email) = $1) desc
          limit 1`,
        [address],
      );
      const contact = rows[0];
      let statusMoved = '';

      if (contact) {
        matched++;
        // stamp last touch always
        // forward-only status nudge
        const cur = s(contact.status);
        const canMove = LADDER.has(cur) && (RANK[nudgeTo] ?? 0) > (RANK[cur] ?? 0);
        if (canMove) statusMoved = nudgeTo;

        await client.query(
          `update outreach_service.contacts set
             last_touch_at  = greatest(coalesce(last_touch_at, 'epoch'::timestamptz), coalesce($2, now())),
             last_thread_id = coalesce(nullif($3,''), last_thread_id),
             last_direction = $4,
             status         = case when $5 <> '' then $5 else status end,
             updated_at     = now()
           where id = $1`,
          [contact.id, occurredAt, threadId, direction, statusMoved],
        );
      } else {
        unmatched++;
      }

      // log the event (idempotent on message_id + address + direction)
      const ins = await client.query(
        `insert into outreach_service.email_events
           (message_id, thread_id, direction, address, from_addr, to_addrs, cc_addrs,
            subject, occurred_at, matched, contact_id, status_moved)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (message_id, address, direction) do nothing
         returning id`,
        [messageId, threadId, direction, address, from, toList.join(', '), ccList.join(', '),
         subject, occurredAt, !!contact, contact?.id ?? null, statusMoved],
      );
      if ((ins.rowCount ?? 0) > 0) events++;

      addresses.push({ address, matched: !!contact, contactId: contact?.id ?? null, statusMoved });
    }

    // If nothing matched at all, still log one unmatched row so the review
    // list shows the message (address = the first target, or the sender).
    if (targets.length === 0) {
      await client.query(
        `insert into outreach_service.email_events
           (message_id, thread_id, direction, address, from_addr, to_addrs, cc_addrs, subject, occurred_at, matched)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,false)
         on conflict (message_id, address, direction) do nothing`,
        [messageId, threadId, direction, from || '(none)', from, toList.join(', '), ccList.join(', '), subject, occurredAt],
      );
    }

    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }

  return { ok: true, direction, matched, unmatched, events, addresses };
}

// Unmatched review list for the desk.
export async function unmatchedEvents(limit = 100) {
  const { rows } = await pool.query(
    `select id, direction, address, from_addr, to_addrs, cc_addrs, subject, occurred_at, thread_id, created_at
       from outreach_service.email_events
      where matched = false
      order by coalesce(occurred_at, created_at) desc
      limit $1`,
    [limit],
  );
  return rows;
}

function dedupe(xs: string[]): string[] { return Array.from(new Set(xs)); }

function parseDate(v: unknown): Date | null {
  const t = s(v);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Email activity for one contact — the read-only auto-list shown beneath the
// notes box in the contact drawer. Newest first.
export async function eventsForContact(contactId: number, limit = 50) {
  const { rows } = await pool.query(
    `select id, direction, address, from_addr, subject, occurred_at, thread_id, status_moved, created_at
       from outreach_service.email_events
      where contact_id = $1
      order by coalesce(occurred_at, created_at) desc
      limit $2`,
    [contactId, limit],
  );
  return rows;
}
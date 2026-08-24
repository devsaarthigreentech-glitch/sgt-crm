// =====================================================================
// routes/timesheet.routes.ts — the daily timesheet, for every SGT login.
//
// WHO SEES WHAT
// -------------
// Everyone internal files their own entries and reads their own back.
// Only a director may read anyone else's: GET /timesheets?scope=team.
// A non-director asking for team scope is not an error — it is silently
// narrowed to their own entries, because the honest answer to "show me
// the team" for someone who is not the director is "here is you".
//
// Nobody edits anyone else's entry, director included. See the note in
// domain/timesheet.ts.
//
// External roles (distributor, dealer) never reach this file at all:
// auth/policy.ts denies them everything outside /api/v1/portal, and this
// prefix is deliberately not on that list. Partners do not file SGT
// timesheets, so there is nothing to open up.
// =====================================================================

import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/guard.js';
import {
  BACKDATE_DAYS,
  EDIT_GRACE_DAYS,
  checkFilingDate,
  isValidISODate,
  shiftDate,
  todayIST,
} from '../domain/timesheet.js';
import {
  createEntry,
  deleteEntry,
  listEntries,
  teamSummary,
  updateEntry,
} from '../services/timesheet.js';

/** app_user.id, as the login route puts it in the token. */
const callerId = (req: FastifyRequest): string => String((req.user as any).sub);
const callerRole = (req: FastifyRequest): string => String((req.user as any).role);

/**
 * Long enough for a real day's account, short enough that a paste of an
 * entire email thread is rejected rather than stored.
 */
const LONG_TEXT = 4000;

const Body = z.object({
  entryDate: z.string().optional(),
  workDone: z.string().trim().min(1, 'Work done is required').max(LONG_TEXT),
  problemsFaced: z.string().trim().max(LONG_TEXT).default(''),
  additionalNotes: z.string().trim().max(LONG_TEXT).default(''),
});

const PatchBody = Body.omit({ entryDate: true });

/**
 * The id column is bigint, so a non-numeric :id makes Postgres raise
 * "invalid input syntax" and the global handler turn it into a 500. It is
 * a 404 — there is no such entry — so it is filtered before it reaches SQL.
 */
const isEntryId = (s: string): boolean => /^\d{1,19}$/.test(s);

/** Zod's flatten() shape, reduced to the { field: message } the forms want. */
function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export async function timesheetRoutes(app: FastifyInstance) {
  // Every route here is staff-only and self-scoped, so one guard covers
  // the file. Anything added below inherits it.
  app.addHook('preHandler', requireAuth);

  /**
   * The rules the form needs in order to disable the right controls —
   * served rather than duplicated in the frontend, so the two cannot
   * drift into disagreeing about which dates are allowed.
   */
  app.get('/timesheets/config', async (req, reply) => {
    const today = todayIST();
    return reply.send({
      data: {
        today,
        earliestDate: shiftDate(today, -BACKDATE_DAYS),
        backdateDays: BACKDATE_DAYS,
        editGraceDays: EDIT_GRACE_DAYS,
        canViewTeam: callerRole(req) === 'director',
      },
    });
  });

  /**
   * GET /timesheets?scope=mine|team&userId=&from=&to=&limit=
   * Defaults to the caller's own entries for the last 30 days.
   */
  app.get('/timesheets', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const isDirector = callerRole(req) === 'director';
    const me = callerId(req);

    const today = todayIST();
    const from = q.from && isValidISODate(q.from) ? q.from : shiftDate(today, -30);
    const to = q.to && isValidISODate(q.to) ? q.to : today;
    if (from > to) {
      return reply.code(400).send({
        error: { code: 'bad_range', message: '"from" is after "to"' },
      });
    }

    // Team scope is a director privilege. For anyone else it collapses to
    // their own entries rather than 403 — the screen offers the toggle to
    // one role only, so a request for it from anyone else is stale UI, not
    // an attack worth an error page.
    const wantsTeam = q.scope === 'team' && isDirector;
    const userId = wantsTeam ? (q.userId || undefined) : me;

    const limit = q.limit ? Number(q.limit) : undefined;

    const data = await listEntries(
      { userId, from, to, limit: Number.isFinite(limit) ? limit : undefined },
      me,
    );
    return reply.send({ data, meta: { from, to, scope: wantsTeam ? 'team' : 'mine' } });
  });

  /** GET /timesheets/summary?from=&to= — director only. Who has filed, who has not. */
  app.get('/timesheets/summary', async (req, reply) => {
    if (callerRole(req) !== 'director') {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Not allowed' } });
    }
    const q = req.query as Record<string, string | undefined>;
    const today = todayIST();
    const from = q.from && isValidISODate(q.from) ? q.from : shiftDate(today, -6);
    const to = q.to && isValidISODate(q.to) ? q.to : today;
    if (from > to) {
      return reply.code(400).send({
        error: { code: 'bad_range', message: '"from" is after "to"' },
      });
    }
    return reply.send({ data: await teamSummary(from, to), meta: { from, to } });
  });

  /** POST /timesheets — file an entry against a day. Always for the caller. */
  app.post('/timesheets', async (req, reply) => {
    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(422).send({
        error: { code: 'validation_failed', message: 'Check the highlighted fields' },
        fields: fieldErrors(parsed.error),
      });
    }
    const b = parsed.data;
    const entryDate = b.entryDate || todayIST();

    const check = checkFilingDate(entryDate);
    if (!check.ok) {
      return reply.code(422).send({
        error: { code: 'bad_date', message: check.message },
        fields: { entryDate: check.message },
      });
    }

    const entry = await createEntry({
      userId: callerId(req),
      entryDate,
      workDone: b.workDone,
      problemsFaced: b.problemsFaced,
      additionalNotes: b.additionalNotes,
    });
    return reply.code(201).send({ data: entry });
  });

  /** PATCH /timesheets/:id — author only, and only while the entry is open. */
  app.patch('/timesheets/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!isEntryId(id)) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'No such entry of yours' },
      });
    }
    const parsed = PatchBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(422).send({
        error: { code: 'validation_failed', message: 'Check the highlighted fields' },
        fields: fieldErrors(parsed.error),
      });
    }

    const r = await updateEntry({ id, userId: callerId(req), ...parsed.data });
    if (r.ok) return reply.send({ data: r.entry });

    if (r.reason === 'locked') {
      return reply.code(409).send({
        error: {
          code: 'entry_locked',
          message: `This entry closed for edits after ${EDIT_GRACE_DAYS === 1 ? 'the next day' : `${EDIT_GRACE_DAYS} days`}. File a new entry instead.`,
        },
      });
    }
    return reply.code(404).send({
      error: { code: 'not_found', message: 'No such entry of yours' },
    });
  });

  /** DELETE /timesheets/:id — same rule as PATCH. */
  app.delete('/timesheets/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!isEntryId(id)) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'No such entry of yours' },
      });
    }
    const r = await deleteEntry(id, callerId(req));
    if (r.ok) return reply.code(204).send();

    if (r.reason === 'locked') {
      return reply.code(409).send({
        error: { code: 'entry_locked', message: 'This entry is closed and can no longer be deleted' },
      });
    }
    return reply.code(404).send({
      error: { code: 'not_found', message: 'No such entry of yours' },
    });
  });
}
export default timesheetRoutes;

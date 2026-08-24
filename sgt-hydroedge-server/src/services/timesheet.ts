// =====================================================================
// services/timesheet.ts
// Reads and writes for lead_service.timesheet_entry.
//
// Ownership is enforced here rather than by the caller checking a row it
// fetched first. update() and remove() take the author's id and refuse to
// match a row belonging to anyone else, so a guessed id returns "not
// found" instead of someone else's day.
//
// The edit window (domain/timesheet.ts) is checked in the same place, so
// there is no second code path that can skip it.
// =====================================================================

import { query } from '../db/pool.js';
import { isEditable, todayIST } from '../domain/timesheet.js';
// Only SGT staff file timesheets, so only SGT staff belong in the team
// summary. Read from the same set auth/policy.ts calls internal — adding a
// staff role there adds it here too, rather than quietly leaving someone out.
import { INTERNAL_ROLES } from '../auth/policy.js';

const INTERNAL_ROLE_LIST = [...INTERNAL_ROLES];

export interface TimesheetEntry {
  id: string;
  userId: string;
  userName: string;
  entryDate: string;          // YYYY-MM-DD
  workDone: string;
  problemsFaced: string;
  additionalNotes: string;
  createdAt: string;
  editedAt: string | null;
  /** Whether the CALLER may still change it — author, inside the window. */
  canEdit: boolean;
}

/**
 * Postgres hands back a Date for a `date` column, built at local midnight.
 * Formatting it in UTC returns the day that was stored; using
 * toISOString() on a machine behind UTC would return the day before.
 */
const day = (v: unknown): string =>
  v instanceof Date
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(v)
    : String(v).slice(0, 10);

const SELECT = /* sql */ `
  select e.id, e.user_id, u.name as user_name, e.entry_date,
         e.work_done, e.problems_faced, e.additional_notes,
         e.created_at, e.edited_at
    from lead_service.timesheet_entry e
    join lead_service.app_user u on u.id = e.user_id
`;

function toEntry(row: any, viewerId: string | null): TimesheetEntry {
  const entryDate = day(row.entry_date);
  return {
    id: String(row.id),
    userId: String(row.user_id),
    userName: row.user_name,
    entryDate,
    workDone: row.work_done,
    problemsFaced: row.problems_faced ?? '',
    additionalNotes: row.additional_notes ?? '',
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
    canEdit:
      viewerId !== null &&
      String(row.user_id) === viewerId &&
      isEditable(entryDate),
  };
}

export interface ListFilter {
  /** Restrict to one author. Omit for every author (the team view). */
  userId?: string;
  from?: string;              // YYYY-MM-DD, inclusive
  to?: string;                // YYYY-MM-DD, inclusive
  limit?: number;
}

export async function listEntries(
  filter: ListFilter,
  viewerId: string | null,
): Promise<TimesheetEntry[]> {
  const where: string[] = [];
  const params: any[] = [];

  if (filter.userId) { params.push(filter.userId); where.push(`e.user_id = $${params.length}`); }
  if (filter.from)   { params.push(filter.from);   where.push(`e.entry_date >= $${params.length}`); }
  if (filter.to)     { params.push(filter.to);     where.push(`e.entry_date <= $${params.length}`); }

  params.push(Math.min(Math.max(filter.limit ?? 200, 1), 500));

  const sql = `${SELECT}
    ${where.length ? `where ${where.join(' and ')}` : ''}
    order by e.entry_date desc, e.id desc
    limit $${params.length}`;

  const { rows } = await query(sql, params);
  return rows.map(r => toEntry(r, viewerId));
}

export interface CreateInput {
  userId: string;
  entryDate: string;
  workDone: string;
  problemsFaced: string;
  additionalNotes: string;
}

export async function createEntry(input: CreateInput): Promise<TimesheetEntry> {
  const { rows } = await query(
    /* sql */ `
      insert into lead_service.timesheet_entry
        (user_id, entry_date, work_done, problems_faced, additional_notes)
      values ($1, $2, $3, $4, $5)
      returning id`,
    [input.userId, input.entryDate, input.workDone, input.problemsFaced, input.additionalNotes],
  );
  const created = await query(`${SELECT} where e.id = $1`, [rows[0].id]);
  return toEntry(created.rows[0], input.userId);
}

export interface UpdateInput {
  id: string;
  userId: string;
  workDone: string;
  problemsFaced: string;
  additionalNotes: string;
}

export type WriteFailure = { ok: false; reason: 'not_found' | 'locked' };
export type UpdateResult = { ok: true; entry: TimesheetEntry } | WriteFailure;
export type DeleteResult = { ok: true } | WriteFailure;

/**
 * Author-only, inside the window.
 *
 * "not yours" and "too late" are told apart on purpose — they need
 * different messages — and neither discloses anything about an entry the
 * caller could not already see.
 */
export async function updateEntry(input: UpdateInput): Promise<UpdateResult> {
  const owned = await query(
    `select entry_date from lead_service.timesheet_entry where id = $1 and user_id = $2`,
    [input.id, input.userId],
  );
  if (owned.rows.length === 0) return { ok: false, reason: 'not_found' };
  if (!isEditable(day(owned.rows[0].entry_date))) return { ok: false, reason: 'locked' };

  await query(
    /* sql */ `
      update lead_service.timesheet_entry
         set work_done = $3, problems_faced = $4, additional_notes = $5,
             updated_at = now(), edited_at = now()
       where id = $1 and user_id = $2`,
    [input.id, input.userId, input.workDone, input.problemsFaced, input.additionalNotes],
  );

  const fresh = await query(`${SELECT} where e.id = $1`, [input.id]);
  return { ok: true, entry: toEntry(fresh.rows[0], input.userId) };
}

export async function deleteEntry(id: string, userId: string): Promise<DeleteResult> {
  const owned = await query(
    `select entry_date from lead_service.timesheet_entry where id = $1 and user_id = $2`,
    [id, userId],
  );
  if (owned.rows.length === 0) return { ok: false, reason: 'not_found' };
  if (!isEditable(day(owned.rows[0].entry_date))) return { ok: false, reason: 'locked' };

  await query(`delete from lead_service.timesheet_entry where id = $1 and user_id = $2`, [id, userId]);
  return { ok: true };
}

export interface UserSummary {
  userId: string;
  userName: string;
  role: string;
  entries: number;
  daysFiled: number;
  lastEntryDate: string | null;
  filedToday: boolean;
}

/**
 * Who filed what over a range — the director's compliance view.
 *
 * LEFT JOIN out of app_user, not out of the entries, so a staff member who
 * filed nothing at all still appears with zeroes. Those are precisely the
 * rows this view exists to surface; an inner join would hide them.
 */
export async function teamSummary(from: string, to: string): Promise<UserSummary[]> {
  const today = todayIST();
  const { rows } = await query(
    /* sql */ `
      select u.id, u.name, u.role,
             count(e.id)::int                  as entries,
             count(distinct e.entry_date)::int as days_filed,
             -- Both of these describe the person NOW, so they deliberately
             -- ignore [from, to]. Reading them off the joined rows would
             -- make "last filed" mean "last filed inside the window" and
             -- report anyone whose range excludes today as never having
             -- filed at all.
             (select max(t.entry_date) from lead_service.timesheet_entry t
               where t.user_id = u.id)                     as last_entry_date,
             exists (select 1 from lead_service.timesheet_entry t
                      where t.user_id = u.id and t.entry_date = $3) as filed_today
        from lead_service.app_user u
        left join lead_service.timesheet_entry e
               on e.user_id = u.id
              and e.entry_date between $1 and $2
       where u.active = true
         and u.role = any($4::text[])
       group by u.id, u.name, u.role
       order by u.name asc`,
    [from, to, today, INTERNAL_ROLE_LIST],
  );
  return rows.map(r => ({
    userId: String(r.id),
    userName: r.name,
    role: r.role,
    entries: r.entries,
    daysFiled: r.days_filed,
    lastEntryDate: r.last_entry_date ? day(r.last_entry_date) : null,
    filedToday: r.filed_today === true,
  }));
}

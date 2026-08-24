// =====================================================================
// domain/timesheet.ts — what day it is, and how long an entry stays open.
//
// WHY IST IS HARDCODED
// --------------------
// The server runs UTC on the droplet. Everyone filing a timesheet is in
// India. Between 00:00 and 05:30 IST the two disagree about what day it
// is, so `new Date().toISOString().slice(0,10)` files a late-evening
// entry against yesterday. A timesheet that silently mislabels the day is
// worse than no timesheet, so the working day is defined in Asia/Kolkata
// and nowhere else. The browser is not trusted for this either — it sends
// a date, and the bounds below are what decide whether it is acceptable.
//
// THE WINDOW
// ----------
// An entry may be filed for today or up to BACKDATE_DAYS earlier — enough
// to cover a Monday catching up on Friday and the weekend, not enough to
// invent a fortnight. Never for a future date.
//
// It stays editable by its author until the end of the day after the day
// it covers. After that it is a record, not a draft. The director does not
// get an override: an entry that anyone can rewrite later is not evidence
// of anything, and "the director changed my timesheet" is a conversation
// nobody needs.
// =====================================================================

export const TZ = 'Asia/Kolkata';

/** How far back an entry may be filed, in days before today. */
export const BACKDATE_DAYS = 7;

/** How long after entry_date the author may still edit or delete it. */
export const EDIT_GRACE_DAYS = 1;

/** Today in IST, as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is the whole reason for the locale.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** YYYY-MM-DD shifted by whole days. Pure string/UTC arithmetic — no DST in IST. */
export function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a well-formed calendar date, so "2026-02-31" is rejected. */
export function isValidISODate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export type DateCheck = { ok: true } | { ok: false; message: string };

/** Is `entryDate` inside the filing window? */
export function checkFilingDate(entryDate: string, now: Date = new Date()): DateCheck {
  if (!isValidISODate(entryDate)) {
    return { ok: false, message: 'Date must be a real date in YYYY-MM-DD form' };
  }
  const today = todayIST(now);
  if (entryDate > today) {
    return { ok: false, message: 'A timesheet cannot be filed for a future date' };
  }
  const earliest = shiftDate(today, -BACKDATE_DAYS);
  if (entryDate < earliest) {
    return {
      ok: false,
      message: `A timesheet can be backdated at most ${BACKDATE_DAYS} days (not before ${earliest})`,
    };
  }
  return { ok: true };
}

/** Last day on which an entry covering `entryDate` may still be changed. */
export function editableUntil(entryDate: string): string {
  return shiftDate(entryDate, EDIT_GRACE_DAYS);
}

/** May the author still edit or delete an entry covering `entryDate`? */
export function isEditable(entryDate: string, now: Date = new Date()): boolean {
  return todayIST(now) <= editableUntil(entryDate);
}

// =====================================================================
// domain/customerClaim.ts — which partner may approach which customer.
//
// The rule, in one line: a customer belongs to the org that claimed
// them, and to that org's subtree. Everyone else is turned away.
//
// "Subtree", not "equals", and the direction matters. Scoping here uses
// the same quote_service.visible_org_ids() the rest of the portal uses,
// which walks strictly DOWNWARDS. So:
//
//   - a dealer's own claim              -> the dealer may proceed
//   - a claim held by their distributor -> the DEALER IS BLOCKED
//   - a claim held by one of their own
//     sub-dealers                       -> the distributor may proceed
//
// The middle case is deliberate and is the one worth being sure about.
// A distributor sits above its dealers and can already see everything
// they do; if the distributor has taken an account directly, a dealer
// underneath should not be quoting it in parallel. The message tells
// them to contact the distributor, which is exactly the conversation
// that needs to happen.
//
// The message never names the holding partner. A dealer learning that
// "Acme Power already has this account" is a Clause 17 problem and a
// competitive one — it maps out a rival's customer book one search at a
// time. The distributor can see both sides and can arbitrate; that is
// why they are the named escalation route.
// =====================================================================

import { query } from '../db/pool.js';

/**
 * Shown verbatim to a partner who tries to take a customer that is
 * already someone else's. Deliberately says nothing about who holds it.
 */
export const CLAIM_BLOCKED_MESSAGE =
  'This customer already exists and is linked to another dealer. '
  + 'Please contact your distributor for resolution or further details.';

/** The error code the frontend keys on to place the message. */
export const CLAIM_BLOCKED_CODE = 'customer_claimed';

export interface ClaimInput {
  erpCustomer: string;
  orgId: number;
  customerName?: string | null;
  customerGstin?: string | null;
  claimedBy?: string | null;
  claimedByName?: string | null;
  via?: 'portal' | 'crm';
}

/**
 * May this org approach this customer?
 *
 * True when the customer is unclaimed, or claimed by the caller's org or
 * one beneath it. False only when someone outside that subtree holds it.
 *
 * Unclaimed is allowed on purpose: ERPNext's master predates this table
 * and holds customers nobody ever quoted. Those are open, and the first
 * partner to take one claims it.
 */
export async function mayApproach(
  erpCustomer: string, callerOrgId: number,
): Promise<boolean> {
  if (!erpCustomer) return true;
  // NOT EXISTS rather than NOT IN, deliberately. `x not in (subquery)`
  // evaluates to NULL — and so matches nothing — the moment the subquery
  // yields a single NULL row. Here that would mean "no blocking claim
  // found", i.e. this function fails OPEN and the whole feature quietly
  // stops working. NOT EXISTS has no such case.
  const { rows } = await query(
    `select 1
       from quote_service.customer_claim c
      where c.erp_customer = $1
        and not exists (
              select 1 from quote_service.visible_org_ids($2) v
               where v.org_id = c.org_id)`,
    [erpCustomer, callerOrgId]);
  return rows.length === 0;
}

/**
 * Record the claim. Does nothing if the customer is already claimed —
 * including by somebody else, which is what makes this safe to call on
 * any path that legitimately touches a customer.
 *
 * The primary key does the work: two partners racing to claim the same
 * customer cannot both succeed, whatever the application logic thinks.
 */
export async function claimCustomer(input: ClaimInput): Promise<void> {
  if (!input.erpCustomer || !input.orgId) return;
  await query(
    `insert into quote_service.customer_claim
       (erp_customer, org_id, customer_name, customer_gstin,
        claimed_by, claimed_by_name, claimed_via)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (erp_customer) do nothing`,
    [
      input.erpCustomer, input.orgId,
      input.customerName ?? null, input.customerGstin ?? null,
      input.claimedBy ?? null, input.claimedByName ?? null,
      input.via ?? 'portal',
    ]);
}

/**
 * The ERPNext customer names this org must not see, for filtering a
 * search result set.
 *
 * Returned as a Set of names to exclude rather than as a filter pushed
 * into the search, because the search itself runs against ERPNext and
 * cannot join our tables. The list is one row per claimed customer held
 * outside the caller's subtree, which stays small — this is a partner
 * book, not a consumer database.
 */
export async function hiddenFrom(callerOrgId: number): Promise<Set<string>> {
  const { rows } = await query(
    `select c.erp_customer
       from quote_service.customer_claim c
      where not exists (
              select 1 from quote_service.visible_org_ids($1) v
               where v.org_id = c.org_id)`,
    [callerOrgId]);
  return new Set(rows.map((r: { erp_customer: string }) => r.erp_customer));
}

/** The 409 body. One shape, so the screen only has to recognise one. */
export function claimBlockedPayload() {
  return {
    error: { code: CLAIM_BLOCKED_CODE, message: CLAIM_BLOCKED_MESSAGE },
  };
}

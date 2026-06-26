// src/services/erpLimit.ts
// ---------------------------------------------------------------------------
// A single GLOBAL concurrency limiter shared by every ERPNext call in the app.
//
// Frappe Cloud caps database connections (MySQL error 1040 "Too many
// connections"). Our services fan out lots of parallel requests (one fetch per
// Sales Invoice, per BOM, etc.), and when several endpoints fire together we can
// burst past that cap. Routing every ERPNext fetch through one limiter means the
// whole process can never have more than ERP_MAX_CONCURRENCY requests in flight
// at once — no matter how many endpoints or batches are running.
//
// Usage: replace `await fetch(url, init)` with `await erpFetch(url, init)`.
// Same signature as fetch; it just waits for a slot first.
// ---------------------------------------------------------------------------

const MAX = Number(process.env.ERP_MAX_CONCURRENCY ?? 4)

let active = 0
const waiters: Array<() => void> = []

function acquire(): Promise<void> {
  if (active < MAX) {
    active++
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => waiters.push(resolve))
}

function release(): void {
  active--
  const next = waiters.shift()
  if (next) {
    active++
    next()
  }
}

/**
 * fetch() wrapped in the global ERPNext concurrency gate.
 * Identical signature to fetch; only difference is it waits for a free slot.
 */
export async function erpFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  await acquire()
  try {
    return await fetch(input, init)
  } finally {
    release()
  }
}

/**
 * Run an array of async tasks with the same global cap, returning all results.
 * Use this instead of Promise.all(chunk.map(...)) so even the fan-out respects
 * the limiter. (erpFetch already gates the actual HTTP, but this keeps the
 * number of *pending* task closures bounded too.)
 */
export async function erpMap<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx])
    }
  }
  const pool = Math.min(MAX, Math.max(1, items.length))
  await Promise.all(Array.from({ length: pool }, () => worker()))
  return results
}
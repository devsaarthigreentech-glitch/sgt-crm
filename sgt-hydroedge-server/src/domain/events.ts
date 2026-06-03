// Event bus stand-in. Writes to the `outbox` table (durable, replayable) AND
// emits in-process so subscribers in this server react immediately. When you
// move to Kafka, a single drain worker reads outbox rows where published=false.
import { EventEmitter } from 'node:events'
import { nanoid } from 'nanoid'
import { query } from '../db/pool'

export const bus = new EventEmitter()
bus.setMaxListeners(50)

export interface Actor { type: 'user' | 'agent' | 'system'; id?: string }

export interface PublishArgs {
  aggregateId?: string
  division?: string
  actor?: Actor
  data?: Record<string, unknown>
  version?: string
}

export async function publish(eventType: string, args: PublishArgs = {}) {
  const { aggregateId, division = 'corporate', actor = { type: 'system' }, data = {}, version = '1.0' } = args
  const id = 'evt_' + nanoid(16)
  await query(
    `INSERT INTO lead_service.outbox
       (id, event_type, event_version, aggregate_id, division, actor, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, eventType, version, aggregateId ?? null, division, JSON.stringify(actor), JSON.stringify(data)]
  )
  // fire-and-forget to in-process subscribers
  bus.emit(eventType, { eventId: id, eventType, division, actor, data })
  return id
}
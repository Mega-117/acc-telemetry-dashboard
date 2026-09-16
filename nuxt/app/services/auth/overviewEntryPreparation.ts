import type { InjectionKey, ShallowRef } from 'vue'
import type { OverviewProjection } from '~/types/overviewProjections'
import type { RaceCalendarEvent } from '~/repositories/raceCalendarRepository'

export interface OverviewEntry {
  uid: string
  projection: Promise<OverviewProjection | null>
  events: Promise<RaceCalendarEvent[]>
  ready: Promise<void>
  takeProjection: (owner: string) => Promise<OverviewProjection | null> | undefined
  takeEvents: (owner: string) => Promise<RaceCalendarEvent[]> | undefined
}

export const overviewEntryKey: InjectionKey<ShallowRef<OverviewEntry | null>> = Symbol('overview-entry')

/** Reuse the same requests in the views, including when the visual deadline expires. */
export function prepareOverviewEntry(uid: string, dependencies: {
  projection: () => Promise<OverviewProjection | null>
  events: () => Promise<RaceCalendarEvent[]>
  image: (projection: OverviewProjection | null) => Promise<unknown>
  code: () => Promise<unknown>
}, timeoutMs = 2500): OverviewEntry {
  const projection = Promise.resolve().then(dependencies.projection)
  const events = Promise.resolve().then(dependencies.events)
  const work = Promise.allSettled([
    projection.then(dependencies.image), events, Promise.resolve().then(dependencies.code),
  ])
  const ready = new Promise<void>(resolve => {
    const timer = setTimeout(resolve, timeoutMs)
    void work.then(() => { clearTimeout(timer); resolve() })
  })
  let projectionTaken = false
  let eventsTaken = false
  return {
    uid, projection, events, ready,
    takeProjection(owner) {
      if (owner !== uid || projectionTaken) return
      projectionTaken = true
      return projection
    },
    takeEvents(owner) {
      if (owner !== uid || eventsTaken) return
      eventsTaken = true
      return events
    },
  }
}

export async function decodeOverviewImage(source: string): Promise<void> {
  const image = new Image()
  image.src = source
  await image.decode()
}

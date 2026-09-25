// Simulator-neutral model of what a track map shows.
//
// The Track Map HUD (services/overlay/trackMapPresentation) only knows this
// model. Everything a simulator says in its own dialect - location codes,
// session type numbers, freshness of its feed, which car is "mine" - is
// translated ONCE by that simulator's adapter (services/sim/<sim>/...). Adding
// a simulator means adding an adapter, not touching the map.

export interface TrackMapCar {
  id: number
  /** 0..1 along the lap. */
  lapPosition: number
  raceNumber: number | null
  overallPosition: number | null
  classPosition: number | null
  /** Lower-case class label as the simulator names it; unknown classes get a neutral colour. */
  classKey: string | null
  speedKmh: number | null
  inPit: boolean
  lapInvalid: boolean
  /** The car this installation is driving. */
  isLocal: boolean
  /** The car the pilot is looking at: the local one while driving, another while spectating. */
  isFocused: boolean
}

export interface TrackMapScene {
  cars: TrackMapCar[]
  isRace: boolean
  /** Pit prediction belongs to the local car: it is only meaningful while that is the car in focus. */
  localInFocus: boolean
}

export const EMPTY_TRACK_MAP_SCENE: TrackMapScene = Object.freeze({ cars: [], isRace: false, localInFocus: true }) as TrackMapScene

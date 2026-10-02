import { commonBoolean, commonValue, type CommonLive } from '~/services/telemetry/commonLive'
import { EMPTY_TRACK_MAP_SCENE, type TrackMapScene } from './trackMapScene'

export function buildCommonTrackMapScene(live: CommonLive | null | undefined): TrackMapScene {
  if (!live?.connected || !live.fresh || live.capabilities.track_position !== true) return EMPTY_TRACK_MAP_SCENE
  const position = commonValue(live, 'normalized_position', 'ratio')
  if (position === null || position < 0 || position > 1) return EMPTY_TRACK_MAP_SCENE
  return { isRace: live.sessionKind === 'race', localInFocus: true, cars: [{
    id: 0, lapPosition: position, raceNumber: null, overallPosition: commonValue(live, 'position', 'position'),
    classPosition: null, classKey: null, speedKmh: commonValue(live, 'speed', 'km/h'),
    inPit: commonBoolean(live, 'in_pit_lane') === true, lapInvalid: commonBoolean(live, 'lap_valid') === false,
    isLocal: true, isFocused: true,
  }] }
}

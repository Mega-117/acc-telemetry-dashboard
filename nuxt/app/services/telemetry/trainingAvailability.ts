import type { TrainingOverlayId } from '~/config/trainingOverlayCatalog'
import type { CommonLive } from './commonLive'
import { featureAvailability, type FeatureRequirement } from './featureAvailability'

// Requirements concern the exercise, not mute, stopwatch, social or placement.
export const TRAINING_REQUIREMENTS: Record<TrainingOverlayId, FeatureRequirement> = {
  tracktitan_input: { capabilities: ['vehicle_inputs', 'track_position'], fields: { throttle: 'ratio', brake: 'ratio', normalized_position: 'ratio' } },
  clean_laps: { capabilities: ['lap_timing', 'lap_validity'], fields: { lap_count: 'count', lap_valid: 'boolean' } },
  qualifying: { capabilities: ['lap_timing', 'lap_validity'], fields: { current_lap_time: 'ms', lap_count: 'count', lap_valid: 'boolean' } },
  consistency: { capabilities: ['lap_timing', 'lap_validity'], fields: { current_lap_time: 'ms', lap_count: 'count', lap_valid: 'boolean' } },
  race_real: { capabilities: ['lap_timing'], fields: { current_lap_time: 'ms', lap_count: 'count' } },
}

export function trainingAvailability(live: CommonLive | null | undefined, training: TrainingOverlayId) {
  return featureAvailability(live, TRAINING_REQUIREMENTS[training])
}

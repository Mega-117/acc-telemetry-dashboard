export function resolveTrackFallbackBest(stat: {
  bestQualy?: number | null
  bestRace?: number | null
  bestByGrip?: Record<string, { bestQualy?: number | null; bestRace?: number | null }>
}) {
  const optimum = stat.bestByGrip?.Optimum || stat.bestByGrip?.Opt
  return {
    bestQualy: optimum?.bestQualy ?? stat.bestQualy ?? null,
    bestRace: optimum?.bestRace ?? stat.bestRace ?? null
  }
}

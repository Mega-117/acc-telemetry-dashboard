export const GAME_OPTIONS = [
  { id: 'acc', label: 'ACC', name: 'Assetto Corsa Competizione', available: true, experimental: false },
  { id: 'evo', label: 'Assetto Corsa EVO', name: 'Assetto Corsa EVO', available: true, experimental: true },
] as const

export function gameLogo(gameId: string): string | null {
  return gameId === 'acc' || gameId === 'evo' ? `/images/games/${gameId}.png` : null
}

export function gameLabel(gameId: string | null | undefined): string {
  if (gameId === 'synthetic') return 'Simulatore di test · DEV'
  return GAME_OPTIONS.find(game => game.id === gameId)?.label || gameId || 'Gioco sconosciuto'
}

// Product support is stable while disconnected. Live availability remains a
// separate measurement/capability check; never infer ACC from an unknown game.
export function gameUiSupport(gameId: string | null | undefined) {
  const full = gameId === 'acc'
  return { pitwall: full, adaptiveCoach: full, pressureAdvice: full,
    quickAutomations: full, quickVoiceControls: full || gameId === 'evo',
    extendedVoiceControls: full, fullStandings: full,
    mapOptions: full }
}

export function hudSettingSupported(gameId: string, overlay: string, key: string): boolean {
  if (gameId === 'acc') return true
  if (gameId !== 'evo') return false
  if (overlay === 'info') return ['showStint', 'showFuelLeft', 'showDelta', 'showGrip', 'showBest', 'showTime'].includes(key)
  if (overlay === 'standings') return ['showFastestLap', 'showLastLap', 'showLapProgressBar'].includes(key)
  return false
}

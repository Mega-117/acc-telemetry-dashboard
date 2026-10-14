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

export type SimulatorConnection = { state: 'connected' | 'started' | 'choice' | 'none'; gameId: string | null; label: string }

/** PIP-510: one reading of the simulator state for the webapp selector and Ctrl+K.
 *  connected = driving data flows; started = game open (menus/lobby/loading). */
export function simulatorConnection(live: { gameId: string; connected: boolean; fresh: boolean; running?: boolean; choiceRequired?: boolean } | null | undefined): SimulatorConnection {
  // readCommonLive already folds freshness into `connected`.
  if (live?.connected) return { state: 'connected', gameId: live.gameId, label: `Collegato: ${gameLabel(live.gameId)}` }
  if (live?.running && GAME_OPTIONS.some(game => game.id === live.gameId)) {
    return { state: 'started', gameId: live.gameId, label: `${gameLabel(live.gameId)} avviato` }
  }
  if (live?.choiceRequired) return { state: 'choice', gameId: null, label: 'Scegli il gioco' }
  return { state: 'none', gameId: null, label: 'Nessun gioco collegato' }
}

// Product support is stable while disconnected. Live availability remains a
// separate measurement/capability check; never infer ACC from an unknown game.
export function gameUiSupport(gameId: string | null | undefined) {
  const full = gameId === 'acc'
  return { pitwall: full, adaptiveCoach: full, pressureAdvice: full,
    quickAutomations: full, quickVoiceControls: full || gameId === 'evo',
    extendedVoiceControls: full, quickSectorReferences: full, fullStandings: full,
    mapOptions: full }
}

export function hudSettingSupported(gameId: string, overlay: string, key: string): boolean {
  if (gameId === 'acc') return true
  if (gameId !== 'evo') return false
  if (overlay === 'info') return ['showStint', 'showFuelLeft', 'showDelta', 'showGrip', 'showBest', 'showTime'].includes(key)
  if (overlay === 'standings') return ['showFastestLap', 'showLastLap', 'showLapProgressBar'].includes(key)
  return false
}

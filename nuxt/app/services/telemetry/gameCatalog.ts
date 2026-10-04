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

// Annuncio tempi giro a spezzoni pre-registrati (PIP-101, stile Crew Chief):
// la scomposizione tempo -> mattoncini e' pura e testabile; la riproduzione
// concatena WAV Kokoro pregenerati (zero latenza, zero dipendenze runtime).
//
// Formato parlato approvato: "uno quarantanove e tre" (minuti, secondi,
// "e", decimi — arrotondato ai decimi; i millesimi restano sul HUD).

export const TIME_BRICK_DIR = '/voice/qualifying'

export function timeBrickPath(brickId: string, voice: string): string {
  return `${TIME_BRICK_DIR}/time-${brickId}-${voice}.wav`
}

/**
 * Scompone un tempo giro nei mattoncini da riprodurre in sequenza.
 * Ritorna gli id dei mattoncini (senza voce/estensione).
 * - tempo nullo/non valido come numero: annuncia solo l'eventuale "giro non valido".
 * - sotto il minuto: niente mattoncino dei minuti.
 */
export function lapTimeToBricks(timeMs: number | null, valid: boolean): string[] {
  const bricks: string[] = []
  if (!valid) bricks.push('invalid')
  if (!timeMs || timeMs <= 0 || !Number.isFinite(timeMs)) return bricks

  const totalSecs = timeMs / 1000
  let minutes = Math.floor(totalSecs / 60)
  let secs = Math.floor(totalSecs % 60)
  let tenths = Math.round((totalSecs - Math.floor(totalSecs)) * 10)
  // Il decimo arrotondato puo' traboccare (es. 49.96s -> 49 e "10 decimi").
  if (tenths >= 10) {
    tenths = 0
    secs += 1
    if (secs >= 60) { secs = 0; minutes += 1 }
  }

  if (minutes > 0) bricks.push(`num-${Math.min(minutes, 59)}`)
  bricks.push(`num-${secs}`)
  bricks.push('e')
  bricks.push(`num-${tenths}`)
  return bricks
}

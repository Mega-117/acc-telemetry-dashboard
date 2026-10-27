import type { PartialDictionary } from '../types'

export default {
  overlays: {
    waiting: 'waiting',
    tyres: 'Tyres',
    tabTyres: 'TYRES',
    tabDamage: 'DAMAGE',
    staleData: 'Data not updated',
    standingsWaiting: 'Waiting for session data',
    trackmapCircleUnsupported: 'Track outline not available: circle view',
    tyreRace: {
      set: 'SET',
      body: 'Body',
      suspension: 'Susp.',
      total: 'Total',
    },
    weather: {
      unavailable: 'Weather forecast not available',
      noData: 'Weather data not available',
      now: 'Now',
      forecast: 'ACC forecast in {minutes} game minutes',
      rain0: 'No rain',
      rain1: 'Drizzle',
      rain2: 'Light rain',
      rain3: 'Medium rain',
      rain4: 'Heavy rain',
      rain5: 'Thunderstorm',
    },
    slip: {
      limit: 'LIMIT',
      sliding: 'SLIDE',
      wheelspin: 'SPIN',
      lockup: 'LOCK',
    },
    sectors: {
      unavailable: 'Sectors not available',
      title: 'SECTORS',
      titleLastLap: 'SECTORS · LAST LAP',
      previous: 'prev',
      best: 'best',
      lastLap: 'LAST LAP',
      // Lowercase link word between the title and the bold reference word.
      versus: 'vs',
    },
    trainingHud: {
      muted: 'MUTED',
      saving: 'saving…',
      readyNext: 'Ready for the next step',
      autoAdvance: 'Next in {seconds}s — click to stay',
      confirmStop: 'Confirm stop',
      confirmStopHint: 'Ctrl+Alt+S or Ctrl+N confirms · cancels itself after 5s',
    },
  },
} satisfies PartialDictionary

// Wave 3 (PIP-665): in-game HUD overlays. Only the few Italian words on screen; labels that are
// already English in the HUD (Fuel Left, Grip, LAP, AVG...) stay in the components, same in both languages.
export default {
  overlays: {
    waiting: 'in attesa',
    tyres: 'Gomme',
    tabTyres: 'GOMME',
    tabDamage: 'DANNI',
    staleData: 'Dati non aggiornati',
    standingsWaiting: 'In attesa dei dati della sessione',
    trackmapCircleUnsupported: 'Sagoma pista non disponibile: vista circolare',
    dashboardHud: {
      aria: 'Cruscotto',
      spectatorAria: 'Cruscotto del pilota osservato',
      unavailableAria: 'Dati non disponibili per il pilota osservato',
    },
    tyreRace: {
      set: 'SET',
      // Middle line, only while the car is damaged: total repair time.
      damage: 'DANNI',
    },
    weather: {
      unavailable: 'Previsioni meteo non disponibili',
      noData: 'Dati meteo non disponibili',
      now: 'Ora',
      forecast: 'Previsione ACC a {minutes} minuti di gioco',
      rain0: 'Nessuna pioggia',
      rain1: 'Pioviggine',
      rain2: 'Pioggia leggera',
      rain3: 'Pioggia moderata',
      rain4: 'Pioggia forte',
      rain5: 'Temporale',
    },
    slip: {
      limit: 'LIMITE',
      sliding: 'SCIVOLA',
      wheelspin: 'PATTINA',
      lockup: 'BLOCCAGGIO',
    },
    sectors: {
      unavailable: 'Settori non disponibili',
      title: 'SETTORI',
      titleLastLap: 'SETTORI · ULTIMO GIRO',
      previous: 'prec',
      best: 'best',
      lastLap: 'ULTIMO GIRO',
      // Parola di collegamento minuscola tra titolo e riferimento in grassetto.
      versus: 'vs',
    },
    trainingHud: {
      muted: 'MUTO',
      saving: 'salvataggio…',
      readyNext: 'Pronto per lo step successivo',
      autoAdvance: 'Avanti tra {seconds}s — clicca per restare',
      confirmStop: 'Conferma stop',
      confirmStopHint: 'Ctrl+Alt+S o Ctrl+N conferma · si annulla da solo dopo 5s',
    },
  },
} as const

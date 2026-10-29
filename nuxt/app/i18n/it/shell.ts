// App shell: tabs, user menu, language, settings page.
export default {
  nav: {
    overview: 'PANORAMICA',
    sessions: 'SESSIONI',
    tracks: 'PISTE',
    pitwall: 'PITWALL',
    spotter: 'SPOTTER',
    hud: 'HUD',
    data: 'DATI',
    back: 'Indietro',
  },
  userMenu: {
    profile: 'Profilo',
    settings: 'Impostazioni',
    report: 'Segnala problema',
    discord: 'Discord',
    logout: 'Esci',
  },
  language: {
    title: 'Lingua',
    hint: "Lingua dell'interfaccia del programma e del sito.",
    label: 'Lingua',
  },
  settings: {
    title: 'Impostazioni',
    subtitle: 'Personalizza il programma e i controlli della tua postazione.',
    sections: 'Sezioni impostazioni',
    commands: 'Comandi',
    startup: 'Avvio',
    intro: 'Introduzione',
    language: 'Lingua',
  },
  topBar: {
    user: 'Utente',
    roleTools: 'Strumenti riservati',
    devTools: 'Strumenti sviluppo (solo admin, in locale)',
    adminCockpit: 'Cockpit amministratore',
    myDrivers: 'I miei piloti',
  },
} as const

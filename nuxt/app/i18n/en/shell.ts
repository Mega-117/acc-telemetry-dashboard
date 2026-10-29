import type { PartialDictionary } from '../types'

export default {
  nav: {
    overview: 'OVERVIEW',
    sessions: 'SESSIONS',
    tracks: 'TRACKS',
    pitwall: 'PITWALL',
    spotter: 'SPOTTER',
    hud: 'HUD',
    data: 'DATA',
    back: 'Back',
  },
  userMenu: {
    profile: 'Profile',
    settings: 'Settings',
    report: 'Report a problem',
    discord: 'Discord',
    logout: 'Log out',
  },
  language: {
    title: 'Language',
    hint: 'Language of the app and the website.',
    label: 'Language',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Customise the app and the controls of your rig.',
    sections: 'Settings sections',
    commands: 'Controls',
    startup: 'Startup',
    intro: 'Introduction',
    language: 'Language',
  },
  topBar: {
    user: 'User',
    roleTools: 'Restricted tools',
    devTools: 'Developer tools (admin only, local)',
    adminCockpit: 'Admin cockpit',
    myDrivers: 'My drivers',
  },
} satisfies PartialDictionary

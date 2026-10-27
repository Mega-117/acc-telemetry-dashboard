import type { PartialDictionary } from '../types'

export default {
  pitwall: {
    unavailable: {
      title: 'Currently unavailable',
      body: 'Pitwall is not available yet for {game}.',
      hint: 'You can use it by selecting Assetto Corsa Competizione.',
    },
    localCrew: {
      aria: 'Crew of the local car',
      title: 'Local car',
      noName: 'Name not available',
      atWheel: 'Driving in the sim',
    },
    overlayButton: {
      close: 'Close Pitwall',
      arming: 'Pitwall: opens in session',
      open: 'Open Pitwall',
      hintUnavailable: 'Pitwall: opens from the desktop app.',
      hintOpen: 'Pitwall: open, friends can join.',
      hintArming: 'Pitwall: {reason}',
      armingDefault: 'opens as soon as ACC is in session.',
      hintClosed: 'Pitwall: closed.',
    },
    tyreCondition: {
      new: 'New',
      used: 'Used',
      live: 'LIVE',
      notAvailable: 'N/A',
      onScreen: 'ON SCREEN',
      onScreenTitle: 'Condition read on screen: {time}',
      unverified: 'Condition not verified',
    },
    toggle: {
      skipTitle: 'Leave this item unchanged',
      yes: 'Yes',
      onTitle: 'Turn on',
      no: 'No',
      offTitle: 'Turn off',
    },
    v4: {
      identityUnavailable: 'Local identity not available.',
      selectRoom: 'Select a room with only one available driver.',
      noV4: 'The driver PC does not offer V4 online.',
      v4Unavailable: 'V4 not available on the driver PC.',
      notSent: 'Not sent',
      presetNotApplied: 'Preset {preset} not applied',
      presetReason: 'The MFD did not allow selecting the requested preset.',
      contextChanged: 'V4 context changed: check the recipient.',
      sendFailed: 'Sending failed.',
      chooseRecipient: 'Several drivers at the wheel: choose who gets the strategy',
      recipient: 'Strategy recipient',
      selectDriver: 'Select a driver',
      noDriver: 'No driver available',
      frameTitle: 'V4 online strategy',
    },
  },
} satisfies PartialDictionary

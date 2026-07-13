import { describe, expect, it } from 'vitest'
import { resolveLapTimeVoiceEntry } from '~/services/overlay/lapTimeAnnouncer'
import {
  isSpotterFeatureAllowed,
  isSpotterSessionChange,
  toggleSpotterSessionMode,
  type SpotterSessionMode,
} from '~/services/spotter/spotterSessionPolicy'
import {
  advanceTrackVoiceReferenceRuntime,
  createTrackVoiceReferenceRuntimeState,
  type TrackVoiceReferenceRuntimeInput,
  type TrackVoiceReferenceRuntimeState,
} from '~/services/spotter/trackVoiceReferenceRuntime'
import type { TrackVoiceReference } from '~/services/spotter/trackVoiceReferences'

interface DriveSettings {
  sessionType: number
  referencesEnabled: boolean
  lapTimesEnabled: boolean
  referenceModes: SpotterSessionMode[]
  lapTimeModes: SpotterSessionMode[]
}

interface DriveFrame {
  lap: number
  phase: TrackVoiceReferenceRuntimeInput['phase']
  eligible: boolean
  position: number
}

interface VirtualSpotterDrive {
  settings: DriveSettings
  queue: string[]
  driveFrame: (frame: DriveFrame) => void
  finishLap: () => void
}

const spaReferences: TrackVoiceReference[] = [
  { id: 'la-source', track: 'spa', normalized_car_position: 0.10, audio_path: '/voice/references/spa/la-source.wav' },
  { id: 'bruxelles', track: 'spa', normalized_car_position: 0.50, audio_path: '/voice/references/spa/bruxelles.wav' },
  { id: 'bus-stop', track: 'spa', normalized_car_position: 0.92, audio_path: '/voice/references/spa/bus-stop.wav' },
]

const expectedTwoLapQueue = [
  'reference:la-source',
  'reference:bruxelles',
  'reference:bus-stop',
  'lap:lap-time-1493-if_sara.wav',
  'reference:la-source',
  'reference:bruxelles',
  'reference:bus-stop',
  'lap:lap-time-1493-if_sara.wav',
]

function defaultSettings(sessionType: number): DriveSettings {
  return {
    sessionType,
    referencesEnabled: true,
    lapTimesEnabled: true,
    referenceModes: ['practice'],
    lapTimeModes: ['practice'],
  }
}

function createVirtualSpotterDrive(settings: DriveSettings): VirtualSpotterDrive {
  let state: TrackVoiceReferenceRuntimeState = createTrackVoiceReferenceRuntimeState()
  let now = 0
  let previousSessionType: number | null = null
  let previousReferencesAllowed: boolean | null = null
  const queue: string[] = []

  const driveFrame = (frame: DriveFrame) => {
    now += 250
    const referencesAllowed = isSpotterFeatureAllowed(
      settings.referencesEnabled,
      settings.referenceModes,
      settings.sessionType,
    )
    const sessionChanged = isSpotterSessionChange(previousSessionType, settings.sessionType)
    const gateClosed = previousReferencesAllowed === true && !referencesAllowed
    if (sessionChanged || gateClosed) state = createTrackVoiceReferenceRuntimeState()
    previousSessionType = settings.sessionType
    previousReferencesAllowed = referencesAllowed

    if (!referencesAllowed) {
      return
    }

    const outcome = advanceTrackVoiceReferenceRuntime(state, {
      phase: frame.phase,
      eligible: frame.eligible,
      legacyLapsCompleted: Math.max(0, frame.lap - 1),
      position: frame.position,
      now,
      references: spaReferences,
    })
    state = outcome.state
    for (const reference of outcome.toAnnounce) queue.push(`reference:${reference.id}`)
  }

  function finishLap() {
    if (!isSpotterFeatureAllowed(
      settings.lapTimesEnabled,
      settings.lapTimeModes,
      settings.sessionType,
    )) return
    const entry = resolveLapTimeVoiceEntry(149_300, true, 'if_sara')
    if (entry) queue.push(`lap:${entry.filename}`)
  }

  return { settings, queue, driveFrame, finishLap }
}

function emitFrame(
  drive: VirtualSpotterDrive,
  frame: DriveFrame,
  beforeFrame?: (frame: DriveFrame, mutableSettings: DriveSettings) => void,
) {
  beforeFrame?.(frame, drive.settings)
  drive.driveFrame(frame)
}

function driveOutlapSession(
  drive: VirtualSpotterDrive,
  laps = 2,
  beforeFrame?: (frame: DriveFrame, mutableSettings: DriveSettings) => void,
) {
  emitFrame(drive, { lap: 0, phase: 'garage', eligible: false, position: 0.04 }, beforeFrame)
  for (let step = 1; step <= 99; step += 1) {
    emitFrame(drive, { lap: 0, phase: 'outlap', eligible: false, position: step / 100 }, beforeFrame)
  }
  emitFrame(drive, { lap: 1, phase: 'active', eligible: true, position: 0.01 }, beforeFrame)

  for (let lap = 1; lap <= laps; lap += 1) {
    for (let step = 2; step <= 99; step += 1) {
      emitFrame(drive, { lap, phase: 'active', eligible: true, position: step / 100 }, beforeFrame)
    }
    emitFrame(drive, { lap: lap + 1, phase: 'active', eligible: true, position: 0.01 }, beforeFrame)
    drive.finishLap()
  }
}

function driveRaceFromGrid(drive: VirtualSpotterDrive, laps = 2) {
  // La griglia puo' essere gia' oltre il traguardo normalizzato: il logger
  // inizializza direttamente active, senza un frame garage/outlap intermedio.
  emitFrame(drive, { lap: 1, phase: 'active', eligible: true, position: 0.04 })
  for (let lap = 1; lap <= laps; lap += 1) {
    const firstStep = lap === 1 ? 5 : 2
    for (let step = firstStep; step <= 99; step += 1) {
      emitFrame(drive, { lap, phase: 'active', eligible: true, position: step / 100 })
    }
    emitFrame(drive, { lap: lap + 1, phase: 'active', eligible: true, position: 0.01 })
    drive.finishLap()
  }
}

function drivePartialActiveLap(drive: VirtualSpotterDrive, lap: number, untilStep: number) {
  for (let step = 2; step <= untilStep; step += 1) {
    emitFrame(drive, { lap, phase: 'active', eligible: true, position: step / 100 })
  }
}

function simulateSpaDrive(
  settings: DriveSettings,
  beforeFrame?: (frame: DriveFrame, mutableSettings: DriveSettings) => void,
) {
  const drive = createVirtualSpotterDrive(settings)

  // Replay della stessa forma PIP-228/PIP-233: garage, outlap completa,
  // primo wrap plausibile e due giri lanciati reali lungo tutta Spa.
  driveOutlapSession(drive, 2, beforeFrame)
  return drive.queue
}

describe('spotter session filters with a complete virtual car drive (PIP-234)', () => {
  it('speaks only in Practice with the default settings', () => {
    expect(simulateSpaDrive(defaultSettings(0))).toEqual(expectedTwoLapQueue)
    expect(simulateSpaDrive(defaultSettings(1))).toEqual([])
    expect(simulateSpaDrive(defaultSettings(2))).toEqual([])
  })

  it('speaks in Qualifying and Race when their buttons are selected', () => {
    const qualifying = defaultSettings(1)
    qualifying.referenceModes = toggleSpotterSessionMode(qualifying.referenceModes, 'qualify')
    qualifying.lapTimeModes = toggleSpotterSessionMode(qualifying.lapTimeModes, 'qualify')

    const race = defaultSettings(2)
    race.referenceModes = toggleSpotterSessionMode(race.referenceModes, 'race')
    race.lapTimeModes = toggleSpotterSessionMode(race.lapTimeModes, 'race')

    expect(simulateSpaDrive(qualifying)).toEqual(expectedTwoLapQueue)
    expect(simulateSpaDrive(race)).toEqual(expectedTwoLapQueue)
  })

  it('keeps reference and lap-time filters independent during complete laps', () => {
    const qualifying = defaultSettings(1)
    qualifying.referenceModes = ['qualify']
    qualifying.lapTimeModes = ['practice']
    expect(simulateSpaDrive(qualifying)).toEqual([
      'reference:la-source',
      'reference:bruxelles',
      'reference:bus-stop',
      'reference:la-source',
      'reference:bruxelles',
      'reference:bus-stop',
    ])

    const race = defaultSettings(2)
    race.referenceModes = ['practice']
    race.lapTimeModes = ['race']
    expect(simulateSpaDrive(race)).toEqual([
      'lap:lap-time-1493-if_sara.wav',
      'lap:lap-time-1493-if_sara.wav',
    ])
  })

  it('keeps both sources silent when their master switches are off', () => {
    const settings = defaultSettings(2)
    settings.referenceModes = ['practice', 'qualify', 'race']
    settings.lapTimeModes = ['practice', 'qualify', 'race']
    settings.referencesEnabled = false
    settings.lapTimesEnabled = false
    expect(simulateSpaDrive(settings)).toEqual([])
  })

  it('applies setting changes to future audio while the same car keeps driving', () => {
    const settings: DriveSettings = {
      ...defaultSettings(1),
      referenceModes: ['qualify'],
      lapTimeModes: ['qualify'],
    }

    const queue = simulateSpaDrive(settings, (frame, mutableSettings) => {
      if (frame.lap === 1 && frame.position >= 0.40) mutableSettings.referencesEnabled = false
      if (frame.lap === 2 && frame.position === 0.01) mutableSettings.referencesEnabled = true
      if (frame.lap === 2 && frame.position >= 0.60) mutableSettings.lapTimesEnabled = false
    })

    expect(queue).toEqual([
      'reference:la-source',
      'lap:lap-time-1493-if_sara.wav',
      'reference:la-source',
      'reference:bruxelles',
      'reference:bus-stop',
    ])
  })

  it('keeps one car correct through Practice, Qualifying, Race and back to Practice by default', () => {
    const drive = createVirtualSpotterDrive(defaultSettings(0))
    driveOutlapSession(drive)

    drive.settings.sessionType = 1
    driveOutlapSession(drive)
    drive.settings.sessionType = 2
    driveRaceFromGrid(drive)
    drive.settings.sessionType = 0
    driveOutlapSession(drive)

    expect(drive.queue).toEqual([
      ...expectedTwoLapQueue,
      ...expectedTwoLapQueue,
    ])
  })

  it('starts a fresh reference cycle at every enabled session boundary', () => {
    const allModes: SpotterSessionMode[] = ['practice', 'qualify', 'race']
    const drive = createVirtualSpotterDrive({
      ...defaultSettings(0),
      referenceModes: allModes,
      lapTimeModes: allModes,
    })

    driveOutlapSession(drive)
    drive.settings.sessionType = 1
    driveOutlapSession(drive)
    // Il timer puo' chiudere la qualifica mentre l'auto e' ancora nel giro:
    // lascia playedIds popolato prima della partenza da griglia della gara.
    drivePartialActiveLap(drive, 3, 55)
    drive.settings.sessionType = 2
    driveRaceFromGrid(drive)
    drive.settings.sessionType = 0
    driveOutlapSession(drive)

    expect(drive.queue).toEqual([
      ...expectedTwoLapQueue,
      ...expectedTwoLapQueue,
      'reference:la-source',
      'reference:bruxelles',
      ...expectedTwoLapQueue,
      ...expectedTwoLapQueue,
    ])
  })

  it('keeps independent filters correct across the whole weekend lifecycle', () => {
    const drive = createVirtualSpotterDrive({
      ...defaultSettings(0),
      referenceModes: ['practice', 'race'],
      lapTimeModes: ['qualify'],
    })
    const referencesForTwoLaps = expectedTwoLapQueue.filter(entry => entry.startsWith('reference:'))
    const lapTimesForTwoLaps = expectedTwoLapQueue.filter(entry => entry.startsWith('lap:'))

    driveOutlapSession(drive)
    drive.settings.sessionType = 1
    driveOutlapSession(drive)
    drive.settings.sessionType = 2
    driveRaceFromGrid(drive)
    drive.settings.sessionType = 0
    driveOutlapSession(drive)

    expect(drive.queue).toEqual([
      ...referencesForTwoLaps,
      ...lapTimesForTwoLaps,
      ...referencesForTwoLaps,
      ...referencesForTwoLaps,
    ])
  })
})

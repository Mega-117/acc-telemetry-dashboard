// PIP-665: English. Same areas and keys as it.ts; a missing key falls back to Italian and fails the test.
import type { PartialDictionary } from './types'
import shell from './en/shell'
import auth from './en/auth'
import privacy from './en/privacy'
import profile from './en/profile'
import settingsPanels from './en/settingsPanels'
import onboarding from './en/onboarding'
import common from './en/common'
import overview from './en/overview'
import sessions from './en/sessions'
import sessionDetail from './en/sessionDetail'
import telemetry from './en/telemetry'
import stats from './en/stats'
import tracks from './en/tracks'
import data from './en/data'
import game from './en/game'
import coach from './en/coach'
import pitwall from './en/pitwall'
import pitwallConcept from './en/pitwallConcept'
import controlK from './en/controlK'
import quickPanel from './en/quickPanel'
import hud from './en/hud'
import hudSetup from './en/hudSetup'
import spotter from './en/spotter'
import overlays from './en/overlays'
import coachLessons from './en/coachLessons'

const en: PartialDictionary = {
  ...shell,
  ...auth,
  ...privacy,
  ...profile,
  ...settingsPanels,
  ...onboarding,
  ...common,
  ...overview,
  ...sessions,
  ...sessionDetail,
  ...telemetry,
  ...stats,
  ...tracks,
  ...data,
  ...game,
  ...coach,
  ...pitwall,
  ...pitwallConcept,
  ...controlK,
  ...quickPanel,
  ...hud,
  ...hudSetup,
  ...spotter,
  ...overlays,
  ...coachLessons,
}

export default en

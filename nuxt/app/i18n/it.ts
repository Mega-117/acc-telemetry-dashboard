// PIP-665: Italian, the source language. One file per area under it/ (max-lines); add keys there
// first, then the same keys under en/ (the test lists any gap).
import shell from './it/shell'
import auth from './it/auth'
import privacy from './it/privacy'
import profile from './it/profile'
import settingsPanels from './it/settingsPanels'
import onboarding from './it/onboarding'
import common from './it/common'
import overview from './it/overview'
import sessions from './it/sessions'
import sessionDetail from './it/sessionDetail'
import telemetry from './it/telemetry'
import stats from './it/stats'
import tracks from './it/tracks'
import data from './it/data'
import game from './it/game'
import coach from './it/coach'
import pitwall from './it/pitwall'
import pitwallConcept from './it/pitwallConcept'
import controlK from './it/controlK'
import quickPanel from './it/quickPanel'
import hud from './it/hud'
import hudSetup from './it/hudSetup'
import spotter from './it/spotter'
import overlays from './it/overlays'
import coachLessons from './it/coachLessons'

export default {
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
} as const

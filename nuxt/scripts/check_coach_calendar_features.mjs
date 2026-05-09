import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const nuxtRoot = path.resolve(scriptDir, '..')
const projectRoot = path.resolve(nuxtRoot, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

function readNuxt(relativePath) {
  return fs.readFileSync(path.join(nuxtRoot, relativePath), 'utf8')
}

const rules = read('firestore.rules')
assert.match(rules, /match \/raceCalendar\/\{eventId\}/, 'Missing raceCalendar rules')
assert.match(rules, /match \/coachLessons\/\{lessonId\}/, 'Missing coachLessons rules')
assert.match(rules, /request\.resource\.data\.coachId == request\.auth\.uid/, 'Coach lesson writes must pin coachId to auth uid')
assert.match(rules, /request\.resource\.data\.pilotId == userId/, 'Coach lesson writes must pin pilotId to path userId')
assert.match(rules, /request\.resource\.data\.createdBy == request\.auth\.uid/, 'Coach-created calendar events must pin createdBy to auth uid')
assert.match(rules, /request\.resource\.data\.createdByRole == 'coach'/, 'Coach-created calendar events must mark createdByRole coach')
assert.doesNotMatch(rules, /resource\.data\.role == 'coach'/, 'Pilot profile must not expose broad coach directory search in V1')
assert.match(rules, /function preservesRoleAndCoach\(\)/, 'Rules must protect role and coachId from owner self-edit')
assert.match(rules, /allow update: if isOwner\(userId\) && preservesRoleAndCoach\(\)/, 'Users owner update must preserve role and coachId')
assert.match(rules, /allow update: if isAdmin\(\) \|\| \(isOwner\(userId\) && preservesRoleAndCoach\(\)\)/, 'pilotDirectory owner update must preserve role and coachId')

const indexes = JSON.parse(read('firestore.indexes.json'))
function hasPilotDirectoryIndex(expectedFields) {
  return indexes.indexes.some((index) => {
    if (index.collectionGroup !== 'pilotDirectory' || index.queryScope !== 'COLLECTION') return false
    const fields = index.fields.map((field) => `${field.fieldPath}:${field.order || field.arrayConfig}`)
    return JSON.stringify(fields) === JSON.stringify(expectedFields)
  })
}

function hasIndex(collectionGroup, expectedFields) {
  return indexes.indexes.some((index) => {
    if (index.collectionGroup !== collectionGroup || index.queryScope !== 'COLLECTION') return false
    const fields = index.fields.map((field) => `${field.fieldPath}:${field.order || field.arrayConfig}`)
    return JSON.stringify(fields) === JSON.stringify(expectedFields)
  })
}


const profilePage = readNuxt('app/components/ProfilePage.vue')
for (const token of [
  'account-equipment-card',
  'ffbGain',
  'brakeForce',
  'isEditingEquipment',
  'wheelSettingDefinitions',
  'forceFeedbackScale',
  'isCoachProfile',
  'settings-toggle',
  'equipment-expand',
  'Manutenzione dati',
  'Best storici'
]) {
  assert.ok(profilePage.includes(token), `ProfilePage missing ${token}`)
}
assert.ok(!profilePage.includes('ProfileRaceCalendarCard'), 'ProfilePage must not mount operational calendar in profile')
assert.ok(!profilePage.includes('ProfileCoachLessonsCard'), 'ProfilePage must not mount coaching history in profile')
assert.ok(!profilePage.includes('ProfileCoachAssociationCard'), 'ProfilePage must not mount coach association in profile')
assert.ok(profilePage.includes('startEquipmentEdit'), 'Equipment tab must expose read/edit mode')
assert.ok(profilePage.includes('type="range"'), 'Equipment settings must use sliders')

const pilotAreaPage = readNuxt('app/components/pages/PilotAreaPage.vue')
for (const token of [
  'Area pilota',
  'ProfileRaceCalendarCard',
  'ProfileCoachAssociationCard',
  'ProfileCoachLessonsCard',
  'showCoachAssociation',
  'Programma e coaching'
]) {
  assert.ok(pilotAreaPage.includes(token), `PilotAreaPage missing ${token}`)
}

const pilotAreaRoute = readNuxt('app/pages/area-pilota.vue')
assert.ok(pilotAreaRoute.includes('PagesPilotAreaPage'), 'Area pilota route must render PilotAreaPage')

const dashboardTabs = readNuxt('app/components/layout/TabsBarRouter.vue')
assert.ok(dashboardTabs.includes("to: '/area-pilota'"), 'Dashboard tabs must include Area pilota route')
assert.ok(dashboardTabs.includes('AREA PILOTA'), 'Dashboard tabs must label Area pilota')

const coachAssociation = readNuxt('app/components/profile/CoachAssociationCard.vue')
assert.ok(coachAssociation.includes('Nessun coach assegnato'), 'Coach association card must be read-only display copy')
assert.ok(!coachAssociation.includes('assignCoachToPilot'), 'Pilot profile must not assign coaches directly')
assert.ok(!coachAssociation.includes('searchCoaches'), 'Pilot profile must not search coach directory in V1')

const calendarCard = readNuxt('app/components/profile/RaceCalendarCard.vue')
assert.ok(calendarCard.includes('v-model="form.startsAt" type="datetime-local"'), 'Calendar must use native datetime-local input')
assert.ok(!calendarCard.includes('startsAtDraft'), 'Calendar must not stage date/time with an external confirmation control')
assert.ok(!calendarCard.includes('Conferma'), 'Calendar must not render an external date/time confirmation button')
assert.ok(calendarCard.includes('::-webkit-calendar-picker-indicator'), 'Calendar picker icon must be visible on dark UI')
assert.ok(calendarCard.includes('isAdding'), 'Calendar form must be collapsed behind add action')
assert.ok(calendarCard.includes('v-model="form.carName"'), 'Calendar events must support optional car name')
assert.ok(calendarCard.includes('event-form-expand'), 'Calendar form must animate open and close')
assert.ok(calendarCard.includes('Nessuna gara pianificata'), 'Calendar empty state must use planned race copy')

const pilotDetail = readNuxt('app/pages/piloti/[id].vue')
assert.ok(pilotDetail.includes("{ id: 'lezioni', label: 'PILOTA' }"), 'Pilot detail missing PILOTA tab')
assert.ok(pilotDetail.includes("import CoachLessonsPanel from '~/components/coach/CoachLessonsPanel.vue'"), 'Pilot detail must import coach lessons panel explicitly')
assert.ok(pilotDetail.includes('<CoachLessonsPanel'), 'Pilot detail missing coach lessons panel')

const coachLessonsPanel = readNuxt('app/components/coach/CoachLessonsPanel.vue')
for (const token of [
  'CoachRaceCalendarPanel',
  'ACC_TRACK_OPTIONS',
  'ACC_CAR_OPTIONS',
  'durationPresets',
  'selectDuration',
  'selectDurationFromEvent',
  'list="acc-track-options"',
  'list="acc-car-options"',
  'toggleLesson',
  'lesson-accordion',
  'lesson-row__chevron',
  'lessonLinksFor',
  'Analisi sessione',
  '<div><span>Durata</span><strong>{{ lesson.durationMinutes }} min</strong></div>',
  '<Transition name="lesson-detail-transition">',
  'lesson-detail__body',
  'prefers-reduced-motion',
  'Commento generale',
  'placeholder="Opzionale"',
  'hasMoreLessons',
  'showMoreLessons',
  'Mostra altre',
  'historyFilters',
  'hasActiveHistoryFilters',
  'resetHistoryFilters',
  'history-filters',
  'loadCoachLessonsPage',
  'trackFlag',
  'track-flag',
  '&--nl',
  'canSaveLesson',
  'lesson-form-section',
  'form-substatus',
  'lesson-history-heading',
  'feedbackTypeLabel',
  'feedbackContext',
  'feedbackSummary',
  'detail-kicker',
  'Contesto pilota',
  'Storico lezioni',
  'lesson-total-count',
  'context-expand',
  'countCoachLessons',
  'accordion-trigger',
  'trackTitanPilotUrl',
  'trackTitanReferenceUrl',
  'recordingUrl',
  'carName',
  'updateCoachLesson',
  'Modifica lezione',
  "::-webkit-calendar-picker-indicator",
  "trackedGetDoc(doc(db, 'users', props.pilotId)"
]) {
  assert.ok(coachLessonsPanel.includes(token), `CoachLessonsPanel missing ${token}`)
}

const accCatalog = readNuxt('app/constants/accCatalog.ts')
for (const token of ['ACC_TRACK_OPTIONS', 'ACC_CAR_OPTIONS', 'Ferrari 296 GT3', 'Nurburgring 24H', 'Nordschleife']) {
  assert.ok(accCatalog.includes(token), `ACC catalog missing ${token}`)
}

const coachLessonsRepository = readNuxt('app/repositories/coachLessonsRepository.ts')
for (const token of ['updateCoachLesson', 'trackedUpdateDoc', 'users\', pilotId, \'coachLessons\', lessonId', 'CoachLessonFilters', 'CoachLessonsPage', 'startAfter', 'where', 'limit(pageSize + 1)', 'countCoachLessons', 'trackedGetCountFromServer']) {
  assert.ok(coachLessonsRepository.includes(token), `CoachLessonsRepository missing ${token}`)
}

const coachRaceCalendar = readNuxt('app/components/coach/CoachRaceCalendarPanel.vue')
for (const token of [
  'Aggiungi gara al pilota',
  "createdByRole: 'coach'",
  'isAdding',
  'event-form-expand',
  'carName',
  'loadRaceCalendarEvents(props.pilotId'
]) {
  assert.ok(coachRaceCalendar.includes(token), `CoachRaceCalendarPanel missing ${token}`)
}

const profileCoachLessons = readNuxt('app/components/profile/CoachLessonsCard.vue')
for (const token of ['lessonLinks', 'lesson.carName', 'lesson-accordion', 'lesson-expand', 'TrackTitan pilota', 'Registrazione', 'feedbackTypeLabel', 'feedbackContext']) {
  assert.ok(profileCoachLessons.includes(token), `Profile coach lessons card missing ${token}`)
}

console.log('[COACH_CALENDAR_FEATURES_CHECK] OK')

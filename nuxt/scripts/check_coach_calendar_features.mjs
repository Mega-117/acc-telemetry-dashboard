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

const accCatalog = readNuxt('app/constants/accCatalog.ts')
for (const token of ['ACC_TRACK_OPTIONS', 'ACC_CAR_OPTIONS', 'Ferrari 296 GT3', 'Nurburgring 24H', 'Nordschleife']) {
  assert.ok(accCatalog.includes(token), `ACC catalog missing ${token}`)
}

const coachLessonsRepository = readNuxt('app/repositories/coachLessonsRepository.ts')
for (const token of ['updateCoachLesson', 'trackedUpdateDoc', 'users\', pilotId, \'coachLessons\', lessonId', 'CoachLessonFilters', 'CoachLessonsPage', 'startAfter', 'where', 'limit(pageSize + 1)', 'countCoachLessons', 'trackedGetCountFromServer']) {
  assert.ok(coachLessonsRepository.includes(token), `CoachLessonsRepository missing ${token}`)
}

// PIP-705 (user decision 02/11): the coach keeps the pilot list and the pilot's data; the
// lessons/calendar tab, the pilot area and the lessons cards are gone.
const pilotDetail = readNuxt('app/pages/piloti/[id].vue')
assert.ok(!pilotDetail.includes('CoachLessonsPanel'), 'Pilot detail must not mount the removed lessons panel')
assert.ok(!pilotDetail.includes("id: 'lezioni'"), 'Pilot detail must not offer the removed lessons tab')
for (const removed of ['app/components/coach/CoachLessonsPanel.vue', 'app/components/coach/CoachRaceCalendarPanel.vue', 'app/components/profile/CoachLessonsCard.vue', 'app/components/pages/PilotAreaPage.vue']) {
  assert.ok(!fs.existsSync(path.join(nuxtRoot, removed)), `${removed} must stay removed (PIP-705)`)
}

console.log('[COACH_CALENDAR_FEATURES_CHECK] OK')

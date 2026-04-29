import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..', '..')
const indexesPath = path.join(projectRoot, 'firestore.indexes.json')
const firebasePath = path.join(projectRoot, 'firebase.json')

const indexesConfig = JSON.parse(fs.readFileSync(indexesPath, 'utf8'))
const firebaseConfig = JSON.parse(fs.readFileSync(firebasePath, 'utf8'))

assert.equal(
  firebaseConfig?.firestore?.indexes,
  'firestore.indexes.json',
  'firebase.json must reference firestore.indexes.json'
)

function normalizeIndex(index) {
  return {
    collectionGroup: index.collectionGroup,
    queryScope: index.queryScope,
    fields: (index.fields || []).map((field) => `${field.fieldPath}:${field.order || field.arrayConfig}`)
  }
}

function hasIndex(expectedFields) {
  return (indexesConfig.indexes || []).some((index) => {
    const normalized = normalizeIndex(index)
    return normalized.collectionGroup === 'sessions'
      && normalized.queryScope === 'COLLECTION'
      && JSON.stringify(normalized.fields) === JSON.stringify(expectedFields)
  })
}

const requiredIndexes = [
  ['meta.date_start:DESCENDING', 'summary.laps:DESCENDING'],
  ['meta.session_type:ASCENDING', 'meta.date_start:DESCENDING'],
  ['meta.session_type:ASCENDING', 'meta.date_start:DESCENDING', 'summary.laps:DESCENDING']
]

for (const fields of requiredIndexes) {
  assert.ok(
    hasIndex(fields),
    `Missing sessions composite index: ${fields.join(', ')}`
  )
}

const pager = fs.readFileSync(path.join(projectRoot, 'nuxt/app/composables/useSessionPager.ts'), 'utf8')
assert.ok(
  pager.includes("where('summary.laps', '>', 0)") && pager.includes("orderBy('meta.date_start', 'desc')"),
  'Session pager query changed; re-check firestore.indexes.json coverage'
)

console.log('[FIRESTORE_INDEXES_CHECK] OK')

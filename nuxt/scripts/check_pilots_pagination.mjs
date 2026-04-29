import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const nuxtRoot = path.resolve(scriptDir, '..')

const pageSource = fs.readFileSync(path.join(nuxtRoot, 'app/pages/piloti/index.vue'), 'utf8')
const repositorySource = fs.readFileSync(path.join(nuxtRoot, 'app/repositories/pilotDirectoryRepository.ts'), 'utf8')
const provisioningSource = fs.readFileSync(path.join(nuxtRoot, 'app/services/auth/userProvisioningService.ts'), 'utf8')
const pilotDetailSource = fs.readFileSync(path.join(nuxtRoot, 'app/pages/piloti/[id].vue'), 'utf8')
const rulesSource = fs.readFileSync(path.resolve(nuxtRoot, '../firestore.rules'), 'utf8')
const backfillSource = fs.readFileSync(path.join(nuxtRoot, 'scripts/backfill_user_directory_fields.mjs'), 'utf8')

assert.equal(pageSource.includes("collection(db, 'users')"), false, '/piloti must not query the full users collection directly')
assert.equal(pageSource.includes('trackedGetDocs'), false, '/piloti must use the paginated repository, not direct trackedGetDocs')
assert.equal(pageSource.includes('filteredPilots'), false, '/piloti must not do client-side search over a full loaded list')
assert.equal(pageSource.includes('loadPilotDirectoryPage'), true, '/piloti must load paginated pilot pages')
assert.equal(pageSource.includes('countPilotDirectory'), true, '/piloti must use count aggregation for totals')
assert.equal(pageSource.includes('goNextPage'), true, '/piloti must expose cursor next pagination')
assert.equal(pageSource.includes('goPreviousPage'), true, '/piloti must expose cursor previous pagination')

assert.equal(repositorySource.includes("collection(db, 'users')"), false, 'pilot directory repository must not read heavy users documents')
assert.equal(repositorySource.includes("collection(db, 'pilotDirectory')"), true, 'pilot directory repository must read pilotDirectory')
assert.equal(repositorySource.includes('limit('), true, 'pilot repository must limit reads per page')
assert.equal(repositorySource.includes('startAfter('), true, 'pilot repository must use cursor pagination')
assert.equal(repositorySource.includes('trackedGetCountFromServer'), true, 'pilot repository must count with tracked aggregation')
assert.equal(repositorySource.includes("where('searchPrefixes', 'array-contains'"), true, 'pilot search must use server-side searchPrefixes')
assert.equal(repositorySource.includes('PILOT_PAGE_SIZE = 25'), true, 'pilot page size must stay bounded')
assert.equal(repositorySource.includes('data.stats'), false, 'pilot directory repository must not depend on heavy stats payload')
assert.equal(repositorySource.includes('sessionIndex'), false, 'pilot directory repository must not depend on sessionIndex payload')
assert.equal(repositorySource.includes('data.email'), false, 'pilot directory repository must not expose raw email')

assert.equal(provisioningSource.includes('directorySortName'), true, 'user provisioning must write directorySortName')
assert.equal(provisioningSource.includes('searchPrefixes'), true, 'user provisioning must write searchPrefixes')
assert.equal(provisioningSource.includes("'pilotDirectory'"), true, 'user provisioning must write pilotDirectory projection')

assert.equal(pilotDetailSource.includes("doc(db, 'users', pilotId)"), false, 'pilot detail header must not read heavy users documents')
assert.equal(pilotDetailSource.includes("doc(db, 'pilotDirectory', pilotId)"), true, 'pilot detail header must read pilotDirectory')

assert.equal(rulesSource.includes('match /pilotDirectory/{userId}'), true, 'firestore rules must cover pilotDirectory')
assert.equal(backfillSource.includes("collection('pilotDirectory')"), true, 'backfill must populate pilotDirectory documents')
assert.equal(backfillSource.includes('sessionIndex'), false, 'pilotDirectory backfill must not copy sessionIndex')

console.log('[PILOTS_PAGINATION] OK')

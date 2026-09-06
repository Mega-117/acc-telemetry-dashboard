import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { diagnosticPolicy, newDiagnosticState, DIAGNOSTIC_DAY_MS as DAY } from '~/services/monitoring/browserDiagnosticStore'
import { flushDiagnosticOutbox } from '~/services/monitoring/clientDiagnosticsService'

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-pip385', firestore: {
    host: '127.0.0.1', port: 8080, rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8')
  } })
})
afterAll(async () => { await env.cleanup() })

describe('bounded diagnostic delivery under unchanged Rules', () => {
  it('counts actual SDK creates, recovers a lost upload response without a second write, denies updates and foreign access', async () => {
    const uid = `pip385-${Date.now()}`
    const db = env.authenticatedContext(uid, { email_verified: true }).firestore()
    const state = newDiagnosticState()
    let now = Date.now(), writes = 0, reads = 0, loseResponse = true
    for (let index = 0; index < 15000; index++) diagnosticPolicy(state, now).capture({ message: `failure ${index}`, suite: '1.0.0', channel: 'develop' }, uid)
    const flush = () => flushDiagnosticOutbox({
      events: diagnosticPolicy(state, now).list(uid), uid, suite: null,
      reserve: async id => diagnosticPolicy(state, now).reserve(id, uid),
      failed: async (id, quota) => diagnosticPolicy(state, now).failed(id, uid, quota),
      isUploaded: async id => { reads++; return (await getDoc(doc(db, `users/${uid}/diagnostics/${id}`))).exists() },
      upload: async payload => {
        await setDoc(doc(db, `users/${uid}/diagnostics/${payload.eventId}`), { ...payload, receivedAt: serverTimestamp() })
        writes++
        if (loseResponse) { loseResponse = false; throw new Error('simulated lost response after server commit') }
      },
      acknowledge: async id => diagnosticPolicy(state, now).acknowledge(id, uid)
    })
    await flush()
    expect(writes).toBe(0)
    expect(reads).toBe(0)
    now += DAY
    const id = state.reports[0]!.event.eventId!
    await expect(flush()).rejects.toThrow('lost response')
    expect(writes).toBe(1)
    now += 60000
    expect((await flush()).alreadyUploaded).toBe(1)
    expect(writes).toBe(1)
    const ref = doc(db, `users/${uid}/diagnostics/${id}`)
    expect((await getDoc(ref)).data()!.context._aggCount).toBe(15000)
    await assertFails(updateDoc(ref, { message: 'mutation' }))
    await assertFails(getDoc(doc(env.authenticatedContext('foreign').firestore(), ref.path)))
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), ref.path)))

    // A fresh 24-hour window with 25 distinct reports must issue only 20 creates.
    for (let index = 0; index < 25; index++) diagnosticPolicy(state, now).capture({ code: `distinct-${index}`, message: 'failure' }, uid)
    now += DAY
    await flush()
    expect(writes).toBe(21)
    expect(diagnosticPolicy(state, now).list(uid)).toHaveLength(5)
    await env.withSecurityRulesDisabled(async context => {
      const docs = await getDocs(collection(context.firestore(), `users/${uid}/diagnostics`))
      expect(docs.size).toBe(21)
    })
    console.log(JSON.stringify({ diagnosticCreates: writes, existenceGets: reads, deferred: 5, repeatedOccurrences: 15000 }))
  }, 30000)
})

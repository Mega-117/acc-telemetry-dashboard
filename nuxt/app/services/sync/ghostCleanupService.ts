import { collection, doc } from 'firebase/firestore'

export async function cleanupZeroLapSessions(params: {
  db: any
  uid: string
  getDocsFn: (queryRef: any) => Promise<any>
  deleteDocFn: (ref: any) => Promise<any>
}): Promise<number> {
  const { db, uid, getDocsFn, deleteDocFn } = params
  const cleanupKey = `zero_lap_cleanup_done_${uid}`

  if (typeof window !== 'undefined' && localStorage.getItem(cleanupKey)) {
    return 0
  }

  try {
    const sessionsRef = collection(db, `users/${uid}/sessions`)
    const snapshot = await getDocsFn(sessionsRef)
    const toDelete = (snapshot.docs || []).filter((docSnap: any) => {
      const data = docSnap.data()
      return Number(data.summary?.laps || 0) === 0
    })

    for (const docSnap of toDelete) {
      const chunksRef = collection(db, `users/${uid}/sessions/${docSnap.id}/rawChunks`)
      const chunksSnap = await getDocsFn(chunksRef)
      for (const chunk of chunksSnap.docs || []) {
        await deleteDocFn(chunk.ref)
      }
      await deleteDocFn(doc(db, `users/${uid}/sessions/${docSnap.id}`))
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(cleanupKey, new Date().toISOString())
    }

    return toDelete.length
  } catch (e: any) {
    console.error('[CLEANUP] Error during cleanup:', e.message)
    return 0
  }
}

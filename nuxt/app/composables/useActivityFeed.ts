import { ref, computed } from 'vue'
import { getAuth } from 'firebase/auth'
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  doc,
  serverTimestamp
} from 'firebase/firestore'
import {
  trackedAddDoc,
  trackedGetDocs,
  trackedOnSnapshot,
  trackedUpdateDoc,
  trackedWriteBatch
} from './useFirebaseTracker'

const CALLER = 'ActivityFeed'

export type ActivityType = 
  | 'new_pb'           // Nuovo Personal Best in una pista
  | 'session_added'    // Nuova sessione registrata/caricata
  | 'milestone_laps'   // Raggiunto un traguardo di giri (es. 100, 500)
  | 'system_update'    // Aggiornamento sistema / Novità introdotte

export interface ActivityMetadata {
  sessionId?: string
  track?: string
  car?: string
  lapTimeMs?: number
  delta?: number
  [key: string]: any
}

export interface ActivityItem {
  id: string
  userId: string
  type: ActivityType
  timestamp: string | Date | any // Can be Firebase Timestamp
  title: string
  description: string
  metadata?: ActivityMetadata
  isRead: boolean
}

// Global state using Vue refs
const activities = ref<ActivityItem[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
let unsubscribeSnapshot: (() => void) | null = null

export function useActivityFeed() {
  const db = getFirestore()
  const auth = getAuth()

  // Computed properties
  const unreadCount = computed(() => activities.value.filter(a => !a.isRead).length)
  const hasUnread = computed(() => unreadCount.value > 0)

  // Listen to activities for a specific user
  const listenToActivities = (userId: string) => {
    if (unsubscribeSnapshot) {
      unsubscribeSnapshot()
    }

    isLoading.value = true
    error.value = null

    try {
      const activitiesRef = collection(db, 'users', userId, 'activities')
      const q = query(activitiesRef, orderBy('timestamp', 'desc'), limit(50))

      unsubscribeSnapshot = trackedOnSnapshot(q, CALLER, (snapshot) => {
        const items: ActivityItem[] = []
        snapshot.forEach((doc) => {
          const data = doc.data()
          items.push({
            id: doc.id,
            userId,
            type: data.type as ActivityType,
            timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : data.timestamp,
            title: data.title,
            description: data.description,
            metadata: data.metadata,
            isRead: data.isRead || false
          })
        })
        activities.value = items
        isLoading.value = false
      }, (err) => {
        console.error('[ActivityFeed] Error listening to activities:', err)
        error.value = err.message
        isLoading.value = false
      })
    } catch (err: any) {
      console.error('[ActivityFeed] Setup error:', err)
      error.value = err.message
      isLoading.value = false
    }
  }

  const stopListening = () => {
    if (unsubscribeSnapshot) {
      unsubscribeSnapshot()
      unsubscribeSnapshot = null
    }
    activities.value = []
  }

  // Add a new activity
  const addActivity = async (userId: string, activity: Omit<ActivityItem, 'id' | 'timestamp' | 'userId'>) => {
    try {
      const activitiesRef = collection(db, 'users', userId, 'activities')
      await trackedAddDoc(activitiesRef, {
        ...activity,
        timestamp: serverTimestamp()
      }, CALLER)
      return true
    } catch (err) {
      console.error('[ActivityFeed] Error adding activity:', err)
      return false
    }
  }

  // Mark a single activity as read
  const markAsRead = async (userId: string, activityId: string) => {
    try {
      const activityRef = doc(db, 'users', userId, 'activities', activityId)
      await trackedUpdateDoc(activityRef, {
        isRead: true
      }, CALLER)
      return true
    } catch (err) {
      console.error('[ActivityFeed] Error marking as read:', err)
      return false
    }
  }

  // Mark all activities as read
  const markAllAsRead = async (userId: string) => {
    try {
      const activitiesRef = collection(db, 'users', userId, 'activities')
      // Only get unread ones to save writes
      const q = query(activitiesRef, limit(50))
      const snapshot = await trackedGetDocs(q, CALLER)
      
      const batch = trackedWriteBatch(db, CALLER)
      let count = 0
      
      snapshot.forEach((doc) => {
        if (!doc.data().isRead) {
          batch.update(doc.ref, { isRead: true })
          count++
        }
      })
      
      if (count > 0) {
        await batch.commit()
      }
      return true
    } catch (err) {
      console.error('[ActivityFeed] Error marking all as read:', err)
      return false
    }
  }

  const generateActivityTitle = (type: ActivityType): string => {
    switch (type) {
      case 'new_pb': return 'Nuovo Record Personale!'
      case 'session_added': return 'Nuova Sessione Registrata'
      case 'milestone_laps': return 'Traguardo Giri Raggiunto!'
      case 'system_update': return 'Aggiornamento Sistema'
      default: return 'Nuova Attività'
    }
  }

  return {
    activities,
    isLoading,
    error,
    unreadCount,
    hasUnread,
    listenToActivities,
    stopListening,
    addActivity,
    markAsRead,
    markAllAsRead,
    generateActivityTitle
  }
}

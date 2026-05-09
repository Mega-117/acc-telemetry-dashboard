<script setup lang="ts">
// Profile page - rendered via Nuxt file-based routing
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'

definePageMeta({
  layout: false,
  pageTransition: {
    name: 'profile-zoom',
    mode: 'out-in'
  }
})

const { userDisplayName, logout: firebaseLogout, userRole } = useFirebaseAuth()

// Get user email from Firebase
const { currentUser } = useFirebaseAuth()
const userEmail = computed(() => currentUser.value?.email || '')
type ProfileTransitionState = 'entering' | 'entered' | 'leaving'

const transitionState = ref<ProfileTransitionState>('entering')
const isLeaving = ref(false)
const exitDurationMs = 280

const profileScreenClass = computed(() => ({
  'profile-screen--entering': transitionState.value === 'entering',
  'profile-screen--entered': transitionState.value === 'entered',
  'profile-screen--leaving': transitionState.value === 'leaving'
}))

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

onMounted(async () => {
  if (prefersReducedMotion()) {
    transitionState.value = 'entered'
    return
  }

  transitionState.value = 'entering'
  await waitForNextPaint()
  transitionState.value = 'entered'
})

const handleLogout = async () => {
  await firebaseLogout()
  navigateTo('/')
}

const handleBack = async () => {
  if (isLeaving.value) return
  isLeaving.value = true

  if (prefersReducedMotion()) {
    await navigateTo('/panoramica')
    return
  }

  transitionState.value = 'leaving'
  await wait(exitDurationMs)
  await navigateTo('/panoramica')
}
</script>

<template>
  <div
    class="profile-screen"
    :class="profileScreenClass"
    :data-transition-state="transitionState"
    data-testid="profile-screen"
  >
    <ProfilePage
      :user-email="userEmail"
      :user-nickname="userDisplayName"
      :user-role="(userRole as 'pilot' | 'coach' | 'admin')"
      @logout="handleLogout"
      @back="handleBack"
    />
  </div>
</template>

<style scoped>
.profile-screen {
  min-height: 100vh;
  transform-origin: center top;
  will-change: opacity, transform, filter;
}

.profile-screen--entering {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
  filter: blur(4px);
}

.profile-screen--entered {
  opacity: 1;
  transform: translateY(0) scale(1);
  filter: blur(0);
  transition:
    opacity 280ms ease,
    transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1),
    filter 280ms ease;
}

.profile-screen--leaving {
  opacity: 0;
  transform: translateY(10px) scale(0.94);
  filter: blur(5px);
  transition:
    opacity 280ms ease,
    transform 280ms cubic-bezier(0.4, 0, 0.2, 1),
    filter 280ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .profile-screen,
  .profile-screen--entering,
  .profile-screen--entered,
  .profile-screen--leaving {
    opacity: 1;
    transform: none;
    filter: none;
    transition: none;
  }
}
</style>


<script setup lang="ts">
// ============================================
// Dashboard Layout - Wraps authenticated pages
// ============================================

import { useFirebaseAuth } from '~/composables/useFirebaseAuth'

const { userDisplayName, userEmail, logout: firebaseLogout } = useFirebaseAuth()
const route = useRoute()
const router = useRouter()

// Inject profile navigation from app.vue
const goToProfile = inject<() => void>('goToProfile')

// Determine active tab from route path
const activeTab = computed(() => {
  const path = route.path
  if (path.startsWith('/sessioni')) return 'sessioni'
  if (path.startsWith('/piste')) return 'piste'
  return 'panoramica'
})

// Display name
const displayName = computed(() => {
  if (userDisplayName.value) return userDisplayName.value
  if (userEmail.value) return userEmail.value.split('@')[0]
  return 'Utente'
})

// Handlers
const handleLogout = async () => {
  await firebaseLogout()
  navigateTo('/')
}

const handleGoToProfile = () => {
  if (goToProfile) {
    goToProfile()
  }
}
</script>

<template>
  <div class="dashboard-layout">
    <!-- TopBar -->
    <LayoutTopBar
      :user-name="displayName"
      @logout="handleLogout"
      @go-to-profile="handleGoToProfile"
    />

    <!-- TabsBar with NuxtLink navigation -->
    <LayoutTabsBarRouter :active-tab="activeTab" />

    <!-- Page Content with transitions -->
    <main class="main-content">
      <slot />
    </main>
  </div>
</template>

<style lang="scss" scoped>
.dashboard-layout {
  min-height: 100vh;
  background: #0d0d12;
}

.main-content {
  flex: 1;
}
</style>

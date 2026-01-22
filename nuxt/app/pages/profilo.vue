<script setup lang="ts">
// Profile page - rendered via Nuxt file-based routing
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'

definePageMeta({
  layout: false
})

const { userDisplayName, logout: firebaseLogout, userRole } = useFirebaseAuth()

// Get user email from Firebase
const { currentUser } = useFirebaseAuth()
const userEmail = computed(() => currentUser.value?.email || '')

const handleLogout = async () => {
  await firebaseLogout()
  navigateTo('/')
}

const handleBack = () => {
  navigateTo('/panoramica')
}
</script>

<template>
  <ProfilePage
    :user-email="userEmail"
    :user-nickname="userDisplayName"
    :user-role="userRole"
    @logout="handleLogout"
    @back="handleBack"
  />
</template>


<script setup lang="ts">
// ============================================
// TopBar - Application header
// ============================================

import { computed } from 'vue'

const props = defineProps<{
  userName?: string
}>()

const emit = defineEmits<{
  logout: []
  goToProfile: []
}>()

const { isCoach, isAdmin } = useFirebaseAuth()
const displayName = computed(() => props.userName ?? 'Utente')

const goToCoachArea = () => {
  navigateTo('/piloti')
}
</script>

<template>
  <header class="topbar">
    <div class="topbar__inner">
      <!-- Logo -->
      <div class="topbar__brand">
        <span class="brand-badge">ACC</span>
        <span class="brand-name">TELEMETRY</span>
      </div>

      <!-- Spacer -->
      <div class="topbar__spacer"></div>

      <!-- Coach/Admin Button (for coaches and admins) -->
      <button 
        v-if="isCoach || isAdmin" 
        class="coach-button" 
        :class="{ 'coach-button--admin': isAdmin }"
        @click="goToCoachArea"
        :title="isAdmin ? 'Gestione utenti' : 'I miei piloti'"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="9" cy="7" r="4"/>
          <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/>
          <path d="M16 3.13a4 4 0 010 7.75"/>
          <path d="M21 21v-2a4 4 0 00-3-3.85"/>
        </svg>
      </button>

      <!-- User Dropdown -->
      <div class="topbar__user">
        <UiUserDropdown
          :user-name="displayName"
          @logout="emit('logout')"
          @go-to-profile="emit('goToProfile')"
        />
      </div>
    </div>
  </header>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.topbar {
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.topbar__inner {
  display: flex;
  align-items: center;
  max-width: 1400px;
  margin: 0 auto;
  padding: 16px 24px;
}

.topbar__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-badge {
  font-family: 'Outfit', sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: $racing-red;
  padding: 5px 8px;
  border: 2px solid $racing-red;
  border-radius: 5px;
}

.brand-name {
  font-family: 'Outfit', sans-serif;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #fff;
}

.topbar__spacer {
  flex: 1;
}

.coach-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  margin-right: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba($racing-orange, 0.15);
    border-color: rgba($racing-orange, 0.4);
    color: $racing-orange;
  }
  
  &--admin:hover {
    background: rgba(#8b5cf6, 0.15);
    border-color: rgba(#8b5cf6, 0.4);
    color: #8b5cf6;
  }
}

.topbar__user {
  display: flex;
  align-items: center;
}
</style>

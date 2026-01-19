<script setup lang="ts">
// ============================================
// Coach/Admin Layout - Area for coach tools and admin management
// ============================================

const { userDisplayName, logout: firebaseLogout, isCoach, isAdmin, userRole } = useFirebaseAuth()

// Redirect non-coaches and non-admins
onMounted(() => {
  if (!isCoach.value && !isAdmin.value) {
    navigateTo('/panoramica')
  }
})

const handleLogout = async () => {
  await firebaseLogout()
  navigateTo('/')
}

const goToDashboard = () => {
  navigateTo('/panoramica')
}

const goToProfile = () => {
  navigateTo('/profilo')
}

// Dynamic badge and title based on role
const areaBadge = computed(() => isAdmin.value ? 'ADMIN' : 'COACH')
const areaTitle = computed(() => isAdmin.value ? 'GESTIONE UTENTI' : 'AREA PILOTI')
</script>

<template>
  <div class="coach-layout">
    <!-- Coach Header -->
    <header class="coach-header" :class="{ 'coach-header--admin': isAdmin }">
      <div class="coach-header__inner">
        <!-- Back to Dashboard -->
        <button class="back-button" @click="goToDashboard">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          <span>Dashboard</span>
        </button>

        <!-- Area Title -->
        <div class="area-title">
          <span class="area-badge" :class="{ 'area-badge--admin': isAdmin }">{{ areaBadge }}</span>
          <span class="area-name">{{ areaTitle }}</span>
        </div>

        <!-- Spacer -->
        <div class="header-spacer"></div>

        <!-- User Dropdown -->
        <UiUserDropdown
          :user-name="userDisplayName"
          @logout="handleLogout"
          @go-to-profile="goToProfile"
        />
      </div>
    </header>

    <!-- Main Content -->
    <main class="coach-main">
      <slot />
    </main>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.coach-layout {
  min-height: 100vh;
  background: linear-gradient(180deg, #0a0a12 0%, #0f0f18 100%);
}

.coach-header {
  background: rgba($racing-orange, 0.08);
  border-bottom: 1px solid rgba($racing-orange, 0.2);
}

.coach-header__inner {
  display: flex;
  align-items: center;
  gap: 24px;
  max-width: 1400px;
  margin: 0 auto;
  padding: 16px 24px;
}

.back-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.7);
  font-family: $font-primary;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
}

.area-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.area-badge {
  font-family: 'Outfit', sans-serif;
  font-size: 12px;
  font-weight: 700;
  color: $racing-orange;
  padding: 4px 8px;
  border: 2px solid $racing-orange;
  border-radius: 5px;
  letter-spacing: 1px;
  
  &--admin {
    color: #8b5cf6;
    border-color: #8b5cf6;
  }
}

.coach-header--admin {
  background: rgba(#8b5cf6, 0.08);
  border-bottom-color: rgba(#8b5cf6, 0.2);
}

.area-name {
  font-family: 'Outfit', sans-serif;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #fff;
}

.header-spacer {
  flex: 1;
}

.coach-main {
  max-width: 1400px;
  margin: 0 auto;
  padding: 32px 24px;
}
</style>

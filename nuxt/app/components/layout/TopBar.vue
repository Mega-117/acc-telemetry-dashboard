<script setup lang="ts">
// ============================================
// TopBar - Application header
// ============================================

const props = defineProps<{
  userName?: string
}>()

const emit = defineEmits<{
  logout: []
  goToProfile: []
}>()

const displayName = computed(() => props.userName || 'Utente')
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

.topbar__user {
  display: flex;
  align-items: center;
}
</style>

<script setup lang="ts">
// ============================================
// MainLayout - TopBar + TabsBar + Content
// ============================================

const props = defineProps<{
  userName?: string
  activeTab: 'panoramica' | 'sessioni' | 'piste'
}>()

const emit = defineEmits<{
  logout: []
  goToProfile: []
  navigate: [tab: string]
}>()
</script>

<template>
  <div class="main-layout">
    <!-- TopBar -->
    <LayoutTopBar
      :user-name="userName"
      @logout="emit('logout')"
      @go-to-profile="emit('goToProfile')"
    />

    <!-- TabsBar -->
    <LayoutTabsBar
      :active-tab="activeTab"
      @navigate="emit('navigate', $event)"
    />

    <!-- Page Content -->
    <main class="main-content">
      <slot />
    </main>
  </div>
</template>

<style lang="scss" scoped>
.main-layout {
  min-height: 100vh;
  background: #0d0d12;
}

.main-content {
  flex: 1;
}
</style>

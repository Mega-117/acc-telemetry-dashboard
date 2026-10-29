<script setup lang="ts">
// ============================================
// UserDropdown - User menu dropdown component
// ============================================

import { onMounted, ref } from 'vue'
import { useI18n } from '~/i18n'
import { DISCORD_INVITE_URL } from '~/utils/communityLinks'

const { t } = useI18n()

const props = defineProps<{
  userName: string
}>()

const emit = defineEmits<{
  logout: []
  goToProfile: []
  goToSettings: []
}>()

const isOpen = ref(false)
const showSettings = ref(false)
// PIP-661: Segnala problema, from the same menu everywhere.
const reportOpen = ref(false)
// Hidden for the beta (product decision 28/10): the dialog and its limits stay, the menu entry does not show.
const SHOW_REPORT_PROBLEM = false
const openReport = () => { closeDropdown(); reportOpen.value = true }

onMounted(() => {
  const api = (window as Window & {
    electronAPI?: { localIdentityRole?: string; controlsGetState?: () => Promise<unknown> }
  }).electronAPI
  showSettings.value = api?.localIdentityRole === 'primary' && !!api.controlsGetState
})

const toggleDropdown = () => {
  isOpen.value = !isOpen.value
}

const closeDropdown = () => {
  isOpen.value = false
}

const handleProfile = () => {
  closeDropdown()
  emit('goToProfile')
}

const handleSettings = () => {
  closeDropdown()
  emit('goToSettings')
}

const handleLogout = () => {
  emit('logout')
  closeDropdown()
}
</script>

<template>
  <div class="user-dropdown" v-click-outside="closeDropdown">
    <!-- Trigger Button -->
    <button class="dropdown-trigger" @click="toggleDropdown">
      <span class="user-name">{{ userName }}</span>
      <svg 
        class="arrow-icon" 
        :class="{ 'arrow-icon--open': isOpen }"
        width="12" 
        height="12" 
        viewBox="0 0 12 12" 
        fill="none"
      >
        <path 
          d="M3 4.5L6 7.5L9 4.5" 
          stroke="currentColor" 
          stroke-width="1.5" 
          stroke-linecap="round" 
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <!-- Dropdown Menu -->
    <Transition name="dropdown">
      <div v-if="isOpen" class="dropdown-menu">
        <button class="dropdown-item" @click="handleProfile">
          <svg class="item-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="5" r="3" stroke="currentColor" stroke-width="1.5"/>
            <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          {{ t('userMenu.profile') }}
        </button>
        <button v-if="showSettings" class="dropdown-item" @click="handleSettings">
          <!-- PIP-676: a gear, not a clock. -->
          <svg class="item-icon item-icon--settings" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" stroke="currentColor" stroke-width="2.25" stroke-linejoin="round"/>
            <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2.25"/>
          </svg>
          {{ t('userMenu.settings') }}
        </button>
        <button v-if="SHOW_REPORT_PROBLEM" class="dropdown-item" @click="openReport">
          <svg class="item-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2l6.5 11.5h-13z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="M8 6.5v3.2M8 11.6v.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          {{ t('userMenu.report') }}
        </button>
        <!-- PIP-672: the community; the program opens it in the system browser. -->
        <a class="dropdown-item dropdown-item--link" :href="DISCORD_INVITE_URL" target="_blank" rel="noopener" @click="closeDropdown">
          <!-- PIP-676: the Discord logo, not a speech bubble. -->
          <svg class="item-icon item-icon--discord" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>
          </svg>
          {{ t('userMenu.discord') }}
        </a>
        <div class="dropdown-divider"></div>
        <button class="dropdown-item dropdown-item--danger" @click="handleLogout">
          <svg class="item-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 2H4a2 2 0 00-2 2v8a2 2 0 002 2h2M11 11l3-3-3-3M14 8H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ t('userMenu.logout') }}
        </button>
      </div>
    </Transition>
    <ReportProblemDialog v-if="reportOpen" @close="reportOpen = false" />
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

$font-family: $font-primary;
$color-racing-red: $racing-red;
$color-racing-orange: $racing-orange;

.user-dropdown {
  position: relative;
}

// === TRIGGER BUTTON ===
.dropdown-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #fff;
  font-family: $font-family;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba($color-racing-red, 0.4);
  }
}

.user-name {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arrow-icon {
  color: rgba(255, 255, 255, 0.5);
  transition: transform 0.2s ease;

  &--open {
    transform: rotate(180deg);
  }
}

// === DROPDOWN MENU ===
.dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 200px;
  padding: 8px;
  background: #1a1a22;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  z-index: 100;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  background: none;
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.8);
  font-family: $font-family;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
  text-decoration: none; // PIP-672: the Discord entry is a link

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }

  &--disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &--danger {
    color: $color-racing-red;

    &:hover {
      background: rgba($color-racing-red, 0.1);
    }
  }
}

.item-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.dropdown-divider {
  height: 1px;
  margin: 8px 0;
  background: rgba(255, 255, 255, 0.08);
}

// === TRANSITION ===
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>

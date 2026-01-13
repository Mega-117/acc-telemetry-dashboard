<script setup lang="ts">
// ============================================
// UserDropdown - User menu dropdown component
// ============================================

import { ref } from 'vue'

const props = defineProps<{
  userName: string
}>()

const emit = defineEmits<{
  logout: []
  goToProfile: []
}>()

const isOpen = ref(false)

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

const handleLogout = () => {
  closeDropdown()
  emit('logout')
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
          Profilo
        </button>
        <button class="dropdown-item dropdown-item--disabled" disabled>
          <svg class="item-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 5v3l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          Impostazioni
        </button>
        <div class="dropdown-divider"></div>
        <button class="dropdown-item dropdown-item--danger" @click="handleLogout">
          <svg class="item-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 2H4a2 2 0 00-2 2v8a2 2 0 002 2h2M11 11l3-3-3-3M14 8H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Logout
        </button>
      </div>
    </Transition>
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

<script setup lang="ts">
import { ref } from 'vue'
import { useActivityFeed, type ActivityItem } from '~/composables/useActivityFeed'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'

const {
  activities,
  unreadCount,
  markAsRead,
  markAllAsRead,
  generateActivityTitle
} = useActivityFeed()

const { currentUser } = useFirebaseAuth()

const isOpen = ref(false)

const togglePanel = () => {
  isOpen.value = !isOpen.value
}

const closePanel = () => {
  isOpen.value = false
}

const handleMarkAllAsRead = async () => {
  if (currentUser.value) {
    await markAllAsRead(currentUser.value.uid)
  }
}

const handleItemClick = async (activity: ActivityItem) => {
  if (!activity.isRead && currentUser.value) {
    await markAsRead(currentUser.value.uid, activity.id)
  }
}

// Click outside functionality
const panelRef = ref<HTMLElement | null>(null)
onMounted(() => {
  document.addEventListener('click', (e) => {
    if (isOpen.value && panelRef.value && !panelRef.value.contains(e.target as Node)) {
      closePanel()
    }
  })
})
</script>

<template>
  <div class="notification-bell" ref="panelRef">
    <button 
      class="bell-button" 
      :class="{ 'bell-button--active': isOpen, 'bell-button--unread': unreadCount > 0 }"
      @click="togglePanel"
      title="Storico Attività"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
      </svg>
      <span v-if="unreadCount > 0" class="badge">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
    </button>

    <Transition name="slide-fade">
      <div v-if="isOpen" class="activity-panel">
        <div class="activity-header">
          <h3>Cronologia Attività</h3>
          <button v-if="unreadCount > 0" class="mark-all-btn" @click="handleMarkAllAsRead">
            Segna tutti come letti
          </button>
        </div>

        <div class="activity-list" v-if="activities && activities.length > 0">
          <div 
            v-for="item in activities" 
            :key="item.id" 
            class="activity-item" 
            :class="{ 'activity-item--unread': !item.isRead }"
            @click="handleItemClick(item)"
          >
            <div class="activity-icon" :class="'icon-' + item.type">
              <svg v-if="item.type === 'new_pb'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>
              <svg v-else-if="item.type === 'milestone_laps'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
              <svg v-else-if="item.type === 'session_added'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            </div>
            <div class="activity-content">
              <div class="activity-title">{{ item.title || generateActivityTitle(item.type) }}</div>
              <div class="activity-desc">{{ item.description }}</div>
              <div class="activity-time">
                {{ new Date(item.timestamp).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }}
              </div>
            </div>
            <div class="unread-dot" v-if="!item.isRead"></div>
          </div>
        </div>
        <div class="activity-empty" v-else>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          <p>Nessuna attività recente</p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.notification-bell {
  position: relative;
  margin-right: $spacing-sm;
}

.bell-button {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 42px;
  height: 42px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: $radius-md;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all $transition-fast;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  &--active {
    background: rgba($racing-red, 0.15);
    border-color: rgba($racing-red, 0.4);
    color: $racing-red;
  }

  &--unread {
    animation: ring 2s ease-in-out infinite alternate;
  }
}

.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: $racing-red;
  color: #fff;
  font-size: 10px;
  font-weight: bold;
  padding: 2px 5px;
  border-radius: 10px;
  box-shadow: 0 0 0 2px $bg-secondary;
}

.activity-panel {
  position: absolute;
  top: 120%;
  right: 0;
  width: 350px;
  max-height: 500px;
  background: $bg-secondary;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: $radius-md;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  z-index: 1000;
  overflow: hidden;
}

.activity-header {
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;

  h3 {
    margin: 0;
    font-size: $font-size-base;
    font-weight: 600;
  }

  .mark-all-btn {
    background: none;
    border: none;
    color: $accent-info;
    font-size: $font-size-xs;
    cursor: pointer;
    &:hover { text-decoration: underline; }
  }
}

.activity-list {
  overflow-y: auto;
  flex: 1;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }
}

.activity-item {
  padding: 16px;
  display: flex;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: background $transition-fast;
  position: relative;

  &:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  &--unread {
    background: rgba(255, 255, 255, 0.015);
  }
}

.unread-dot {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: $racing-red;
}

.activity-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.icon-new_pb {
    background: rgba($racing-red, 0.15);
    color: $racing-red;
  }
  &.icon-milestone_laps {
    background: rgba($racing-orange, 0.15);
    color: $racing-orange;
  }
  &.icon-session_added {
    background: rgba($accent-success, 0.15);
    color: $accent-success;
  }
  &.icon-system_update {
    background: rgba($accent-info, 0.15);
    color: $accent-info;
  }
}

.activity-content {
  flex: 1;
}

.activity-title {
  font-weight: 500;
  font-size: $font-size-sm;
  color: $text-primary;
  margin-bottom: 4px;
}

.activity-desc {
  font-size: $font-size-xs;
  color: $text-secondary;
  margin-bottom: 8px;
  line-height: 1.4;
}

.activity-time {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
}

.activity-empty {
  padding: 40px 20px;
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  
  svg {
    opacity: 0.5;
    margin-bottom: 12px;
  }
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}
</style>

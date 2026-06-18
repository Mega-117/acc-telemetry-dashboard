<script setup lang="ts">
import { useAppNotifications } from '~/composables/useAppNotifications'

const { notifications, dismiss } = useAppNotifications()
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="app-notification" tag="div" class="app-notifications">
      <button
        v-for="notification in notifications"
        :key="notification.id"
        type="button"
        class="app-notification"
        :class="`app-notification--${notification.type}`"
        @click="dismiss(notification.id)"
      >
        <span class="app-notification__dot" />
        <span class="app-notification__text">{{ notification.text }}</span>
      </button>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped lang="scss">
.app-notifications {
  position: fixed;
  top: 44px;
  right: 12px;
  z-index: 12000;
  display: grid;
  gap: 8px;
  max-width: min(420px, calc(100vw - 24px));
  pointer-events: none;
}

.app-notification {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 40px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #fff;
  font: 500 13px/1.25 Inter, -apple-system, BlinkMacSystemFont, sans-serif;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
}

.app-notification--success {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.92), rgba(22, 163, 74, 0.92));
}

.app-notification--error {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.92), rgba(220, 38, 38, 0.92));
}

.app-notification--info {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.92), rgba(37, 99, 235, 0.92));
}

.app-notification__dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.16);
}

.app-notification__text {
  flex: 1 1 auto;
}

.app-notification-enter-active,
.app-notification-leave-active {
  transition: all 0.22s ease;
}

.app-notification-enter-from,
.app-notification-leave-to {
  opacity: 0;
  transform: translateX(18px);
}
</style>

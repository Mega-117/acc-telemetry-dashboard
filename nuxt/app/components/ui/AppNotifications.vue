<script setup lang="ts">
import { useAppNotifications } from '~/composables/useAppNotifications'

const { notifications, dismiss } = useAppNotifications()
</script>

<template>
  <Teleport to="body">
    <!-- One column of small messages, top right. The slot hosts the runtime status and the sync result
         (teleported in by their components) above the notifications, so nothing overlaps and no bar
         across the page pushes the content down. -->
    <div class="app-notifications">
      <div id="app-toast-slot" class="app-notifications__slot" />
      <TransitionGroup name="app-notification" tag="div" class="app-notifications__list">
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
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use '~/assets/scss/racing-toast' as toast;

.app-notifications {
  position: fixed;
  top: 44px;
  right: 12px;
  z-index: 12000;
  display: grid;
  gap: 8px;
  width: max-content;
  max-width: min(420px, calc(100vw - 24px));
  pointer-events: none;
}

.app-notifications__slot,
.app-notifications__list { display: contents; }

.app-notification {
  @include toast.toast;
  @include toast.toast-tones;
  cursor: pointer;
}

.app-notification__dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  background: var(--toast-tone);
  box-shadow: 0 0 8px var(--toast-tone);
}

.app-notification__text {
  flex: 1 1 auto;
}

@include toast.toast-motion(app-notification);
</style>

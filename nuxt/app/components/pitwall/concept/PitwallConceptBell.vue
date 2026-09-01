<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePitwallConceptMode } from '~/composables/usePitwallConceptMode'

type MockNotice = {
  id: number
  type: 'crew' | 'temporary'
  title: string
  body: string
}

const { notificationsOpen, toggleNotifications } = usePitwallConceptMode()
const notices = ref<MockNotice[]>([
  { id: 1, type: 'crew', title: 'Invito alla Crew', body: 'Marco ti invita in Endurance X' },
  { id: 2, type: 'temporary', title: 'Invito temporaneo', body: 'Luca ti invita ad assistere questa gara' },
])
const pendingCount = computed(() => notices.value.length)

function remove(id: number) {
  notices.value = notices.value.filter(item => item.id !== id)
}
</script>

<template>
  <div class="pwc-bell-wrap">
    <button class="pwc-bell" :class="{ 'is-open': notificationsOpen }" aria-label="Notifiche Concept" @click.stop="toggleNotifications">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      <span v-if="pendingCount" class="pwc-bell__badge">{{ pendingCount }}</span>
    </button>

    <div v-if="notificationsOpen" class="pwc-notices" @click.stop>
      <header><strong>Notifiche</strong></header>
      <div v-if="notices.length" class="pwc-notices__list">
        <article v-for="notice in notices" :key="notice.id" class="pwc-notice">
          <div class="pwc-notice__copy">
            <strong>{{ notice.title }}</strong>
            <p>{{ notice.body }}</p>
          </div>
          <div class="pwc-notice__actions">
            <button
              class="is-accept"
              :aria-label="`Accetta ${notice.title.toLowerCase()}`"
              :title="`Accetta ${notice.title.toLowerCase()}`"
              @click="remove(notice.id)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
            </button>
            <button
              class="is-reject"
              :aria-label="`Rifiuta ${notice.title.toLowerCase()}`"
              :title="`Rifiuta ${notice.title.toLowerCase()}`"
              @click="remove(notice.id)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
            </button>
          </div>
        </article>
      </div>
      <p v-else class="pwc-notices__empty">Nessun invito.</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;
.pwc-bell-wrap{position:relative;margin-right:$spacing-sm}.pwc-bell{position:relative;display:grid;place-items:center;width:39px;height:39px;border:1px solid rgba(255,255,255,.12);border-radius:$radius-md;background:rgba(255,255,255,.04);color:$text-secondary;cursor:pointer}.pwc-bell:hover,.pwc-bell.is-open{color:#fff;border-color:rgba($racing-orange,.5);background:rgba($racing-orange,.08)}.pwc-bell__badge{position:absolute;right:-4px;top:-5px;display:grid;place-items:center;min-width:18px;height:18px;padding:0 4px;border-radius:10px;background:$accent-danger;color:#fff;font:700 10px $font-primary;box-shadow:0 0 0 2px $bg-primary}.pwc-notices{position:absolute;z-index:1100;right:0;top:52px;width:min(340px,calc(100vw - 24px));border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#11151d;box-shadow:0 22px 70px rgba(0,0,0,.65);overflow:hidden}.pwc-notices header{display:flex;align-items:center;min-height:52px;padding:0 16px;border-bottom:1px solid rgba(255,255,255,.08)}.pwc-notices header strong{font:700 17px $font-display}.pwc-notice{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;min-height:76px;padding:13px 14px 13px 16px;border-bottom:1px solid rgba(255,255,255,.07)}.pwc-notice:last-child{border-bottom:0}.pwc-notice__copy{min-width:0}.pwc-notice strong{display:block;font-size:14px}.pwc-notice p{margin:4px 0 0;color:$text-secondary;font-size:12px;line-height:1.4}.pwc-notice__actions{display:flex;gap:7px}.pwc-notice__actions button{display:grid;place-items:center;width:34px;height:34px;padding:0;border:1px solid;border-radius:7px;background:transparent;cursor:pointer;transition:background-color .14s ease,border-color .14s ease,color .14s ease,transform .1s ease}.pwc-notice__actions button:active{transform:translateY(1px)}.pwc-notice__actions svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.pwc-notice__actions .is-accept{border-color:rgba($accent-success,.5);color:$accent-success;background:rgba($accent-success,.06)}.pwc-notice__actions .is-accept:hover{border-color:$accent-success;background:rgba($accent-success,.14)}.pwc-notice__actions .is-reject{border-color:rgba($accent-danger,.5);color:#ff625c;background:rgba($accent-danger,.05)}.pwc-notice__actions .is-reject:hover{border-color:$accent-danger;background:rgba($accent-danger,.14)}.pwc-notice__actions button:focus-visible{outline:2px solid $racing-orange;outline-offset:2px}.pwc-notices__empty{margin:0;padding:24px;text-align:center;color:$text-muted;font-size:13px}@media(prefers-reduced-motion:reduce){.pwc-notice__actions button{transition:none}}
</style>

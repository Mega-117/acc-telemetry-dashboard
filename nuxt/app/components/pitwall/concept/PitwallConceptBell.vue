<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePitwallConceptMode } from '~/composables/usePitwallConceptMode'

type MockNotice = { id: number, type: string, title: string, body: string, meta: string, primary?: string }

const { notificationsOpen, toggleNotifications } = usePitwallConceptMode()
const notices = ref<MockNotice[]>([
  { id: 1, type: 'crew', title: 'Invito Crew', body: 'Marco ti ha invitato in Endurance X', meta: '2 minuti fa', primary: 'Accetta' },
  { id: 2, type: 'wall', title: 'Invito al muretto', body: 'Luca ti invita ad assistere questa gara', meta: 'Ferrari 296 GT3 · Nürburgring', primary: 'Partecipa' },
  { id: 3, type: 'info', title: 'Aggiornamento', body: 'La sessione di Monza è iniziata', meta: '45 minuti fa' },
])
const unread = computed(() => notices.value.filter(item => item.primary).length)

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
      <span v-if="unread" class="pwc-bell__badge">{{ unread }}</span>
    </button>

    <div v-if="notificationsOpen" class="pwc-notices" @click.stop>
      <header><strong>Notifiche</strong><span>{{ unread }}</span><button @click="notices = []">Segna come lette</button></header>
      <div v-if="notices.length" class="pwc-notices__list">
        <article v-for="notice in notices" :key="notice.id" class="pwc-notice">
          <span class="pwc-notice__icon" :class="`is-${notice.type}`">{{ notice.type === 'crew' ? 'C' : notice.type === 'wall' ? 'W' : 'i' }}</span>
          <div>
            <strong>{{ notice.title }}</strong>
            <p>{{ notice.body }}</p>
            <small>{{ notice.meta }}</small>
            <div v-if="notice.primary" class="pwc-notice__actions">
              <button class="is-primary" @click="remove(notice.id)">{{ notice.primary }}</button>
              <button @click="remove(notice.id)">Rifiuta</button>
            </div>
          </div>
        </article>
      </div>
      <p v-else class="pwc-notices__empty">Nessuna nuova notifica.</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;
.pwc-bell-wrap{position:relative;margin-right:$spacing-sm}.pwc-bell{position:relative;display:grid;place-items:center;width:42px;height:42px;border:1px solid rgba(255,255,255,.12);border-radius:$radius-md;background:rgba(255,255,255,.04);color:$text-secondary;cursor:pointer}.pwc-bell:hover,.pwc-bell.is-open{color:#fff;border-color:rgba($racing-orange,.5);background:rgba($racing-orange,.08)}.pwc-bell__badge{position:absolute;right:-4px;top:-5px;display:grid;place-items:center;min-width:18px;height:18px;padding:0 4px;border-radius:10px;background:$accent-danger;color:#fff;font:700 10px $font-primary;box-shadow:0 0 0 2px $bg-primary}.pwc-notices{position:absolute;z-index:1100;right:0;top:52px;width:min(360px,calc(100vw - 24px));border:1px solid rgba(255,255,255,.12);border-radius:14px;background:#11151d;box-shadow:0 22px 70px rgba(0,0,0,.65);overflow:hidden}.pwc-notices header{display:flex;align-items:center;gap:8px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.08)}.pwc-notices header strong{font:700 18px $font-display}.pwc-notices header span{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:$accent-danger;font-size:11px}.pwc-notices header button{margin-left:auto;border:0;background:none;color:$text-secondary;cursor:pointer}.pwc-notice{display:grid;grid-template-columns:34px 1fr;gap:12px;padding:16px;border-bottom:1px solid rgba(255,255,255,.07)}.pwc-notice__icon{display:grid;place-items:center;width:34px;height:34px;border:1px solid #8b5cf6;border-radius:50%;color:#a78bfa;font-weight:700}.pwc-notice__icon.is-wall{border-color:$accent-success;color:$accent-success}.pwc-notice__icon.is-info{border-color:$accent-info;color:$accent-info}.pwc-notice strong{font-size:14px}.pwc-notice p{margin:5px 0;color:#d4d4d8;font-size:13px;line-height:1.45}.pwc-notice small{color:$text-muted}.pwc-notice__actions{display:flex;gap:8px;margin-top:12px}.pwc-notice__actions button{min-height:36px;padding:0 16px;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:transparent;color:#fff;cursor:pointer}.pwc-notice__actions .is-primary{border-color:$racing-orange;background:$racing-red}.pwc-notices__empty{padding:28px;text-align:center;color:$text-muted}
</style>

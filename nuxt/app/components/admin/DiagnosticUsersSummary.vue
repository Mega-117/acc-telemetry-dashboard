<script setup lang="ts">
import { computed } from 'vue'
import { diagnosticUsers } from '~/utils/diagnosticsPresentation'

const props = defineProps<{
  events: readonly { userId?: unknown, pilotNickname?: unknown }[]
}>()
const users = computed(() => diagnosticUsers(props.events))
const remaining = computed(() => users.value.slice(3))
</script>

<template>
  <section class="diagnostic-users" aria-label="Utenti negli errori di questa pagina">
    <div class="diagnostic-users__heading">
      <strong>{{ users.length }} {{ users.length === 1 ? 'utente' : 'utenti' }} con errori</strong>
      <span>Negli errori di questa pagina</span>
    </div>
    <div v-if="users.length" class="diagnostic-users__names">
      <span v-for="user in users.slice(0, 3)" :key="user.id" class="diagnostic-users__name" :title="user.nickname">
        {{ user.nickname }}
      </span>
      <details v-if="remaining.length" :key="users.map(user => user.id).join('|')">
        <summary>+{{ remaining.length }} {{ remaining.length === 1 ? 'altro' : 'altri' }}</summary>
        <ul tabindex="0" aria-label="Altri utenti di questa pagina">
          <li v-for="user in remaining" :key="user.id">{{ user.nickname }}</li>
        </ul>
      </details>
    </div>
  </section>
</template>

<style scoped>
.diagnostic-users { padding: 14px 16px; margin: 0 0 18px; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; background: rgba(255,255,255,.025); }
.diagnostic-users__heading { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; }
.diagnostic-users__heading strong { font-size: .9rem; color: #e2e8f0; }
.diagnostic-users__heading > span { font-size: .78rem; color: #94a3b8; }
.diagnostic-users__names { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; margin-top: 10px; }
.diagnostic-users__name { max-width: min(100%, 240px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 4px 9px; border-radius: 6px; background: rgba(255,255,255,.06); color: #cbd5e1; font-size: .82rem; }
details { min-width: 0; max-width: 100%; }
summary { padding: 4px 8px; cursor: pointer; color: #93c5fd; font-size: .82rem; }
summary:focus-visible, ul:focus-visible { outline: 2px solid #93c5fd; outline-offset: 3px; }
ul { max-height: 9rem; overflow-y: auto; overscroll-behavior: contain; margin: 8px 0 0; padding: 0 12px; list-style: none; }
li { padding: 5px 0; color: #cbd5e1; font-size: .82rem; overflow-wrap: anywhere; }
</style>

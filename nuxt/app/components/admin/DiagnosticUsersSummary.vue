<script setup lang="ts" generic="T extends DiagnosticRecapEvent">
import { computed, ref, watch } from 'vue'
import { diagnosticUsers, diagnosticErrorGroups, type DiagnosticRecapEvent } from '~/utils/diagnosticsPresentation'

const props = defineProps<{
  events: readonly T[]
}>()
const emit = defineEmits<{ select: [event: T] }>()
const users = computed(() => diagnosticUsers(props.events))
const remaining = computed(() => users.value.slice(3))
const groups = computed(() => diagnosticErrorGroups(props.events))
const expanded = ref(false)
const visibleGroups = computed(() => expanded.value ? groups.value : groups.value.slice(0, 3))
watch(() => props.events, () => { expanded.value = false })
</script>

<template>
  <section class="diagnostic-users" aria-label="Utenti negli errori di questa pagina">
    <div class="diagnostic-users__heading">
      <strong>{{ users.length }} {{ users.length === 1 ? 'utente' : 'utenti' }} con errori</strong>
      <span>Negli errori di questa pagina</span>
    </div>
    <div v-if="users.length" class="diagnostic-users__names">
      <span v-for="user in users.slice(0, 3)" :key="user.id" class="diagnostic-users__name" :title="user.nickname">
        <span class="diagnostic-users__nickname">{{ user.nickname }}</span>
        <span class="diagnostic-users__count">· {{ user.count }} {{ user.count === 1 ? 'errore' : 'errori' }}</span>
      </span>
      <details v-if="remaining.length" :key="users.map(user => user.id).join('|')">
        <summary>+{{ remaining.length }} {{ remaining.length === 1 ? 'altro' : 'altri' }}</summary>
        <ul tabindex="0" aria-label="Altri utenti di questa pagina">
          <li v-for="user in remaining" :key="user.id">{{ user.nickname }} · {{ user.count }} {{ user.count === 1 ? 'errore' : 'errori' }}</li>
        </ul>
      </details>
    </div>
    <div v-if="groups.length" class="diagnostic-recap" aria-label="Riepilogo errori di questa pagina">
      <div class="diagnostic-users__heading">
        <strong>Riepilogo errori</strong>
        <span>{{ groups.length }} {{ groups.length === 1 ? 'tipo di errore' : 'tipi di errore' }} · Ricorrenze nei rapporti di questa pagina</span>
      </div>
      <ol class="diagnostic-recap__list" tabindex="0" aria-label="Tipi di errore">
        <li v-for="group in visibleGroups" :key="group.key" class="diagnostic-recap__item">
          <button class="diagnostic-recap__open" type="button" @click="emit('select', group.sample)">
            <span class="diagnostic-recap__code">{{ group.sample.component }} · {{ group.sample.code }}<template v-if="group.sample.suiteVersion"> · {{ group.sample.suiteVersion }}</template></span>
            <strong>{{ group.message || 'Messaggio non disponibile' }}</strong>
            <span>Apri esempio →</span>
          </button>
          <div class="diagnostic-recap__users">
            <span v-for="user in group.users" :key="user.id">{{ user.nickname }}: <strong>{{ user.count }} {{ user.count === 1 ? 'volta' : 'volte' }}</strong></span>
            <span v-if="group.unknownCount">Sistema / utente non identificato: <strong>{{ group.unknownCount }} {{ group.unknownCount === 1 ? 'volta' : 'volte' }}</strong></span>
          </div>
        </li>
      </ol>
      <button v-if="groups.length > 3" class="diagnostic-recap__toggle" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
        {{ expanded ? 'Mostra meno' : `Mostra altri ${groups.length - 3} tipi` }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.diagnostic-users { padding: 14px 16px; margin: 0 0 18px; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; background: rgba(255,255,255,.025); }
.diagnostic-users__heading { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; }
.diagnostic-users__heading strong { font-size: .9rem; color: #e2e8f0; }
.diagnostic-users__heading > span { font-size: .78rem; color: #94a3b8; }
.diagnostic-users__names { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; margin-top: 10px; }
.diagnostic-users__name { display: inline-flex; gap: 5px; max-width: min(100%, 320px); padding: 4px 9px; border-radius: 6px; background: rgba(255,255,255,.06); color: #cbd5e1; font-size: .82rem; }
.diagnostic-users__nickname { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.diagnostic-users__count { flex-shrink: 0; white-space: nowrap; }
details { min-width: 0; max-width: 100%; }
summary { padding: 4px 8px; cursor: pointer; color: #93c5fd; font-size: .82rem; }
summary:focus-visible, ul:focus-visible { outline: 2px solid #93c5fd; outline-offset: 3px; }
ul { max-height: 9rem; overflow-y: auto; overscroll-behavior: contain; margin: 8px 0 0; padding: 0 12px; list-style: none; }
li { padding: 5px 0; color: #cbd5e1; font-size: .82rem; overflow-wrap: anywhere; }
.diagnostic-recap { margin-top: 16px; border-top: 1px solid rgba(255,255,255,.1); padding-top: 14px; }
.diagnostic-recap__list { list-style: none; padding: 0; margin: 10px 0 0; max-height: 22rem; overflow-y: auto; overscroll-behavior: contain; }
.diagnostic-recap__item { padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.07); }
.diagnostic-recap__open { display: grid; gap: 4px; text-align: left; width: 100%; background: none; border: 0; color: #e2e8f0; cursor: pointer; padding: 0; font: inherit; overflow-wrap: anywhere; }
.diagnostic-recap__open > strong { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.diagnostic-recap__code { font-size: .75rem; color: #94a3b8; }
.diagnostic-recap__open > span:last-child, .diagnostic-recap__toggle { color: #93c5fd; font-size: .78rem; }
.diagnostic-recap__users { display: flex; flex-wrap: wrap; gap: 5px 16px; margin-top: 8px; max-height: 6rem; overflow-y: auto; }
.diagnostic-recap__toggle { background: none; border: 0; cursor: pointer; padding: 10px 0 0; }
button:focus-visible, ol:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
</style>

<script setup lang="ts">
// ============================================
// PitwallCarCard - stato reale della macchina del pilota. Si legge soltanto.
//
// I dati arrivano dalla presenza che il PC del pilota pubblica ogni 30
// secondi: vettura, pista, equipaggio dalla EntryList e strategia nel Pit
// MFD. Un dato vecchio si dichiara vecchio, non si mostra come attuale.
// ============================================

import { computed } from 'vue'
import type { PitwallSession } from '~/services/pitwall/pitwallLink'

const props = defineProps<{
  /** La presenza del pilota selezionato; null senza pilota. */
  session: PitwallSession | null
  /** La presenza e' recente: il pilota e' davvero raggiungibile. */
  fresh: boolean
  /** Quanti secondi ha il dato, per dichiararne l'eta'. */
  ageSeconds: number | null
}>()

const crew = computed(() => props.session?.crew ?? [])
</script>

<template>
  <section class="card">
    <div class="card__head">
      <h2>Macchina</h2>
      <span
        v-if="session"
        class="tag"
        :class="fresh ? 'tag--live' : 'tag--stale'"
      >
        {{ fresh ? 'LIVE' : 'DATI VECCHI' }}
      </span>
    </div>

    <p v-if="!session" class="note">
      Nessun pilota selezionato: qui compare la sua macchina.
    </p>

    <template v-else>
      <dl class="facts">
        <template v-if="session.car">
          <dt>Vettura</dt>
          <dd>{{ session.car }}</dd>
        </template>
        <template v-if="session.track">
          <dt>Pista</dt>
          <dd>{{ session.track }}</dd>
        </template>
        <dt>Aggiornata</dt>
        <dd>{{ ageSeconds == null ? 'mai' : `${ageSeconds}s fa` }}</dd>
      </dl>

      <!-- L'equipaggio vero della vettura, dalla EntryList del gioco. -->
      <ul v-if="crew.length" class="crew">
        <li
          v-for="member in crew"
          :key="member.driverIndex"
          class="crew__member"
          :class="{ 'crew__member--current': member.current }"
        >
          {{ member.name }}
          <span v-if="member.current" class="crew__now">al volante</span>
        </li>
      </ul>
      <p v-else class="note">
        Equipaggio non ancora ricevuto dal gioco.
      </p>
    </template>
  </section>
</template>

<style lang="scss" scoped>
.card {
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: linear-gradient(145deg, rgba(26, 26, 36, 0.98), rgba(12, 12, 18, 0.98));
}

.card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.card__head h2 {
  margin: 0;
  color: rgba(255, 255, 255, 0.46);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tag {
  padding: 2px 6px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 5px;
  color: rgba(255, 255, 255, 0.45);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.1em;
}

.tag--live {
  border-color: rgba(111, 214, 111, 0.5);
  color: #6fd66f;
}

/* Un dato vecchio non si mimetizza: si vede che e' vecchio. */
.tag--stale {
  border-color: rgba(255, 176, 58, 0.5);
  color: #ffb03a;
}

/* Etichetta e valore sulla stessa riga: due righe totali invece di quattro. */
.facts {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 2px 8px;
  margin: 0 0 10px;
}

.facts dt {
  color: rgba(255, 255, 255, 0.42);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 16px;
  text-transform: uppercase;
}

.facts dd {
  margin: 0;
  overflow: hidden;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.crew {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.crew__member {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
}

.crew__member--current {
  color: #fff;
  font-weight: 800;
}

.crew__now {
  padding: 1px 5px;
  border: 1px solid rgba(var(--accent-rgb, 40, 183, 255), 0.5);
  border-radius: 5px;
  color: var(--accent, #28b7ff);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.note {
  margin: 8px 0 0;
  color: rgba(255, 255, 255, 0.35);
  font-size: 11px;
}
</style>

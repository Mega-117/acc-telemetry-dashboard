<script setup lang="ts">
// La schermata di assistenza del prototipo (PIP-369): chi ha il volante, chi
// sta al muretto, chi puo' entrare, e sotto la decisione da mandare. Niente
// header di gara e niente seconda colonna: quelle il muretto le legge in ACC.
//
// Nessun servizio reale: solo lo stato locale del prototipo.
import { computed, ref } from "vue";
import PitwallConceptPitStop from "~/components/pitwall/concept/PitwallConceptPitStop.vue";
import PitwallConceptSearch from "~/components/pitwall/concept/PitwallConceptSearch.vue";
import PitwallConceptWall from "~/components/pitwall/concept/PitwallConceptWall.vue";
import { usePitwallConceptState } from "~/composables/usePitwallConceptState";
import {
  PITWALL_CONCEPT_CURRENT_USER_ID,
  filterPitwallConceptPeople,
  pitwallConceptInitialsById,
  pitwallConceptIsManager,
  pitwallConceptNicknameById,
  pitwallConceptWallIds,
  resolvePitwallConceptExecutor,
} from "~/utils/pitwallConcept";

const emit = defineEmits<{ back: [] }>();

const state = usePitwallConceptState();
const race = computed(() => state.selectedRace.value);

const guestOpen = ref(false);
const guestQuery = ref("");

const executor = computed(() => resolvePitwallConceptExecutor(race.value));
const driverName = computed(() =>
  executor.value.driverId ? pitwallConceptNicknameById(executor.value.driverId) : null,
);
const wallIds = computed(() => pitwallConceptWallIds(race.value));
const isManager = computed(() => pitwallConceptIsManager(race.value));

/** Per invitare si cerca fra chi non e' gia' dentro: il resto e' rumore. */
const guestResults = computed(() => {
  if (!guestQuery.value.trim()) return [];
  const inside = new Set([
    PITWALL_CONCEPT_CURRENT_USER_ID,
    ...(race.value?.members ?? []).map(member => member.personId),
  ]);
  return filterPitwallConceptPeople(guestQuery.value).filter(person => !inside.has(person.id));
});

function invite(personId: string) {
  if (!race.value) return;
  state.inviteToRace(race.value.id, personId);
  guestQuery.value = "";
  guestOpen.value = false;
}

/** Uscendo dalla gara non si resta su una schermata che non ci riguarda piu'. */
function leave() {
  if (!race.value) return;
  state.leaveRace(race.value.id);
  emit("back");
}
</script>

<template>
  <div class="pwc-live">
    <button
      type="button"
      class="pwc-back pwc-live__back"
      @click="$emit('back')"
    >
      ← Pit Wall
    </button>

    <section
      v-if="race"
      class="pwc-wall"
    >
      <span class="pwc-role">
        <small>Al volante</small>
        <b v-if="driverName">
          <span class="pwc-avatar is-small">{{ pitwallConceptInitialsById(executor.driverId!) }}</span>
          {{ driverName }}
        </b>
        <b v-else>—</b>
        <em v-if="driverName">applica lui la strategia</em>
        <em v-else-if="executor.state === 'multiple-driving'">in due al volante: nessun ordine parte</em>
        <em v-else>nessuno al volante: nessun ordine parte</em>
      </span>
      <span
        v-if="wallIds.length"
        class="pwc-role"
      >
        <small>Al muretto</small>
        <b>
          <span
            v-for="id in wallIds"
            :key="id"
            class="pwc-avatar is-small"
            :title="pitwallConceptNicknameById(id)"
          >{{ pitwallConceptInitialsById(id) }}</span>
        </b>
      </span>
      <button
        v-if="isManager"
        type="button"
        class="pwc-btn"
        @click="guestOpen = true"
      >
        + Ospite
      </button>
    </section>

    <PitwallConceptWall
      v-if="race"
      :race="race"
      @promote="state.promoteInRace(race.id, $event)"
      @remove="state.removeFromRace(race.id, $event)"
      @leave="leave"
      @close="state.closeRace(race.id)"
    />

    <PitwallConceptPitStop :race="race" />

    <div
      v-if="guestOpen"
      class="pwc-modal"
      @click.self="guestOpen = false"
    >
      <section
        class="pwc-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwc-guest-title"
      >
        <button
          type="button"
          class="pwc-close"
          aria-label="Chiudi"
          @click="guestOpen = false"
        >
          ×
        </button>
        <h2 id="pwc-guest-title">
          Ospite per oggi
        </h2>
        <p>Vede la gara e può mandare strategie. Scade a mezzanotte.</p>

        <PitwallConceptSearch
          v-model="guestQuery"
          :results="guestResults"
          placeholder="Cerca chi invitare"
          empty-label="Nessuno con questo nickname, o è già dentro."
        >
          <template #actions="{ person }">
            <button
              type="button"
              class="pwc-btn is-primary"
              @click="invite(person.id)"
            >
              Invita
            </button>
          </template>
        </PitwallConceptSearch>
      </section>
    </div>
  </div>
</template>

<style lang="scss">
@use "@/assets/scss/variables" as *;

/* Stili della sola assistenza. Le basi condivise (bottoni, avatar, persone,
   pannelli) vivono in PitwallConcept.vue: qui non si ridefiniscono.
   Una colonna sola e stretta: la schermata ha una decisione sola da prendere. */
.pwc-live {
  display: grid;
  gap: 16px;
  width: min(820px, 100%);
  margin: 0 auto;
}
.pwc-live__back { justify-self: start; padding: 4px 0; }

.pwc-wall {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 32px;
  padding: 16px 20px;
  border: 1px solid var(--pwc-line);
  border-radius: 12px;
  background: var(--pwc-raised);
}
/* I due ruoli partono dall'alto: le etichette restano sulla stessa riga anche
   quando sotto al volante c'e' una frase in piu'. */
.pwc-wall .pwc-role { align-self: start; }
.pwc-wall .pwc-btn { margin-left: auto; }

.pwc-modal {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.7);
}
.pwc-dialog {
  position: relative;
  width: min(480px, 100%);
  padding: 28px;
  border: 1px solid var(--pwc-line);
  border-radius: 14px;
  background: #121820;
}
.pwc-dialog > p { margin: 8px 0 0; color: $text-secondary; font-size: 14px; }
.pwc-dialog .pwc-person { grid-template-columns: 36px minmax(0, 1fr) auto; }
.pwc-close {
  position: absolute;
  top: 14px;
  right: 16px;
  border: 0;
  background: none;
  color: $text-secondary;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
}

@media (max-width: 760px) {
  .pwc-wall { gap: 20px; }
  .pwc-wall .pwc-btn { margin-left: 0; }
}
</style>

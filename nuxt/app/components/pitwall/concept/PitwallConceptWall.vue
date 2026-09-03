<script setup lang="ts">
// Chi c'e' dentro la gara, e cosa puo' farci chi la gestisce (PIP-369).
//
// Le parole delle pastiglie sono le stesse della vista classica: chi porta
// questo layout sulla Classica traduce la forma, non il vocabolario.
import { computed } from "vue";
import {
  describePitwallConceptMember,
  pitwallConceptCanLeave,
  pitwallConceptCanPromote,
  pitwallConceptCanRemove,
  pitwallConceptInitialsById,
  pitwallConceptIsManager,
  pitwallConceptNicknameById,
  PITWALL_CONCEPT_CURRENT_USER_ID,
} from "~/utils/pitwallConcept";
import type { PitwallConceptMember, PitwallConceptRace } from "~/utils/pitwallConcept";

const props = defineProps<{ race: PitwallConceptRace }>();

const emit = defineEmits<{
  promote: [personId: string];
  remove: [personId: string];
  leave: [];
  close: [];
}>();

const isManager = computed(() => pitwallConceptIsManager(props.race));
const canLeave = computed(() => pitwallConceptCanLeave(props.race));

/** Prima chi guida, poi chi gestisce, poi il resto: l'ordine di chi guarda. */
const ordered = computed(() => [...props.race.members].sort((left, right) => {
  const weight = (member: PitwallConceptMember) =>
    member.driving ? 0 : member.role === "manager" ? 1 : member.role === "member" ? 2 : 3;
  return weight(left) - weight(right);
}));

function pillClass(member: PitwallConceptMember): string {
  if (member.driving) return "is-driving";
  if (member.role === "invited") return "is-waiting";
  return member.online ? "is-online" : "";
}
</script>

<template>
  <section class="pwc-panel pwc-roster">
    <header class="pwc-panel__head">
      <h2>Equipaggio</h2>
      <small v-if="!isManager">Solo chi gestisce la gara può invitare o togliere.</small>
    </header>

    <div
      v-for="member in ordered"
      :key="member.personId"
      class="pwc-roster__row"
    >
      <span
        class="pwc-dot"
        :class="pillClass(member)"
      ></span>
      <span class="pwc-avatar is-small">{{ pitwallConceptInitialsById(member.personId) }}</span>
      <strong class="pwc-person__name">
        {{ pitwallConceptNicknameById(member.personId) }}
        <template v-if="member.personId === PITWALL_CONCEPT_CURRENT_USER_ID"> (tu)</template>
      </strong>
      <span
        class="pwc-chip"
        :class="member.driving ? 'is-always' : 'is-waiting'"
      >
        {{ describePitwallConceptMember(member) }}
      </span>
      <span class="pwc-person__actions">
        <button
          v-if="pitwallConceptCanPromote(race, member)"
          type="button"
          class="pwc-link-btn"
          @click="emit('promote', member.personId)"
        >
          Promuovi
        </button>
        <button
          v-if="pitwallConceptCanRemove(race, member)"
          type="button"
          class="pwc-link-btn"
          @click="emit('remove', member.personId)"
        >
          Togli
        </button>
      </span>
    </div>

    <footer
      v-if="canLeave || (isManager && !race.closed)"
      class="pwc-roster__foot"
    >
      <button
        v-if="canLeave"
        type="button"
        class="pwc-link-btn"
        @click="emit('leave')"
      >
        Esci dalla gara
      </button>
      <button
        v-if="isManager && !race.closed"
        type="button"
        class="pwc-link-btn"
        @click="emit('close')"
      >
        Chiudi gara
      </button>
    </footer>
  </section>
</template>

<style lang="scss">
@use "@/assets/scss/variables" as *;

/* Stile del solo equipaggio: pannello, righe e pallino di presenza. Le basi
   condivise (bottoni, avatar, pastiglie) vivono in PitwallConcept.vue. */
.pwc-roster__row {
  display: grid;
  grid-template-columns: 8px 28px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 0 18px;
  border-top: 1px solid var(--pwc-line);
}
.pwc-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
}
.pwc-dot.is-driving { background: #4ade80; box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.16); }
.pwc-dot.is-online { background: #60a5fa; }
.pwc-dot.is-waiting { background: #f59e0b; }
.pwc-roster__foot {
  display: flex;
  justify-content: flex-end;
  gap: 18px;
  padding: 12px 18px;
  border-top: 1px solid var(--pwc-line);
}

@media (max-width: 760px) {
  .pwc-roster__row {
    grid-template-columns: 8px 28px minmax(0, 1fr);
    grid-auto-rows: min-content;
    padding: 12px 14px;
  }
  .pwc-roster__row .pwc-chip,
  .pwc-roster__row .pwc-person__actions { grid-column: 2 / -1; }
}
</style>

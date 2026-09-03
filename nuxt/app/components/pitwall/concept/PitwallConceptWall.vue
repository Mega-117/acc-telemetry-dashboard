<script setup lang="ts">
// Chi c'e' dentro la gara, e cosa puo' farci chi la gestisce (PIP-369).
//
// Le parole delle pastiglie sono le stesse della vista classica: chi porta
// questo layout sulla Classica traduce la forma, non il vocabolario.
import { computed, ref } from "vue";
import PitwallConceptMore from "~/components/pitwall/concept/PitwallConceptMore.vue";
import {
  describePitwallConceptMember,
  isPitwallConceptPinnedMember,
  pitwallConceptCanLeave,
  pitwallConceptCanPromote,
  pitwallConceptCanRemove,
  pitwallConceptInitialsById,
  pitwallConceptIsManager,
  pitwallConceptNicknameById,
  pitwallConceptRoomIsFull,
  splitPitwallConceptList,
  PITWALL_CONCEPT_LIST_LIMITS,
  PITWALL_CONCEPT_MAX_ROOM_PEOPLE,
} from "~/utils/pitwallConcept";
import type { PitwallConceptMember, PitwallConceptPerson, PitwallConceptRace } from "~/utils/pitwallConcept";

const props = defineProps<{
  race: PitwallConceptRace;
  people: PitwallConceptPerson[];
  /** Chi guarda: da lui dipende cosa puo' fare. */
  meId: string | null;
}>();

const emit = defineEmits<{
  promote: [personId: string];
  remove: [personId: string];
  leave: [];
  close: [];
}>();

const expanded = ref(false);

const me = computed(() => props.meId ?? "");
const isManager = computed(() => pitwallConceptIsManager(props.race, me.value));
const canLeave = computed(() => pitwallConceptCanLeave(props.race, me.value));
const isFull = computed(() => pitwallConceptRoomIsFull(props.race));

/** Prima chi guida, poi chi gestisce, poi il resto: l'ordine di chi guarda. */
const ordered = computed(() => [...props.race.members].sort((left, right) => {
  const weight = (member: PitwallConceptMember) =>
    member.driving ? 0 : member.role === "manager" ? 1 : member.role === "member" ? 2 : 3;
  return weight(left) - weight(right);
}));

/**
 * Una stanza arriva a trentadue persone. Chi guida, chi gestisce e chi e'
 * invitato restano sempre visibili: sono le righe su cui si decide qualcosa.
 */
const split = computed(() => splitPitwallConceptList(
  ordered.value,
  expanded.value ? ordered.value.length : PITWALL_CONCEPT_LIST_LIMITS.crew,
  isPitwallConceptPinnedMember,
));

function pillClass(member: PitwallConceptMember): string {
  if (member.driving) return "is-driving";
  if (member.role === "invited") return "is-waiting";
  return member.online ? "is-online" : "";
}

const nick = (id: string) => pitwallConceptNicknameById(id, props.people);
const initials = (id: string) => pitwallConceptInitialsById(id, props.people);
</script>

<template>
  <section class="pwc-panel pwc-roster">
    <header class="pwc-panel__head">
      <h2>
        Equipaggio
        <span class="pwc-count">{{ race.members.length }}</span>
      </h2>
      <small v-if="isFull">
        Questa gara è piena: {{ PITWALL_CONCEPT_MAX_ROOM_PEOPLE }} persone è il massimo.
      </small>
      <small v-else-if="!isManager">Solo chi gestisce la gara può invitare o togliere.</small>
    </header>

    <div
      v-for="member in split.visible"
      :key="member.personId"
      class="pwc-roster__row"
    >
      <span
        class="pwc-dot"
        :class="pillClass(member)"
      ></span>
      <span class="pwc-avatar is-small">{{ initials(member.personId) }}</span>
      <strong class="pwc-person__name">
        {{ nick(member.personId) }}
        <template v-if="member.personId === me"> (tu)</template>
      </strong>
      <span
        class="pwc-chip"
        :class="member.driving ? 'is-always' : 'is-waiting'"
      >
        {{ describePitwallConceptMember(member) }}
      </span>
      <span class="pwc-person__actions">
        <button
          v-if="pitwallConceptCanPromote(race, member, me)"
          type="button"
          class="pwc-link-btn"
          @click="emit('promote', member.personId)"
        >
          Promuovi
        </button>
        <button
          v-if="pitwallConceptCanRemove(race, member, me)"
          type="button"
          class="pwc-link-btn"
          @click="emit('remove', member.personId)"
        >
          Togli
        </button>
      </span>
    </div>

    <PitwallConceptMore
      :hidden="split.hidden"
      :expanded="expanded"
      noun="persone"
      noun-one="persona"
      class="pwc-roster__more"
      @toggle="expanded = !expanded"
    />

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
.pwc-roster__more { margin: 0; padding: 10px 18px; }
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

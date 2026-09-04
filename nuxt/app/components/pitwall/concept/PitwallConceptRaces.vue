<script setup lang="ts">
// I Pitwall aperti adesso (PIP-369, PIP-360, PIP-362).
//
// Una riga per **amico che ha aperto il suo Pitwall**, non per stanza e non
// per chiunque sia in pista. Elencare le stanze rispondeva alla domanda
// sbagliata (non si chiudono mai); elencare chi era in pista rispondeva a
// meta' (in pista si sta anche senza volere nessuno al muretto). Qui c'e' chi
// ha detto "vieni": se chiude o spegne, la sua riga sparisce da sola.
import { computed, ref } from "vue";
import PitwallConceptMore from "~/components/pitwall/concept/PitwallConceptMore.vue";
import {
  PITWALL_CONCEPT_LIST_LIMITS,
  describePitwallConceptWall,
  pitwallConceptAmInvited,
  pitwallConceptInitialsById,
  pitwallConceptNicknameById,
  splitPitwallConceptList,
} from "~/utils/pitwallConcept";
import type { PitwallConceptPerson, PitwallConceptRace } from "~/utils/pitwallConcept";

const props = defineProps<{
  races: PitwallConceptRace[];
  people: PitwallConceptPerson[];
  meId: string | null;
}>();
defineEmits<{ enter: [race: PitwallConceptRace] }>();

const expanded = ref(false);
const me = computed(() => props.meId ?? "");

const invited = (race: PitwallConceptRace) => pitwallConceptAmInvited(race, me.value);

/** Prima quelli in cui sei gia' dentro, poi gli inviti, in fondo le chiuse. */
const ordered = computed(() => [...props.races].sort((left, right) => {
  const weight = (race: PitwallConceptRace) => {
    if (race.closed) return 2;
    return invited(race) ? 1 : 0;
  };
  return weight(left) - weight(right);
}));

const split = computed(() => splitPitwallConceptList(
  ordered.value,
  expanded.value ? ordered.value.length : PITWALL_CONCEPT_LIST_LIMITS.races,
));

const nick = (id: string) => pitwallConceptNicknameById(id, props.people);
const initials = (id: string) => pitwallConceptInitialsById(id, props.people);

/** Dove sta guidando: pista e vettura, quando le sappiamo. */
function whereLabel(race: PitwallConceptRace): string {
  const number = race.carNumber ? `#${race.carNumber}` : "";
  return [race.track, race.carModel, number].filter(Boolean).join(" · ");
}

/**
 * Chi altro sta al muretto con te. Il pilota e' la riga stessa, quindi non si
 * conta: prima finiva fra gli assistenti e sembrava che si assistesse da solo.
 */
function wallLabel(race: PitwallConceptRace): string {
  const others = race.members
    .filter(member => member.personId !== race.hostId && member.role !== "invited")
    .map(member => member.personId);
  return describePitwallConceptWall(others, undefined, props.people);
}
</script>

<template>
  <div>
    <article
      v-for="race in split.visible"
      :key="race.id"
      class="pwc-race"
      :class="{
        'is-invited': invited(race),
        'is-closed': race.closed,
      }"
    >
      <div class="pwc-race__who">
        <span class="pwc-avatar">{{ initials(race.hostId) }}</span>
        <span class="pwc-race__copy">
          <strong>{{ nick(race.hostId) }}</strong>
          <small>{{ whereLabel(race) || race.session }}</small>
        </span>
      </div>

      <span
        v-if="wallLabel(race)"
        class="pwc-role pwc-race__wall"
      >
        <small>Al muretto</small>
        <b>{{ wallLabel(race) }}</b>
      </span>

      <span
        v-if="race.closed"
        class="pwc-chip is-waiting"
      >Chiusa</span>
      <span
        v-else
        class="pwc-chip is-always"
      >Pitwall aperto</span>

      <button
        v-if="!race.closed"
        type="button"
        class="pwc-btn is-primary"
        @click="$emit('enter', race)"
      >
        Entra
      </button>

      <p
        v-if="invited(race)"
        class="pwc-race__why"
      >
        Entra per vedere la vettura e mandare la strategia.
      </p>
    </article>

    <p
      v-if="!races.length"
      class="pwc-empty"
    >
      Nessun amico ha il Pitwall aperto adesso. Quando uno lo apre compare qui
      da solo, e ci entri con un clic.
    </p>

    <PitwallConceptMore
      :hidden="split.hidden"
      :expanded="expanded"
      noun="Pitwall"
      noun-one="Pitwall"
      @toggle="expanded = !expanded"
    />
  </div>
</template>

<style lang="scss">
@use "@/assets/scss/variables" as *;

.pwc-race {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 24px;
  margin-top: var(--pwc-gap);
  padding: 20px 24px;
  border: 1px solid rgba(74, 222, 128, 0.3);
  border-radius: 14px;
  background: var(--pwc-raised);
}
/* Invitato e non ancora entrato: bordo d'attesa, non di gara in corso. */
.pwc-race.is-invited { border-color: rgba(245, 158, 11, 0.45); }
.pwc-race.is-closed { border-color: var(--pwc-line); opacity: 0.72; }

.pwc-race__who { display: flex; align-items: center; gap: 16px; min-width: 0; }
.pwc-race__copy { display: grid; gap: 4px; min-width: 0; }
.pwc-race__copy strong { font-size: 19px; overflow-wrap: anywhere; }
.pwc-race__copy small { font-size: 13px; }
.pwc-race__wall { align-self: center; }

.pwc-race__why {
  grid-column: 1 / -1;
  margin: 0;
  padding-top: 16px;
  border-top: 1px solid var(--pwc-line);
  color: $text-muted;
  font-size: 13px;
}

@media (max-width: 1180px) {
  .pwc-race { grid-template-columns: minmax(0, 1fr) auto auto; }
  .pwc-race__wall { grid-column: 1 / -1; }
}

@media (max-width: 760px) {
  .pwc-race { grid-template-columns: 1fr; }
  .pwc-race > .pwc-btn { justify-self: start; }
}
</style>

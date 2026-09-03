<script setup lang="ts">
// Le gare che ti compaiono senza aver fatto niente (PIP-369).
//
// Tre stati, e si vedono dal bordo: ci sei dentro, sei solo invitato, oppure e'
// chiusa. La riga sotto dice **perche'** ti compare, perche' ritrovarsi dentro
// una gara senza capire il motivo e' esattamente il difetto che il prototipo
// deve togliere.
//
// L'elenco vero arriva a sessanta gare - le stanze non si cancellano mai e
// nessuno filtra le chiuse - quindi qui se ne mostrano tre: quelle in cui c'e'
// davvero qualcuno al volante restano in cima, le chiuse in fondo.
import { computed, ref } from "vue";
import PitwallConceptMore from "~/components/pitwall/concept/PitwallConceptMore.vue";
import {
  PITWALL_CONCEPT_LIST_LIMITS,
  describePitwallConceptReason,
  describePitwallConceptWall,
  pitwallConceptAmInvited,
  pitwallConceptNicknameById,
  pitwallConceptWallIds,
  resolvePitwallConceptExecutor,
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

/**
 * Prima quella viva con qualcuno al volante, poi le gare in cui sono gia'
 * dentro, poi gli inviti, in fondo le chiuse. Le mie gare stanno sopra gli
 * inviti perche' e' li' che torno: un invito vecchio non deve nasconderle.
 */
const ordered = computed(() => [...props.races].sort((left, right) => {
  const weight = (race: PitwallConceptRace) => {
    if (race.closed) return 3;
    if (invited(race)) return 2;
    return resolvePitwallConceptExecutor(race).state === "ready" ? 0 : 1;
  };
  return weight(left) - weight(right);
}));

const split = computed(() => splitPitwallConceptList(
  ordered.value,
  expanded.value ? ordered.value.length : PITWALL_CONCEPT_LIST_LIMITS.races,
));

/**
 * Al volante c'e' uno solo, oppure va detto che non si sa chi applica. Senza
 * presenza in diretta non si dice "nessuno": non lo sappiamo.
 */
function driverLabel(race: PitwallConceptRace): string {
  if (race.live === false) return "—";
  const executor = resolvePitwallConceptExecutor(race);
  if (executor.state === "ready") return pitwallConceptNicknameById(executor.driverId!, props.people);
  return executor.state === "multiple-driving" ? "in due" : "nessuno";
}

/** Sedici nickname uniti da virgole sono un paragrafo, non una riga di card. */
function wallLabel(race: PitwallConceptRace): string {
  return describePitwallConceptWall(pitwallConceptWallIds(race), undefined, props.people);
}

function reasonLabel(race: PitwallConceptRace): string {
  return describePitwallConceptReason(race.reason, props.people);
}
</script>

<template>
  <div>
    <article
      v-for="race in split.visible"
      :key="race.id"
      class="pwc-race"
      :class="{ 'is-invited': invited(race), 'is-closed': race.closed }"
    >
      <div class="pwc-race__car">
        <span class="pwc-race__number">#{{ race.carNumber }}</span>
        <span class="pwc-race__copy">
          <strong>{{ race.carModel }}</strong>
          <small>{{ race.track }} · {{ race.session }}</small>
        </span>
      </div>

      <div class="pwc-race__roles">
        <span class="pwc-role">
          <small>Al volante</small>
          <b>{{ driverLabel(race) }}</b>
        </span>
        <span
          v-if="wallLabel(race)"
          class="pwc-role"
        >
          <small>Al muretto</small>
          <b>{{ wallLabel(race) }}</b>
        </span>
      </div>

      <span
        v-if="race.closed"
        class="pwc-chip is-waiting"
      >Chiusa</span>
      <button
        v-else
        type="button"
        class="pwc-btn is-primary"
        @click="$emit('enter', race)"
      >
        Entra
      </button>

      <p class="pwc-race__why">
        {{ reasonLabel(race) }}
        <template v-if="invited(race)">
          Non sei ancora entrato.
        </template>
      </p>
    </article>

    <p
      v-if="!races.length"
      class="pwc-empty"
    >
      Nessuna gara attiva fra le tue persone.
    </p>

    <PitwallConceptMore
      :hidden="split.hidden"
      :expanded="expanded"
      noun="gare"
      noun-one="gara"
      @toggle="expanded = !expanded"
    />
  </div>
</template>

<style lang="scss">
@use "@/assets/scss/variables" as *;

.pwc-race {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
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
.pwc-race__car { display: flex; align-items: center; gap: 16px; min-width: 0; }
.pwc-race__number {
  flex: none;
  font-family: $font-display;
  font-size: 26px;
  color: $racing-gold;
  font-variant-numeric: tabular-nums;
}
.pwc-race__copy { display: grid; gap: 4px; min-width: 0; }
.pwc-race__copy strong { font-size: 17px; }
.pwc-race__copy small { font-size: 13px; }
.pwc-race__roles { display: flex; gap: 28px; }
.pwc-race__why {
  grid-column: 1 / -1;
  margin: 0;
  padding-top: 16px;
  border-top: 1px solid var(--pwc-line);
  color: $text-muted;
  font-size: 13px;
}
.pwc-race__why b { color: $text-secondary; font-weight: 700; }

@media (max-width: 1180px) {
  .pwc-race { grid-template-columns: minmax(0, 1fr) auto; }
  .pwc-race__roles { grid-column: 1 / -1; }
  /* Il bottone scende su una riga sua: resta della sua misura, non a tutta larghezza. */
  .pwc-race > .pwc-btn { justify-self: start; }
}

@media (max-width: 760px) {
  .pwc-race { grid-template-columns: 1fr; }
}
</style>

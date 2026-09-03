<script setup lang="ts">
// Le gare che ti compaiono senza aver fatto niente (PIP-369).
//
// Tre stati, e si vedono dal bordo: ci sei dentro, sei solo invitato, oppure e'
// chiusa. La riga sotto dice **perche'** ti compare, perche' ritrovarsi dentro
// una gara senza capire il motivo e' esattamente il difetto che il prototipo
// deve togliere.
import {
  describePitwallConceptReason,
  pitwallConceptAmInvited,
  pitwallConceptNicknameById,
  pitwallConceptNicknames,
  pitwallConceptWallIds,
  resolvePitwallConceptExecutor,
} from "~/utils/pitwallConcept";
import type { PitwallConceptRace } from "~/utils/pitwallConcept";

defineProps<{ races: PitwallConceptRace[] }>();
defineEmits<{ enter: [race: PitwallConceptRace] }>();

/** Al volante c'e' uno solo, oppure va detto che non si sa chi applica. */
function driverLabel(race: PitwallConceptRace): string {
  const executor = resolvePitwallConceptExecutor(race);
  if (executor.state === "ready") return pitwallConceptNicknameById(executor.driverId!);
  return executor.state === "multiple-driving" ? "in due" : "nessuno";
}

function wallLabel(race: PitwallConceptRace): string {
  return pitwallConceptNicknames(pitwallConceptWallIds(race)).join(", ");
}
</script>

<template>
  <div>
    <article
      v-for="race in races"
      :key="race.id"
      class="pwc-race"
      :class="{ 'is-invited': pitwallConceptAmInvited(race), 'is-closed': race.closed }"
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
        {{ describePitwallConceptReason(race.reason) }}
        <template v-if="pitwallConceptAmInvited(race)">
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

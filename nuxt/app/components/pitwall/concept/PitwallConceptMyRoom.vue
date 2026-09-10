<script setup lang="ts">
// La stanza corrente appartiene ai partecipanti, indipendentemente da ACC.
// L'intento desktop apre una stanza; una membership confermata prevale su off.
import { computed } from "vue";
import {
  pitwallConceptInitialsById,
  pitwallConceptNicknameById,
} from "~/utils/pitwallConcept";
import type { PitwallConceptMyRoom, PitwallConceptPerson } from "~/utils/pitwallConcept";
import type { PitwallIntentStatus } from "~/composables/usePitwallIntent";

const props = defineProps<{
  room: PitwallConceptMyRoom | null;
  pitwall: PitwallIntentStatus;
  people: PitwallConceptPerson[];
  meId: string | null;
}>();
defineEmits<{
  /** Apri il Pitwall, anche senza ACC. */
  start: [];
  /** Esci: gli altri partecipanti rimangono nella stanza. */
  close: [];
  /** Mostra l'equipaggio e i comandi della strategia. */
  open: [];
}>();

const nick = (id: string) => pitwallConceptNicknameById(id, props.people);
const initials = (id: string) => pitwallConceptInitialsById(id, props.people);

/** La gara mostrata: solo quando il Pitwall e' aperto, o quando la si guarda da un browser. */
const room = computed(() => props.room);
const reconnecting = computed(() => room.value?.members.some(member => member.personId === props.meId && member.reconnecting));

/** Dove si corre: la pista, e il numero quando c'e'. */
const where = computed(() => {
  const current = room.value;
  if (!current) return "";
  const parts = [current.carNumber == null ? "" : `#${current.carNumber}`, current.track ?? ""];
  return parts.filter(Boolean).join(" · ") || current.label;
});

/**
 * Chi e' collegato adesso, tolto te: la riga parla del tuo Pitwall, e contarti
 * fra i tuoi assistenti farebbe sembrare che ti assisti da solo.
 */
const connected = computed(() => (room.value?.members ?? [])
  .filter(member => member.personId !== props.meId && member.role !== "invited")
  .map(member => member.personId));

/** Amici che non sono ancora entrati: e' cio' che manca perche' ti assistano. */
const waiting = computed(() => room.value?.invitedIds ?? []);

const driving = computed(() => {
  const id = room.value?.drivingId;
  if (!id) return null;
  return id === props.meId ? "Sei tu al volante" : `Al volante: ${nick(id)}`;
});
</script>

<template>
  <div>
    <!-- Da un browser normale non c'e' nessun PC del pilota: si dice, invece
         di offrire un bottone che non fa niente. -->
    <article
      v-if="!pitwall.available && !room"
      class="pwc-panel pwc-mine"
      :class="{ 'is-closed': !room }"
    >
      <div class="pwc-race__who">
        <span class="pwc-avatar">{{ initials(meId ?? "") }}</span>
        <span class="pwc-race__copy">
          <strong>{{ where || "Il tuo Pitwall" }}</strong>
          <small>Si apre dall'app desktop del pilota, anche con ACC spento.</small>
        </span>
      </div>
    </article>

    <!-- Spento: un bottone solo. -->
    <article
      v-else-if="!room && pitwall.state === 'off'"
      class="pwc-panel pwc-mine is-off"
    >
      <div class="pwc-race__who">
        <span class="pwc-avatar">{{ initials(meId ?? "") }}</span>
        <span class="pwc-race__copy">
          <strong>Il tuo Pitwall è chiuso</strong>
          <small>Gli amici lo vedranno aperto e potranno entrare con un clic.</small>
        </span>
      </div>
      <button
        type="button"
        class="pwc-btn is-primary"
        @click="$emit('start')"
      >
        Apri il Pitwall
      </button>
    </article>

    <!-- Chiesto, ma la vettura non c'e' ancora: si arma e lo dice. -->
    <article
      v-else-if="!room && pitwall.state === 'arming'"
      class="pwc-panel pwc-mine is-arming"
    >
      <div class="pwc-race__who">
        <span class="pwc-avatar">{{ initials(meId ?? "") }}</span>
        <span class="pwc-race__copy">
          <strong>{{ pitwall.reason ? 'Apertura del Pitwall non riuscita' : 'Apertura del Pitwall' }}</strong>
          <small>{{ pitwall.reason ?? "Apertura della stanza in corso." }}</small>
        </span>
      </div>
      <span class="pwc-chip is-waiting">{{ pitwall.reason ? 'Apertura non riuscita' : 'Connessione in corso' }}</span>
      <button
        type="button"
        class="pwc-link-btn"
        @click="$emit('close')"
      >
        Chiudi
      </button>
    </article>

    <!-- Aperto: la gara esiste e gli amici la vedono. -->
    <article
      v-else
      class="pwc-panel pwc-mine"
    >
      <div class="pwc-race__who">
        <span class="pwc-avatar">{{ initials(meId ?? "") }}</span>
        <span class="pwc-race__copy">
          <strong>{{ where || "Il tuo Pitwall" }}</strong>
          <small>{{ reconnecting ? "Riconnessione in corso" : driving ?? "Nessuno al volante adesso" }}</small>
        </span>
      </div>

      <span class="pwc-chip is-always">{{ reconnecting ? "Riconnessione in corso" : "Aperto" }}</span>

      <span class="pwc-mine__actions">
        <button
          v-if="room"
          type="button"
          class="pwc-btn"
          @click="$emit('open')"
        >
          Apri la gara
        </button>
        <button
          type="button"
          class="pwc-link-btn"
          @click="$emit('close')"
        >
          Esci dal Pitwall
        </button>
      </span>

      <p class="pwc-race__why">
        <template v-if="connected.length">
          Al muretto con te adesso:
          <b>{{ connected.map(nick).join(", ") }}</b>.
        </template>
        <template v-else-if="waiting.length">
          <b>{{ waiting.map(nick).join(", ") }}</b>
          {{ waiting.length === 1 ? "può entrare" : "possono entrare" }}: il tuo Pitwall
          è aperto, {{ waiting.length === 1 ? "gli" : "gli" }} basta un clic.
        </template>
        <template v-else>
          Gli amici di chi è nella stanza possono vederla e unirsi.
        </template>
      </p>
    </article>
  </div>
</template>

<style scoped>
/*
 * Gli stili della schermata (`.pwc-panel`, `.pwc-chip`, `.pwc-btn`,
 * `.pwc-race__*`, `.pwc-empty`) sono globali dentro `.pwc`: qui resta solo la
 * disposizione propria di questa card.
 */
.pwc-mine {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
}

.pwc-mine.is-off { grid-template-columns: 1fr auto; }

.pwc-mine__actions { display: flex; align-items: center; gap: 14px; }

.pwc-mine .pwc-race__why {
  grid-column: 1 / -1;
  margin: 0;
}

.pwc-mine.is-arming,
.pwc-mine.is-closed {
  opacity: 0.8;
}

@media (max-width: 640px) {
  .pwc-mine { grid-template-columns: 1fr auto; }
  .pwc-mine__actions { grid-column: 1 / -1; }
}
</style>

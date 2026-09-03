<script setup lang="ts">
// La gara del pilota, vista dal pilota (PIP-362).
//
// "In pista" elenca le persone che ti hanno autorizzato, quindi per
// costruzione non contiene te stesso: chi guidava apriva questa pagina e non
// vedeva niente - nemmeno la gara che il suo stesso computer aveva appena
// aperto. Non sapeva che esistesse, come si chiamasse, chi ci potesse entrare.
//
// Il meccanismo non cambia: cambiano le parole. La gara si apre da sola quando
// ACC va in sessione, e chi ti ha autorizzato ci entra da solo; qui si vede
// che e' successo davvero, e chi manca ancora.
import { computed } from "vue";
import {
  pitwallConceptInitialsById,
  pitwallConceptNicknameById,
} from "~/utils/pitwallConcept";
import type { PitwallConceptMyRoom, PitwallConceptPerson } from "~/utils/pitwallConcept";

const props = defineProps<{
  room: PitwallConceptMyRoom | null;
  people: PitwallConceptPerson[];
  meId: string | null;
}>();
defineEmits<{ invite: [] }>();

const nick = (id: string) => pitwallConceptNicknameById(id, props.people);
const initials = (id: string) => pitwallConceptInitialsById(id, props.people);

/** Dove si corre: la pista, e il numero quando c'e'. */
const where = computed(() => {
  const room = props.room;
  if (!room) return "";
  const parts = [room.carNumber == null ? "" : `#${room.carNumber}`, room.track ?? ""];
  return parts.filter(Boolean).join(" · ") || room.label;
});

/**
 * Chi e' collegato adesso, tolto te: la riga parla della tua gara, e contarti
 * fra i tuoi assistenti farebbe sembrare che ti assisti da solo.
 */
const connected = computed(() => (props.room?.members ?? [])
  .filter(member => member.personId !== props.meId && member.role !== "invited" && member.online)
  .map(member => member.personId));

/** Autorizzati che non sono ancora entrati: e' cio' che manca perche' ti assistano. */
const waiting = computed(() => props.room?.invitedIds ?? []);

const driving = computed(() => {
  const id = props.room?.drivingId;
  if (!id) return null;
  return id === props.meId ? "Sei tu al volante" : `Al volante: ${nick(id)}`;
});
</script>

<template>
  <div>
    <article
      v-if="room"
      class="pwc-panel pwc-mine"
      :class="{ 'is-dormant': room.state === 'dormant', 'is-closed': room.state === 'closed' }"
    >
      <div class="pwc-race__who">
        <span class="pwc-avatar">{{ initials(meId ?? "") }}</span>
        <span class="pwc-race__copy">
          <strong>{{ where }}</strong>
          <small>{{ driving ?? "Nessuno al volante adesso" }}</small>
        </span>
      </div>

      <span
        v-if="room.state === 'live'"
        class="pwc-chip is-always"
      >Aperta</span>
      <span
        v-else-if="room.state === 'dormant'"
        class="pwc-chip is-waiting"
      >Nessuno da un po'</span>
      <span
        v-else
        class="pwc-chip is-waiting"
      >Chiusa</span>

      <button
        type="button"
        class="pwc-btn"
        @click="$emit('invite')"
      >
        Fai entrare qualcuno
      </button>

      <p class="pwc-race__why">
        <template v-if="connected.length">
          Al muretto con te adesso:
          <b>{{ connected.map(nick).join(", ") }}</b>.
        </template>
        <template v-else-if="waiting.length">
          <b>{{ waiting.map(nick).join(", ") }}</b>
          {{ waiting.length === 1 ? "può entrare" : "possono entrare" }} in questa
          gara: il tuo PC {{ waiting.length === 1 ? "l'ha" : "li ha" }} già
          {{ waiting.length === 1 ? "aggiunto" : "aggiunti" }}, deve solo aprirla.
        </template>
        <template v-else>
          Non c’è ancora nessuno che possa assisterti in questa gara. Autorizza
          qualcuno e il tuo PC lo aggiunge da solo.
        </template>
      </p>
    </article>

    <p
      v-else
      class="pwc-empty"
    >
      Nessuna gara aperta su questo computer. Appena entri in sessione su ACC
      ne nasce una da sola, e chi ti ha autorizzato la trova senza che tu debba
      dirgli niente.
    </p>
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

.pwc-mine .pwc-race__why {
  grid-column: 1 / -1;
  margin: 0;
}

.pwc-mine.is-dormant,
.pwc-mine.is-closed {
  opacity: 0.72;
}

@media (max-width: 640px) {
  .pwc-mine {
    grid-template-columns: 1fr auto;
  }
}
</style>

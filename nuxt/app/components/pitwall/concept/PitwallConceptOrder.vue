<script setup lang="ts">
// Com'e' andato l'ordine, e cosa si puo' fare adesso (PIP-369, PIP-360).
//
// Due principi che vengono dal Pit Wall reale: l'invio non finge mai - se e'
// bloccato dice **quale** cosa lo blocca - e l'esito resta distinto campo per
// campo, perche' ACC rilegge solo una parte dei campi e appiattirli in un
// generico "fatto" sarebbe un falso verde. Gli stati sono quelli veri che il
// PC del pilota scrive: inviata, in corso, applicata, in parte, non riuscita,
// rifiutata.
import { computed } from "vue";
import { describePitwallConceptOrderStatus } from "~/utils/pitwallConcept";
import type { PitwallOrderStatus } from "~/services/pitwall/pitwallLink";
import type { PitwallFieldOutcomeRow } from "~/composables/usePitwallController";

const props = defineProps<{
  status: PitwallOrderStatus | null;
  /** Il motivo scritto da chi ha applicato, quando c'e'. */
  reason: string | null;
  /** I campi dichiarati, e se ACC li ha riletti o li abbiamo solo premuti. */
  outcomes: PitwallFieldOutcomeRow[];
  /** Il motivo per cui non si puo' inviare, oppure `null`. */
  blocked: string | null;
}>();

defineEmits<{ send: [] }>();

const order = computed(() => describePitwallConceptOrderStatus(props.status, props.reason));
const busy = computed(() => props.status === "pending" || props.status === "applying");

function mark(outcome: PitwallFieldOutcomeRow["outcome"]): string {
  if (outcome === "verified") return "✓";
  if (outcome === "selected") return "→";
  return "—";
}
</script>

<template>
  <div>
    <!-- Inviare non e' finire: "in parte" e "rifiutata" sono esiti quanto
         "applicata", e vanno detti con lo stesso peso. -->
    <div
      v-if="status"
      class="pwc-order"
      :class="`is-${order.tone}`"
    >
      <strong>{{ order.label }}</strong>
      <span>{{ order.detail }}</span>
    </div>

    <div
      v-if="outcomes.length && !busy"
      class="pwc-outcome"
    >
      <span
        v-for="entry in outcomes"
        :key="entry.field"
        class="pwc-outcome__chip"
        :class="`is-${entry.outcome ?? 'none'}`"
        :title="entry.reason ?? undefined"
      >
        {{ mark(entry.outcome) }} {{ entry.label }}
      </span>
    </div>

    <p
      v-if="blocked"
      class="pwc-blocked"
    >
      {{ blocked }}
    </p>

    <button
      type="button"
      class="pwc-send"
      :class="{ 'is-sent': status === 'applied' }"
      :disabled="Boolean(blocked)"
      @click="$emit('send')"
    >
      {{ busy ? "Invia di nuovo" : "Invia strategia" }}
    </button>
  </div>
</template>

<style lang="scss">
@use "@/assets/scss/variables" as *;

/* L'esito per campo: segni diversi perche' sono cose diverse. */
.pwc-outcome {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px 20px 0;
}
.pwc-outcome__chip {
  padding: 4px 10px;
  border: 1px solid var(--pwc-line);
  border-radius: 99px;
  color: $text-secondary;
  font-size: 12px;
  font-weight: 700;
}
.pwc-outcome__chip.is-verified { border-color: rgba(74, 222, 128, 0.45); color: #4ade80; }
.pwc-outcome__chip.is-selected { border-color: rgba(167, 139, 250, 0.45); color: #a78bfa; }
.pwc-outcome__chip.is-not-verifiable { border-color: rgba(245, 158, 11, 0.45); color: #f59e0b; }

/* Lo stato dell'ordine: sei esiti, non "inviata" e basta. */
.pwc-order {
  display: grid;
  gap: 2px;
  margin: 16px 20px 0;
  padding: 12px 14px;
  border: 1px solid var(--pwc-line);
  border-radius: 8px;
  font-size: 13px;
}
.pwc-order > span { color: $text-secondary; }
.pwc-order.is-good { border-color: rgba(74, 222, 128, 0.45); }
.pwc-order.is-good > strong { color: #4ade80; }
.pwc-order.is-warn { border-color: rgba(245, 158, 11, 0.45); }
.pwc-order.is-warn > strong { color: #f59e0b; }
.pwc-order.is-bad { border-color: rgba(239, 68, 68, 0.5); }
.pwc-order.is-bad > strong { color: #ff625c; }

.pwc-blocked {
  margin: 16px 20px 0;
  padding: 10px 14px;
  border: 1px solid rgba(245, 158, 11, 0.4);
  border-radius: 8px;
  color: #f59e0b;
  font-size: 13px;
}

.pwc-send {
  width: calc(100% - 40px);
  min-height: 48px;
  margin: 20px;
  border: 0;
  border-radius: 8px;
  background: #e0210b;
  color: #fff;
  font-family: $font-display;
  font-size: 14px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
}
.pwc-send:hover { background: #f5290f; }
.pwc-send:disabled { background: rgba(255, 255, 255, 0.06); color: $text-muted; cursor: not-allowed; }
.pwc-send.is-sent { background: rgba(74, 222, 128, 0.18); color: #4ade80; }

@media (max-width: 760px) {
  .pwc-send { width: calc(100% - 28px); margin: 14px; }
}
</style>

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
// Il segno, il tono e la frase di ogni chip vengono da una funzione sola,
// condivisa con la vista Legacy: "confermato a schermo" e "tasto inviato"
// non possono avere due traduzioni.
import { describePitwallFieldOutcome } from "~/utils/pitwallPresentation";
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

/**
 * Una riga di conto a esito concluso: quanti campi confermati (e quanti a
 * schermo), quanti in disaccordo. Si legge in un colpo d'occhio, senza aprire
 * le chip; il colore da solo non basta.
 */
const summary = computed(() => {
  const rows = props.outcomes;
  if (!rows.length) return "";
  const verified = rows.filter(entry => entry.outcome === "verified").length;
  const onScreen = rows.filter(entry => entry.outcome === "verified" && entry.via === "screen").length;
  const mismatch = rows.filter(entry => entry.outcome === null && entry.observed != null).length;
  const parts = [`${verified}/${rows.length} confermati`];
  if (onScreen) parts.push(`${onScreen} a schermo`);
  if (mismatch) parts.push(`${mismatch} in disaccordo`);
  return parts.join(" · ");
});

/** Ogni chip con il suo segno: ✓ a schermo o dalla telemetria, → inviato, ✗ in disaccordo, ↳ trascinata. */
const chips = computed(() => props.outcomes.map((entry) => {
  const described = describePitwallFieldOutcome(entry);
  return {
    ...entry,
    ...described,
    title: [described.title, entry.reason].filter(Boolean).join(" · "),
  };
}));
</script>

<template>
  <div>
    <!-- Inviare non e' finire: "in parte" e "rifiutata" sono esiti quanto
         "applicata", e vanno detti con lo stesso peso. -->
    <div
      v-if="status"
      class="pwc-order"
      :class="[`is-${order.tone}`, { 'is-busy': busy }]"
      role="status"
      aria-live="polite"
    >
      <span
        class="pwc-order__mark"
        aria-hidden="true"
      >{{ busy ? "…" : order.tone === "good" ? "✓" : order.tone === "warn" ? "!" : order.tone === "bad" ? "✗" : "" }}</span>
      <strong>{{ order.label }}</strong>
      <span class="pwc-order__detail">{{ order.detail }}</span>
      <small
        v-if="!busy && summary"
        class="pwc-order__summary"
      >{{ summary }}</small>
    </div>

    <div
      v-if="outcomes.length && !busy"
      class="pwc-outcome"
    >
      <span
        v-for="chip in chips"
        :key="chip.field"
        class="pwc-outcome__chip"
        :class="[`is-${chip.tone}`, { 'is-screen': chip.onScreen }]"
        :title="chip.title || undefined"
      >
        {{ chip.mark }} {{ chip.label }}<small v-if="chip.detail"> · {{ chip.detail }}</small>
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
      :class="{ 'is-sent': status === 'applied' && Boolean(blocked) }"
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
/* Confermato guardando lo schermo: il bordo pieno lo distingue dalla memoria. */
.pwc-outcome__chip.is-verified.is-screen { border-color: #4ade80; }
.pwc-outcome__chip.is-selected { border-color: rgba(167, 139, 250, 0.45); color: #a78bfa; }
.pwc-outcome__chip.is-not-verifiable { border-color: rgba(245, 158, 11, 0.45); color: #f59e0b; }
.pwc-outcome__chip.is-mismatch { border-color: rgba(239, 68, 68, 0.6); color: #ff625c; }
.pwc-outcome__chip.is-dragged { border-color: rgba(96, 165, 250, 0.45); color: #60a5fa; }
.pwc-outcome__chip small { font-weight: 500; opacity: 0.85; }

/* Lo stato dell'ordine: sei esiti, non "inviata" e basta. */
/* L'esito si capisce in due secondi senza aprire i log: segno grande a
   sinistra, etichetta in evidenza, fondo tinto del tono, riga di conto sotto. */
.pwc-order {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 14px;
  row-gap: 2px;
  align-items: center;
  margin: 16px 20px 0;
  padding: 14px 16px;
  border: 1px solid var(--pwc-line);
  border-radius: 10px;
  font-size: 13px;
}
.pwc-order__mark {
  grid-row: 1 / span 3;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 2px solid currentColor;
  border-radius: 50%;
  font-family: $font-display;
  font-size: 18px;
}
.pwc-order > strong { font-size: 16px; letter-spacing: 0.02em; text-transform: uppercase; }
.pwc-order__detail { color: $text-secondary; }
.pwc-order__summary { color: $text-muted; font-size: 12px; }
.pwc-order.is-busy .pwc-order__mark { animation: pwc-order-pulse 1.2s ease-in-out infinite; }
.pwc-order.is-good { border-color: rgba(74, 222, 128, 0.6); background: rgba(74, 222, 128, 0.08); }
.pwc-order.is-good > strong, .pwc-order.is-good .pwc-order__mark { color: #4ade80; }
.pwc-order.is-warn { border-color: rgba(245, 158, 11, 0.6); background: rgba(245, 158, 11, 0.08); }
.pwc-order.is-warn > strong, .pwc-order.is-warn .pwc-order__mark { color: #f59e0b; }
.pwc-order.is-bad { border-color: rgba(239, 68, 68, 0.65); background: rgba(239, 68, 68, 0.1); }
.pwc-order.is-bad > strong, .pwc-order.is-bad .pwc-order__mark { color: #ff625c; }
.pwc-order.is-neutral .pwc-order__mark { color: $text-secondary; }
@keyframes pwc-order-pulse { 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .pwc-order.is-busy .pwc-order__mark { animation: none; } }

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

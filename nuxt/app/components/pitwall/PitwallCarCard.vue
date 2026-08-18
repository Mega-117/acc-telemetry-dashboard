<script setup lang="ts">
// ============================================
// PitwallCarCard - stato della macchina del pilota. Si legge soltanto.
//
// I due comandi che simulano l'auto esistono solo in sviluppo: sono un
// simulatore, e nella build utente gli strumenti di sviluppo non devono
// esistere (Principio 4). `import.meta.dev` li fa sparire in compilazione.
// ============================================

defineProps<{
  inPitLane: boolean
  canApply: boolean
}>()

const emit = defineEmits<{
  'toggle-pit-lane': []
  'apply-order': []
}>()

const showMockControls = import.meta.dev
</script>

<template>
  <section class="card">
    <div class="card__head">
      <h2>Macchina</h2>
      <span class="tag">MOCK</span>
    </div>

    <!-- Il conteggio delle voci dell'ultimo ordine e' stato tolto: era sempre
         lo stesso numero (i campi dell'ordine), quindi non informava. -->
    <dl class="facts">
      <dt>In pit lane</dt>
      <dd>{{ inPitLane ? 'Si' : 'No' }}</dd>
    </dl>

    <div
      v-if="showMockControls"
      class="quick"
    >
      <button
        type="button"
        class="ghost"
        @click="emit('toggle-pit-lane')"
      >
        {{ inPitLane ? 'Esci dai box' : 'Entra ai box' }}
      </button>
      <button
        type="button"
        class="ghost"
        :disabled="!canApply"
        @click="emit('apply-order')"
      >
        Applica ordine
      </button>
    </div>

    <p class="note">
      Dati finti: nessuna telemetria letta, niente inviato alla macchina.
    </p>
    <!-- Nota volutamente esplicita: chi apre questa pagina deve capire subito
         che sta guardando un prototipo, non lo stato reale dell'auto. -->
  </section>
</template>

<style lang="scss" scoped>
.card {
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: linear-gradient(145deg, rgba(26, 26, 36, 0.98), rgba(12, 12, 18, 0.98));
}

.card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.card__head h2 {
  margin: 0;
  color: rgba(255, 255, 255, 0.46);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tag {
  padding: 2px 6px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 5px;
  color: rgba(255, 255, 255, 0.45);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.1em;
}

/* Etichetta e valore sulla stessa riga: due righe totali invece di quattro. */
.facts {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 2px 8px;
  margin: 0 0 10px;
}

.facts dt {
  color: rgba(255, 255, 255, 0.42);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 16px;
  text-transform: uppercase;
}

.facts dd {
  margin: 0;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  line-height: 16px;
}

.quick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ghost {
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.ghost:hover:not(:disabled),
.ghost:focus-visible:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.4);
  color: #fff;
}

.ghost:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.note {
  margin: 8px 0 0;
  color: rgba(255, 255, 255, 0.35);
  font-size: 11px;
}
</style>

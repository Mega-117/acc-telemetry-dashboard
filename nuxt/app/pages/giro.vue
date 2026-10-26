<script setup lang="ts">
// PIP-623: chi apre un link "Condividi giro" nel browser arriva qui. Il giro non si apre da solo:
// va incollato nella Telemetria di una propria sessione sulla stessa pista, dove diventa il
// riferimento. Il frammento del link (giro e chiave) resta nel browser e non si salva.
import { onMounted, ref } from 'vue'
import { parseLapShareLink } from '~/services/telemetry/lapShareLink'

useHead({ title: 'Giro condiviso · Racer Core' })
const link = ref('')
const valid = ref(false)
const copied = ref(false)
onMounted(() => {
  link.value = window.location.href
  valid.value = parseLapShareLink(window.location.hash) !== null
})
async function copy() {
  try { await navigator.clipboard.writeText(link.value); copied.value = true; setTimeout(() => { copied.value = false }, 2500) } catch { copied.value = false }
}
</script>

<template>
  <main class="lap-link">
    <h1>Giro condiviso</h1>
    <template v-if="valid">
      <p>Per confrontarti con questo giro:</p>
      <ol>
        <li>apri <strong>Racer Core</strong> e una tua sessione sulla stessa pista;</li>
        <li>vai su <strong>Telemetria</strong> e premi <strong>+ Giro di un altro pilota</strong>;</li>
        <li>incolla questo link: il giro diventa il tuo riferimento.</li>
      </ol>
      <button type="button" @click="copy">{{ copied ? 'Link copiato' : 'Copia il link' }}</button>
    </template>
    <p v-else>Questo link non contiene un giro: chiedi a chi te l'ha mandato di usare di nuovo "Condividi giro".</p>
  </main>
</template>

<style scoped lang="scss">
.lap-link { max-width: 560px; margin: 40px auto; padding: 0 16px; color: #e6e6ea; display: grid; gap: 12px;
  h1 { margin: 0; font: italic 700 24px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; }
  ol { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
  button { justify-self: start; height: 38px; padding: 0 16px; border: 1px solid #fbbf24; background: #fbbf2422; color: #fff; font: 700 13px 'Inter', sans-serif; cursor: pointer; } }
</style>

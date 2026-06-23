<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
</script>

<template>
  <LayoutPageContainer>
    <section class="spotter-page">
      <header class="spotter-hero">
        <span class="spotter-kicker">Spotter</span>
        <h1>Avvisi vocali</h1>
        <p>Gestisci i riferimenti audio che il sistema riproduce mentre guidi.</p>
      </header>

      <div class="spotter-grid">
        <article class="spotter-card">
          <div>
            <span class="spotter-card__eyebrow">Riferimenti pista</span>
            <h2>Kokoro Voice Lab</h2>
            <p>Apri la gestione dei riferimenti vocali per pista: testo, voce, velocita, ascolto, salvataggio e generazione WAV.</p>
          </div>
          <NuxtLink class="spotter-action" to="/dev-voice-lab?section=references">
            Apri riferimenti vocali
          </NuxtLink>
        </article>
      </div>
    </section>
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.spotter-page {
  padding: 32px 0 56px;
  color: #f7fbff;
}

.spotter-hero {
  max-width: 920px;
  margin-bottom: 28px;
}

.spotter-kicker,
.spotter-card__eyebrow {
  display: block;
  color: $racing-orange;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.spotter-hero h1,
.spotter-card h2 {
  margin: 0 0 10px;
  letter-spacing: 0;
}

.spotter-hero p,
.spotter-card p {
  margin: 0;
  color: rgba(255, 255, 255, 0.68);
  line-height: 1.55;
}

.spotter-grid {
  display: grid;
  grid-template-columns: minmax(0, 560px);
  gap: 16px;
}

.spotter-card {
  display: grid;
  gap: 22px;
  padding: 22px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
}

.spotter-action {
  width: fit-content;
  padding: 10px 14px;
  border-radius: 6px;
  background: linear-gradient(135deg, $racing-red, $racing-orange);
  color: #fff;
  font-weight: 800;
  text-decoration: none;
}
</style>
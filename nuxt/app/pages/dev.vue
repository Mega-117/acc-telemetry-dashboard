<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
  middleware: 'dev-tools'
})

const devTools = [
  {
    title: 'Firebase Monitor',
    eyebrow: 'reads / writes',
    description: 'Scenario, caller, path e operazioni Firestore della sessione corrente.',
    to: '/dev-firebase',
    tone: 'cyan'
  },
  {
    title: 'Owner Rebuild',
    eyebrow: 'audit / migration',
    description: 'Audit owner, rebuild projection e reprocess controllato dei dati dell utente loggato.',
    to: '/dev-rebuild',
    tone: 'orange'
  },
  {
    title: 'Cleanup',
    eyebrow: 'ghost / duplicates',
    description: 'Controlli manuali per zero-lap, duplicati e pulizia dati legacy.',
    to: '/dev-cleanup',
    tone: 'red'
  },
  {
    title: 'Data Audit',
    eyebrow: 'trackBests / legacy',
    description: 'Analisi tecnica di trackBests, grip legacy e dati storici.',
    to: '/dev-data-audit',
    tone: 'blue'
  },
  {
    title: 'Upload',
    eyebrow: 'manual json',
    description: 'Upload manuale di file JSON per debug e test controllati.',
    to: '/dev-upload',
    tone: 'green'
  }
]
</script>

<template>
  <LayoutPageContainer>
    <section class="dev-hub">
      <header class="dev-hero">
        <span class="dev-kicker">Area sviluppo locale</span>
        <h1>Strumenti Dev</h1>
        <p>
          Pannelli diagnostici disponibili solo in sviluppo o localhost. Le route originali restano invariate.
        </p>
      </header>

      <div class="dev-grid">
        <NuxtLink
          v-for="tool in devTools"
          :key="tool.to"
          :to="tool.to"
          class="dev-card"
          :class="`dev-card--${tool.tone}`"
        >
          <span class="dev-card__eyebrow">{{ tool.eyebrow }}</span>
          <strong>{{ tool.title }}</strong>
          <p>{{ tool.description }}</p>
          <span class="dev-card__cta">Apri pannello</span>
        </NuxtLink>
      </div>
    </section>
  </LayoutPageContainer>
</template>

<style scoped lang="scss">
.dev-hub {
  display: grid;
  gap: 28px;
}

.dev-hero {
  padding: 34px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    radial-gradient(circle at 16% 20%, rgba(45, 212, 191, 0.16), transparent 36%),
    linear-gradient(135deg, rgba(22, 27, 40, 0.96), rgba(11, 11, 16, 0.96));

  h1 {
    margin: 8px 0 10px;
    color: #fff;
    font-size: clamp(34px, 5vw, 58px);
    letter-spacing: -0.04em;
  }

  p {
    max-width: 760px;
    margin: 0;
    color: rgba(255, 255, 255, 0.68);
    font-size: 16px;
    line-height: 1.65;
  }
}

.dev-kicker,
.dev-card__eyebrow {
  color: rgba(255, 255, 255, 0.52);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.dev-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.dev-card {
  position: relative;
  min-height: 210px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  padding: 24px;
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.035);
  color: #fff;
  text-decoration: none;
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;

  &::before {
    content: '';
    position: absolute;
    inset: auto -20% -35% 30%;
    height: 150px;
    border-radius: 999px;
    filter: blur(20px);
    opacity: 0.18;
    background: var(--card-accent, #5eead4);
  }

  &:hover {
    transform: translateY(-3px);
    border-color: color-mix(in srgb, var(--card-accent, #5eead4), transparent 35%);
    background: rgba(255, 255, 255, 0.055);
  }

  strong {
    position: relative;
    font-size: 26px;
    letter-spacing: -0.03em;
  }

  p {
    position: relative;
    margin: 0;
    color: rgba(255, 255, 255, 0.66);
    line-height: 1.55;
  }
}

.dev-card__cta {
  position: relative;
  color: var(--card-accent, #5eead4);
  font-weight: 900;
}

.dev-card--cyan { --card-accent: #5eead4; }
.dev-card--orange { --card-accent: #fb923c; }
.dev-card--red { --card-accent: #ff4d4d; }
.dev-card--blue { --card-accent: #60a5fa; }
.dev-card--green { --card-accent: #22c55e; }

@media (max-width: 820px) {
  .dev-grid {
    grid-template-columns: 1fr;
  }
}
</style>

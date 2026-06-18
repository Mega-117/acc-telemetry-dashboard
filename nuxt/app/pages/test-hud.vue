<script setup lang="ts">
// Test HUD (PIP-175): banco di prova dev-gated per gli overlay. Da qui si
// accende/spegne ogni overlay singolarmente e si entra in modalita'
// riposiziona. Self-contained (come dev.vue): nessun componente in
// components/pages, quindi fuori dal contratto useTelemetryGateway.
import { onMounted, reactive, ref } from 'vue'

definePageMeta({
  layout: 'dashboard',
  middleware: 'dev-tools',
})

type HudOverlayId = 'tyres' | 'sectors'

const hudOverlays: Array<{ id: HudOverlayId; title: string; description: string }> = [
  { id: 'tyres', title: 'Gomme', description: 'Temperature, pressioni e scivolamento per pneumatico (fast_state).' },
  { id: 'sectors', title: 'Settori', description: 'Tempi e delta per settore con codifica colore (live_state).' },
]

function getApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

const isElectron = ref(false)
const open = reactive<Record<HudOverlayId, boolean>>({ tyres: false, sectors: false })
const trainingOpen = ref(false)

onMounted(async () => {
  const api = getApi()
  isElectron.value = !!api
  if (!api?.hudOverlayIsOpen) return
  for (const overlay of hudOverlays) {
    try {
      open[overlay.id] = await api.hudOverlayIsOpen(overlay.id)
    } catch {
      open[overlay.id] = false
    }
  }
})

async function toggleHud(id: HudOverlayId) {
  const api = getApi()
  if (!api) return
  if (open[id]) {
    await api.hudOverlayClose?.(id)
    open[id] = false
  } else {
    await api.hudOverlayOpen?.(id)
    open[id] = true
  }
}

async function repositionHud(id: HudOverlayId) {
  const api = getApi()
  if (!api?.hudOverlayOpen) return
  await api.hudOverlayOpen(id, { place: true })
  open[id] = true
}

async function toggleTraining() {
  const api = getApi()
  if (!api) return
  if (trainingOpen.value) {
    await api.trainingOverlayClose?.()
    trainingOpen.value = false
  } else {
    await api.trainingOverlayOpen?.()
    trainingOpen.value = true
  }
}
</script>

<template>
  <LayoutPageContainer>
    <section class="test-hud">
      <header class="test-hud__hero">
        <span class="test-hud__kicker">Strumenti dev · overlay</span>
        <h1>Test HUD</h1>
        <p>
          Accendi, spegni e riposiziona gli overlay singolarmente. Disponibile solo da
          <strong>localhost</strong> con ruolo <strong>admin</strong>.
        </p>
        <p v-if="!isElectron" class="test-hud__warning">
          Sei nel browser: i comandi overlay funzionano solo nell'app desktop (Electron).
        </p>
      </header>

      <div class="test-hud__grid">
        <!-- Overlay allenamento: gestito col suo open/close esistente -->
        <article class="hud-card hud-card--training">
          <div class="hud-card__head">
            <strong>Allenamento</strong>
            <span class="hud-card__state" :class="{ 'is-on': trainingOpen }">
              {{ trainingOpen ? 'ON' : 'OFF' }}
            </span>
          </div>
          <p>Overlay coaching completo (fasi, voce, step). Gestito dal suo sistema.</p>
          <div class="hud-card__actions">
            <button type="button" class="btn btn--primary" :disabled="!isElectron" @click="toggleTraining">
              {{ trainingOpen ? 'Chiudi' : 'Apri' }}
            </button>
          </div>
        </article>

        <!-- Overlay HUD semplici: toggle individuale + riposiziona -->
        <article
          v-for="overlay in hudOverlays"
          :key="overlay.id"
          class="hud-card"
        >
          <div class="hud-card__head">
            <strong>{{ overlay.title }}</strong>
            <span class="hud-card__state" :class="{ 'is-on': open[overlay.id] }">
              {{ open[overlay.id] ? 'ON' : 'OFF' }}
            </span>
          </div>
          <p>{{ overlay.description }}</p>
          <div class="hud-card__actions">
            <button type="button" class="btn btn--primary" :disabled="!isElectron" @click="toggleHud(overlay.id)">
              {{ open[overlay.id] ? 'Spegni' : 'Accendi' }}
            </button>
            <button type="button" class="btn" :disabled="!isElectron" @click="repositionHud(overlay.id)">
              Riposiziona
            </button>
          </div>
        </article>
      </div>
    </section>
  </LayoutPageContainer>
</template>

<style scoped lang="scss">
.test-hud {
  display: grid;
  gap: 28px;
}

.test-hud__hero {
  padding: 34px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    radial-gradient(circle at 16% 20%, rgba(251, 146, 60, 0.16), transparent 36%),
    linear-gradient(135deg, rgba(22, 27, 40, 0.96), rgba(11, 11, 16, 0.96));

  h1 {
    margin: 8px 0 10px;
    color: #fff;
    font-size: clamp(34px, 5vw, 58px);
    letter-spacing: -0.04em;
  }

  p {
    max-width: 760px;
    margin: 0 0 6px;
    color: rgba(255, 255, 255, 0.68);
    font-size: 16px;
    line-height: 1.6;
  }
}

.test-hud__kicker {
  color: rgba(255, 255, 255, 0.52);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.test-hud__warning {
  color: #fbbf24;
  font-weight: 700;
}

.test-hud__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 18px;
}

.hud-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.035);
  color: #fff;

  p {
    margin: 0;
    color: rgba(255, 255, 255, 0.66);
    line-height: 1.5;
    flex: 1;
  }
}

.hud-card--training {
  border-color: rgba(34, 197, 94, 0.28);
}

.hud-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;

  strong {
    font-size: 22px;
    letter-spacing: -0.02em;
  }
}

.hud-card__state {
  padding: 3px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.55);

  &.is-on {
    color: #22c55e;
    border-color: rgba(34, 197, 94, 0.5);
  }
}

.hud-card__actions {
  display: flex;
  gap: 10px;
}

.btn {
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  font-weight: 800;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;

  &:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.32);
    background: rgba(255, 255, 255, 0.07);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.btn--primary {
  border-color: transparent;
  background: linear-gradient(90deg, #f97316, #fb923c);
  color: #1a0d04;
}
</style>

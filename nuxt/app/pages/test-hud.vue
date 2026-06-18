<script setup lang="ts">
// Test HUD (PIP-175): banco di prova dev-gated per gli overlay. Da qui si
// accende/spegne ogni overlay, si blocca la posizione e si entra in
// riposizionamento. Self-contained (come dev.vue): niente componente in
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
// L'app desktop puo' essere in esecuzione con un preload vecchio (avviata prima
// dell'aggiornamento): gli overlay funzionano solo se l'API e' davvero presente.
const apiReady = ref(false)
const open = reactive<Record<HudOverlayId, boolean>>({ tyres: false, sectors: false })
const locked = reactive<Record<HudOverlayId, boolean>>({ tyres: false, sectors: false })
const trainingOpen = ref(false)

async function refreshState() {
  const api = getApi()
  isElectron.value = !!api
  apiReady.value = !!(api && typeof api.hudOverlayOpen === 'function')
  if (!apiReady.value) return
  for (const overlay of hudOverlays) {
    try {
      open[overlay.id] = await api.hudOverlayIsOpen(overlay.id)
      const settings = await api.hudOverlayGetSettings(overlay.id)
      locked[overlay.id] = !!settings?.locked
    } catch {
      open[overlay.id] = false
    }
  }
  if (typeof api.trainingOverlayIsOpen === 'function') {
    try {
      trainingOpen.value = await api.trainingOverlayIsOpen()
    } catch {
      trainingOpen.value = false
    }
  }
}

onMounted(refreshState)

async function toggleHud(id: HudOverlayId) {
  const api = getApi()
  if (!apiReady.value || !api) return
  if (open[id]) {
    await api.hudOverlayClose(id)
  } else {
    await api.hudOverlayOpen(id)
  }
  // Stato dal risultato reale, non ottimistico.
  open[id] = await api.hudOverlayIsOpen(id)
}

async function repositionHud(id: HudOverlayId) {
  const api = getApi()
  if (!apiReady.value || !api || locked[id]) return
  await api.hudOverlayOpen(id, { place: true })
  open[id] = await api.hudOverlayIsOpen(id)
}

async function toggleLock(id: HudOverlayId) {
  const api = getApi()
  if (!apiReady.value || !api) return
  const next = !locked[id]
  await api.hudOverlaySetLocked(id, next)
  locked[id] = next
}

async function toggleTraining() {
  const api = getApi()
  if (!api || typeof api.trainingOverlayToggle !== 'function') return
  await api.trainingOverlayToggle()
  if (typeof api.trainingOverlayIsOpen === 'function') {
    trainingOpen.value = await api.trainingOverlayIsOpen()
  } else {
    trainingOpen.value = !trainingOpen.value
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
          Accendi, spegni, blocca e riposiziona gli overlay singolarmente. Disponibile solo da
          <strong>localhost</strong> con ruolo <strong>admin</strong>.
        </p>
        <p v-if="!isElectron" class="test-hud__warning">
          Sei nel browser: i comandi overlay funzionano solo nell'app desktop (Electron).
        </p>
        <p v-else-if="!apiReady" class="test-hud__warning">
          App desktop avviata con una versione precedente: <strong>riavvia l'app</strong> per
          caricare gli overlay aggiornati.
        </p>
      </header>

      <div class="test-hud__grid">
        <!-- Overlay allenamento: solo mostra/nascondi (come Ctrl+K) -->
        <article class="hud-card hud-card--training">
          <div class="hud-card__head">
            <strong>Allenamento</strong>
            <span class="hud-card__state" :class="{ 'is-on': trainingOpen }">
              {{ trainingOpen ? 'ON' : 'OFF' }}
            </span>
          </div>
          <p>Overlay coaching completo (fasi, voce, step). Qui solo mostra/nascondi.</p>
          <div class="hud-card__actions">
            <button type="button" class="btn btn--primary" :disabled="!isElectron" @click="toggleTraining">
              {{ trainingOpen ? 'Nascondi' : 'Mostra' }}
            </button>
          </div>
        </article>

        <!-- Overlay HUD semplici: toggle + blocco + riposiziona + impostazioni segnaposto -->
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
            <button type="button" class="btn btn--primary" :disabled="!apiReady" @click="toggleHud(overlay.id)">
              {{ open[overlay.id] ? 'Spegni' : 'Accendi' }}
            </button>
            <button
              type="button"
              class="btn"
              :disabled="!apiReady || locked[overlay.id]"
              :title="locked[overlay.id] ? 'Sblocca per riposizionare' : 'Trascina per posizionare'"
              @click="repositionHud(overlay.id)"
            >
              Riposiziona
            </button>
            <button
              type="button"
              class="btn btn--lock"
              :class="{ 'is-locked': locked[overlay.id] }"
              :disabled="!apiReady"
              @click="toggleLock(overlay.id)"
            >
              {{ locked[overlay.id] ? '🔒 Bloccata' : '🔓 Blocca' }}
            </button>
          </div>

          <!-- Impostazioni previste ma non ancora attive (segnaposto inerti) -->
          <details class="hud-card__more">
            <summary>Impostazioni <span class="soon">presto</span></summary>
            <div class="hud-card__settings" aria-disabled="true">
              <label class="setting setting--disabled">
                <span>Opacità</span>
                <input type="range" min="20" max="100" value="100" disabled>
              </label>
              <label class="setting setting--disabled">
                <span>Dimensione</span>
                <select disabled>
                  <option>Normale</option>
                </select>
              </label>
              <p class="setting__note">Queste opzioni non sono ancora attive.</p>
            </div>
          </details>
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
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
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

  > p {
    margin: 0;
    color: rgba(255, 255, 255, 0.66);
    line-height: 1.5;
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
  flex-wrap: wrap;
  gap: 10px;
}

.btn {
  padding: 8px 14px;
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

.btn--lock.is-locked {
  border-color: rgba(251, 191, 36, 0.5);
  color: #fbbf24;
}

.hud-card__more {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 10px;

  summary {
    cursor: pointer;
    color: rgba(255, 255, 255, 0.6);
    font-weight: 700;
    font-size: 13px;
  }

  .soon {
    margin-left: 6px;
    padding: 1px 7px;
    border-radius: 999px;
    background: rgba(251, 191, 36, 0.16);
    color: #fbbf24;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
}

.hud-card__settings {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);

  &--disabled {
    opacity: 0.5;
  }
}

.setting__note {
  margin: 2px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}
</style>

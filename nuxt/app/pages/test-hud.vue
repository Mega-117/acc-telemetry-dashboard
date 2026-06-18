<script setup lang="ts">
// Test HUD (PIP-175): banco di prova dev-gated per gli overlay.
// - Interruttore GLOBALE di posizionamento: sblocca/blocca TUTTI gli overlay.
// - Per ogni overlay: on/off + formato fisso (Piccolo/Medio/Grande).
// Self-contained (come dev.vue): fuori dal contratto useTelemetryGateway.
import { onMounted, reactive, ref } from 'vue'

definePageMeta({
  layout: 'dashboard',
  middleware: 'dev-tools',
})

type HudOverlayId = 'tyres' | 'sectors'
type HudFormat = 'small' | 'medium' | 'large'

const hudOverlays: Array<{ id: HudOverlayId; title: string; description: string }> = [
  { id: 'tyres', title: 'Gomme', description: 'Temperature, pressioni e scivolamento per pneumatico (fast_state).' },
  { id: 'sectors', title: 'Settori', description: 'Tempi e delta per settore con codifica colore (live_state).' },
]

const FORMAT_OPTIONS: Array<{ value: HudFormat; label: string }> = [
  { value: 'small', label: 'Piccolo' },
  { value: 'medium', label: 'Medio' },
  { value: 'large', label: 'Grande' },
]

function getApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

const isElectron = ref(false)
const apiReady = ref(false)
const open = reactive<Record<HudOverlayId, boolean>>({ tyres: false, sectors: false })
const format = reactive<Record<HudOverlayId, HudFormat>>({ tyres: 'medium', sectors: 'medium' })
const positioning = ref(false)
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
      if (settings?.format) format[overlay.id] = settings.format
    } catch {
      open[overlay.id] = false
    }
  }
  if (typeof api.hudOverlayIsPositioning === 'function') {
    try { positioning.value = await api.hudOverlayIsPositioning() } catch { positioning.value = false }
  }
  if (typeof api.trainingOverlayIsOpen === 'function') {
    try { trainingOpen.value = await api.trainingOverlayIsOpen() } catch { trainingOpen.value = false }
  }
}

onMounted(refreshState)

async function toggleHud(id: HudOverlayId) {
  const api = getApi()
  if (!apiReady.value || !api) return
  if (open[id]) await api.hudOverlayClose(id)
  else await api.hudOverlayOpen(id, { format: format[id] })
  open[id] = await api.hudOverlayIsOpen(id)
}

async function setFormat(id: HudOverlayId, value: HudFormat) {
  const api = getApi()
  format[id] = value
  if (!apiReady.value || !api) return
  await api.hudOverlaySetFormat(id, value)
}

async function togglePositioning() {
  const api = getApi()
  if (!apiReady.value || !api) return
  const next = !positioning.value
  await api.hudOverlaySetAllPlacement(next)
  positioning.value = next
}

async function toggleTraining() {
  const api = getApi()
  if (!api || typeof api.trainingOverlayToggle !== 'function') return
  await api.trainingOverlayToggle()
  if (typeof api.trainingOverlayIsOpen === 'function') trainingOpen.value = await api.trainingOverlayIsOpen()
  else trainingOpen.value = !trainingOpen.value
}
</script>

<template>
  <LayoutPageContainer>
    <section class="test-hud">
      <header class="test-hud__hero">
        <span class="test-hud__kicker">Strumenti dev · overlay</span>
        <h1>Test HUD</h1>
        <p>
          Accendi gli overlay, scegli il formato e posizionali. Disponibile solo da
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

      <!-- Interruttore globale di posizionamento -->
      <div class="test-hud__placement" :class="{ 'is-on': positioning }">
        <div class="test-hud__placement-text">
          <strong>Posizionamento overlay</strong>
          <span>{{ positioning ? 'Sbloccato: trascina gli overlay dove vuoi, poi blocca per fissarli.' : 'Bloccato: le posizioni sono fisse.' }}</span>
        </div>
        <button type="button" class="btn btn--primary" :disabled="!apiReady" @click="togglePositioning">
          {{ positioning ? 'Blocca tutti' : 'Sblocca tutti' }}
        </button>
      </div>

      <div class="test-hud__grid">
        <!-- Overlay allenamento: solo mostra/nascondi (come Ctrl+K) -->
        <article class="hud-card hud-card--training">
          <div class="hud-card__head">
            <strong>Allenamento</strong>
            <span class="hud-card__state" :class="{ 'is-on': trainingOpen }">{{ trainingOpen ? 'ON' : 'OFF' }}</span>
          </div>
          <p>Overlay coaching completo (fasi, voce, step). Qui solo mostra/nascondi.</p>
          <div class="hud-card__actions">
            <button type="button" class="btn btn--primary" :disabled="!isElectron" @click="toggleTraining">
              {{ trainingOpen ? 'Nascondi' : 'Mostra' }}
            </button>
          </div>
        </article>

        <!-- Overlay HUD: on/off + formato -->
        <article v-for="overlay in hudOverlays" :key="overlay.id" class="hud-card">
          <div class="hud-card__head">
            <strong>{{ overlay.title }}</strong>
            <span class="hud-card__state" :class="{ 'is-on': open[overlay.id] }">{{ open[overlay.id] ? 'ON' : 'OFF' }}</span>
          </div>
          <p>{{ overlay.description }}</p>

          <div class="hud-card__actions">
            <button type="button" class="btn btn--primary" :disabled="!apiReady" @click="toggleHud(overlay.id)">
              {{ open[overlay.id] ? 'Spegni' : 'Accendi' }}
            </button>
          </div>

          <div class="hud-card__formats">
            <span class="hud-card__formats-label">Formato</span>
            <div class="seg">
              <button
                v-for="opt in FORMAT_OPTIONS"
                :key="opt.value"
                type="button"
                class="seg__btn"
                :class="{ 'is-active': format[overlay.id] === opt.value }"
                :disabled="!apiReady"
                @click="setFormat(overlay.id, opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>
  </LayoutPageContainer>
</template>

<style scoped lang="scss">
.test-hud {
  display: grid;
  gap: 22px;
}

.test-hud__hero {
  padding: 34px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    radial-gradient(circle at 16% 20%, rgba(251, 146, 60, 0.16), transparent 36%),
    linear-gradient(135deg, rgba(22, 27, 40, 0.96), rgba(11, 11, 16, 0.96));

  h1 { margin: 8px 0 10px; color: #fff; font-size: clamp(34px, 5vw, 58px); letter-spacing: -0.04em; }
  p { max-width: 760px; margin: 0 0 6px; color: rgba(255, 255, 255, 0.68); font-size: 16px; line-height: 1.6; }
}

.test-hud__kicker {
  color: rgba(255, 255, 255, 0.52);
  font-size: 12px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase;
}

.test-hud__warning { color: #fbbf24; font-weight: 700; }

.test-hud__placement {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.035);

  &.is-on {
    border-color: rgba(34, 197, 94, 0.5);
    background: rgba(34, 197, 94, 0.08);
  }

  strong { display: block; color: #fff; font-size: 18px; }
  span { color: rgba(255, 255, 255, 0.62); font-size: 14px; }
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

  > p { margin: 0; color: rgba(255, 255, 255, 0.66); line-height: 1.5; }
}

.hud-card--training { border-color: rgba(34, 197, 94, 0.28); }

.hud-card__head {
  display: flex; align-items: center; justify-content: space-between;
  strong { font-size: 22px; letter-spacing: -0.02em; }
}

.hud-card__state {
  padding: 3px 12px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.2);
  font-size: 12px; font-weight: 900; letter-spacing: 0.08em; color: rgba(255, 255, 255, 0.55);
  &.is-on { color: #22c55e; border-color: rgba(34, 197, 94, 0.5); }
}

.hud-card__actions { display: flex; gap: 10px; }

.hud-card__formats { display: flex; flex-direction: column; gap: 6px; }
.hud-card__formats-label { color: rgba(255, 255, 255, 0.5); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; }

.seg {
  display: inline-flex;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  overflow: hidden;
}

.seg__btn {
  padding: 7px 14px;
  border: none;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.7);
  font-weight: 800;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  & + & { border-left: 1px solid rgba(255, 255, 255, 0.12); }

  &:hover:not(:disabled) { background: rgba(255, 255, 255, 0.08); color: #fff; }
  &.is-active { background: linear-gradient(90deg, #f97316, #fb923c); color: #1a0d04; }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
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

  &:hover:not(:disabled) { border-color: rgba(255, 255, 255, 0.32); background: rgba(255, 255, 255, 0.07); }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
}

.btn--primary { border-color: transparent; background: linear-gradient(90deg, #f97316, #fb923c); color: #1a0d04; }
</style>

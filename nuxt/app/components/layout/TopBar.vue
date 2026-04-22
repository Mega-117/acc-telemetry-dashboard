<script setup lang="ts">
// ============================================
// TopBar - Application header
// ============================================

import { computed, ref, onMounted } from 'vue'

const props = defineProps<{
  userName?: string
}>()

const emit = defineEmits<{
  logout: []
  goToProfile: []
}>()

const { isCoach, isAdmin } = useFirebaseAuth()
const displayName = computed(() => props.userName ?? 'Utente')

const goToCoachArea = () => {
  navigateTo('/piloti')
}

// ============================================
// Voice Assistant (TTS Server + Fallback)
// ============================================
const TTS_SERVER = 'http://localhost:5111'

interface TTSVoice {
  id: string
  name: string
  engine: string
  gender: string
  quality: string
  description: string
}

const isSpeaking = ref(false)
const availableVoices = ref<TTSVoice[]>([])
const selectedVoice = ref('')
const ttsServerAvailable = ref(false)
const showVoiceDropdown = ref(false)

// Fetch voices from TTS server
async function loadVoices() {
  try {
    const res = await fetch(`${TTS_SERVER}/voices`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) throw new Error('Server non raggiungibile')
    const data = await res.json()
    availableVoices.value = data.voices || []
    ttsServerAvailable.value = availableVoices.value.length > 0
    if (availableVoices.value.length > 0 && !selectedVoice.value) {
      selectedVoice.value = availableVoices.value[0].id
    }
    console.log(`[VOICE] TTS Server: ${availableVoices.value.length} voci disponibili`)
  } catch {
    ttsServerAvailable.value = false
    console.log('[VOICE] TTS Server non disponibile, uso Web Speech API')
  }
}

async function speakGreeting() {
  const text = `Ciao ${displayName.value}!`

  if (ttsServerAvailable.value && selectedVoice.value) {
    // Use TTS Server (Kokoro/Piper)
    await speakWithServer(text)
  } else {
    // Fallback: Web Speech API
    speakWithBrowser(text)
  }
}

async function speakWithServer(text: string) {
  if (isSpeaking.value) return
  isSpeaking.value = true

  try {
    const url = `${TTS_SERVER}/speak?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(selectedVoice.value)}`
    console.log(`[VOICE] Server TTS: "${text}" → ${selectedVoice.value}`)

    const res = await fetch(url)
    if (!res.ok) throw new Error(`Errore server: ${res.status}`)

    const blob = await res.blob()
    const audioUrl = URL.createObjectURL(blob)
    const audio = new Audio(audioUrl)

    audio.onended = () => {
      isSpeaking.value = false
      URL.revokeObjectURL(audioUrl)
    }
    audio.onerror = () => {
      isSpeaking.value = false
      URL.revokeObjectURL(audioUrl)
    }

    await audio.play()
  } catch (e) {
    console.error('[VOICE] Errore TTS server:', e)
    isSpeaking.value = false
  }
}

function speakWithBrowser(text: string) {
  if (!('speechSynthesis' in window)) return

  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  const voices = window.speechSynthesis.getVoices()
  const italianVoice = voices.find(v => v.lang.startsWith('it'))
  if (italianVoice) utterance.voice = italianVoice
  utterance.lang = 'it-IT'
  utterance.rate = 1.0

  utterance.onstart = () => { isSpeaking.value = true }
  utterance.onend = () => { isSpeaking.value = false }
  utterance.onerror = (_e: SpeechSynthesisErrorEvent) => { isSpeaking.value = false }

  window.speechSynthesis.speak(utterance)
}

function toggleVoiceDropdown() {
  showVoiceDropdown.value = !showVoiceDropdown.value
}

// Load voices on mount
onMounted(() => {
  loadVoices()
  // Preload browser voices as fallback
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices()
  }
})
</script>


<template>
  <header class="topbar">
    <div class="topbar__inner">
      <!-- Logo -->
      <div class="topbar__brand">
        <span class="brand-badge">ACC</span>
        <span class="brand-name">TELEMETRY</span>
      </div>

      <!-- Spacer -->
      <div class="topbar__spacer"></div>

      <!-- Coach/Admin Button (for coaches and admins) -->
      <button 
        v-if="isCoach || isAdmin" 
        class="coach-button" 
        :class="{ 'coach-button--admin': isAdmin }"
        @click="goToCoachArea"
        :title="isAdmin ? 'Gestione utenti' : 'I miei piloti'"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="9" cy="7" r="4"/>
          <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/>
          <path d="M16 3.13a4 4 0 010 7.75"/>
          <path d="M21 21v-2a4 4 0 00-3-3.85"/>
        </svg>
      </button>

      <!-- Voice Assistant POC -->
      <div class="voice-group">
        <select 
          v-model="selectedVoice" 
          class="voice-select"
          :title="availableVoices.find(v => v.id === selectedVoice)?.description || 'Seleziona voce'"
        >
          <option v-if="!ttsServerAvailable" value="">🔊 Browser</option>
          <option 
            v-for="voice in availableVoices" 
            :key="voice.id" 
            :value="voice.id"
          >
            {{ voice.name }}
          </option>
        </select>

        <button 
          class="voice-button" 
          :class="{ 'voice-button--speaking': isSpeaking }"
          :disabled="isSpeaking"
          @click="speakGreeting"
          title="Ascolta saluto"
        >
          <svg v-if="!isSpeaking" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 010 7.07" />
            <path d="M19.07 4.93a10 10 0 010 14.14" />
          </svg>
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="10" y1="15" x2="10" y2="9" />
            <line x1="14" y1="15" x2="14" y2="9" />
          </svg>
        </button>
      </div>

      <!-- User Dropdown -->
      <div class="topbar__user">
        <UiNotificationBell />
        <UiUserDropdown
          :user-name="displayName"
          @logout="emit('logout')"
          @go-to-profile="emit('goToProfile')"
        />
      </div>
    </div>
  </header>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.topbar {
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.topbar__inner {
  display: flex;
  align-items: center;
  max-width: 1400px;
  margin: 0 auto;
  padding: $spacing-md $spacing-lg;
}

.topbar__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-badge {
  font-family: $font-display;
  font-size: $font-size-base;
  font-weight: $font-weight-bold;
  color: $racing-red;
  padding: 5px 8px;
  border: 2px solid $racing-red;
  border-radius: $radius-sm;
}

.brand-name {
  font-family: $font-display;
  font-size: $font-size-lg;
  font-weight: $font-weight-bold;
  letter-spacing: 2px;
  color: $text-primary;
}

.topbar__spacer {
  flex: 1;
}

.coach-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  margin-right: $spacing-sm;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: $radius-md;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all $transition-fast;

  &:hover {
    background: rgba($racing-orange, 0.15);
    border-color: rgba($racing-orange, 0.4);
    color: $racing-orange;
  }
  
  &--admin:hover {
    background: rgba(#8b5cf6, 0.15);
    border-color: rgba(#8b5cf6, 0.4);
    color: #8b5cf6;
  }
}

.voice-group {
  display: flex;
  align-items: center;
  gap: 0;
  margin-right: $spacing-sm;
}

.voice-select {
  height: 42px;
  padding: 0 $spacing-sm;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-right: none;
  border-radius: $radius-md 0 0 $radius-md;
  color: $text-secondary;
  font-family: $font-primary;
  font-size: $font-size-xs;
  cursor: pointer;
  transition: all $transition-fast;
  outline: none;
  max-width: 180px;

  &:hover, &:focus {
    background: rgba($accent-info, 0.1);
    border-color: rgba($accent-info, 0.3);
    color: $text-primary;
  }

  option {
    background: $bg-secondary;
    color: $text-primary;
  }
}

.voice-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0 $radius-md $radius-md 0;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all $transition-fast;

  &:hover:not(:disabled) {
    background: rgba($accent-info, 0.15);
    border-color: rgba($accent-info, 0.4);
    color: $accent-info;
  }

  &:disabled {
    cursor: wait;
  }

  &--speaking {
    background: rgba($accent-info, 0.2);
    border-color: rgba($accent-info, 0.5);
    color: $accent-info;
    animation: voice-pulse 1s ease-in-out infinite;
  }
}

@keyframes voice-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.topbar__user {
  display: flex;
  align-items: center;
}
</style>

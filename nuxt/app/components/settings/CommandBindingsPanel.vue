<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useKeyboardCapture } from '~/composables/useKeyboardCapture'
import { useWheelInputBridge } from '~/composables/useWheelInputBridge'
import { captureSourceReady, commandErrorText } from '~/services/controls/commandCapture'
import {
  formatWheelBinding,
  WHEEL_CONTROL_ACTIONS,
} from '~/services/controls/wheelBindingModel'
import { useI18n } from '~/i18n'

const { t } = useI18n()

// PIP-665: titles and descriptions in the dictionary (commands.action.<id>).
const actions = computed(() => WHEEL_CONTROL_ACTIONS.map(id => ({
  id, title: t(`commands.action.${id}.title`), description: t(`commands.action.${id}.description`),
})))

const bridge = useWheelInputBridge()
const {
  state,
  testMode,
  testedActions,
  beginCapture,
  cancelCapture,
  clearBinding,
  setTestMode,
  finishConfiguration,
  retrySource,
} = bridge

const selectedDevice = ref('')
const { keyHint, reset: resetKeyCapture } = useKeyboardCapture(bridge)
const devices = computed(() => state.value.devices.map((device, index) => ({
  id: device.deviceId,
  label: `${device.deviceLabel}${device.buttonCount ? ` · ${t('commands.buttons', { count: device.buttonCount })}` : ''}${state.value.devices.filter(d => d.deviceLabel === device.deviceLabel && d.buttonCount === device.buttonCount).length > 1 ? ` · ${index + 1}` : ''}`,
})))
watch(selectedDevice, () => { resetKeyCapture(); if (state.value.capture) void cancelCapture() })
const selectedSource = computed(() => selectedDevice.value === 'keyboard:system' ? 'keyboard' : selectedDevice.value ? 'controller' : null)
const sourceReady = computed(() => captureSourceReady(state.value, selectedSource.value))
const failedSources = computed(() => (['keyboard', 'controller'] as const).filter(source => state.value.sources?.[source].status === 'unavailable'))

const statusText = computed(() => {
  if (!state.value.available) return t('commands.status.runtimeUnavailable')
  if (state.value.sources && selectedSource.value) {
    const source = state.value.sources[selectedSource.value]
    if (source.status === 'starting') return t('commands.status.starting')
    if (source.status === 'unavailable') return selectedSource.value === 'keyboard' ? t('commands.status.keyboardUnavailable') : t('commands.status.controllerUnavailable')
  }
  if (state.value.inputStatus === 'starting') return t('commands.status.searching')
  if (state.value.inputStatus === 'unavailable') return t('commands.status.inputUnavailable')
  if (!state.value.devices.length) return t('commands.status.noDevices')
  return t('commands.status.devices', { count: state.value.devices.length })
})
const errorText = computed(() => commandErrorText(state.value.operation?.reason || state.value.lastError))

onBeforeUnmount(() => { void finishConfiguration() })
</script>

<template>
  <section class="commands-panel" aria-labelledby="commands-title">
    <header class="commands-panel__header">
      <div>
        <p class="eyebrow">{{ t('commands.eyebrow') }}</p>
        <h2 id="commands-title">{{ t('commands.title') }}</h2>
        <p>{{ t('commands.lead') }}</p>
      </div>
      <button
        type="button"
        class="test-button rc-btn rc-btn--compact"
        :class="{ 'is-active': testMode }"
        :disabled="!state.available || !!state.capture"
        @click="setTestMode(!testMode)"
      >
        {{ testMode ? t('commands.endTest') : t('commands.test') }}
      </button>
    </header>

    <div class="device-row">
      <label for="command-device">{{ t('commands.device') }}</label>
      <select id="command-device" v-model="selectedDevice" :disabled="testMode">
        <option value="">{{ t('commands.autoDetect') }}</option>
        <option v-if="state.inputBackend === 'native'" value="keyboard:system">{{ t('commands.keyboardDevice') }}</option>
        <option v-for="device in devices" :key="device.id" :value="device.id">{{ device.label }}</option>
        <option v-if="selectedDevice && selectedDevice !== 'keyboard:system' && !devices.some(d => d.id === selectedDevice)" :value="selectedDevice">{{ t('commands.disconnected') }}</option>
      </select>
      <span :class="['device-status', { 'is-connected': !!state.devices.length }]">{{ statusText }}</span>
      <div v-for="source in failedSources" :key="source" role="status">
        {{ source === 'keyboard' ? t('commands.keyboardNotStarted') : t('commands.controllerNotStarted') }}
        <button type="button" class="rc-btn rc-btn--compact" :disabled="!state.available || !!state.capture" @click="retrySource(source)">{{ source === 'keyboard' ? t('commands.retryKeyboard') : t('commands.retryController') }}</button>
      </div>
      <span v-if="state.inputBackend === 'native' && !state.sources" class="device-status">{{ t('commands.needsUpdate') }}</span>
    </div>

    <p v-if="errorText" class="command-error" role="alert">{{ errorText }}</p>
    <p v-if="state.ambiguousDeviceIds?.length" class="command-error" role="alert">
      {{ t('commands.ambiguousBefore', { ids: state.ambiguousDeviceIds.join(', ') }) }}
      {{ t('commands.ambiguousAfter') }}
    </p>
    <p v-if="state.unavailableKeys?.length" class="command-error" role="alert">{{ t('commands.keyUnavailable') }}</p>
    <p v-if="state.capture" class="capture-hint" role="status">
      {{ keyHint || t('commands.captureHint') }}
    </p>
    <p v-if="testMode" class="capture-hint" role="status">{{ t('commands.testHint') }}</p>
    <p v-if="selectedDevice === 'keyboard:system' || Object.values(state.bindings).some(b => b?.deviceId === 'keyboard:system')" class="keyboard-note">{{ t('commands.keyboardNote') }}</p>

    <div class="command-list">
      <article
        v-for="action in actions"
        :key="action.id"
        class="command-row"
        :class="{
          'is-capturing': state.capture?.action === action.id,
          'is-tested': testedActions.includes(action.id),
        }"
      >
        <div class="command-row__copy">
          <strong>{{ action.title }}</strong>
          <span>{{ action.description }}</span>
        </div>
        <div class="binding-copy">
          <code>{{ formatWheelBinding(state.bindings[action.id]) }}</code>
          <span v-if="state.disconnectedActions?.includes(action.id)">{{ state.bindings[action.id]?.deviceId.startsWith('raw:') ? t('commands.rawDisconnected') : t('commands.confirmDevice') }}</span>
        </div>
        <div class="command-row__actions">
          <button
            v-if="state.capture?.action !== action.id"
            class="rc-btn rc-btn--compact"
            type="button"
            :disabled="!state.available || !sourceReady || (!state.devices.length && state.inputBackend !== 'native') || !!state.capture || testMode"
            @click="beginCapture(action.id, selectedDevice)"
          >
            {{ t('commands.assign') }}
          </button>
          <button v-else class="rc-btn rc-btn--compact" type="button" @click="cancelCapture">{{ t('commands.cancel') }}</button>
          <button
            type="button"
            class="rc-btn rc-btn--danger rc-btn--compact"
            :disabled="!state.bindings[action.id] || !!state.capture || testMode"
            @click="clearBinding(action.id)"
          >
            {{ t('commands.remove') }}
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/assets/scss/racing-settings' as controls;
.commands-panel { color: #eee; min-width: 0; max-width: 940px; --rc-control-height: 34px; }
.commands-panel__header { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding-bottom: 16px; }
h2 { margin: 0 0 6px; padding-left: 14px; border-left: 3px solid var(--racing-race); font-size: 20px; font-weight: 550; }
p { margin: 0; color: #aaa; font-size: 13px; line-height: 1.6; }
.eyebrow { display: none; }
// Il bottone di prova resta verde mentre la modalita prova e attiva.
.test-button.is-active { color: #21ff83; background: #21ff8314; }
.device-row { display: grid; grid-template-columns: auto minmax(180px,320px); align-items: center; justify-content: start; gap: 8px 16px; padding: 0 0 16px; }
.device-row label { font-size: 13px; }
.device-row select { @include controls.field; appearance: none; width: 100%; padding: 9px 38px 9px 12px; text-overflow: ellipsis; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath d='m4 6 4 4 4-4' fill='none' stroke='%23ccc' stroke-width='1.5'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; }
.device-status,.device-row > div { grid-column: 1 / -1; color: #ffc400; font-size: 12px; }.device-status.is-connected { color: #21ff83; }
.binding-copy { display: grid; gap: 6px; min-width: 0; }.binding-copy span { font-size: 12px; color: #ffc400; }
.keyboard-note { font-size: 12px; margin: 10px 0; }
.command-error,.capture-hint { padding: 12px 14px; margin-bottom: 12px; border-left: 2px solid currentColor; background: #ff002410; color: #ff7188; }
.capture-hint { background: #0076ff15; color: #70b1ff; }
.command-list { display: grid; margin-top: 8px; }
.command-row { display: grid; grid-template-columns: minmax(200px,1fr) minmax(120px,180px) auto; align-items: center; gap: 16px; padding: 12px 0; border-top: 1px solid #ffffff25; transition: background .16s ease; }
.command-row:hover { background: linear-gradient(110deg,#ffffff09,transparent); }
.command-row.is-capturing { background: #0076ff12; }.command-row.is-tested { background: #21ff8314; }
.command-row__copy { display: grid; gap: 3px; }.command-row__copy strong { font-size: 13px; font-weight: 550; }.command-row__copy span { color: #999; font-size: 12px; line-height: 1.5; }
.command-row code { color: #ddd; padding: 6px 10px; border: 1px solid #ffffff25; background: #ffffff05; width: fit-content; max-width: 100%; font-family: inherit; font-size: 12px; overflow-wrap: anywhere; }
.command-row__actions { display: flex; gap: 8px; }
@media(max-width:1150px) { .command-row { grid-template-columns: 1fr auto; }.binding-copy { grid-column: 1; }.command-row__actions { grid-column: 2; grid-row: 1 / span 2; } }
@media(max-width:900px) { .commands-panel__header { flex-direction: column; } }
@media(max-width:600px) { .command-row { grid-template-columns: 1fr; }.command-row__actions { grid-column: 1; grid-row: auto; }.device-row { grid-template-columns: 1fr; } }
@media(prefers-reduced-motion:reduce) { .command-row { transition: none; } }
.commands-panel .device-row select { @include controls.select; }
.command-row:hover { background: var(--rc-hover); }
</style>

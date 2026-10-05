<script setup lang="ts">
import { usesLegacyHudInput } from '~/services/sim/hudSourceAdapter'

import { computed } from 'vue'
import type { CommonLive } from '~/services/telemetry/commonLive'
import { availabilityLabel, featureAvailability, TELEMETRY_FEATURES } from '~/services/telemetry/featureAvailability'

const props = defineProps<{ live?: CommonLive | null; feature: keyof typeof TELEMETRY_FEATURES; unsupportedText?: string }>()
const availability = computed(() => featureAvailability(props.live, TELEMETRY_FEATURES[props.feature]))
// Legacy ACC HUDs already own detailed recovery messages. New connectors use
// this notice until each feature has its own richer presenter.
const visible = computed(() => props.live && !usesLegacyHudInput(props.live) && !availability.value.available)
</script>

<template>
  <div v-if="visible" class="telemetry-feature-notice" role="status">{{ availability.reason === 'unsupported' && unsupportedText ? unsupportedText : availabilityLabel(availability.reason) }}</div>
</template>

<style scoped>
.telemetry-feature-notice{position:absolute;bottom:4px;left:4px;right:4px;z-index:5;padding:5px 8px;border-radius:5px;background:rgba(18,22,28,.94);color:#d8dee8;font:12px/1.35 system-ui,sans-serif;text-align:center;pointer-events:none}
</style>

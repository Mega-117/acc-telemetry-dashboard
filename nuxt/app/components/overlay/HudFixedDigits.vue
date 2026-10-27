<script setup lang="ts">
import { computed } from 'vue'
import { FIXED_WIDTH_GLYPH_EM, splitFixedWidthGlyphs } from '~/utils/fixedWidthGlyphs'

// Live time with fixed-width digits: same font, colour and size as the parent,
// but each character sits in its own centred slot so ticking digits never shift.
// Screen readers get the plain string from aria-label; the slots are aria-hidden.
// Words such as 'wait' or 'live' render as plain text.
const props = defineProps<{ value: string }>()

const glyphs = computed(() => splitFixedWidthGlyphs(props.value))
</script>

<template>
  <span
    class="hud-fixed-digits"
    :aria-label="glyphs ? value : undefined"
  ><template v-if="glyphs"><span
    v-for="(glyph, index) in glyphs"
    :key="index"
    class="hud-fixed-digits__glyph"
    :style="{ width: `${FIXED_WIDTH_GLYPH_EM[glyph.kind]}em` }"
    aria-hidden="true"
  >{{ glyph.char }}</span></template><template v-else>{{ value }}</template></span>
</template>

<style scoped>
.hud-fixed-digits {
  display: inline-block;
  white-space: nowrap;
}

.hud-fixed-digits__glyph {
  display: inline-block;
  text-align: center;
}
</style>

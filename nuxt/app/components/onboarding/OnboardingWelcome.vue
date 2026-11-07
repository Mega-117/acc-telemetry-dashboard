<script setup lang="ts">
// PIP-749: first card of the introduction, drawn live instead of a clip so the logo and the
// words stay sharp at any window size: the logo, "Cosa fa per te" and the four pillars
// (Live, Automation, Performance, Memory). Sizes follow the card width (container units),
// so it scales like the 16:9 clips of the other cards. The entrance runs each time it is shown.
import { computed } from 'vue'
import { usePublicPath } from '~/composables/usePublicPath'
import { useI18n, type TranslationKey } from '~/i18n'

const { getPublicPath } = usePublicPath()
const { t } = useI18n()

const PILLARS: ReadonlyArray<{ id: string; name: string; text: TranslationKey }> = [
  { id: 'live', name: 'Live', text: 'onboarding.steps.benvenuto.live' },
  { id: 'automation', name: 'Automation', text: 'onboarding.steps.benvenuto.automation' },
  { id: 'performance', name: 'Performance', text: 'onboarding.steps.benvenuto.performance' },
  { id: 'memory', name: 'Memory', text: 'onboarding.steps.benvenuto.memory' },
]
const pillars = computed(() => PILLARS.map(p => ({ ...p, label: t(p.text) })))
</script>

<template>
  <div class="welcome" data-onboarding-welcome>
    <img class="welcome__logo" :src="getPublicPath('/branding/auth/racer_core_exact.svg')" alt="Racer Core" width="1774" height="887">
    <p class="welcome__head">{{ t('onboarding.steps.benvenuto.pillarsTitle') }} <em>{{ t('onboarding.steps.benvenuto.pillarsAccent') }}</em></p>
    <ul class="welcome__pillars">
      <li v-for="(p, i) in pillars" :key="p.id" :style="{ '--i': i }" :data-pillar="p.id">
        <b>{{ p.name }}</b>
        <span>{{ p.label }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
$red: #e3122a;
$ease: cubic-bezier(.22, .61, .36, 1);
// Everything is measured in hundredths of the card width (cqw), like a 1280 px wide stage.
.welcome { position: absolute; inset: 0; container-type: inline-size; overflow: hidden;
  background: radial-gradient(ellipse at 50% 36%, #2a0910 0%, #12070a 45%, #060608 100%);
  &::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: .4cqw; background: $red; } }
.welcome__logo { position: absolute; left: 50%; top: 2.6cqw; width: 36.7cqw; height: auto; transform: translateX(-50%); animation: wl-logo .7s $ease .15s both; }
.welcome__head { position: absolute; left: 0; right: 0; top: 23.2cqw; margin: 0; text-align: center; color: #fff;
  font: 700 3.6cqw/1 'Racer Display', 'Inter', sans-serif; text-transform: uppercase; animation: wl-rise .5s $ease .9s both;
  em { font-style: inherit; color: $red; } }
.welcome__pillars { position: absolute; left: 5.5cqw; right: 5.5cqw; top: 31.2cqw; display: flex; gap: 1.6cqw; margin: 0; padding: 0; list-style: none;
  li { flex: 1; padding: 1.7cqw 1.7cqw 1.9cqw; background: #fff; color: #0b0b0f; border-top: .47cqw solid $red; box-shadow: 0 1.4cqw 3.9cqw rgba(0, 0, 0, .6);
    animation: wl-rise .45s $ease both; animation-delay: calc(1.5s + var(--i) * .4s); }
  b { display: block; font: 700 3cqw/1 'Racer Display', 'Inter', sans-serif; text-transform: uppercase; }
  span { display: block; margin-top: .95cqw; color: #3a3a42; font: 600 1.72cqw/1.2 'Inter', 'Segoe UI', sans-serif; } }
@keyframes wl-logo { from { opacity: 0; transform: translate(-50%, 2cqw) } to { opacity: 1; transform: translate(-50%, 0) } }
@keyframes wl-rise { from { opacity: 0; transform: translateY(2cqw) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) {
  .welcome__logo, .welcome__head, .welcome__pillars li { animation: none; }
}
</style>

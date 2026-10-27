<script setup lang="ts">
// PIP-665: one switch for the interface language, used in Impostazioni (program) and Profilo (also in the browser).
import { LOCALES, useI18n, type Locale } from '~/i18n'

const { t, locale, setLocale } = useI18n()
</script>

<template>
  <section class="language-picker" :aria-label="t('language.title')">
    <h3>{{ t('language.title') }}</h3>
    <p>{{ t('language.hint') }}</p>
    <div class="language-picker__options" role="radiogroup" :aria-label="t('language.label')">
      <button v-for="option in LOCALES" :key="option.id" type="button" role="radio" :lang="option.id"
        :aria-checked="locale === option.id" :class="{ 'is-active': locale === option.id }" @click="setLocale(option.id as Locale)">
        {{ option.name }}
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/assets/scss/racing-settings' as controls;
.language-picker { display: grid; gap: 8px;
  h3 { @include controls.section-title; }
  p { margin: 0; color: #b3b3b8; font-size: 13px; } }
.language-picker__options { display: flex; flex-wrap: wrap; gap: 10px;
  button { @include controls.action; min-width: 140px; }
  button.is-active { color: #fff; background: var(--rc-selection, linear-gradient(90deg,#ffffff20,#ffffff05)); box-shadow: inset 0 -3px var(--racing-race); } }
</style>

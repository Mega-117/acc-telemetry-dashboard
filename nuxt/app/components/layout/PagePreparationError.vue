<script setup lang="ts">
import { useI18n } from '~/i18n'
defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>
<template>
  <LayoutPageContainer class="page-preparation-error">
    <div role="status">
      <p>{{ t('common.pagePrepError') }}</p>
      <button type="button" class="rc-btn" @click="$emit('retry')">{{ t('common.retry') }}</button>
    </div>
  </LayoutPageContainer>
</template>
<style scoped>
.page-preparation-error { display: grid; place-items: center; text-align: center; }
</style>

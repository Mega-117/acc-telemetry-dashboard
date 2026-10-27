// PIP-665: the document language follows the saved interface language from the first paint.
import { useI18n } from '~/i18n'

export default defineNuxtPlugin(() => {
  document.documentElement.lang = useI18n().locale.value
})

// ============================================
// Click Outside Directive Plugin
// ============================================

import { vClickOutside } from '~/directives/clickOutside'

export default defineNuxtPlugin((nuxtApp) => {
    nuxtApp.vueApp.directive('click-outside', vClickOutside)
})

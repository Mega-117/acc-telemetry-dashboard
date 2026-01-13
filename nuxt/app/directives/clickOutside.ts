// ============================================
// v-click-outside directive
// Closes element when clicking outside of it
// ============================================

import type { DirectiveBinding } from 'vue'

interface ClickOutsideElement extends HTMLElement {
    _clickOutside?: (event: MouseEvent) => void
}

export const vClickOutside = {
    mounted(el: ClickOutsideElement, binding: DirectiveBinding) {
        el._clickOutside = (event: MouseEvent) => {
            if (!(el === event.target || el.contains(event.target as Node))) {
                binding.value(event)
            }
        }
        document.addEventListener('click', el._clickOutside)
    },
    unmounted(el: ClickOutsideElement) {
        if (el._clickOutside) {
            document.removeEventListener('click', el._clickOutside)
        }
    }
}

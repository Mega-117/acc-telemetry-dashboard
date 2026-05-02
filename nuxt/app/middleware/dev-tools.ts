import { canUseDevTools } from '~/utils/devToolsAccess'

export default defineNuxtRouteMiddleware(() => {
  const hostname = typeof window !== 'undefined'
    ? window.location.hostname
    : useRequestURL().hostname

  if (!canUseDevTools(hostname)) {
    return navigateTo('/panoramica')
  }
})

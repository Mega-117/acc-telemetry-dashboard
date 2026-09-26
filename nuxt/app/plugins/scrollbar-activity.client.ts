import { installScrollbarActivity } from '~/services/ui/scrollbarActivity'
import '~/assets/css/scrollbar-activity.css'

export default defineNuxtPlugin(() => {
  const dispose = installScrollbarActivity()
  if (import.meta.hot) import.meta.hot.dispose(dispose)
})

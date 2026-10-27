import type { PartialDictionary } from '../types'

export default {
  common: {
    retry: 'Retry',
    yes: 'Yes',
    no: 'No',
    startupFailed: 'The app could not start.',
    close: 'Close',
    cancel: 'Cancel',
    remove: 'Remove',
    loadingData: 'Loading data…',
    pagePrepError: 'The page could not be prepared.',
    notAvailable: 'Not available',
    pager: {
      items: 'items',
      pageOf: 'Page {page} of {total}',
      prev: 'Previous page',
      next: 'Next page',
      page: 'Page {page}',
      gap: 'Pages in between',
    },
  },
} satisfies PartialDictionary

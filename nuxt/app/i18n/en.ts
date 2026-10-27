// PIP-665: English. Same areas and keys as it.ts; a missing key falls back to Italian and fails the test.
import type { PartialDictionary } from './index'
import shell from './en/shell'

const en: PartialDictionary = {
  ...shell,
}

export default en

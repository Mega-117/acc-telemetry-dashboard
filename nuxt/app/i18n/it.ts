// PIP-665: Italian, the source language. One file per area under it/ (max-lines); add keys there
// first, then the same keys under en/ (the test lists any gap).
import shell from './it/shell'

export default {
  ...shell,
} as const

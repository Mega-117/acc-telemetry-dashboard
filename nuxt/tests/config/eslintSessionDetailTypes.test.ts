import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const targets = [
  'app/components/pages/SessionDetailPage.vue',
  'app/services/session-detail/loadSessionDetailViewModel.ts',
  'app/services/session-detail/sessionCompareService.ts',
  'app/services/session-detail/sessionComparisonTableService.ts',
  'app/services/session-detail/sessionLapSeries.ts'
]

describe('session detail type boundary', () => {
  it('keeps the page and its boundary services free of explicit any', async () => {
    const eslint = new ESLint({ cwd: process.cwd() })
    const results = await eslint.lintFiles(targets)

    const violations = results.flatMap((result) => result.messages
      .filter((message) => message.ruleId === '@typescript-eslint/no-explicit-any')
      .map((message) => `${result.filePath}:${message.line ?? 0} ${message.message}`))

    expect(violations).toEqual([])
  }, 30_000)
})

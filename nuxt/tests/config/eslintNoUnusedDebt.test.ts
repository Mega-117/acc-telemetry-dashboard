import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

describe('ESLint unused TypeScript declarations', () => {
  it('keeps the application free of no-unused-vars findings', async () => {
    const eslint = new ESLint({ cwd: process.cwd() })
    const results = await eslint.lintFiles(['app/**/*.{ts,vue}'])

    const violations = results.flatMap((result) => result.messages
      .filter((message) => message.ruleId === '@typescript-eslint/no-unused-vars')
      .map((message) => `${result.filePath}:${message.line ?? 0} ${message.message}`))

    expect(violations).toEqual([])
  }, 30_000)
})

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const missingRuleDefinition = /Definition for rule ['"]@typescript-eslint\/[^'"]+['"] was not found/i

describe('ESLint Vue plugin registry', () => {
  it('resolves TypeScript ESLint directives in every application SFC', async () => {
    const eslint = new ESLint({ cwd: process.cwd() })
    const results = await eslint.lintFiles(['app/**/*.vue'])

    const violations = results.flatMap((result) => result.messages
      .filter((message) => missingRuleDefinition.test(message.message))
      .map((message) => `${result.filePath}:${message.line ?? 0} ${message.message}`))

    expect(violations).toEqual([])
  }, 30_000)
})

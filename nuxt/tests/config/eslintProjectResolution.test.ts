import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const projectResolutionError = /(?:parserOptions\.project|project service).*(?:not found|was not found)/i

describe('ESLint TypeScript project resolution', () => {
  it('resolves every application TypeScript file through its owning project', async () => {
    const eslint = new ESLint({ cwd: process.cwd() })
    const results = await eslint.lintFiles(['app/**/*.ts'])

    const violations = results.flatMap((result) => result.messages
      .filter((message) => message.fatal && projectResolutionError.test(message.message))
      .map((message) => `${result.filePath}:${message.line ?? 0} ${message.message}`))

    expect(violations).toEqual([])
  }, 30_000)
})

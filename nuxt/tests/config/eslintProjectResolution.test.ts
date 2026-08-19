import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const projectResolutionError = /(?:parserOptions\.project|project service).*(?:not found|was not found)/i

function projectResolutionViolations(results: Array<{ filePath: string, messages: Array<{ fatal?: boolean, line?: number, message: string }> }>) {
  return results.flatMap((result) => result.messages
    .filter((message) => message.fatal && projectResolutionError.test(message.message))
    .map((message) => `${result.filePath}:${message.line ?? 0} ${message.message}`))
}

describe('ESLint TypeScript project resolution', () => {
  it('resolves every application TypeScript file through its owning project', async () => {
    const eslint = new ESLint({ cwd: process.cwd() })
    const results = await eslint.lintFiles(['app/**/*.ts'])
    expect(projectResolutionViolations(results)).toEqual([])
  }, 30_000)

  it('detects a TypeScript project-resolution failure', () => {
    expect(projectResolutionViolations([{
      filePath: 'app/example.ts',
      messages: [{ fatal: true, message: 'Project service was not found' }],
    }])).toEqual(['app/example.ts:0 Project service was not found'])
  })
})

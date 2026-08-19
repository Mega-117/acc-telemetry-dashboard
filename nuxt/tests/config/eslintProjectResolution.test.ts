import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const projectResolutionError = /(?:parserOptions\.project|project service).*(?:not found|was not found)/i

const projectResolutionOnlyRules = {
  'max-lines': 'off',
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/no-unused-vars': 'off',
  '@typescript-eslint/consistent-type-imports': 'off',
  '@typescript-eslint/no-non-null-assertion': 'off',
  '@typescript-eslint/no-floating-promises': 'off',
  '@typescript-eslint/await-thenable': 'off',
  '@typescript-eslint/no-misused-promises': 'off',
  'no-console': 'off',
  'no-debugger': 'off',
  // Keep ESLint parsing every file while this guard checks Project Service
  // resolution only. Quality rules have their own guard/full lint surface.
  'no-empty': 'error',
} as const

function projectResolutionViolations(results: Array<{ filePath: string, messages: Array<{ fatal?: boolean, line?: number, message: string }> }>) {
  return results.flatMap((result) => result.messages
    .filter((message) => message.fatal && projectResolutionError.test(message.message))
    .map((message) => `${result.filePath}:${message.line ?? 0} ${message.message}`))
}

describe('ESLint TypeScript project resolution', () => {
  it('resolves every application TypeScript file through its owning project', async () => {
    const eslint = new ESLint({
      cwd: process.cwd(),
      overrideConfig: [{
        files: ['app/**/*.ts'],
        rules: projectResolutionOnlyRules,
      }],
    })
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

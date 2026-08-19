import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

const projectResolutionError = /(?:parserOptions\.project|project service).*(?:not found|was not found)/i
const noUnusedVarsRule = '@typescript-eslint/no-unused-vars'

type LintResult = Awaited<ReturnType<ESLint['lintFiles']>>[number]

function projectResolutionViolations(results: LintResult[]) {
  return results.flatMap((result) => result.messages
    .filter((message) => message.fatal && projectResolutionError.test(message.message))
    .map((message) => `${result.filePath}:${message.line ?? 0} ${message.message}`))
}

function noUnusedVarsViolations(results: LintResult[]) {
  return results.flatMap((result) => result.messages
    .filter((message) => message.ruleId === noUnusedVarsRule)
    .map((message) => `${result.filePath}:${message.line ?? 0} ${message.message}`))
}

describe('ESLint application guards', () => {
  let results: LintResult[]

  beforeAll(async () => {
    const eslint = new ESLint({ cwd: process.cwd() })
    // One complete scan serves both guards. Running these independently creates
    // two TypeScript Project Service instances over the same application files.
    results = await eslint.lintFiles(['app/**/*.{ts,vue}'])
  }, 30_000)

  it('resolves every application TypeScript file through its owning project', () => {
    expect(projectResolutionViolations(results)).toEqual([])
  })

  it('keeps the application free of no-unused-vars findings', () => {
    expect(noUnusedVarsViolations(results)).toEqual([])
  })

  it('detects a TypeScript project-resolution failure', () => {
    expect(projectResolutionViolations([{
      filePath: 'app/example.ts',
      messages: [{ fatal: true, message: 'Project service was not found', ruleId: null, severity: 2 }],
      errorCount: 1,
      warningCount: 0,
      fixableErrorCount: 0,
      fixableWarningCount: 0,
      suppressedMessages: [],
    }])).toEqual(['app/example.ts:0 Project service was not found'])
  })

  it('detects an unused TypeScript declaration', () => {
    expect(noUnusedVarsViolations([{
      filePath: 'app/example.ts',
      messages: [{ fatal: false, message: "'unused' is defined but never used.", ruleId: noUnusedVarsRule, severity: 2, line: 3 }],
      errorCount: 1,
      warningCount: 0,
      fixableErrorCount: 0,
      fixableWarningCount: 0,
      suppressedMessages: [],
    }])).toEqual(["app/example.ts:3 'unused' is defined but never used."])
  })
})

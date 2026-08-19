import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const noUnusedVarsRule = '@typescript-eslint/no-unused-vars'

function noUnusedVarsViolations(results: Array<{ filePath: string, messages: Array<{ line?: number, message: string, ruleId: string | null }> }>) {
  return results.flatMap((result) => result.messages
    .filter((message) => message.ruleId === noUnusedVarsRule)
    .map((message) => `${result.filePath}:${message.line ?? 0} ${message.message}`))
}

describe('ESLint unused TypeScript declarations', () => {
  it('keeps the application free of no-unused-vars findings', async () => {
    const eslint = new ESLint({
      cwd: process.cwd(),
      overrideConfig: [
        {
          files: ['app/**/*.ts'],
          languageOptions: {
            // no-unused-vars is syntactic. Avoid creating a second TypeScript
            // Project Service while the dedicated resolution guard owns it.
            parserOptions: { projectService: false },
          },
          rules: {
            // These guards need type information but are not assertions of
            // this no-unused-vars contract.
            '@typescript-eslint/no-floating-promises': 'off',
            '@typescript-eslint/await-thenable': 'off',
            '@typescript-eslint/no-misused-promises': 'off',
          },
        },
      ],
    })
    const results = await eslint.lintFiles(['app/**/*.{ts,vue}'])

    expect(noUnusedVarsViolations(results)).toEqual([])
  }, 30_000)

  it('detects an unused TypeScript declaration', () => {
    expect(noUnusedVarsViolations([{
      filePath: 'app/example.ts',
      messages: [{ line: 3, message: "'unused' is defined but never used.", ruleId: noUnusedVarsRule }],
    }])).toEqual(["app/example.ts:3 'unused' is defined but never used."])
  })
})

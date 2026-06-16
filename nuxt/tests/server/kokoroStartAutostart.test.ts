import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'server/api/dev/kokoro-start.post.ts'), 'utf8')

describe('kokoro autostart endpoint', () => {
  it('usa file descriptor validi per i log del processo child', () => {
    expect(source).toContain("import { closeSync, openSync } from 'node:fs'")
    expect(source).toContain("stdoutFd = openSync(outLog, 'a')")
    expect(source).toContain("stderrFd = openSync(errLog, 'a')")
    expect(source).toContain("stdio: ['ignore', stdoutFd, stderrFd]")
    expect(source).not.toContain('createWriteStream')
    expect(source).not.toContain("stdio: ['ignore', stdout, stderr]")
  })
})

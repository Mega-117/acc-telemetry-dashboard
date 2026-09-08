import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const ci = parse(read('../../../.github/workflows/ci.yml'))
const pages = parse(read('../../../.github/workflows/static.yml'))

describe('CI publication contract', () => {
  it('installs the pinned emulator CLI with npm ci and provisions its Java prerequisite', () => {
    const pkg = JSON.parse(read('../../package.json'))
    const lock = JSON.parse(read('../../package-lock.json'))
    const version = pkg.devDependencies['firebase-tools']
    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(lock.packages['node_modules/firebase-tools'].version).toBe(version)
    expect(lock.packages[''].devDependencies['firebase-tools']).toBe(version)
    expect(pkg.scripts['test:coverage']).toContain('--project demo-pitwall-audit')
    expect(pkg.scripts['test:coverage']).toContain('--only database')
    const steps = ci.jobs['fe-test'].steps
    expect(steps.find((s: { uses?: string }) => s.uses?.startsWith('actions/setup-node@')).with['node-version']).toBe('24')
    expect(steps.find((s: { uses?: string }) => s.uses?.startsWith('actions/setup-java@')).with).toMatchObject({ distribution: 'temurin', 'java-version': '21' })
    const commands = steps.map((s: { run?: string }) => s.run)
    for (const command of ['npm ci', 'npm run typecheck', './scripts/check_fe_pipeline.ps1', 'npm run test:coverage']) {
      const step = steps.find((s: { run?: string }) => s.run === command)
      expect(step, command).toBeDefined()
      expect(step['continue-on-error']).toBeUndefined()
    }
    expect(commands.indexOf('npm ci')).toBeLessThan(commands.indexOf('npm run typecheck'))
  })

  it('has no independent or manual Pages trigger and binds checkout to the caller SHA', () => {
    expect(Object.keys(pages.on)).toEqual(['workflow_call'])
    expect(ci.on).toHaveProperty('workflow_dispatch')
    expect(ci.jobs.pages.uses).toBe('./.github/workflows/static.yml')
    expect(pages.jobs.deploy.steps.find((s: { uses?: string }) => s.uses?.startsWith('actions/checkout@')).with.ref).toBe('${{ github.sha }}')
    expect(pages.jobs.deploy.steps.find((s: { uses?: string }) => s.uses?.startsWith('actions/upload-pages-artifact@')).with.path).toBe('.')
  })

  it('requires both successful jobs and only permits a main push (no always/cancel bypass)', () => {
    expect(ci.jobs.pages.needs).toEqual(['fe-test', 'python-test'])
    // Without a status function GitHub applies success() to the needs graph.
    expect(ci.jobs.pages.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/main'")
    for (const name of ci.jobs.pages.needs) {
      expect(ci.jobs[name]['continue-on-error']).toBeUndefined()
    }
    expect(ci.jobs.pages.permissions).toEqual({ contents: 'read', pages: 'write', 'id-token': 'write' })
  })
})

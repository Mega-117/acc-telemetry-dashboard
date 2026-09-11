import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const ci = parse(read('../../../.github/workflows/ci.yml'))
const pages = parse(read('../../../.github/workflows/static.yml'))
const cloudflare = parse(read('../../../.github/workflows/cloudflare.yml'))
const checks = JSON.parse(read('../../../ci-checks.json'))

describe('CI publication contract', () => {
  it('routes only verified develop pushes to Cloudflare without running generate', () => {
    expect(ci.on.push.branches).toContain('develop')
    expect(ci.on.pull_request.branches).toContain('develop')
    expect(ci.jobs.cloudflare.needs).toEqual(['fe-test', 'python-test'])
    expect(ci.jobs.cloudflare.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/develop'")
    expect(ci.jobs.cloudflare.uses).toBe('./.github/workflows/cloudflare.yml')
    expect(Object.keys(cloudflare.on)).toEqual(['workflow_call'])
    expect(cloudflare.jobs.deploy.if).toBe(ci.jobs.cloudflare.if)
    expect(cloudflare.jobs.deploy.steps[0].with.ref).toBe('${{ github.sha }}')
    expect(cloudflare.concurrency).toEqual({ group: 'cloudflare-develop', 'cancel-in-progress': false })
    expect(ci.concurrency['cancel-in-progress']).toBe(false)
    const commands = cloudflare.jobs.deploy.steps.map((s: { run?: string }) => s.run ?? '').join('\n')
    expect(commands).toContain('cloudflare-package.mjs')
    expect(commands).toContain('wrangler@4.130.0 pages deploy')
    expect(commands).toContain('--branch develop --commit-hash "$GITHUB_SHA"')
    expect(commands).not.toMatch(/npm run (generate|build)|nuxt generate/)
    expect(cloudflare.jobs.deploy['continue-on-error']).toBeUndefined()
    for (const step of cloudflare.jobs.deploy.steps) expect(step['continue-on-error']).toBeUndefined()
  })
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
    expect(steps.find((s: { uses?: string }) => s.uses?.startsWith('actions/setup-node@')).with['node-version-file']).toBe('.node-version')
    expect(read('../../../.node-version').trim()).toMatch(/^24\.\d+\.\d+$/)
    expect(steps.find((s: { uses?: string }) => s.uses?.startsWith('actions/setup-java@')).with).toMatchObject({ distribution: 'temurin', 'java-version': '21' })
    const commands = steps.map((s: { run?: string }) => s.run)
    for (const command of ['npm ci', 'python scripts/ci_checks.py --group frontend']) {
      const step = steps.find((s: { run?: string }) => s.run === command)
      expect(step, command).toBeDefined()
      expect(step['continue-on-error']).toBeUndefined()
    }
    expect(commands.indexOf('npm ci')).toBeLessThan(commands.indexOf('python scripts/ci_checks.py --group frontend'))
  })

  it('runs every shared blocking check with declared runtimes and unchanged thresholds', () => {
    const frontend = checks.groups.frontend
    for (const script of ['typecheck', 'test', 'test:coverage']) {
      expect(frontend.some((s: { argv: string[] }) => JSON.stringify(s.argv) === JSON.stringify(['npm', 'run', script]))).toBe(true)
    }
    expect(frontend.find((s: { id: string }) => s.id === 'pipeline').argv).toEqual([
      'pwsh', '-NoProfile', '-NonInteractive', '-File', 'scripts/check_fe_pipeline.ps1',
    ])
    expect(checks.groups.python.find((s: { id: string }) => s.id === 'python-lint').argv).toContain('nuxt/scripts/')
    expect(checks.groups.python.find((s: { id: string }) => s.id === 'python-tests').argv).toEqual(['python', '-m', 'pytest', '--tb=short', '-q'])
    for (const group of Object.values(checks.groups) as { id: string; timeoutSeconds: number; allowNoTests?: boolean }[][]) {
      for (const check of group) {
        expect(check.timeoutSeconds).toBeGreaterThan(0)
        if (check.id !== 'python-tests') expect(check.allowNoTests).toBeUndefined()
      }
    }
    const pythonSteps = ci.jobs['python-test'].steps
    expect(pythonSteps.some((s: { run?: string }) => s.run?.includes('pip install -r requirements-ci.txt'))).toBe(true)
    const shared = pythonSteps.find((s: { run?: string }) => s.run === 'python scripts/ci_checks.py --group python')
    expect(shared).toBeDefined()
    expect(shared['continue-on-error']).toBeUndefined()
    for (const job of ['fe-test', 'python-test']) {
      expect(ci.jobs[job].steps.find((s: { uses?: string }) => s.uses?.startsWith('actions/setup-python@')).with['python-version-file']).toBe('.python-version')
    }
    expect(read('../../../.python-version').trim()).toBe('3.11')
    expect(read('../../scripts/check_fe_pipeline.ps1')).not.toContain('C:\\nvm4w')
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

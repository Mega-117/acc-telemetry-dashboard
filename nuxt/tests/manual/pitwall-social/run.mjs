import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
const here = path.dirname(fileURLToPath(import.meta.url))
const nuxt = path.resolve(here, '../../..')
const local = path.resolve(nuxt, '../../local')
const server = await createServer({ configFile: false, root: here, plugins: [vue()],
  resolve: { alias: { '~': path.join(nuxt, 'app'), '@': path.join(nuxt, 'app'), vue: path.join(nuxt, 'node_modules/vue/dist/vue.esm-bundler.js') } }, server: { host: '127.0.0.1', port: 0, fs: { allow: [nuxt] } } })
await server.listen()
const url = server.resolvedUrls.local[0]
const log = fs.openSync(path.join(local, '.codex_tmp/pitwall-social-ui.log'), 'w')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(path.join(local, 'desktop-app/node_modules/electron/dist/electron.exe'),
  [path.join(local, 'desktop-app/tests/manual/pitwall-social-window.js'), url], { stdio: ['ignore', log, log], env, windowsHide: true })
console.log('PIP390_UI_STARTED', { pid: child.pid, url })
const deadline = setTimeout(() => child.kill(), 360000)
child.on('exit', async code => { clearTimeout(deadline); await server.close(); process.exitCode = code || 0 })
process.on('SIGINT', () => child.kill())

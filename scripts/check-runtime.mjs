/** Test the built production server against the configured external database. */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the runtime check')
const base = 'http://127.0.0.1:4181'
const server = spawn(process.execPath, ['.output/server/index.mjs'], {
  env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '4181' },
  stdio: 'inherit',
})
const serverClosed = once(server, 'close')
try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Production server exited before readiness')
    try {
      ready = (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })).ok
    } catch {
      // Startup is allowed to take a few seconds; failed readiness remains a failure below.
    }
    if (ready) break
    await delay(200)
  }
  if (!ready) throw new Error('Production server did not become ready')
  const smoke = spawn(process.execPath, ['scripts/smoke.mjs', base], { stdio: 'inherit' })
  const [code] = await once(smoke, 'close')
  if (code !== 0) throw new Error(`HTTP smoke check failed (${code})`)
} finally {
  if (server.exitCode === null) server.kill('SIGTERM')
  await serverClosed
}

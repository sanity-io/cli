import {readFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {
  getLocalTelemetryDenial,
  TELEMETRY_API_VERSION,
  TELEMETRY_BATCH_PATH,
  TELEMETRY_STATUS_PATH,
} from '@sanity/cli-setup/telemetry'
import {createClient} from '@sanity/client'
import {createSessionId} from '@sanity/telemetry'

export async function sendBlueprintSetup(route, outcome, elapsed) {
  const durationMs = Number(elapsed)
  if (!['delegated', 'standalone'].includes(route)) return
  if (!['cancelled', 'failed', 'success'].includes(outcome)) return
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) return
  if (getLocalTelemetryDenial()) return

  const environment = process.env.SANITY_INTERNAL_ENV
  const token = await readToken(environment)
  if (!token) return

  const apiHost = environment === 'staging' ? 'https://api.sanity.work' : environment
  const client = createClient({
    ...(apiHost && apiHost !== 'production' ? {apiHost} : {}),
    apiVersion: TELEMETRY_API_VERSION,
    maxRetries: 0,
    requestTagPrefix: 'sanity.cli',
    token,
    useCdn: false,
    useProjectHostname: false,
  })
  const signal = AbortSignal.timeout(3000)
  const consent = await client.request({
    signal,
    tag: 'telemetry-consent',
    url: TELEMETRY_STATUS_PATH,
  })
  if (consent?.status !== 'granted') return

  await client.request({
    body: {
      batch: [
        {
          createdAt: new Date().toISOString(),
          data: {durationMs, outcome, route},
          name: 'Create Sanity Blueprint Setup',
          redactionVersion: 1,
          sessionId: createSessionId(),
          source: 'cli',
          type: 'log',
          version: 1,
        },
      ],
    },
    json: true,
    method: 'POST',
    signal,
    url: TELEMETRY_BATCH_PATH,
  })
}

async function readToken(environment) {
  if (process.env.SANITY_AUTH_TOKEN) return process.env.SANITY_AUTH_TOKEN.trim()

  const configDir = environment === 'staging' ? 'sanity-staging' : 'sanity'
  const path =
    process.env.SANITY_CLI_CONFIG_PATH || join(homedir(), '.config', configDir, 'config.json')
  try {
    const config = JSON.parse(await readFile(path, 'utf8'))
    if (typeof config?.authToken === 'string') return config.authToken
  } catch {
    // A missing or unreadable CLI config means there is no stored login.
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [route, outcome, elapsed] = process.argv.slice(2)
  await sendBlueprintSetup(route, outcome, elapsed).catch(() => {})
}

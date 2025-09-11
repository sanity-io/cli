#!/usr/bin/env node

import {getGlobalCliClient} from '@sanity/cli-core'
import {type TelemetryEvent} from '@sanity/telemetry'

import {resolveConsent} from '../../actions/telemetry/resolveConsent.js'
import {flushTelemetryFiles} from '../../telemetry/store/flushTelemetryFiles.js'

async function sendEvents(batch: TelemetryEvent[]) {
  const client = await getGlobalCliClient({
    apiVersion: '2023-12-18',
    requireUser: true,
  })

  const projectId = process.env.SANITY_TELEMETRY_PROJECT_ID
  return client.request({
    body: {batch, projectId},
    json: true,
    method: 'POST',
    uri: '/intake/batch',
  })
}

export async function runFlushWorker() {
  await flushTelemetryFiles({resolveConsent, sendEvents})
}

// Only run if executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await runFlushWorker()
    process.exit(0)
  } catch {
    // Silently exit - don't block parent process
    process.exit(1)
  }
}

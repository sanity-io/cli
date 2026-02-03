#!/usr/bin/env node

import {flushTelemetryFiles} from '@sanity/cli-core'

import {resolveConsent} from '../../actions/telemetry/resolveConsent.js'
import {sendEvents} from '../../services/telemetry.js'

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

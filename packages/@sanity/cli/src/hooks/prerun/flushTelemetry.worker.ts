#!/usr/bin/env node

import {resolveConsent} from '../../actions/telemetry/resolveConsent.js'
import {sendEvents} from '../../services/telemetry.js'
import {flushTelemetryFiles} from '../../util/telemetry/flushTelemetryFiles.js'

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

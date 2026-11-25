import {fileURLToPath} from 'node:url'

import {getLocalTelemetryDenial} from '@sanity/cli-setup/telemetry'

export function reportBlueprintSetup(route, outcome, durationMs) {
  if (getLocalTelemetryDenial()) return

  const {spawn} = process.getBuiltinModule('node:child_process')
  const worker = fileURLToPath(new URL('sendBlueprintSetup.worker.js', import.meta.url))
  const child = spawn(process.execPath, [worker, route, outcome, String(durationMs)], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.on('error', () => {})
  child.unref()
}

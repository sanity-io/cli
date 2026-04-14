#!/usr/bin/env node

import {pathToFileURL} from 'node:url'

import {runFetchWorker} from './fetchUpdateInfo.js'

// Only run if executed directly (not imported)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cwd = process.env.SANITY_UPDATE_CHECK_CWD || process.cwd()
  const cliVersion = process.env.SANITY_UPDATE_CHECK_CLI_VERSION || '0.0.0'

  try {
    await runFetchWorker(cwd, cliVersion)
    process.exit(0)
  } catch {
    // Silently exit - don't leave zombie processes
    process.exit(1)
  }
}

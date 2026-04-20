#!/usr/bin/env node

import {pathToFileURL} from 'node:url'

import {type SanityPackage} from '../packageManager/installationInfo/types.js'
import {fetchUpdateInfo} from './fetchUpdateInfo.js'

// Only run if executed directly (not imported)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cwd = process.env.SANITY_UPDATE_CHECK_CWD || process.cwd()
  const cliVersion = process.env.SANITY_UPDATE_CHECK_CLI_VERSION || '0.0.0'
  const packageOverride = process.env.SANITY_UPDATE_CHECK_PACKAGE as SanityPackage | undefined

  try {
    await fetchUpdateInfo(cwd, cliVersion, packageOverride || undefined)
    process.exit(0)
  } catch {
    // Silently exit - don't leave zombie processes
    process.exit(1)
  }
}

import {chmodSync, mkdirSync, statSync} from 'node:fs'
import {homedir} from 'node:os'
import {dirname, join} from 'node:path'

import {readJsonFileSync} from './readJsonFileSync.js'
import {writeJsonFileSync} from './writeJsonFileSync.js'

export function getHostCliUserConfigPath(staging: boolean): string {
  return (
    process.env.SANITY_CLI_CONFIG_PATH ||
    join(homedir(), '.config', staging ? 'sanity-staging' : 'sanity', 'config.json')
  )
}

export function readHostCliUserConfig(path: string): Record<string, unknown> {
  // Restrict credentials left with permissive modes by older CLI versions.
  if (typeof process.getuid === 'function') {
    try {
      const {mode, uid} = statSync(path)
      if (uid === process.getuid() && (mode & 0o077) !== 0) chmodSync(path, mode & 0o700)
    } catch {
      // Missing or unreadable config is treated as an empty store.
    }
  }

  try {
    const config = readJsonFileSync(path)
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      return config
    }
  } catch {
    // Config data is recoverable if the file is missing, invalid, or unreadable.
  }

  return {}
}

export function writeHostCliUserConfig(
  path: string,
  config: Record<string, unknown>,
  {createDirectory = true} = {},
): void {
  if (createDirectory) mkdirSync(dirname(path), {mode: 0o700, recursive: true})
  writeJsonFileSync(path, config, {mode: 0o600, pretty: true})
}

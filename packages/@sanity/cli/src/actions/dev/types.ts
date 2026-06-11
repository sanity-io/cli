import {type CliConfig, type Output} from '@sanity/cli-core'
import {type ViteDevServer} from 'vite'

import {type DevCommand} from '../../commands/dev.js'

export type DevFlags = DevCommand['flags']

export interface DevActionOptions {
  cliConfig: CliConfig
  flags: DevFlags
  isApp: boolean
  output: Output
  workDir: string

  workbenchAvailable?: boolean
}

/**
 * Result of starting an app/studio dev server. Discriminated on `started` so
 * callers handle the didn't-start case explicitly instead of null-checking
 * optional fields. A server that fails to *boot* still throws — the
 * not-started arm is reserved for expected early exits the server has
 * already reported to the user.
 */
export type StartDevServerResult =
  | {close: () => Promise<void>; server: ViteDevServer; started: true}
  | {reason: 'missing-organization-id'; started: false}

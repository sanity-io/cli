import {EventEmitter} from 'node:events'

import {type CliConfig} from '@sanity/cli-core'
import {createMockOutput} from '@sanity/cli-test/test/util'

import {unstable_defineApp} from '../../../defineApp.js'
import {type StartWorkbenchOptions} from '../startWorkbenchDevServer.js'

/**
 * Stand-in for node's `fs.FSWatcher` that lets a test drive change events by
 * hand instead of touching the filesystem. Wire it into a mocked `fs.watch`
 * and call `emitChange` to fire the listener.
 */
// eslint-disable-next-line unicorn/prefer-event-target -- mirrors node's FSWatcher which extends EventEmitter
export class FakeFsWatcher extends EventEmitter {
  public closed = false
  public handler: ((event: string, filename: string | null) => void) | undefined

  close() {
    this.closed = true
  }

  emitChange(filename: string | null) {
    if (this.closed) return
    this.handler?.('change', filename)
  }
}

/** A CliConfig `app` from a branded `unstable_defineApp(...)` — the workbench opt-in. */
export function workbenchApp(overrides: Record<string, unknown> = {}): CliConfig['app'] {
  return unstable_defineApp({
    name: 'test-app',
    organizationId: 'org-123',
    title: 'Test App',
    ...overrides,
  }) as unknown as CliConfig['app']
}

export function workbenchCliConfig(overrides: Partial<CliConfig> = {}): CliConfig {
  return {app: workbenchApp(), ...overrides} as CliConfig
}

export function createDevOptions(
  overrides: Partial<StartWorkbenchOptions> = {},
): StartWorkbenchOptions {
  return {
    cacheDir: '/tmp/sanity-project/.sanity/vite',
    cliConfig: {} as CliConfig,
    httpHost: 'localhost',
    httpPort: 3333,
    output: createMockOutput(),
    reactStrictMode: false,
    workDir: '/tmp/sanity-project',
    ...overrides,
  }
}

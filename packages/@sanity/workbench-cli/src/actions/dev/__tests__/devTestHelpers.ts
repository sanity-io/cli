import {type CliConfig, type Output} from '@sanity/cli-core/types'
// eslint-disable-next-line import-x/no-extraneous-dependencies
import {vi} from 'vitest'

import {unstable_defineApp} from '../../../defineApp.js'
import {type StartWorkbenchOptions} from '../startWorkbenchDevServer.js'

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

export function createMockOutput(): Output {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
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

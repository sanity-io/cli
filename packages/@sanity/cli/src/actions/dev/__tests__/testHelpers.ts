import {type CliConfig, type Output} from '@sanity/cli-core'
import {unstable_defineApp} from '@sanity/federation'
// eslint-disable-next-line import-x/no-extraneous-dependencies
import {afterEach, beforeEach, type Mock, vi} from 'vitest'

import {type DevActionOptions} from '../types.js'
import {type StartWorkbenchOptions} from '../workbench/startWorkbenchDevServer.js'

/** Shared test helpers for dev-action test suites. */

/**
 * A CliConfig whose `app` is a branded `unstable_defineApp(...)` result — the
 * workbench opt-in. Replaces the old `federation: {enabled: true}` test signal.
 */
export function workbenchApp(overrides: Record<string, unknown> = {}): CliConfig['app'] {
  return unstable_defineApp({
    name: 'test-app',
    organizationId: 'org-123',
    title: 'Test App',
    ...overrides,
  }) as unknown as CliConfig['app']
}

/** Branded workbench app explicitly typed as a studio. */
export function studioWorkbenchApp(overrides: Record<string, unknown> = {}): CliConfig['app'] {
  const app = workbenchApp(overrides)
  ;(app as {applicationType?: string}).applicationType = 'studio'
  return app
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

/** Minimal flags object accepted by the dev command — values aren't asserted
 * by the code under test but are required to type-check as `DevFlags`. */
export const DEV_FLAGS = {
  'auto-updates': false,
  host: 'localhost',
  json: false,
  'load-in-dashboard': false,
  port: '3333',
} as const

export function createDevOptions(
  overrides: Partial<StartWorkbenchOptions> = {},
): StartWorkbenchOptions {
  return {
    cliConfig: {} as CliConfig,
    flags: DEV_FLAGS,
    httpHost: 'localhost',
    httpPort: 3333,
    isApp: false,
    output: createMockOutput(),
    workDir: '/tmp/sanity-project',
    ...overrides,
  }
}

export function createBaseDevOptions(overrides: Partial<DevActionOptions> = {}): DevActionOptions {
  return {
    cliConfig: {} as CliConfig,
    flags: DEV_FLAGS,
    isApp: false,
    output: createMockOutput(),
    workDir: '/tmp/sanity-project',
    ...overrides,
  }
}

/** Return value the `getDevServerConfig` mock should resolve with. */
export const DEV_SERVER_CONFIG = {
  basePath: '/',
  cwd: '/tmp/sanity-project',
  httpHost: 'localhost',
  httpPort: 3333,
  reactStrictMode: false,
  staticPath: '/tmp/sanity-project/static',
} as const

/** Minimal `startDevServer` result — a closeable vite server on the given port. */
export function createMockDevServer({port = 3333}: {port?: number} = {}) {
  return {
    close: vi.fn().mockResolvedValue(),
    server: {
      config: {
        logger: {info: vi.fn()},
        server: {port},
      },
    },
  }
}

/**
 * Registers hooks that stub global `fetch` with fake timers for the duration
 * of the suite. Call at `describe` (or file) top level; use the returned mock
 * to script responses per test.
 */
export function setupFetchStub(): Mock {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  return mockFetch
}

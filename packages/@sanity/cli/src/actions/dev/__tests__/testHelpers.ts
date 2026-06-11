import {type CliConfig, type Output} from '@sanity/cli-core'
import {unstable_defineApp} from '@sanity/federation'
// eslint-disable-next-line import-x/no-extraneous-dependencies
import {vi} from 'vitest'

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
const DEV_FLAGS = {
  'auto-updates': false,
  host: 'localhost',
  json: false,
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

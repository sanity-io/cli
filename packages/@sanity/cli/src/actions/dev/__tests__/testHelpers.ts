import {type CliConfig, type Output} from '@sanity/cli-core'
// eslint-disable-next-line import-x/no-extraneous-dependencies
import {vi} from 'vitest'

import {type DevActionOptions} from '../types.js'

/** Shared test helpers for dev-action test suites. */

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

export function createDevOptions(overrides: Partial<DevActionOptions> = {}): DevActionOptions {
  return {
    cliConfig: {} as CliConfig,
    flags: DEV_FLAGS,
    isApp: false,
    output: createMockOutput(),
    workDir: '/tmp/sanity-project',
    ...overrides,
  }
}

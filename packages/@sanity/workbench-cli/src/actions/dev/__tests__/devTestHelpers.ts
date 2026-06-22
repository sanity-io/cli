import {type CliConfig, type Output} from '@sanity/cli-core'
// eslint-disable-next-line import-x/no-extraneous-dependencies
import {vi} from 'vitest'

import {unstable_defineApp} from '../../../defineApp.js'

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

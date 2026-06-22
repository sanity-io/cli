import {type CliConfig} from '@sanity/cli-core'

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

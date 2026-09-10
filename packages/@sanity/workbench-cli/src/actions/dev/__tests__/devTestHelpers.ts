import {EventEmitter} from 'node:events'

import {type CliConfig, type Output} from '@sanity/cli-core'
// eslint-disable-next-line import-x/no-extraneous-dependencies
import {vi} from 'vitest'

import {defineApplication, unstable_defineMediaLibrary} from '../../../defineApp.js'
import {type DevServerInterface} from '../deriveConfigs.js'
import {type DevServerManifest, devServerManifestSchema} from '../registry.js'
import {type StartWorkbenchOptions} from '../startWorkbenchDevServer.js'

/**
 * A valid {@link DevServerManifest}, parsed through `devServerManifestSchema`
 * inside the builder so a fixture can never be structurally invalid or drift
 * from the schema — a schema change fails this one builder, not N tests
 * silently. Override only the field under test.
 *
 * Defaults ONLY the schema's required fields. Every optional field stays absent
 * unless overridden: `toApplicationsPayload` picks a subset of manifest fields
 * for the broadcast, so a defaulted optional (e.g. `name`) would leak into the
 * wire payload and break exact-match assertions. Never add an optional default.
 */
export function aDevServerManifest(overrides: Partial<DevServerManifest> = {}): DevServerManifest {
  return devServerManifestSchema.parse({
    host: 'localhost',
    pid: 1,
    port: 3333,
    startedAt: '2026-01-01T00:00:00.000Z',
    type: 'studio',
    // The schema pins this to the current REGISTRY_VERSION; a bump fails this
    // literal — the single builder update the ticket trades the sweep for.
    version: 2,
    workDir: '/tmp/workbench',
    ...overrides,
  })
}

/** A valid panel interface record for a dev-server manifest fixture. */
export const panel = (name: string, src = `./src/${name}.tsx`): DevServerInterface => ({
  id: `test-app-panel-${name}`,
  metadata: null,
  moduleId: `views/${name}`,
  name,
  src,
  surface: 'panel',
  title: name,
})

/** A valid web-worker interface record for a dev-server manifest fixture. */
export const worker = (name: string, src = `./src/${name}.ts`): DevServerInterface => ({
  id: `test-app-worker-${name}`,
  metadata: null,
  moduleId: `services/${name}`,
  name,
  src,
  title: name,
  type: 'worker',
})

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

/** A CliConfig `app` from a branded `defineApplication(...)` — the workbench opt-in. */
export function workbenchApp(overrides: Record<string, unknown> = {}): CliConfig['app'] {
  return defineApplication({
    organizationId: 'org-123',
    slug: 'test-app',
    title: 'Test App',
    ...overrides,
  }) as unknown as CliConfig['app']
}

export function workbenchCliConfig(overrides: Partial<CliConfig> = {}): CliConfig {
  return {app: workbenchApp(), ...overrides} as CliConfig
}

/**
 * A CliConfig whose `app` is a branded `unstable_defineMediaLibrary(...)` config —
 * config-only (no interfaces), so the workbench must still start to render it.
 */
export function mediaLibraryCliConfig(overrides: Partial<CliConfig> = {}): CliConfig {
  return {
    app: unstable_defineMediaLibrary({organizationId: 'org-123'}),
    ...overrides,
  } as unknown as CliConfig
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
    mode: 'development',
    output: createMockOutput(),
    reactStrictMode: false,
    workDir: '/tmp/sanity-project',
    ...overrides,
  }
}

/** A minimal Vite dev server stand-in — enough of the shape the workbench dev
 * flow reads (bound address, config, ws channel, lifecycle). */
export function createMockViteServer({host, port = 3333}: {host?: string; port?: number} = {}) {
  return {
    close: vi.fn<() => Promise<void>>().mockResolvedValue(),
    config: {server: {host, port}},
    httpServer: {address: vi.fn().mockReturnValue({address: '127.0.0.1', family: 'IPv4', port})},
    listen: vi.fn<() => Promise<void>>().mockResolvedValue(),
    ws: {on: vi.fn(), send: vi.fn()},
  }
}

/** A `startWorkbenchDevServer` result — the singleton shell as seen by its callers. */
export function mockWorkbenchServer(
  overrides: {
    httpHost?: string
    workbenchAvailable?: boolean
    workbenchPort?: number
  } = {},
) {
  return {
    close: vi.fn<() => Promise<void>>().mockResolvedValue(),
    httpHost: 'localhost',
    workbenchAvailable: true,
    workbenchPort: 3333,
    ...overrides,
  }
}

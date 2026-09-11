/**
 * Composed, in-process integration test of the dev orchestration chain:
 * `startDevServerRegistration` → registry → `startWorkbenchRemoteCoordinator`
 * (`toApplicationsPayload`). The isolated unit tests each mock their
 * collaborators, so the *seams* between them go unguarded — and the seams are
 * where the escaped regressions lived: the `surface` → `type` wire mapping and
 * the `organizationId` / `slug` / `visibility` metadata threaded from
 * registration through to the applications payload.
 *
 * This wires the real units together against an in-memory `node:fs` (no disk, no
 * network, no vite) and asserts the exact payload the workbench receives over
 * its HMR channel — "given this app, the workbench gets this".
 */
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  createMockOutput,
  createMockViteServer,
  FakeFsWatcher,
  workbenchApp,
  workbenchCliConfig,
} from '../../../../src/actions/dev/__tests__/devTestHelpers.js'
import {startDevServerRegistration} from '../../../../src/actions/dev/startDevServerRegistration.js'
import {startWorkbenchRemoteCoordinator} from '../../../../src/actions/dev/startWorkbenchDevServer.js'
import {unstable_defineMediaLibrary} from '../../../../src/defineApp.js'

// A fresh in-memory `node:fs` for this file (see fsMock.ts): the real
// `registerDevServer`/`getRegisteredServers` read/write path runs with no disk
// I/O, so the test asserts on the persisted-then-served payload rather than the
// arguments handed to a mocked collaborator.
const fsMock = await vi.hoisted(async () =>
  (await import('../../../../src/actions/dev/__tests__/fsMock.js')).createFsMock(),
)

vi.mock('node:fs', () => fsMock.module)

const mockGetSanityDataDir = vi.hoisted(() => vi.fn())
vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getSanityDataDir: mockGetSanityDataDir,
}))

// Liveness/PID-reuse is a mocked seam (exercised for real in
// processLiveness.test.ts) so the freshly written entry reads back as live.
vi.mock('../../../../src/actions/dev/processLiveness.js', () => ({
  __resetStartTimeCacheForTesting: vi.fn(),
  getProcessStartTime: vi.fn(() => undefined),
  isOurProcess: vi.fn((pid: number) => pid === process.pid),
}))

// The manifest file watcher owns `fs.watch` + config re-reads; it is not part of
// the registration → wire seam under test, so it is stubbed out.
const mockStartDevManifestWatcher = vi.hoisted(() => vi.fn())
vi.mock('../../../../src/actions/dev/startDevManifestWatcher.js', () => ({
  startDevManifestWatcher: mockStartDevManifestWatcher,
}))

const DATA_DIR = '/tmp/sanity-data'

/** Register a dev server the way `sanity dev` does, with sensible defaults. */
function register(overrides: Partial<Parameters<typeof startDevServerRegistration>[0]> = {}) {
  return startDevServerRegistration({
    cliConfig: workbenchCliConfig(),
    extractManifest: vi.fn().mockResolvedValue(undefined),
    isApp: true,
    output: createMockOutput(),
    server: createMockViteServer({port: 3334}) as never,
    workDir: '/tmp/sanity-project',
    ...overrides,
  })
}

/**
 * Attach the workbench coordinator to a fresh mock server and return the payload
 * it replies with when the page asks for the local applications — the exact
 * object the workbench receives over the HMR channel.
 */
function workbenchReceives() {
  const server = createMockViteServer({port: 3333})
  const coordinator = startWorkbenchRemoteCoordinator({httpHost: 'localhost', port: 3333, server})

  const onGetLocalApplications = server.ws.on.mock.calls.find(
    ([event]) => event === 'sanity:workbench:get-local-applications',
  )?.[1] as (payload: unknown, client: {send: ReturnType<typeof vi.fn>}) => void

  const client = {send: vi.fn()}
  onGetLocalApplications({}, client)

  const [, payload] = client.send.mock.calls[0]
  return {coordinator, payload}
}

describe('dev orchestration chain', () => {
  beforeEach(() => {
    fsMock.reset()
    // `watchRegistry` calls `fs.watch`; hand it a fake so `coordinator.close()`
    // has a real watcher to close.
    fsMock.module.watch.mockImplementation((_dir: string, listener: FakeFsWatcher['handler']) => {
      const watcher = new FakeFsWatcher()
      watcher.handler = listener
      return watcher
    })
    mockGetSanityDataDir.mockReturnValue(DATA_DIR)
    mockStartDevManifestWatcher.mockResolvedValue({close: vi.fn().mockResolvedValue(undefined)})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('given an SDK app, the workbench receives the composed applications payload', async () => {
    const registration = await register({
      cliConfig: workbenchCliConfig({
        api: {projectId: 'abc123'},
        app: workbenchApp({
          entry: './src/App.tsx',
          views: [{name: 'feed', src: './src/Feed.tsx', surface: 'panel', title: 'Feed'}],
          // A non-default value proves the field is threaded through, not defaulted.
          visibility: 'unlisted',
        }),
      } as never),
      isApp: true,
    })

    const {coordinator, payload} = workbenchReceives()

    expect(payload).toEqual({
      applications: [
        {
          host: 'localhost',
          id: 'test-app',
          interfaces: [
            // `surface: 'panel'` → `type: 'panel'`, `surface` never crosses the wire.
            {
              id: 'test-app-panel-feed',
              metadata: null,
              moduleId: 'views/feed',
              name: 'feed',
              src: './src/Feed.tsx',
              title: 'Feed',
              type: 'panel',
              version: '1',
            },
            // `surface: 'window'` → `type: 'app'`, the mapping that regressed before.
            {
              id: 'test-app-window-test-app',
              metadata: null,
              moduleId: 'App',
              name: 'test-app',
              src: './src/App.tsx',
              title: 'Test App',
              type: 'app',
            },
          ],
          manifest: undefined,
          name: 'test-app',
          organizationId: 'org-123',
          port: 3334,
          projectId: 'abc123',
          reference: 'org-123/test-app',
          slug: 'test-app',
          type: 'coreApp',
          visibility: 'unlisted',
        },
      ],
      configs: [],
    })

    await registration.close()
    await coordinator.close()
  })

  test('given a media-library config, the workbench receives it in the configs channel', async () => {
    const registration = await register({
      cliConfig: {
        app: unstable_defineMediaLibrary({
          fields: [{name: 'notes', src: './src/notes.ts', title: 'Notes'}],
          organizationId: 'org-1',
        }),
      } as never,
    })

    const {coordinator, payload} = workbenchReceives()

    // A config-only server is filtered out of `applications`; only its config is
    // published — nested under `config` (the flat→nested wire transform) with a
    // `remoteURL` composed from the server address.
    expect(payload).toEqual({
      applications: [],
      configs: [
        {
          appType: 'media-library',
          config: {fields: [{name: 'notes', src: './src/notes.ts', title: 'Notes'}]},
          id: expect.any(String),
          moduleName: 'media-library',
          remoteURL: 'http://localhost:3334',
          version: '1',
        },
      ],
    })

    await registration.close()
    await coordinator.close()
  })
})

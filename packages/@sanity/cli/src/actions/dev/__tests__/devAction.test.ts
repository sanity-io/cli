import {type CliConfig, type Output} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {devAction} from '../devAction.js'

const mockStartWorkbenchDevServer = vi.hoisted(() => vi.fn())
const mockStartAppDevServer = vi.hoisted(() => vi.fn())
const mockStartStudioDevServer = vi.hoisted(() => vi.fn())
const mockRegisterDevServer = vi.hoisted(() => vi.fn())
const mockReadIconFromPath = vi.hoisted(() => vi.fn())
const mockGetSharedServerConfig = vi.hoisted(() => vi.fn())

vi.mock('../startWorkbenchDevServer.js', () => ({
  startWorkbenchDevServer: mockStartWorkbenchDevServer,
}))
vi.mock('../startAppDevServer.js', () => ({
  startAppDevServer: mockStartAppDevServer,
}))
vi.mock('../startStudioDevServer.js', () => ({
  startStudioDevServer: mockStartStudioDevServer,
}))
vi.mock('../devServerRegistry.js', () => ({
  registerDevServer: mockRegisterDevServer,
}))
vi.mock('../../manifest/extractAppManifest.js', () => ({
  readIconFromPath: mockReadIconFromPath,
}))
vi.mock('../../../util/getSharedServerConfig.js', () => ({
  getSharedServerConfig: mockGetSharedServerConfig,
}))

function createMockOutput(): Output {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
}

/** These are not relevant for what we are testing, but still needed to pass type checker */
const FLAGS = {
  'auto-updates': false,
  host: 'localhost',
  json: false,
  port: '3333',
} as const

function createOptions(overrides?: {cliConfig?: CliConfig; isApp?: boolean; output?: Output}) {
  return {
    cliConfig: overrides?.cliConfig ?? ({} as CliConfig),
    flags: FLAGS,
    isApp: overrides?.isApp ?? false,
    output: overrides?.output ?? createMockOutput(),
    workDir: '/tmp/sanity-project',
  }
}

describe('devAction', () => {
  beforeEach(() => {
    // Default: no workbench (federation disabled)
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      httpHost: 'localhost',
      workbenchAvailable: false,
      workbenchPort: 3333,
    })
    mockRegisterDevServer.mockReturnValue(vi.fn())
    mockGetSharedServerConfig.mockReturnValue({httpHost: 'localhost', httpPort: 3333})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('studio mode without workbench uses original port', async () => {
    mockStartStudioDevServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      server: {config: {server: {port: 3333}}},
    })

    await devAction(createOptions())

    expect(mockStartStudioDevServer).toHaveBeenCalledWith(
      expect.objectContaining({flags: expect.objectContaining({port: '3333'})}),
    )
  })

  test('studio mode with workbench bumps port and logs workbench URL', async () => {
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      httpHost: 'localhost',
      workbenchAvailable: true,
      workbenchPort: 3333,
    })
    mockStartStudioDevServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      server: {config: {server: {port: 3334}}},
    })
    const output = createMockOutput()

    await devAction(createOptions({output}))

    expect(mockStartStudioDevServer).toHaveBeenCalledWith(
      expect.objectContaining({
        flags: expect.objectContaining({port: '3334'}),
        workbenchAvailable: true,
      }),
    )
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('3333'))
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('3334'))
  })

  test('app mode routes to startAppDevServer', async () => {
    mockStartAppDevServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      server: {config: {server: {port: 3333}}},
    })

    await devAction(createOptions({isApp: true}))

    expect(mockStartAppDevServer).toHaveBeenCalled()
    expect(mockStartStudioDevServer).not.toHaveBeenCalled()
  })

  test('passes reactRefreshHost pointing to workbench when workbench is running', async () => {
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      httpHost: 'localhost',
      workbenchAvailable: true,
      workbenchPort: 3333,
    })
    mockStartStudioDevServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      server: {config: {server: {port: 3334}}},
    })

    await devAction(createOptions())

    expect(mockStartStudioDevServer).toHaveBeenCalledWith(
      expect.objectContaining({reactRefreshHost: 'http://localhost:3333'}),
    )
  })

  test('does not pass reactRefreshHost when workbench is not running', async () => {
    mockStartStudioDevServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      server: {config: {server: {port: 3333}}},
    })

    await devAction(createOptions())

    expect(mockStartStudioDevServer).toHaveBeenCalledWith(
      expect.objectContaining({reactRefreshHost: undefined}),
    )
  })

  test('cleans up workbench and re-throws when app/studio startup fails', async () => {
    const mockWorkbenchClose = vi.fn().mockResolvedValue(undefined)
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: mockWorkbenchClose,
      httpHost: 'localhost',
      workbenchAvailable: true,
      workbenchPort: 3333,
    })
    const startupError = new Error('Port already in use')
    mockStartStudioDevServer.mockRejectedValue(startupError)

    const thrown = await devAction(createOptions()).catch((err) => err)

    expect(thrown).toBe(startupError)
    expect(mockWorkbenchClose).toHaveBeenCalled()
  })

  test('close handler is resilient to one close rejecting', async () => {
    const mockWorkbenchClose = vi.fn().mockRejectedValue(new Error('workbench close failed'))
    const mockAppClose = vi.fn().mockResolvedValue(undefined)
    mockStartWorkbenchDevServer.mockResolvedValue({
      close: mockWorkbenchClose,
      httpHost: 'localhost',
      workbenchAvailable: true,
      workbenchPort: 3333,
    })
    mockStartStudioDevServer.mockResolvedValue({
      close: mockAppClose,
      server: {config: {server: {port: 3334}}},
    })

    const result = await devAction(createOptions())

    await expect(result.close()).resolves.toBeUndefined()
    expect(mockWorkbenchClose).toHaveBeenCalled()
    expect(mockAppClose).toHaveBeenCalled()
  })

  describe('registry integration', () => {
    test('registers studio in registry when federation is enabled', async () => {
      mockStartStudioDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        server: {config: {server: {port: 3334}}},
      })

      await devAction(
        createOptions({
          cliConfig: {federation: {enabled: true}},
        }),
      )

      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 3334,
          type: 'studio',
        }),
      )
    })

    test('passes deployment.appId to registerDevServer', async () => {
      mockStartStudioDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        server: {config: {server: {port: 3334}}},
      })

      await devAction(
        createOptions({
          cliConfig: {deployment: {appId: 'app-abc'}, federation: {enabled: true}},
        }),
      )

      expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({id: 'app-abc'}))
    })

    test('normalizes deprecated app.id into deployment.appId before registering', async () => {
      mockStartStudioDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        server: {config: {server: {port: 3334}}},
      })
      const output = createMockOutput()

      await devAction(
        createOptions({
          cliConfig: {app: {id: 'legacy-app'}, federation: {enabled: true}},
          output,
        }),
      )

      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.objectContaining({id: 'legacy-app'}),
      )
      expect(output.warn).toHaveBeenCalledWith(
        expect.stringContaining('`app.id` config has moved to `deployment.appId`'),
      )
    })

    test('prefers deployment.appId over deprecated app.id when both are set', async () => {
      mockStartStudioDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        server: {config: {server: {port: 3334}}},
      })
      const output = createMockOutput()

      await devAction(
        createOptions({
          cliConfig: {
            app: {id: 'legacy-app'},
            deployment: {appId: 'new-app'},
            federation: {enabled: true},
          },
          output,
        }),
      )

      expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({id: 'new-app'}))
      expect(output.warn).toHaveBeenCalledWith(
        expect.stringContaining('Found both `app.id` (deprecated) and `deployment.appId`'),
      )
    })

    test('inlines app.icon via readIconFromPath and passes app.title to registerDevServer', async () => {
      mockStartStudioDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        server: {config: {server: {port: 3334}}},
      })
      mockReadIconFromPath.mockResolvedValue('<svg><path d="M0 0"/></svg>')

      await devAction(
        createOptions({
          cliConfig: {
            app: {icon: 'public/logo.svg', title: 'My App'},
            federation: {enabled: true},
          },
        }),
      )

      expect(mockReadIconFromPath).toHaveBeenCalledWith('/tmp/sanity-project', 'public/logo.svg')
      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: '<svg><path d="M0 0"/></svg>',
          title: 'My App',
        }),
      )
    })

    test('warns and registers without icon when readIconFromPath fails', async () => {
      mockStartStudioDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        server: {config: {server: {port: 3334}}},
      })
      mockReadIconFromPath.mockRejectedValue(new Error('ENOENT'))
      const output = createMockOutput()

      await devAction(
        createOptions({
          cliConfig: {
            app: {icon: 'public/missing.svg', title: 'My App'},
            federation: {enabled: true},
          },
          output,
        }),
      )

      expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('ENOENT'))
      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.objectContaining({icon: undefined, title: 'My App'}),
      )
    })

    test('does not call readIconFromPath when app.icon is not configured', async () => {
      mockStartStudioDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        server: {config: {server: {port: 3334}}},
      })

      await devAction(
        createOptions({
          cliConfig: {
            app: {title: 'My App'},
            federation: {enabled: true},
          },
        }),
      )

      expect(mockReadIconFromPath).not.toHaveBeenCalled()
      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.objectContaining({icon: undefined, title: 'My App'}),
      )
    })

    test('registers with undefined app metadata when nothing is configured', async () => {
      mockStartStudioDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        server: {config: {server: {port: 3334}}},
      })

      await devAction(createOptions({cliConfig: {federation: {enabled: true}}}))

      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: undefined,
          id: undefined,
          title: undefined,
        }),
      )
    })

    test('registers app under its own resolved host (server.hostname via getSharedServerConfig)', async () => {
      mockStartStudioDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        server: {config: {server: {port: 3334}}},
      })
      mockGetSharedServerConfig.mockReturnValue({httpHost: 'mydev.local', httpPort: 3333})

      await devAction(
        createOptions({
          cliConfig: {federation: {enabled: true}, server: {hostname: 'mydev.local'}},
        }),
      )

      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.objectContaining({host: 'mydev.local'}),
      )
    })

    test('registered host reflects this process when another process owns the workbench lock', async () => {
      // startWorkbenchDevServer returns the existing workbench's host — but the
      // registered app host must reflect THIS process's own config.
      mockStartWorkbenchDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        httpHost: 'other-workbench.local',
        workbenchAvailable: true,
        workbenchPort: 3333,
      })
      mockGetSharedServerConfig.mockReturnValue({httpHost: 'app.local', httpPort: 4000})
      mockStartStudioDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        server: {config: {server: {port: 3334}}},
      })

      await devAction(
        createOptions({
          cliConfig: {federation: {enabled: true}, server: {hostname: 'app.local'}},
        }),
      )

      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.objectContaining({host: 'app.local'}),
      )
    })

    test('falls back to localhost when resolved host is empty', async () => {
      mockStartStudioDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        server: {config: {server: {port: 3334}}},
      })
      mockGetSharedServerConfig.mockReturnValue({httpHost: '', httpPort: 3333})

      await devAction(createOptions({cliConfig: {federation: {enabled: true}}}))

      expect(mockRegisterDevServer).toHaveBeenCalledWith(
        expect.objectContaining({host: 'localhost'}),
      )
    })

    test('registers app type when isApp is true', async () => {
      mockStartAppDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        server: {config: {server: {port: 3334}}},
      })

      await devAction(
        createOptions({
          cliConfig: {federation: {enabled: true}},
          isApp: true,
        }),
      )

      expect(mockRegisterDevServer).toHaveBeenCalledWith(expect.objectContaining({type: 'coreApp'}))
    })

    test('does not register when federation is disabled', async () => {
      mockStartStudioDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        server: {config: {server: {port: 3333}}},
      })

      await devAction(createOptions())

      expect(mockRegisterDevServer).not.toHaveBeenCalled()
    })

    test('calls manifest cleanup on close', async () => {
      const mockCleanup = vi.fn()
      mockRegisterDevServer.mockReturnValue(mockCleanup)
      mockStartStudioDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        server: {config: {server: {port: 3334}}},
      })

      const result = await devAction(createOptions({cliConfig: {federation: {enabled: true}}}))

      await result.close()
      expect(mockCleanup).toHaveBeenCalled()
    })

    test('close removes signal handlers to prevent listener leaks', async () => {
      const offSpy = vi.spyOn(process, 'off')
      mockRegisterDevServer.mockReturnValue(vi.fn())
      mockStartStudioDevServer.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        server: {config: {server: {port: 3334}}},
      })

      const result = await devAction(createOptions({cliConfig: {federation: {enabled: true}}}))
      await result.close()

      expect(offSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function))
      expect(offSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function))

      offSpy.mockRestore()
    })
  })
})

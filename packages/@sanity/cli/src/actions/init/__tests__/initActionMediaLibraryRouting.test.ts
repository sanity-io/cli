/**
 * Routing tests for the media-library-config template: it must ride the app
 * init flow end to end — `initApp`, app unattended-flag rules — without being
 * listed as an app template itself. Collaborators around the routing are
 * mocked; `initAction`'s own control flow is real.
 */
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {initAction} from '../initAction.js'
import {InitError} from '../initError.js'
import {type InitContext, type InitOptions} from '../types.js'

const mockGetProjectDetails = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    datasetName: '',
    displayName: '',
    isFirstProject: false,
    organizationId: 'org-1',
    projectId: '',
  }),
)
const mockInitApp = vi.hoisted(() => vi.fn())
const mockInitStudio = vi.hoisted(() => vi.fn())
const mockValidateSession = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/ux', async () => import('@sanity/cli-test/mocks/cli-core/ux'))
vi.mock('../../../util/detectFramework.js', () => ({
  detectFrameworkRecord: vi.fn().mockResolvedValue(null),
}))
vi.mock('../../../util/getProjectDefaults.js', () => ({
  getProjectDefaults: vi.fn().mockResolvedValue({}),
}))
vi.mock('../../auth/ensureAuthenticated.js', () => ({
  validateSession: mockValidateSession,
}))
vi.mock('../../auth/login/login.js', () => ({login: vi.fn()}))
vi.mock('../../mcp/detectAvailableEditors.js', () => ({
  detectAvailableEditors: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../mcp/setupMCP.js', () => ({
  setupMCP: vi.fn().mockResolvedValue({
    alreadyConfiguredEditors: [],
    configuredEditors: [],
    detectedEditors: [],
    skillsToInstall: [],
    skipped: true,
  }),
}))
vi.mock('../initApp.js', () => ({initApp: mockInitApp}))
vi.mock('../initStudio.js', () => ({initStudio: mockInitStudio}))
vi.mock('../plan/getPlan.js', () => ({getPlan: vi.fn().mockResolvedValue(undefined)}))
vi.mock('../project/getProjectDetails.js', () => ({
  getProjectDetails: mockGetProjectDetails,
}))
vi.mock('../project/getProjectOutputPath.js', () => ({
  getProjectOutputPath: vi.fn().mockResolvedValue('/tmp/test-output'),
}))

function createTestContext(): InitContext {
  return {
    output: {
      error: vi.fn() as unknown as InitContext['output']['error'],
      log: vi.fn(),
      logDiagnostic: vi.fn(),
      logJson: vi.fn(),
      warn: vi.fn(),
    },
    telemetry: {
      trace: vi.fn().mockReturnValue({
        complete: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        newContext: vi.fn().mockReturnValue(vi.fn()),
        start: vi.fn(),
      }),
    } as unknown as InitContext['telemetry'],
    workDir: '/tmp/test-work-dir',
  }
}

const baseOptions: InitOptions = {
  autoUpdates: true,
  bare: false,
  datasetDefault: false,
  fromCreate: false,
  install: true,
  mcpMode: 'skip',
  skillsMode: 'skip',
  template: 'media-library-config',
  unattended: false,
}

describe('initAction routing for media-library-config', () => {
  beforeEach(() => {
    mockValidateSession.mockResolvedValue({
      email: 'test@example.com',
      id: 'user-123',
      name: 'Test User',
      provider: 'google',
    })
  })
  afterEach(() => vi.clearAllMocks())

  test('routes to initApp, not initStudio', async () => {
    await initAction(
      {...baseOptions, organization: 'org-1', outputPath: '/tmp/test-output', unattended: true},
      createTestContext(),
    )

    expect(mockInitApp).toHaveBeenCalledTimes(1)
    expect(mockInitStudio).not.toHaveBeenCalled()
    expect(mockInitApp).toHaveBeenCalledWith(
      expect.objectContaining({organizationId: 'org-1', workbench: false}),
    )
  })

  test('passes isMediaLibraryTemplate to getProjectDetails so the project prompt is skipped', async () => {
    await initAction(
      {...baseOptions, organization: 'org-1', outputPath: '/tmp/test-output', unattended: true},
      createTestContext(),
    )

    expect(mockGetProjectDetails).toHaveBeenCalledWith(
      expect.objectContaining({isAppTemplate: true, isMediaLibraryTemplate: true}),
    )
  })

  test('gets the unattended-flag rules: organization is required (project flags do not count)', async () => {
    let caughtError: unknown
    try {
      await initAction(
        {
          ...baseOptions,
          outputPath: '/tmp/test-output',
          project: 'proj-1',
          unattended: true,
        },
        createTestContext(),
      )
    } catch (error) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(InitError)
    expect((caughtError as InitError).message).toContain(
      'Organization is required for the media-library-config template',
    )
    expect(mockInitApp).not.toHaveBeenCalled()
  })

  test('warns that --dashboard is ignored for the template', async () => {
    const context = createTestContext()

    await initAction(
      {
        ...baseOptions,
        dashboard: true,
        organization: 'org-1',
        outputPath: '/tmp/test-output',
        unattended: true,
      },
      context,
    )

    expect(context.output.warn).toHaveBeenCalledWith(
      '--dashboard is ignored for the media-library-config template',
    )
  })
})

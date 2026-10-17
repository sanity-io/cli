import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {initAction} from '../initAction.js'
import {type InitContext, type InitOptions} from '../types.js'

const mocks = vi.hoisted(() => ({
  checkNextJsReactCompatibility: vi.fn(),
  createOrAppendEnvVars: vi.fn(),
  detectFrameworkRecord: vi.fn(),
  getProjectDetails: vi.fn(),
  initApp: vi.fn(),
  initNextJs: vi.fn(),
  initStudio: vi.fn(),
  promptForConfigFiles: vi.fn(),
  promptForInitType: vi.fn(),
}))

vi.mock('../../../prompts/init/promptForInitType.js', () => ({
  promptForInitType: mocks.promptForInitType,
}))
vi.mock('../../../prompts/init/nextjs.js', () => ({
  promptForConfigFiles: mocks.promptForConfigFiles,
}))
vi.mock('../../../util/detectFramework.js', () => ({
  detectFrameworkRecord: mocks.detectFrameworkRecord,
}))
vi.mock('@vercel/frameworks', () => ({frameworks: []}))
vi.mock('../../../util/getProjectDefaults.js', () => ({
  getProjectDefaults: vi.fn().mockResolvedValue({projectName: 'test-project'}),
}))
vi.mock('../../auth/ensureAuthenticated.js', () => ({
  validateSession: vi
    .fn()
    .mockResolvedValue({id: 'user-123', name: 'Test User', provider: 'google'}),
}))
vi.mock('../../auth/login/login.js', () => ({login: vi.fn()}))
vi.mock('../../../services/user.js', () => ({getCliUser: vi.fn()}))
vi.mock('../../mcp/detectAvailableEditors.js', () => ({detectAvailableEditors: vi.fn()}))
vi.mock('../../mcp/setupMCP.js', () => ({
  setupMCP: vi.fn().mockResolvedValue({
    alreadyConfiguredEditors: [],
    configuredEditors: [],
    detectedEditors: [],
    skillsToInstall: [],
    skipped: true,
  }),
}))
vi.mock('../../skills/setupSkills.js', () => ({setupSkills: vi.fn()}))
vi.mock('../plan/getPlan.js', () => ({getPlan: vi.fn()}))
vi.mock('../project/createProjectFromName.js', () => ({createProjectFromName: vi.fn()}))
vi.mock('../project/getProjectDetails.js', () => ({getProjectDetails: mocks.getProjectDetails}))
vi.mock('../project/getProjectOutputPath.js', () => ({
  getProjectOutputPath: vi.fn().mockResolvedValue('/tmp/test-output'),
}))
vi.mock('../remoteTemplate.js', () => ({
  checkIsRemoteTemplate: vi.fn().mockReturnValue(false),
  getGitHubRepoInfo: vi.fn(),
}))
vi.mock('../checkNextJsReactCompatibility.js', () => ({
  checkNextJsReactCompatibility: mocks.checkNextJsReactCompatibility,
}))
vi.mock('../env/createOrAppendEnvVars.js', () => ({
  createOrAppendEnvVars: mocks.createOrAppendEnvVars,
}))
vi.mock('../initHelpers.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../initHelpers.js')>()),
  writeStagingEnvIfNeeded: vi.fn(),
}))
vi.mock('../initApp.js', () => ({initApp: mocks.initApp}))
vi.mock('../initNextJs.js', () => ({initNextJs: mocks.initNextJs}))
vi.mock('../initStudio.js', () => ({initStudio: mocks.initStudio}))

const defaultOptions: InitOptions = {
  autoUpdates: true,
  bare: false,
  dataset: 'production',
  datasetDefault: false,
  fromCreate: false,
  install: false,
  mcpMode: 'skip',
  outputPath: '/tmp/test-output',
  project: 'test-project',
  skillsMode: 'skip',
  unattended: false,
}

function createContext(): InitContext {
  return {
    output: {
      error: vi.fn(() => {
        throw new Error('Unexpected output.error')
      }),
      log: vi.fn(),
      warn: vi.fn(),
    },
    telemetry: {
      trace: vi.fn().mockReturnValue({
        complete: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        start: vi.fn(),
      }),
    } as unknown as InitContext['telemetry'],
    workDir: '/tmp/test-work-dir',
  }
}

describe('init type selection', () => {
  beforeEach(() => {
    mocks.promptForInitType.mockResolvedValue('studio')
    mocks.detectFrameworkRecord.mockResolvedValue(null)
    mocks.getProjectDetails.mockResolvedValue({
      datasetName: 'production',
      displayName: 'Test Project',
      isFirstProject: false,
      organizationId: 'org-123',
      projectId: 'test-project',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test.each(['studio', 'app'] as const)(
    'routes the attended %s choice to its scaffold',
    async (type) => {
      mocks.promptForInitType.mockResolvedValueOnce(type)
      const options = {...defaultOptions}

      await initAction(options, createContext())

      expect(mocks.promptForInitType).toHaveBeenCalledOnce()
      expect(mocks.getProjectDetails).toHaveBeenCalledWith(
        expect.objectContaining({isAppTemplate: type === 'app'}),
      )
      const selectedScaffold = type === 'app' ? mocks.initApp : mocks.initStudio
      const otherScaffold = type === 'app' ? mocks.initStudio : mocks.initApp
      expect(selectedScaffold).toHaveBeenCalledWith(
        expect.objectContaining({
          datasetName: 'production',
          options: type === 'app' ? {...options, template: 'app-quickstart'} : options,
          projectId: 'test-project',
        }),
      )
      expect(otherScaffold).not.toHaveBeenCalled()
      expect(options.template).toBeUndefined()
    },
  )

  test.each([
    {label: 'unattended', options: {unattended: true}, scaffold: 'studio'},
    {label: 'Studio template', options: {template: 'blog'}, scaffold: 'studio'},
    {label: 'App SDK template', options: {template: 'app-sanity-ui'}, scaffold: 'app'},
    {label: 'bare', options: {bare: true}, scaffold: undefined},
    {label: 'env', options: {env: '.env'}, scaffold: undefined},
  ])('skips type selection for $label initialization', async ({options, scaffold}) => {
    await initAction({...defaultOptions, ...options}, createContext())

    expect(mocks.promptForInitType).not.toHaveBeenCalled()
    expect(mocks.initStudio).toHaveBeenCalledTimes(scaffold === 'studio' ? 1 : 0)
    expect(mocks.initApp).toHaveBeenCalledTimes(scaffold === 'app' ? 1 : 0)
    if (options.env) expect(mocks.createOrAppendEnvVars).toHaveBeenCalledOnce()
  })

  test('keeps Next.js setup available when Studio is selected', async () => {
    mocks.detectFrameworkRecord.mockResolvedValueOnce({name: 'Next.js', slug: 'nextjs'})
    mocks.promptForConfigFiles.mockResolvedValueOnce(true)

    await initAction(defaultOptions, createContext())

    expect(mocks.promptForConfigFiles).toHaveBeenCalledOnce()
    expect(mocks.checkNextJsReactCompatibility).toHaveBeenCalledOnce()
    expect(mocks.initNextJs).toHaveBeenCalledOnce()
    expect(mocks.initApp).not.toHaveBeenCalled()
    expect(mocks.initStudio).not.toHaveBeenCalled()
  })

  test.each([undefined, true])(
    'App SDK bypasses Next.js setup (config flag: %s)',
    async (nextjsAddConfigFiles) => {
      mocks.detectFrameworkRecord.mockResolvedValueOnce({name: 'Next.js', slug: 'nextjs'})
      mocks.promptForInitType.mockResolvedValueOnce('app')

      await initAction({...defaultOptions, nextjsAddConfigFiles}, createContext())

      expect(mocks.initApp).toHaveBeenCalledOnce()
      expect(mocks.promptForConfigFiles).not.toHaveBeenCalled()
      expect(mocks.checkNextJsReactCompatibility).not.toHaveBeenCalled()
      expect(mocks.initNextJs).not.toHaveBeenCalled()
      expect(mocks.initStudio).not.toHaveBeenCalled()
    },
  )

  test('cancellation stops before project setup or scaffolding', async () => {
    const error = new Error('User cancelled')
    mocks.promptForInitType.mockRejectedValueOnce(error)

    await expect(initAction(defaultOptions, createContext())).rejects.toBe(error)

    expect(mocks.getProjectDetails).not.toHaveBeenCalled()
    expect(mocks.initApp).not.toHaveBeenCalled()
    expect(mocks.initStudio).not.toHaveBeenCalled()
  })
})

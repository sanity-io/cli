/**
 * Auto-detected in-place Studio must not swallow init modes that already
 * have their own flow. Collaborators are mocked; `initAction`'s control flow is real.
 */
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {initAction} from '../initAction.js'
import {type InitContext, type InitOptions, type VersionedFramework} from '../types.js'

const mockGetProjectDetails = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    datasetName: 'production',
    displayName: 'Test Project',
    isFirstProject: false,
    organizationId: 'org-1',
    projectId: 'proj-1',
  }),
)
const mockGetProjectOutputPath = vi.hoisted(() => vi.fn())
const mockInitApp = vi.hoisted(() => vi.fn())
const mockInitStudio = vi.hoisted(() => vi.fn())
const mockInitInPlaceStudio = vi.hoisted(() => vi.fn())
const mockCreateOrAppendEnvVars = vi.hoisted(() => vi.fn())
const mockDetectFramework = vi.hoisted(() => vi.fn())
const mockValidateSession = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/ux', async () => import('@sanity/cli-test/mocks/cli-core/ux'))
vi.mock('../../../util/detectFramework.js', () => ({
  detectFrameworkRecord: mockDetectFramework,
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
vi.mock('../env/createOrAppendEnvVars.js', () => ({
  createOrAppendEnvVars: mockCreateOrAppendEnvVars,
}))
vi.mock('../initApp.js', () => ({initApp: mockInitApp}))
vi.mock('../initInPlaceStudio.js', () => ({initInPlaceStudio: mockInitInPlaceStudio}))
vi.mock('../initStudio.js', () => ({initStudio: mockInitStudio}))
vi.mock('../plan/getPlan.js', () => ({getPlan: vi.fn().mockResolvedValue(undefined)}))
vi.mock('../project/getProjectDetails.js', () => ({
  getProjectDetails: mockGetProjectDetails,
}))
vi.mock('../project/getProjectOutputPath.js', () => ({
  getProjectOutputPath: mockGetProjectOutputPath,
}))

const astro = {name: 'Astro', slug: 'astro'} as VersionedFramework
const nextjs = {
  detectedVersion: '15.1.0',
  name: 'Next.js',
  slug: 'nextjs',
} as VersionedFramework

const baseOptions: InitOptions = {
  autoUpdates: true,
  bare: false,
  dataset: 'production',
  datasetDefault: false,
  fromCreate: false,
  install: false,
  mcpMode: 'skip',
  project: 'proj-1',
  skillsMode: 'skip',
  unattended: true,
}

describe('initAction in-place routing', () => {
  let workDir: string
  let context: InitContext

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'init-in-place-routing-'))
    await writeFile(
      join(workDir, 'package.json'),
      `${JSON.stringify({name: 'app', version: '0.0.0'})}\n`,
    )
    mockGetProjectOutputPath.mockResolvedValue(join(workDir, 'unused-studio'))
    mockDetectFramework.mockResolvedValue(astro)
    mockValidateSession.mockResolvedValue({
      email: 'test@example.com',
      id: 'user-123',
      name: 'Test User',
      provider: 'google',
    })
    context = {
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
      workDir,
    }
  })

  afterEach(async () => {
    vi.clearAllMocks()
    await rm(workDir, {force: true, recursive: true})
  })

  test('adds a Studio in the current folder for a documented framework', async () => {
    await initAction(baseOptions, context)

    expect(mockInitInPlaceStudio).toHaveBeenCalledTimes(1)
    expect(mockInitStudio).not.toHaveBeenCalled()
    expect(mockInitApp).not.toHaveBeenCalled()
  })

  test('keeps --env as an env-only init', async () => {
    await initAction({...baseOptions, env: '.env', outputPath: join(workDir, 'studio')}, context)

    expect(mockInitInPlaceStudio).not.toHaveBeenCalled()
    expect(mockCreateOrAppendEnvVars).toHaveBeenCalledWith(
      expect.objectContaining({filename: '.env'}),
    )
  })

  test('routes app templates to initApp', async () => {
    await initAction(
      {...baseOptions, outputPath: join(workDir, 'studio'), template: 'app-quickstart'},
      context,
    )

    expect(mockInitApp).toHaveBeenCalledTimes(1)
    expect(mockInitInPlaceStudio).not.toHaveBeenCalled()
  })

  test('routes media-library-config to initApp', async () => {
    await initAction(
      {
        ...baseOptions,
        organization: 'org-1',
        outputPath: join(workDir, 'studio'),
        project: undefined,
        template: 'media-library-config',
      },
      context,
    )

    expect(mockInitApp).toHaveBeenCalledTimes(1)
    expect(mockInitInPlaceStudio).not.toHaveBeenCalled()
  })

  test('routes studio templates this flow cannot scaffold to initStudio', async () => {
    await initAction(
      {...baseOptions, outputPath: join(workDir, 'studio'), template: 'moviedb'},
      context,
    )

    expect(mockInitStudio).toHaveBeenCalledTimes(1)
    expect(mockInitInPlaceStudio).not.toHaveBeenCalled()
  })

  test('honors an explicit --in-place-studio over another template', async () => {
    await initAction({...baseOptions, inPlaceStudio: true, template: 'moviedb'}, context)

    expect(mockInitInPlaceStudio).toHaveBeenCalledTimes(1)
    expect(mockInitStudio).not.toHaveBeenCalled()
  })

  test('warns that --output-path is ignored and checks the app package.json', async () => {
    await writeFile(
      join(workDir, 'package.json'),
      `${JSON.stringify({
        dependencies: {react: '^19.2.0'},
        name: 'next-app',
        version: '0.0.0',
      })}\n`,
    )
    mockDetectFramework.mockResolvedValue(nextjs)

    await initAction({...baseOptions, outputPath: join(workDir, 'unused-studio')}, context)

    expect(mockInitInPlaceStudio).toHaveBeenCalledWith(expect.objectContaining({workDir}))
    expect(context.output.warn).toHaveBeenCalledWith(
      '--output-path is ignored when adding a Studio to this folder. Pass --no-in-place-studio to write the Studio to that path.',
    )
    expect(context.output.warn).toHaveBeenCalledWith(
      expect.stringContaining('Next.js 15 and React 19'),
    )
    expect(mockInitStudio).not.toHaveBeenCalled()
  })

  test('keeps --output-path when --no-in-place-studio is set', async () => {
    await initAction(
      {...baseOptions, inPlaceStudio: false, outputPath: join(workDir, 'studio')},
      context,
    )

    expect(mockInitStudio).toHaveBeenCalledTimes(1)
    expect(mockInitInPlaceStudio).not.toHaveBeenCalled()
    expect(context.output.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('--output-path is ignored'),
    )
  })
})

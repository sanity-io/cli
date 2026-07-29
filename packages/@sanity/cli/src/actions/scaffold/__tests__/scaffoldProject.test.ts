import path from 'node:path'

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
  FRONTEND_ENV_PREFIX_OVERRIDES,
  manualScaffoldCommands,
  scaffoldProject,
} from '../scaffoldProject.js'

const mockDetectFrameworkRecord = vi.hoisted(() => vi.fn())
const mockDirIsEmptyOrNonExistent = vi.hoisted(() => vi.fn())
const mockAppendEnvValues = vi.hoisted(() => vi.fn())
const mockGetProjectDefaults = vi.hoisted(() => vi.fn())
const mockInitStudio = vi.hoisted(() => vi.fn())
const mockResolvePackageManager = vi.hoisted(() => vi.fn())
const mockCreateFrontend = vi.hoisted(() => vi.fn())
const mockInstallFrontendDeps = vi.hoisted(() => vi.fn())

vi.mock('../../../util/detectFramework.js', () => ({
  detectFrameworkRecord: mockDetectFrameworkRecord,
}))
vi.mock('../../../util/dirIsEmptyOrNonExistent.js', () => ({
  dirIsEmptyOrNonExistent: mockDirIsEmptyOrNonExistent,
}))
vi.mock('../../../util/envFile.js', () => ({
  appendEnvValues: mockAppendEnvValues,
}))
vi.mock('../../../util/getProjectDefaults.js', () => ({
  getProjectDefaults: mockGetProjectDefaults,
}))
vi.mock('../../init/initStudio.js', () => ({initStudio: mockInitStudio}))
vi.mock('../../init/resolvePackageManager.js', () => ({
  resolvePackageManager: mockResolvePackageManager,
}))
vi.mock('../createFrontend.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../createFrontend.js')>()),
  createFrontend: mockCreateFrontend,
  installFrontendDeps: mockInstallFrontendDeps,
}))

const trace = {
  complete: vi.fn(),
  error: vi.fn(),
  start: vi.fn(),
}
const telemetry = {trace: vi.fn(() => trace)} as never
const output = {log: vi.fn(), warn: vi.fn()} as never

const options = {
  dataset: 'production',
  displayName: 'My Project',
  output,
  projectId: 'abc123',
  telemetry,
  token: 'sk-token',
  workDir: '/tmp/project',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDetectFrameworkRecord.mockResolvedValue(undefined)
  mockDirIsEmptyOrNonExistent.mockResolvedValue(true)
  mockAppendEnvValues.mockReturnValue({
    created: true,
    skippedKeys: [],
    wroteKeys: ['value'],
  })
  mockGetProjectDefaults.mockResolvedValue({projectName: 'My Project'})
  mockInitStudio.mockResolvedValue(undefined)
  mockResolvePackageManager.mockResolvedValue('npm')
  mockCreateFrontend.mockResolvedValue(undefined)
  mockInstallFrontendDeps.mockResolvedValue(undefined)
})

describe('manualScaffoldCommands', () => {
  test('provides unattended Studio and frontend recovery commands', () => {
    expect(manualScaffoldCommands({dataset: 'production', projectId: 'abc123'})).toEqual([
      'npx sanity init --project abc123 --dataset production --output-path sanity --no-mcp --no-skills --no-git -y',
      expect.stringContaining('create-next-app@^16 web'),
    ])
  })
})

describe('scaffoldProject', () => {
  test('refuses a non-empty Studio target before writing files', async () => {
    mockDirIsEmptyOrNonExistent.mockResolvedValue(false)

    await expect(scaffoldProject(options)).rejects.toThrow('./sanity is not empty')

    expect(mockInitStudio).not.toHaveBeenCalled()
    expect(mockAppendEnvValues).not.toHaveBeenCalled()
  })

  test('creates a Studio and Next.js frontend with their scoped env files', async () => {
    await expect(scaffoldProject(options)).resolves.toMatchObject({
      frontendDependenciesInstalled: true,
      frontendEnv: {
        NEXT_PUBLIC_SANITY_DATASET: 'production',
        NEXT_PUBLIC_SANITY_PROJECT_ID: 'abc123',
      },
      frontendEnvPrefix: 'NEXT_PUBLIC_',
      frontendEnvWritten: true,
      frontendPackageManager: 'npm',
      frontendPath: path.join(options.workDir, 'web'),
      studioEnvWritten: true,
      studioPath: path.join(options.workDir, 'sanity'),
    })

    expect(mockInitStudio).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetName: 'production',
        outputPath: path.join(options.workDir, 'sanity'),
        preclaim: true,
        projectId: 'abc123',
      }),
    )
    expect(mockCreateFrontend).toHaveBeenCalledWith(
      expect.objectContaining({dirName: 'web', packageManager: 'npm'}),
    )
    expect(mockInstallFrontendDeps).toHaveBeenCalled()
    expect(mockAppendEnvValues).toHaveBeenCalledWith(
      path.join(options.workDir, 'sanity', '.env.local'),
      {SANITY_AUTH_TOKEN: 'sk-token'},
      expect.anything(),
    )
    expect(mockAppendEnvValues).toHaveBeenCalledWith(
      path.join(options.workDir, 'web', '.env.local'),
      {
        NEXT_PUBLIC_SANITY_DATASET: 'production',
        NEXT_PUBLIC_SANITY_PROJECT_ID: 'abc123',
      },
      expect.anything(),
    )
  })

  test.each([
    ['nuxtjs', FRONTEND_ENV_PREFIX_OVERRIDES.nuxtjs],
    ['sveltekit-1', FRONTEND_ENV_PREFIX_OVERRIDES['sveltekit-1']],
  ])('uses framework-correct public env keys for %s', async (slug, prefix) => {
    mockDetectFrameworkRecord.mockResolvedValue({
      envPrefix: 'IGNORED_',
      name: slug,
      slug,
    })

    await expect(scaffoldProject(options)).resolves.toMatchObject({
      detectedFramework: slug,
      frontendEnv: {
        [`${prefix}SANITY_DATASET`]: 'production',
        [`${prefix}SANITY_PROJECT_ID`]: 'abc123',
      },
      frontendEnvWritten: false,
      studioEnvWritten: true,
    })
    expect(mockCreateFrontend).not.toHaveBeenCalled()
  })

  test('uses Astro public env keys from framework metadata', async () => {
    mockDetectFrameworkRecord.mockResolvedValue({
      envPrefix: 'PUBLIC_',
      name: 'Astro',
      slug: 'astro',
    })

    await expect(scaffoldProject(options)).resolves.toMatchObject({
      detectedFramework: 'Astro',
      frontendEnv: {
        PUBLIC_SANITY_DATASET: 'production',
        PUBLIC_SANITY_PROJECT_ID: 'abc123',
      },
      frontendEnvPrefix: 'PUBLIC_',
      frontendEnvWritten: false,
      studioEnvWritten: true,
    })
    expect(mockCreateFrontend).not.toHaveBeenCalled()
  })

  test('returns a typed recovery when frontend creation fails', async () => {
    const {FrontendScaffoldError} = await import('../createFrontend.js')
    mockCreateFrontend.mockRejectedValue(new FrontendScaffoldError('create-next-app failed'))

    await expect(scaffoldProject(options)).resolves.toMatchObject({
      frontendCreationError: 'create-next-app failed',
      frontendEnvWritten: false,
      studioEnvWritten: true,
    })
  })

  test('returns typed env and dependency recovery states', async () => {
    const {FrontendScaffoldError} = await import('../createFrontend.js')
    mockAppendEnvValues
      .mockReturnValueOnce({created: false, skippedKeys: ['SANITY_AUTH_TOKEN'], wroteKeys: []})
      .mockReturnValueOnce({
        created: false,
        skippedKeys: ['NEXT_PUBLIC_SANITY_PROJECT_ID'],
        wroteKeys: [],
      })
    mockInstallFrontendDeps.mockRejectedValue(new FrontendScaffoldError('next-sanity failed'))

    await expect(scaffoldProject(options)).resolves.toMatchObject({
      frontendDependenciesInstalled: false,
      frontendDependencyError: 'next-sanity failed',
      frontendEnvWritten: false,
      studioEnvWritten: false,
    })
  })

  test('reports next-sanity as pending when package installation is manual', async () => {
    mockResolvePackageManager.mockResolvedValue('manual')

    await expect(scaffoldProject(options)).resolves.toMatchObject({
      frontendDependenciesInstalled: false,
      frontendPackageManager: 'manual',
    })
    expect(mockInstallFrontendDeps).not.toHaveBeenCalled()
  })
})

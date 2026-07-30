import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {isStudioScaffoldTargetAvailable, scaffoldProject} from '../scaffoldProject.js'

const mockWriteFileSync = vi.hoisted(() => vi.fn())
const mockDetectFrameworkRecord = vi.hoisted(() => vi.fn())
const mockDirIsEmptyOrNonExistent = vi.hoisted(() => vi.fn())
const mockGetProjectDefaults = vi.hoisted(() => vi.fn())
const mockInitStudio = vi.hoisted(() => vi.fn())
const mockResolvePackageManager = vi.hoisted(() => vi.fn())
const mockCreateFrontend = vi.hoisted(() => vi.fn())
const mockInstallFrontendDeps = vi.hoisted(() => vi.fn())

vi.mock('node:fs', () => ({writeFileSync: mockWriteFileSync}))
vi.mock('../../../util/detectFramework.js', () => ({
  detectFrameworkRecord: mockDetectFrameworkRecord,
}))
vi.mock('../../../util/dirIsEmptyOrNonExistent.js', () => ({
  dirIsEmptyOrNonExistent: mockDirIsEmptyOrNonExistent,
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
const envContents = [
  '# Added by `sanity new`. Keep this file out of git: it holds a live project token.',
  'SANITY_AUTH_TOKEN="sk-token"',
  'SANITY_DATASET="production"',
  'SANITY_PROJECT_ID="abc123"',
  '',
].join('\n')

beforeEach(() => {
  vi.clearAllMocks()
  mockDetectFrameworkRecord.mockResolvedValue(undefined)
  mockDirIsEmptyOrNonExistent.mockResolvedValue(true)
  mockGetProjectDefaults.mockResolvedValue({projectName: 'My Project'})
  mockInitStudio.mockResolvedValue(undefined)
  mockResolvePackageManager.mockResolvedValue('npm')
  mockCreateFrontend.mockResolvedValue(undefined)
  mockInstallFrontendDeps.mockResolvedValue(undefined)
})

describe('scaffoldProject', () => {
  test('treats an existing Studio file as unavailable', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'sanity-new-'))

    try {
      await writeFile(path.join(workDir, 'sanity'), 'not a directory')

      await expect(isStudioScaffoldTargetAvailable(workDir)).resolves.toBe(false)
      expect(mockDirIsEmptyOrNonExistent).not.toHaveBeenCalled()
    } finally {
      await rm(workDir, {force: true, recursive: true})
    }
  })

  test('refuses a non-empty Studio target before writing files', async () => {
    mockDirIsEmptyOrNonExistent.mockResolvedValue(false)

    await expect(scaffoldProject(options)).rejects.toThrow('./sanity is not an empty directory')

    expect(mockInitStudio).not.toHaveBeenCalled()
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  test('creates a Studio and Next.js frontend with identical env files', async () => {
    await expect(scaffoldProject(options)).resolves.toMatchObject({
      frontendDependenciesInstalled: true,
      frontendPackageManager: 'npm',
      frontendPath: path.join(options.workDir, 'web'),
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
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(options.workDir, 'sanity', '.env.local'),
      envContents,
      'utf8',
    )
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(options.workDir, 'web', '.env.local'),
      envContents,
      'utf8',
    )
  })

  test('leaves a detected frontend unchanged', async () => {
    mockDetectFrameworkRecord.mockResolvedValue({
      name: 'Nuxt',
      slug: 'nuxtjs',
    })

    await expect(scaffoldProject(options)).resolves.toMatchObject({
      detectedFramework: 'Nuxt',
      studioPath: path.join(options.workDir, 'sanity'),
    })
    expect(mockCreateFrontend).not.toHaveBeenCalled()
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1)
  })

  test('returns a typed recovery when frontend creation fails', async () => {
    const {FrontendScaffoldError} = await import('../createFrontend.js')
    mockCreateFrontend.mockRejectedValue(new FrontendScaffoldError('create-next-app failed'))

    await expect(scaffoldProject(options)).resolves.toMatchObject({
      frontendCreationError: 'create-next-app failed',
      frontendPackageManager: 'npm',
    })
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1)
  })

  test('returns a typed dependency recovery state', async () => {
    const {FrontendScaffoldError} = await import('../createFrontend.js')
    mockInstallFrontendDeps.mockRejectedValue(new FrontendScaffoldError('next-sanity failed'))

    await expect(scaffoldProject(options)).resolves.toMatchObject({
      frontendDependenciesInstalled: false,
      frontendDependencyError: 'next-sanity failed',
    })
  })

  test('reports a Studio env write failure after Studio scaffolding', async () => {
    mockWriteFileSync.mockImplementationOnce(() => {
      throw new Error('read-only filesystem')
    })

    await expect(scaffoldProject(options)).rejects.toThrow(
      'Studio scaffold completed, but writing ./sanity/.env.local failed: read-only filesystem',
    )
    expect(mockCreateFrontend).not.toHaveBeenCalled()
  })

  test('reports a website env write failure after website scaffolding', async () => {
    mockWriteFileSync
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('read-only filesystem')
      })

    await expect(scaffoldProject(options)).rejects.toThrow(
      'Website scaffold completed, but writing ./web/.env.local failed: read-only filesystem',
    )
    expect(mockCreateFrontend).toHaveBeenCalled()
    expect(mockInstallFrontendDeps).not.toHaveBeenCalled()
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

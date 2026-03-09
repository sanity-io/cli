import {type Output} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {bootstrapRemoteTemplate} from '../bootstrapRemoteTemplate.js'

const mocks = vi.hoisted(() => ({
  applyEnvVariables: vi.fn(),
  checkIfNeedsApiToken: vi.fn(),
  createCorsOrigin: vi.fn(),
  createToken: vi.fn(),
  detectFrameworkRecord: vi.fn(),
  downloadAndExtractRepo: vi.fn(),
  getDefaultPortForFramework: vi.fn(),
  getGitHubRawContentUrl: vi.fn(),
  getMonoRepo: vi.fn(),
  mkdir: vi.fn(),
  spinner: vi.fn(),
  tryApplyPackageName: vi.fn(),
  tryGitInit: vi.fn(),
  updateInitialTemplateMetadata: vi.fn(),
  validateTemplate: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({mkdir: mocks.mkdir}))

vi.mock('@sanity/template-validator', () => ({
  getMonoRepo: mocks.getMonoRepo,
  GitHubFileReader: vi.fn(),
  validateTemplate: mocks.validateTemplate,
}))

vi.mock('@vercel/frameworks', () => ({frameworks: []}))

vi.mock('@vercel/fs-detectors', () => ({
  detectFrameworkRecord: mocks.detectFrameworkRecord,
  LocalFileSystemDetector: vi.fn(),
}))

vi.mock('@sanity/cli-core/ux', () => ({
  logSymbols: {success: '✔'},
  spinner: mocks.spinner,
}))

vi.mock('../../../services/cors.js', () => ({createCorsOrigin: mocks.createCorsOrigin}))
vi.mock('../../../services/tokens.js', () => ({createToken: mocks.createToken}))
vi.mock('../../../util/frameworkPort.js', () => ({
  getDefaultPortForFramework: mocks.getDefaultPortForFramework,
}))

vi.mock('../remoteTemplate.js', () => ({
  applyEnvVariables: mocks.applyEnvVariables,
  checkIfNeedsApiToken: mocks.checkIfNeedsApiToken,
  downloadAndExtractRepo: mocks.downloadAndExtractRepo,
  getGitHubRawContentUrl: mocks.getGitHubRawContentUrl,
  tryApplyPackageName: mocks.tryApplyPackageName,
}))

vi.mock('../git.js', () => ({tryGitInit: mocks.tryGitInit}))

vi.mock('../updateInitialTemplateMetadata.js', () => ({
  updateInitialTemplateMetadata: mocks.updateInitialTemplateMetadata,
}))

const mockOutput = {log: vi.fn()} as unknown as Output

const baseOpts = {
  output: mockOutput,
  outputPath: '/tmp/test-bootstrap',
  packageName: 'test-project',
  repoInfo: {
    branch: 'main',
    filePath: '',
    name: 'test-template',
    username: 'sanity-io',
  },
  variables: {
    autoUpdates: false,
    dataset: 'production',
    projectId: 'test-project-id',
  },
}

describe('bootstrapRemoteTemplate', () => {
  beforeEach(() => {
    mocks.applyEnvVariables.mockResolvedValue(undefined)
    mocks.checkIfNeedsApiToken.mockResolvedValue(false)
    mocks.createCorsOrigin.mockResolvedValue({})
    mocks.createToken.mockResolvedValue({key: 'test-token'})
    mocks.detectFrameworkRecord.mockResolvedValue(null)
    mocks.downloadAndExtractRepo.mockResolvedValue(undefined)
    mocks.getDefaultPortForFramework.mockReturnValue(3000)
    mocks.getGitHubRawContentUrl.mockReturnValue(
      'https://raw.githubusercontent.com/sanity-io/test-template/main/',
    )
    mocks.getMonoRepo.mockResolvedValue(null)
    mocks.mkdir.mockResolvedValue(undefined)
    mocks.spinner.mockReturnValue({start: vi.fn().mockReturnThis(), succeed: vi.fn()})
    mocks.tryApplyPackageName.mockResolvedValue(undefined)
    mocks.updateInitialTemplateMetadata.mockResolvedValue(undefined)
    mocks.validateTemplate.mockResolvedValue({isValid: true})
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('CORS origin setup', () => {
    test('adds CORS origin for a framework port that is not the Sanity default (3333)', async () => {
      await bootstrapRemoteTemplate(baseOpts)

      expect(mocks.createCorsOrigin).toHaveBeenCalledOnce()
      expect(mocks.createCorsOrigin).toHaveBeenCalledWith({
        allowCredentials: true,
        origin: 'http://localhost:3000',
        projectId: 'test-project-id',
      })
    })

    test('does not add CORS origin for the Sanity default port (3333)', async () => {
      mocks.getDefaultPortForFramework.mockReturnValue(3333)

      await bootstrapRemoteTemplate(baseOpts)

      expect(mocks.createCorsOrigin).not.toHaveBeenCalled()
    })

    test('does not add CORS origin twice when multiple packages resolve to the same port', async () => {
      mocks.getMonoRepo.mockResolvedValue(['app', 'studio'])
      mocks.getDefaultPortForFramework.mockReturnValue(3000)

      await bootstrapRemoteTemplate(baseOpts)

      expect(mocks.createCorsOrigin).toHaveBeenCalledOnce()
    })

    test('adds distinct CORS origins for packages on different ports', async () => {
      mocks.getMonoRepo.mockResolvedValue(['frontend', 'backend'])
      mocks.getDefaultPortForFramework
        .mockReturnValueOnce(3000) // frontend
        .mockReturnValueOnce(8080) // backend

      await bootstrapRemoteTemplate(baseOpts)

      expect(mocks.createCorsOrigin).toHaveBeenCalledTimes(2)
      expect(mocks.createCorsOrigin).toHaveBeenCalledWith(
        expect.objectContaining({origin: 'http://localhost:3000'}),
      )
      expect(mocks.createCorsOrigin).toHaveBeenCalledWith(
        expect.objectContaining({origin: 'http://localhost:8080'}),
      )
    })

    test('logs newly added CORS origins but not the pre-seeded default port', async () => {
      await bootstrapRemoteTemplate(baseOpts)

      const logCalls = vi.mocked(mockOutput.log).mock.calls.flat()
      expect(logCalls.some((msg) => msg.includes('localhost:3000'))).toBe(true)
      expect(logCalls.some((msg) => msg.includes('localhost:3333'))).toBe(false)
    })

    test('logs nothing for CORS when the only port is the pre-seeded default (3333)', async () => {
      mocks.getDefaultPortForFramework.mockReturnValue(3333)

      await bootstrapRemoteTemplate(baseOpts)

      const logCalls = vi.mocked(mockOutput.log).mock.calls.flat()
      expect(logCalls.some((msg) => msg.includes('CORS origins added'))).toBe(false)
    })
  })

  describe('template validation', () => {
    test('throws when the remote template fails validation', async () => {
      mocks.validateTemplate.mockResolvedValueOnce({
        errors: ['Missing sanity.config.ts', 'Missing package.json'],
        isValid: false,
      })

      await expect(bootstrapRemoteTemplate(baseOpts)).rejects.toThrow(
        'Missing sanity.config.ts\nMissing package.json',
      )
    })

    test('does not proceed to download when validation fails', async () => {
      mocks.validateTemplate.mockResolvedValueOnce({
        errors: ['Missing sanity.config.ts'],
        isValid: false,
      })

      await expect(bootstrapRemoteTemplate(baseOpts)).rejects.toThrow()

      expect(mocks.downloadAndExtractRepo).not.toHaveBeenCalled()
    })
  })

  describe('API token creation', () => {
    test('creates a read token when the template requires one', async () => {
      mocks.checkIfNeedsApiToken.mockImplementation((_path: string, type: string) =>
        Promise.resolve(type === 'read'),
      )

      await bootstrapRemoteTemplate(baseOpts)

      expect(mocks.createToken).toHaveBeenCalledOnce()
      expect(mocks.createToken).toHaveBeenCalledWith(expect.objectContaining({roleName: 'viewer'}))
    })

    test('creates a write token when the template requires one', async () => {
      mocks.checkIfNeedsApiToken.mockImplementation((_path: string, type: string) =>
        Promise.resolve(type === 'write'),
      )

      await bootstrapRemoteTemplate(baseOpts)

      expect(mocks.createToken).toHaveBeenCalledOnce()
      expect(mocks.createToken).toHaveBeenCalledWith(expect.objectContaining({roleName: 'editor'}))
    })

    test('does not create any tokens when the template requires none', async () => {
      await bootstrapRemoteTemplate(baseOpts)

      expect(mocks.createToken).not.toHaveBeenCalled()
    })
  })
})

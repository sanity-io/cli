import {type Output} from '@sanity/cli-core'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {bootstrapRemoteTemplate} from '../bootstrapRemoteTemplate.js'

const mocks = vi.hoisted(() => ({
  applyEnvVariables: vi.fn().mockResolvedValue(undefined),
  checkIfNeedsApiToken: vi.fn().mockResolvedValue(false),
  createCorsOrigin: vi.fn().mockResolvedValue({}),
  createToken: vi.fn().mockResolvedValue({key: 'test-token'}),
  detectFrameworkRecord: vi.fn().mockResolvedValue(null),
  downloadAndExtractRepo: vi.fn().mockResolvedValue(undefined),
  getDefaultPortForFramework: vi.fn(),
  getGitHubRawContentUrl: vi
    .fn()
    .mockReturnValue('https://raw.githubusercontent.com/sanity-io/test-template/main/'),
  getMonoRepo: vi.fn().mockResolvedValue(null),
  tryApplyPackageName: vi.fn().mockResolvedValue(undefined),
  tryGitInit: vi.fn(),
  updateInitialTemplateMetadata: vi.fn().mockResolvedValue(undefined),
  validateTemplate: vi.fn().mockResolvedValue({isValid: true}),
}))

vi.mock('node:fs/promises', () => ({mkdir: vi.fn().mockResolvedValue(undefined)}))

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
  spinner: vi.fn().mockReturnValue({start: vi.fn().mockReturnThis(), succeed: vi.fn()}),
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
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('CORS origin setup', () => {
    test('adds CORS origin for a framework port that is not the Sanity default (3333)', async () => {
      mocks.getDefaultPortForFramework.mockReturnValue(3000)

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
      mocks.getDefaultPortForFramework.mockReturnValue(3000)

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
      mocks.getDefaultPortForFramework.mockReturnValue(3000)

      await bootstrapRemoteTemplate(baseOpts)

      expect(mocks.createToken).toHaveBeenCalledOnce()
      expect(mocks.createToken).toHaveBeenCalledWith(expect.objectContaining({roleName: 'viewer'}))
    })

    test('creates a write token when the template requires one', async () => {
      mocks.checkIfNeedsApiToken.mockImplementation((_path: string, type: string) =>
        Promise.resolve(type === 'write'),
      )
      mocks.getDefaultPortForFramework.mockReturnValue(3000)

      await bootstrapRemoteTemplate(baseOpts)

      expect(mocks.createToken).toHaveBeenCalledOnce()
      expect(mocks.createToken).toHaveBeenCalledWith(expect.objectContaining({roleName: 'editor'}))
    })

    test('does not create any tokens when the template requires none', async () => {
      mocks.checkIfNeedsApiToken.mockResolvedValue(false)
      mocks.getDefaultPortForFramework.mockReturnValue(3000)

      await bootstrapRemoteTemplate(baseOpts)

      expect(mocks.createToken).not.toHaveBeenCalled()
    })
  })
})

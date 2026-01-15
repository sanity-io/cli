import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {InitCommand} from '../../init'
import {ORGANIZATIONS_API_VERSION} from '../../../services/organizations'
import {PROJECT_FEATURES_API_VERSION} from '../../../services/getProjectFeatures'
import {PROJECTS_API_VERSION} from '../../../services/projects'

const mocks = vi.hoisted(() => ({
  bootstrapTemplate: vi.fn(),
  checkNextJsReactCompatibility: vi.fn(),
  confirm: vi.fn(),
  execa: vi.fn(),
  existsSync: vi.fn(),
  input: vi.fn(),
  installDeclaredPackages: vi.fn(),
  resolvePackageManager: vi.fn(),
  select: vi.fn(),
  setupEnvFile: vi.fn(),
  setupMCP: vi.fn(),
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()

  const globalTestClient = createTestClient({
    apiVersion: 'v2025-05-14',
    token: 'test-token',
  })

  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      projects: {
        list: vi
          .fn()
          .mockResolvedValue([
            {createdAt: '2024-01-01T00:00:00Z', displayName: 'Test', id: 'test'},
          ]),
      },
      request: globalTestClient.request,
      users: {
        getById: vi.fn().mockResolvedValue({
          email: 'test@example.com',
          id: 'user-123',
          name: 'Test User',
          provider: 'saml-123',
        }),
      } as never,
    }),
    getProjectCliClient: vi.fn().mockImplementation(async (options) => {
      const client = createTestClient({
        apiVersion: options.apiVersion,
        token: 'test-token',
      })

      return {
        datasets: {
          list: vi.fn().mockResolvedValue([{aclMode: 'public', name: 'test'}]),
        },
        request: client.request,
      }
    }),
  }
})

vi.mock('execa', () => ({
  execa: mocks.execa,
}))

vi.mock('node:fs', () => ({
  existsSync: mocks.existsSync,
}))

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual('@sanity/cli-core/ux')
  return {
    ...actual,
    confirm: mocks.confirm,
    input: mocks.input,
    select: mocks.select,
  }
})

vi.mock('@vercel/fs-detectors', () => ({
  detectFrameworkRecord: vi.fn().mockResolvedValue({
    name: 'Next.js',
    slug: 'nextjs',
  }),
  LocalFileSystemDetector: vi.fn(),
}))

vi.mock('../../../util/getProjectDefaults.js', () => ({
  getProjectDefaults: vi.fn().mockResolvedValue({
    author: undefined,
    description: '',
    gitRemote: '',
    license: 'UNLICENSED',
    projectName: 'test-project',
  }),
}))

vi.mock('../../../actions/init/setupMCP.js', () => ({
  setupMCP: vi.fn().mockResolvedValue({
    configuredEditors: [],
    detectedEditors: [],
    error: undefined,
    skipped: false,
  }),
}))

vi.mock('../../../actions/init/checkNextJsReactCompatibility.js', () => ({
  checkNextJsReactCompatibility: mocks.checkNextJsReactCompatibility.mockResolvedValue(undefined),
}))

vi.mock('../../../util/packageManager/installPackages.js', () => ({
  installDeclaredPackages: mocks.installDeclaredPackages.mockResolvedValue(undefined),
}))

vi.mock('../../../actions/init/setupEnvFile.js', () => ({
  setupEnvFile: mocks.setupEnvFile,
}))

const setupInitSuccessMocks = () => {
  mockApi({
    apiVersion: ORGANIZATIONS_API_VERSION,
    method: 'get',
    uri: '/organizations',
  }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

  mockApi({
    apiVersion: PROJECT_FEATURES_API_VERSION,
    method: 'get',
    uri: '/features',
  }).reply(200, ['privateDataset'])
}

const defaultMocks = {
  projectRoot: {
    directory: '/test/work/dir',
    path: '/test/work/dir',
    type: 'studio' as const,
  },
  token: 'test-token',
}

mocks.setupEnvFile.mockResolvedValue(undefined)

describe('#init:nextjs-app-initialization', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })
  test('initializes nextjs app', async () => {
    // mock prompt for nextjs-add-config-files to be true
    // mock prompt for nextjs-append-env to be true
    // mock prompt for typescript to be true
    // mock prompt nextjs-embed-studio to be true
    // mock prompt for studio path
    // mock prompt overwite files to be true twice
    // // mock prompt template to be clean

    setupInitSuccessMocks()

    // Mock prompts
    mocks.confirm.mockResolvedValueOnce(true) // nextjs-add-config-files
    mocks.confirm.mockResolvedValueOnce(true) // nextjs-append-env
    mocks.confirm.mockResolvedValueOnce(true) // nextjs-embed-studio
    mocks.input.mockResolvedValueOnce('/studio') // studio path
    mocks.confirm.mockResolvedValueOnce(true) // overwrite file 1
    mocks.confirm.mockResolvedValueOnce(true) // overwrite file 2
    mocks.select.mockResolvedValueOnce('clean') // template

    const {error, stdout} = await testCommand(
      InitCommand,
      ['--output-path=/test/output', '--project=test', '--dataset=test'],
      {
        mocks: {
          ...defaultMocks,
          isInteractive: true,
        },
      },
    )

    console.log(error)
    console.log('---')
    console.log(stdout)

    expect(mocks.setupEnvFile).toHaveBeenCalledWith({
      datasetName: 'test-dataset',
      detectedFramework: expect.any(Object),
      envFilename: '.env.local',
      isNextJs: true,
      output: expect.any(Object),
      outputPath: expect.any(String),
      projectId: 'test-project',
      workDir: expect.any(String),
    })
  })
})

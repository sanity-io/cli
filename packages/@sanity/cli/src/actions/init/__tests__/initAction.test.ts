import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {createTestClient, mockApi} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {PROJECT_FEATURES_API_VERSION} from '../../../services/getProjectFeatures.js'
import {ORGANIZATIONS_API_VERSION} from '../../../services/organizations.js'
import {CREATE_PROJECT_API_VERSION} from '../../../services/projects.js'
import {initAction} from '../initAction.js'
import {InitError} from '../initError.js'
import {type InitContext, type InitOptions} from '../types.js'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockGetById = vi.hoisted(() => vi.fn())
const mockValidateSession = vi.hoisted(() => vi.fn())
const mockLogin = vi.hoisted(() => vi.fn())

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

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
            {createdAt: '2024-01-01T00:00:00Z', displayName: 'Test Project', id: 'test-project'},
          ]),
      },
      request: globalTestClient.request,
      users: {
        getById: mockGetById,
      } as never,
    }),
    getProjectCliClient: vi.fn().mockImplementation(async (options) => {
      const client = createTestClient({
        apiVersion: options.apiVersion,
        token: 'test-token',
      })

      return {
        datasets: {
          create: vi.fn().mockResolvedValue(undefined),
          list: vi.fn().mockResolvedValue([{aclMode: 'public', name: 'production'}]),
        },
        request: client.request,
      }
    }),
  }
})

vi.mock('../../../util/detectFramework.js', () => ({
  detectFrameworkRecord: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../auth/ensureAuthenticated.js', () => ({
  validateSession: mockValidateSession,
}))

vi.mock('../../auth/login/login.js', () => ({
  login: mockLogin,
}))

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const defaultOptions: InitOptions = {
  autoUpdates: true,
  bare: false,
  datasetDefault: false,
  fromCreate: false,
  mcpMode: 'skip',
  unattended: false,
}

function createTestContext(workDir = '/tmp/test-work-dir'): InitContext {
  return {
    output: {
      // output.error has a `never` return type in the Output interface, but
      // initAction throws InitError instead of calling it directly. A plain
      // vi.fn() satisfies the mock here.
      error: vi.fn() as unknown as InitContext['output']['error'],
      log: vi.fn(),
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
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('initAction (direct)', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('throws InitError for deprecated reconfigure flag', async () => {
    mockValidateSession.mockResolvedValue({
      email: 'test@example.com',
      id: 'user-123',
      name: 'Test User',
      provider: 'google',
    })

    const context = createTestContext()
    const options: InitOptions = {
      ...defaultOptions,
      reconfigure: true,
    }

    let caughtError: unknown
    try {
      await initAction(options, context)
    } catch (error) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(InitError)
    const initError = caughtError as InitError
    expect(initError.message).toBe(
      '--reconfigure is deprecated - manual configuration is now required',
    )
    expect(initError.exitCode).toBe(1)
  })

  test('bare mode outputs project details and returns', async () => {
    mockValidateSession.mockResolvedValue({
      email: 'test@example.com',
      id: 'user-123',
      name: 'Test User',
      provider: 'google',
    })

    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: '/features',
    }).reply(200, ['privateDataset'])

    const context = createTestContext()
    const options: InitOptions = {
      ...defaultOptions,
      bare: true,
      dataset: 'production',
      project: 'test-project',
    }

    await initAction(options, context)

    const logCalls = vi.mocked(context.output.log).mock.calls.map((call) => call[0])
    const combined = logCalls.join('\n')

    expect(combined).toContain('Below are your project details')
    expect(combined).toContain('test-project')
    expect(combined).toContain('production')
  })

  test('throws InitError when not authenticated in unattended mode', async () => {
    mockValidateSession.mockResolvedValue(null)

    const context = createTestContext()
    const options: InitOptions = {
      ...defaultOptions,
      dataset: 'production',
      outputPath: '/tmp/test-output',
      project: 'test-project',
      unattended: true,
    }

    let caughtError: unknown
    try {
      await initAction(options, context)
    } catch (error) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(InitError)
    const initError = caughtError as InitError
    expect(initError.message).toBe(
      'Must be logged in to run this command in unattended mode, run `sanity login`',
    )
    expect(initError.exitCode).toBe(1)
  })

  test('unattended --project-name with single org with attach grant auto-picks org', async () => {
    mockValidateSession.mockResolvedValue({
      email: 'test@example.com',
      id: 'user-123',
      name: 'Test User',
      provider: 'google',
    })

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'Only Org', slug: 'only-org'}])

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations/org-1/grants',
    }).reply(200, {
      'sanity.organization.projects': [{grants: [{name: 'attach'}]}],
    })

    mockApi({
      apiVersion: CREATE_PROJECT_API_VERSION,
      method: 'post',
      uri: '/projects',
    }).reply(200, {displayName: 'My New Project', projectId: 'test-project'})

    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: '/features',
    }).reply(200, ['privateDataset'])

    const context = createTestContext()
    const options: InitOptions = {
      ...defaultOptions,
      bare: true,
      projectName: 'My New Project',
      unattended: true,
    }

    await initAction(options, context)

    const logCalls = vi.mocked(context.output.log).mock.calls.map((call) => call[0])
    const combined = logCalls.join('\n')

    expect(combined).toContain('test-project')
  })

  test('unattended --project-name with zero orgs throws descriptive error pointing to organizations list', async () => {
    mockValidateSession.mockResolvedValue({
      email: 'test@example.com',
      id: 'user-123',
      name: 'Test User',
      provider: 'google',
    })

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [])

    const context = createTestContext()
    const options: InitOptions = {
      ...defaultOptions,
      bare: true,
      projectName: 'My New Project',
      unattended: true,
    }

    let caughtError: unknown
    try {
      await initAction(options, context)
    } catch (error) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(InitError)
    const initError = caughtError as InitError
    expect(initError.message).toContain('No organization found for new project')
    expect(initError.message).toContain('sanity organizations list')
    expect(initError.exitCode).toBe(1)
  })

  test('unattended without --project/--project-name derives projectName from package.json name', async () => {
    mockValidateSession.mockResolvedValue({
      email: 'test@example.com',
      id: 'user-123',
      name: 'Test User',
      provider: 'google',
    })

    const tmpDir = mkdtempSync(path.join(tmpdir(), 'sanity-init-test-'))
    writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'my-pkg-name', version: '1.0.0'}),
    )

    try {
      mockApi({
        apiVersion: ORGANIZATIONS_API_VERSION,
        uri: '/organizations',
      }).reply(200, [{id: 'org-1', name: 'Only Org', slug: 'only-org'}])

      mockApi({
        apiVersion: ORGANIZATIONS_API_VERSION,
        uri: '/organizations/org-1/grants',
      }).reply(200, {
        'sanity.organization.projects': [{grants: [{name: 'attach'}]}],
      })

      mockApi({
        apiVersion: CREATE_PROJECT_API_VERSION,
        method: 'post',
        uri: '/projects',
      }).reply(200, (_uri, body: Record<string, unknown>) => {
        expect(body.displayName).toBe('my-pkg-name')
        return {displayName: 'my-pkg-name', projectId: 'test-project'}
      })

      mockApi({
        apiVersion: PROJECT_FEATURES_API_VERSION,
        method: 'get',
        uri: '/features',
      }).reply(200, ['privateDataset'])

      const context = createTestContext(tmpDir)
      const options: InitOptions = {
        ...defaultOptions,
        bare: true,
        unattended: true,
      }

      await initAction(options, context)
    } finally {
      rmSync(tmpDir, {force: true, recursive: true})
    }
  })

  test('unattended without --project/--project-name and no package.json derives projectName from basename(cwd)', async () => {
    mockValidateSession.mockResolvedValue({
      email: 'test@example.com',
      id: 'user-123',
      name: 'Test User',
      provider: 'google',
    })

    const tmpDir = mkdtempSync(path.join(tmpdir(), 'my-folder-name-'))
    const expectedName = path.basename(tmpDir)

    try {
      mockApi({
        apiVersion: ORGANIZATIONS_API_VERSION,
        uri: '/organizations',
      }).reply(200, [{id: 'org-1', name: 'Only Org', slug: 'only-org'}])

      mockApi({
        apiVersion: ORGANIZATIONS_API_VERSION,
        uri: '/organizations/org-1/grants',
      }).reply(200, {
        'sanity.organization.projects': [{grants: [{name: 'attach'}]}],
      })

      mockApi({
        apiVersion: CREATE_PROJECT_API_VERSION,
        method: 'post',
        uri: '/projects',
      }).reply(200, (_uri, body: Record<string, unknown>) => {
        expect(body.displayName).toBe(expectedName)
        return {displayName: expectedName, projectId: 'test-project'}
      })

      mockApi({
        apiVersion: PROJECT_FEATURES_API_VERSION,
        method: 'get',
        uri: '/features',
      }).reply(200, ['privateDataset'])

      const context = createTestContext(tmpDir)
      const options: InitOptions = {
        ...defaultOptions,
        bare: true,
        unattended: true,
      }

      await initAction(options, context)
    } finally {
      rmSync(tmpDir, {force: true, recursive: true})
    }
  })
})

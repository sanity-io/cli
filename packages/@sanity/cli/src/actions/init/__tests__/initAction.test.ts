import {createTestClient, mockApi} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {PROJECT_FEATURES_API_VERSION} from '../../../services/getProjectFeatures.js'
import {initAction} from '../initAction.js'
import {InitError} from '../initError.js'
import {type InitContext, type InitOptions} from '../types.js'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockGetById = vi.hoisted(() => vi.fn())
const mockValidateSession = vi.hoisted(() => vi.fn())
const mockLogin = vi.hoisted(() => vi.fn())
const mockReadEnvValues = vi.hoisted(() => vi.fn(() => ({}) as Record<string, string>))
const mockGetMintedProjectRecord = vi.hoisted(() => vi.fn())

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

vi.mock('../../../util/envFile.js', () => ({
  GUARDED_ENV_KEYS: ['SANITY_AUTH_TOKEN', 'SANITY_PROJECT_ID', 'SANITY_CLAIM_URL'],
  readEnvValues: mockReadEnvValues,
}))

vi.mock('../../../util/claimNudges.js', () => ({
  getMintedProjectRecord: mockGetMintedProjectRecord,
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
  skillsMode: 'skip',
  unattended: false,
}

function createTestContext(): InitContext {
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
    workDir: '/tmp/test-work-dir',
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
    expect(initError.message).toContain('Not logged in. Run `sanity login` to authenticate')
    expect(initError.message).toContain('run `sanity new` to create a project without logging in')
    expect(initError.exitCode).toBe(1)
  })

  test('unattended not-logged-in in a minted directory points at its token, not `sanity new`', async () => {
    mockValidateSession.mockResolvedValue(null)
    mockReadEnvValues.mockReturnValue({SANITY_PROJECT_ID: 'abc123'})
    // A ledger record is what marks this as a known unclaimed mint.
    mockGetMintedProjectRecord.mockReturnValue({projectId: 'abc123'})

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

    const initError = caughtError as InitError
    expect(initError.message).toContain('unclaimed Sanity project (abc123)')
    expect(initError.message).toContain('Set SANITY_AUTH_TOKEN')
    expect(initError.message).not.toContain('run `sanity new`')
  })

  test('unattended not-logged-in with guarded .env keys but no ledger record: no mislabel, no sanity new', async () => {
    // `sanity init --env` also writes SANITY_PROJECT_ID and it survives a claim, so a bare id with
    // no ledger record must not be mislabeled an unclaimed mint — and since `sanity new` is still
    // refused here (guarded key present), it must not be suggested either.
    mockValidateSession.mockResolvedValue(null)
    mockReadEnvValues.mockReturnValue({SANITY_PROJECT_ID: 'claimedproj'})
    mockGetMintedProjectRecord.mockReturnValue(undefined)

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

    const initError = caughtError as InitError
    expect(initError.message).toContain('already has Sanity credentials in .env')
    expect(initError.message).not.toContain('unclaimed Sanity project (claimedproj)')
    expect(initError.message).not.toContain('sanity new')
  })

  test('greets a robot-token session as a project token, not "logged in as null"', async () => {
    // A minted project's robot token authenticates but has no display name.
    mockValidateSession.mockResolvedValue({
      email: '',
      id: 'robot',
      name: '',
      provider: 'sanity-token',
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

    const combined = vi
      .mocked(context.output.log)
      .mock.calls.map((call) => call[0])
      .join('\n')
    expect(combined).toContain('Authenticated with a project token')
    expect(combined).not.toContain('logged in as')
  })

  test('suppresses the "two ways to start" banner in a minted directory', async () => {
    // `sanity new` is refused by the remint guard in a minted directory, so its banner would
    // steer the user toward a dead end — mirror the unattended path, which already special-cases it.
    mockValidateSession.mockResolvedValue(null)
    mockReadEnvValues.mockReturnValue({SANITY_PROJECT_ID: 'abc123'})
    mockGetMintedProjectRecord.mockReturnValue({projectId: 'abc123'})
    // The banner renders before login(); reject there to stop before the networked getCliUser.
    mockLogin.mockRejectedValueOnce(new Error('stop'))

    const context = createTestContext()
    await initAction(
      {...defaultOptions, dataset: 'production', project: 'test-project'},
      context,
    ).catch(() => {})

    const combined = vi
      .mocked(context.output.log)
      .mock.calls.map((call) => call[0])
      .join('\n')
    expect(combined).not.toContain('Two ways to start')
  })

  test('suppresses the banner when .env has guarded keys but no ledger record (still remint-blocked)', async () => {
    // A copied minted directory or an `init --env` leftover: no ledger record, but `sanity new` is
    // still refused because guarded keys are present — so the banner must stay suppressed.
    mockValidateSession.mockResolvedValue(null)
    mockReadEnvValues.mockReturnValue({SANITY_PROJECT_ID: 'copied-or-claimed'})
    mockGetMintedProjectRecord.mockReturnValue(undefined)
    mockLogin.mockRejectedValueOnce(new Error('stop'))

    const context = createTestContext()
    await initAction(
      {...defaultOptions, dataset: 'production', project: 'test-project'},
      context,
    ).catch(() => {})

    const combined = vi
      .mocked(context.output.log)
      .mock.calls.map((call) => call[0])
      .join('\n')
    expect(combined).not.toContain('Two ways to start')
  })

  test('shows the "two ways to start" banner when the directory has no minted project', async () => {
    mockValidateSession.mockResolvedValue(null)
    mockReadEnvValues.mockReturnValue({})
    mockGetMintedProjectRecord.mockReturnValue(undefined)
    mockLogin.mockRejectedValueOnce(new Error('stop'))

    const context = createTestContext()
    await initAction(
      {...defaultOptions, dataset: 'production', project: 'test-project'},
      context,
    ).catch(() => {})

    const combined = vi
      .mocked(context.output.log)
      .mock.calls.map((call) => call[0])
      .join('\n')
    expect(combined).toContain('Two ways to start')
  })
})

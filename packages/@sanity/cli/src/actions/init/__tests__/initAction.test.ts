import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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
const mockInspectEnvKeys = vi.hoisted(() =>
  vi.fn<
    (
      _envPath: string,
      _keys: readonly string[],
    ) => {
      blankKeys: string[]
      presentKeys: string[]
      values: Partial<Record<string, string>>
    }
  >(() => ({blankKeys: [], presentKeys: [], values: {}})),
)
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

vi.mock('../../../util/envFile.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../util/envFile.js')>()),
  inspectEnvKeys: mockInspectEnvKeys,
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

async function useMintedDescendant(options: {unreadable?: boolean} = {}): Promise<() => void> {
  const mintRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sanity-init-minted-root-'))
  const descendant = path.join(mintRoot, 'web')
  fs.mkdirSync(descendant)
  const envPath = path.join(mintRoot, '.env')
  if (options.unreadable) {
    fs.mkdirSync(envPath)
  } else {
    fs.writeFileSync(envPath, 'SANITY_PROJECT_ID="abc123"\n')
  }
  const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(descendant)
  if (!options.unreadable) {
    const {inspectEnvKeys} = await vi.importActual<typeof import('../../../util/envFile.js')>(
      '../../../util/envFile.js',
    )
    mockInspectEnvKeys.mockImplementation(inspectEnvKeys)
  }

  return () => {
    mockInspectEnvKeys.mockImplementation(() => ({blankKeys: [], presentKeys: [], values: {}}))
    cwdSpy.mockRestore()
    fs.rmSync(mintRoot, {force: true, recursive: true})
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
    expect(initError.message).toContain('To create a project without logging in, run `sanity new`')
    expect(initError.message).toContain('https://sanity.new')
    expect(initError.exitCode).toBe(1)
  })

  test('unattended not-logged-in in a minted directory points at its token, not `sanity new`', async () => {
    mockValidateSession.mockResolvedValue(null)
    mockInspectEnvKeys.mockReturnValue({
      blankKeys: [],
      presentKeys: ['SANITY_PROJECT_ID'],
      values: {SANITY_PROJECT_ID: 'abc123'},
    })
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

  test('unattended not-logged-in in a minted descendant keeps the mint-root guidance', async () => {
    const cleanup = await useMintedDescendant()
    mockValidateSession.mockResolvedValue(null)
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
    } finally {
      cleanup()
    }

    const initError = caughtError as InitError
    expect(initError.message).toContain('unclaimed Sanity project (abc123)')
    expect(initError.message).toContain('Set SANITY_AUTH_TOKEN')
    expect(initError.message).not.toContain('run `sanity new`')
  })

  test('unattended reports an unreadable ancestor credential boundary without suggesting a remint', async () => {
    const cleanup = await useMintedDescendant({unreadable: true})
    mockValidateSession.mockResolvedValue(null)

    const context = createTestContext()
    let caughtError: unknown
    try {
      await initAction(
        {
          ...defaultOptions,
          dataset: 'production',
          outputPath: '/tmp/test-output',
          project: 'test-project',
          unattended: true,
        },
        context,
      )
    } catch (error) {
      caughtError = error
    } finally {
      cleanup()
    }

    expect(caughtError).toBeInstanceOf(InitError)
    const initError = caughtError as InitError
    expect(initError.message).toContain('Could not inspect the Sanity credential boundary')
    expect(initError.message).toContain('Ensure ancestor .env files are readable regular files')
    expect(initError.message).not.toContain('sanity new')
    expect(initError.exitCode).toBe(1)
  })

  test('interactive warns on an unreadable ancestor boundary, suppresses the remint banner, and logs in', async () => {
    const cleanup = await useMintedDescendant({unreadable: true})
    mockValidateSession.mockResolvedValue(null)
    mockLogin.mockRejectedValueOnce(new Error('stop'))

    const context = createTestContext()
    try {
      await expect(
        initAction({...defaultOptions, dataset: 'production', project: 'test-project'}, context),
      ).rejects.toThrow('Login failed: stop')
    } finally {
      cleanup()
    }

    const warnings = vi
      .mocked(context.output.warn)
      .mock.calls.map((call) => call[0])
      .join('\n')
    const logged = vi
      .mocked(context.output.log)
      .mock.calls.map((call) => call[0])
      .join('\n')
    expect(warnings).toContain('Could not inspect the Sanity credential boundary')
    expect(warnings).toContain('Ensure ancestor .env files are readable regular files')
    expect(logged).not.toContain('Two ways to start')
    expect(mockLogin).toHaveBeenCalledOnce()
  })

  test('unattended not-logged-in with guarded .env keys but no ledger record: no mislabel, no sanity new', async () => {
    // `sanity init --env` also writes SANITY_PROJECT_ID and it survives a claim, so a bare id with
    // no ledger record must not be mislabeled an unclaimed mint — and since `sanity new` is still
    // refused here (guarded key present), it must not be suggested either.
    mockValidateSession.mockResolvedValue(null)
    mockInspectEnvKeys.mockReturnValue({
      blankKeys: [],
      presentKeys: ['SANITY_PROJECT_ID'],
      values: {SANITY_PROJECT_ID: 'claimedproj'},
    })
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

  test('unattended not-logged-in with blank guarded placeholders explains how to unblock', async () => {
    mockValidateSession.mockResolvedValue(null)
    mockInspectEnvKeys.mockReturnValue({
      blankKeys: ['SANITY_PROJECT_ID', 'SANITY_AUTH_TOKEN'],
      presentKeys: ['SANITY_PROJECT_ID', 'SANITY_AUTH_TOKEN'],
      values: {},
    })

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
    expect(initError.message).toContain(
      'blank Sanity credential placeholders in .env: SANITY_PROJECT_ID, SANITY_AUTH_TOKEN',
    )
    expect(initError.message).not.toContain('sanity new')
  })

  test('never greets a robot-token session as "logged in as null"', async () => {
    // A minted project's robot token authenticates but has no email to display.
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
    expect(combined).toContain('You are logged in as robot using an API token')
    expect(combined).not.toContain('null')
  })

  test('suppresses the "two ways to start" banner in a minted descendant', async () => {
    // `sanity new` is refused by the remint guard in a minted directory, so its banner would
    // steer the user toward a dead end — mirror the unattended path, which already special-cases it.
    const cleanup = await useMintedDescendant()
    mockValidateSession.mockResolvedValue(null)
    mockGetMintedProjectRecord.mockReturnValue({projectId: 'abc123'})
    // The banner renders before login(); reject there to stop before the networked getCliUser.
    mockLogin.mockRejectedValueOnce(new Error('stop'))

    const context = createTestContext()
    try {
      await initAction(
        {...defaultOptions, dataset: 'production', project: 'test-project'},
        context,
      ).catch(() => {})
    } finally {
      cleanup()
    }

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
    mockInspectEnvKeys.mockReturnValue({
      blankKeys: [],
      presentKeys: ['SANITY_PROJECT_ID'],
      values: {SANITY_PROJECT_ID: 'copied-or-claimed'},
    })
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

  test('suppresses the banner when .env has blank guarded placeholders', async () => {
    mockValidateSession.mockResolvedValue(null)
    mockInspectEnvKeys.mockReturnValue({
      blankKeys: ['SANITY_PROJECT_ID'],
      presentKeys: ['SANITY_PROJECT_ID'],
      values: {},
    })
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
    mockInspectEnvKeys.mockReturnValue({blankKeys: [], presentKeys: [], values: {}})
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

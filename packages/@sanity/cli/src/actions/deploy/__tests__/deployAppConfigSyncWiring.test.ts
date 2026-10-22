/**
 * Wiring tests for the aspect-document sync inside a media-library config
 * deploy (`deployApp` through the real `runDeploy` sequence): the sync runs
 * only after the config itself deployed, a dry run never mutates but reports
 * the sync in the `--json` payload, stale-definition deletion is confirmed
 * interactively, and failures surface with the retry hint and the plan
 * failure's exit code.
 *
 * `planAspectSync` / `applyAspectSync` internals are covered by
 * `../../media/aspectSync/__tests__/` — here they are mocked so the tests pin
 * the deploy orchestration around them.
 */

import {CLIError} from '@oclif/core/errors'
import {type CliConfig, exitCodes, type Output} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {type ResolvedMediaLibraryConfig} from '@sanity/workbench-cli/deploy'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type DeployFlags} from '../types.js'

vi.mock(
  import('@sanity/cli-build/_internal/manifest'),
  () => import('@sanity/cli-test/mocks/cli-build/manifest'),
)
vi.mock('@sanity/cli-core/ux', async () => import('@sanity/cli-test/mocks/cli-core/ux'))

const mockDeployConfig = vi.hoisted(() => vi.fn())
const mockResolveInstallationId = vi.hoisted(() => vi.fn())
const mockResolveWorkbenchConfig = vi.hoisted(() => vi.fn())
vi.mock('@sanity/workbench-cli/deploy', () => ({
  createCoreApp: vi.fn(),
  deployConfig: mockDeployConfig,
  deployWorkbenchApp: vi.fn(),
  getApplicationUrl: vi.fn(),
  getWorkbench: vi.fn(() => null),
  resolveInstallationId: mockResolveInstallationId,
  resolveWorkbenchConfig: mockResolveWorkbenchConfig,
  summarizeConfig: vi.fn(() => 'Media Library config: 2 fields'),
  toWorkbenchPayload: vi.fn(() => ({})),
}))

const mockPlanAspectSync = vi.hoisted(() => vi.fn())
const mockApplyAspectSync = vi.hoisted(() => vi.fn())
vi.mock('../../media/aspectSync/syncAspects.js', () => ({
  applyAspectSync: mockApplyAspectSync,
  planAspectSync: mockPlanAspectSync,
}))

vi.mock('../deployChecks.js', () => ({
  checkAppId: vi.fn(),
  checkAppTarget: vi.fn(),
  checkAutoUpdates: vi.fn(() => false),
  checkBuild: vi.fn(),
  checkPackageVersion: vi.fn(() => Promise.resolve('6.0.0')),
  verifyOutputDir: vi.fn(),
}))

vi.mock('../../build/buildApp.js', () => ({buildApp: vi.fn()}))
vi.mock('../../../services/userApplications.js', () => ({
  createDeployment: vi.fn(),
  updateUserApplication: vi.fn(),
}))

const {deployApp} = await import('../deployApp.js')

/** `output.error({exit})` must abort the flow like the real Output does. */
function mockOutput() {
  return {
    error: vi.fn((message: string, options?: {exit?: number}) => {
      throw new CLIError(message, {exit: options?.exit ?? 1})
    }),
    log: vi.fn(),
    logJson: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
}

// Typed against the real resolver contract: the sync is gated on the
// `appType` discriminator, so a made-up value here would silently test a
// deploy that never syncs.
const CONFIG: ResolvedMediaLibraryConfig = {
  appType: 'media-library',
  fields: [
    {name: 'caption', src: './src/fields/caption.ts', title: 'Caption'},
    {name: 'notes', src: './src/fields/notes.tsx', title: 'Notes'},
  ],
  organizationId: 'org-1',
}

const PLAN = {
  documents: [
    {_id: 'caption', _type: 'sanity.asset.aspect', definition: {}},
    {_id: 'notes', _type: 'sanity.asset.aspect', definition: {}},
  ],
  mediaLibraryId: 'library-1',
  staleIds: [] as string[],
  strippedByField: {},
}

function deployOptions(flags: Partial<DeployFlags>, output: Output) {
  return {
    cliConfig: {app: {organizationId: 'org-1'}} as CliConfig,
    flags: {build: true, 'dry-run': false, json: false, yes: true, ...flags} as DeployFlags,
    output,
    projectRoot: {
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'app' as const,
    },
    sourceDir: '/test/project/dist',
  }
}

describe('deployApp aspect-sync wiring (media-library config)', () => {
  beforeEach(() => {
    mockResolveWorkbenchConfig.mockReturnValue(CONFIG)
    mockResolveInstallationId.mockResolvedValue('installation-1')
    mockPlanAspectSync.mockResolvedValue({plan: PLAN})
    mockDeployConfig.mockResolvedValue(undefined)
    mockApplyAspectSync.mockResolvedValue(undefined)
  })
  afterEach(() => vi.clearAllMocks())

  test('a real deploy applies the sync only after the config deployed', async () => {
    await deployApp(deployOptions({}, mockOutput()))

    expect(mockDeployConfig).toHaveBeenCalledTimes(1)
    expect(mockApplyAspectSync).toHaveBeenCalledTimes(1)
    expect(mockApplyAspectSync).toHaveBeenCalledWith(PLAN)
    expect(mockApplyAspectSync.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockDeployConfig.mock.invocationCallOrder[0],
    )
  })

  test('a config of another appType deploys without the media-library aspect sync', async () => {
    // Forged via cast — the config union has one member today. The sync is
    // gated on the `appType` discriminator, so a future config type must not
    // inherit the aspect sync (and its deletions) just by being a config.
    mockResolveWorkbenchConfig.mockReturnValue({
      ...CONFIG,
      appType: 'another-config',
    } as unknown as ResolvedMediaLibraryConfig)

    await deployApp(deployOptions({}, mockOutput()))

    expect(mockDeployConfig).toHaveBeenCalledTimes(1)
    expect(mockPlanAspectSync).not.toHaveBeenCalled()
    expect(mockApplyAspectSync).not.toHaveBeenCalled()
  })

  test('a dry run reports the sync in the --json payload but never mutates', async () => {
    const output = mockOutput()

    await deployApp(deployOptions({'dry-run': true, json: true}, output))

    expect(mockDeployConfig).not.toHaveBeenCalled()
    expect(mockApplyAspectSync).not.toHaveBeenCalled()
    expect(output.logJson).toHaveBeenCalledWith(
      expect.objectContaining({
        canDeploy: true,
        payload: expect.objectContaining({
          aspectSync: {
            deleteIds: [],
            mediaLibraryId: 'library-1',
            upsertIds: ['caption', 'notes'],
          },
        }),
      }),
    )
  })

  test('an interactive run confirms stale-definition deletion and aborts on "no"', async () => {
    const plan = {...PLAN, staleIds: ['legacy']}
    mockPlanAspectSync.mockResolvedValue({plan})
    vi.mocked(confirm).mockResolvedValue(false)

    await expect(deployApp(deployOptions({yes: false}, mockOutput()))).rejects.toMatchObject({
      message: expect.stringContaining('Deploy cancelled'),
      oclif: {exit: exitCodes.USER_ABORT},
    })

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        default: false,
        message: expect.stringContaining('Delete 1 stored aspect definition'),
      }),
    )
    expect(mockDeployConfig).not.toHaveBeenCalled()
    expect(mockApplyAspectSync).not.toHaveBeenCalled()
  })

  test('an interactive run proceeds after the deletion is confirmed', async () => {
    mockPlanAspectSync.mockResolvedValue({plan: {...PLAN, staleIds: ['legacy']}})
    vi.mocked(confirm).mockResolvedValue(true)

    await deployApp(deployOptions({yes: false}, mockOutput()))

    expect(mockApplyAspectSync).toHaveBeenCalledTimes(1)
  })

  test('an unattended run (--yes) deletes without confirming', async () => {
    mockPlanAspectSync.mockResolvedValue({plan: {...PLAN, staleIds: ['legacy']}})

    await deployApp(deployOptions({}, mockOutput()))

    expect(confirm).not.toHaveBeenCalled()
    expect(mockApplyAspectSync).toHaveBeenCalledTimes(1)
  })

  test('a sync failure after the config deployed names the stale mirror and the retry', async () => {
    mockApplyAspectSync.mockRejectedValue(new Error('boom'))

    await expect(deployApp(deployOptions({}, mockOutput()))).rejects.toMatchObject({
      message: expect.stringContaining(
        'The config deployed, but syncing its aspect documents to media library library-1 failed: boom',
      ),
    })
    const rejection = await deployApp(deployOptions({}, mockOutput())).catch((error) => error)
    expect(rejection.message).toContain('Run `sanity deploy` again to retry the sync.')
    expect(mockDeployConfig).toHaveBeenCalled()
  })

  test("a real run exits with the plan failure's exit code", async () => {
    mockPlanAspectSync.mockResolvedValue({
      failure: {
        exitCode: exitCodes.USAGE_ERROR,
        message: 'Organization org-1 has 2 active media libraries',
        solution: 'Pass --media-library-id',
      },
    })

    await expect(deployApp(deployOptions({}, mockOutput()))).rejects.toMatchObject({
      message: expect.stringContaining('2 active media libraries'),
      oclif: {exit: exitCodes.USAGE_ERROR},
    })
    expect(mockDeployConfig).not.toHaveBeenCalled()
    expect(mockApplyAspectSync).not.toHaveBeenCalled()
  })

  test('a dry run records an unexpected planning throw as a failing check and keeps reporting', async () => {
    mockPlanAspectSync.mockRejectedValue(new Error('socket hang up'))
    const output = mockOutput()

    await expect(deployApp(deployOptions({'dry-run': true}, output))).rejects.toMatchObject({
      message: 'Deploy blocked by failing checks.',
    })

    // The plan still rendered — the throw became a check, not a crash.
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('Dry run — no changes made.'))
    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining('Planning the aspect-document sync failed: socket hang up'),
    )
    expect(mockApplyAspectSync).not.toHaveBeenCalled()
  })
})

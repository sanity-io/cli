import {findBlueprintFile, readBlueprint} from '@sanity/blueprints/resolve'
import {type CoreAppManifest} from '@sanity/cli-build/_internal/manifest'
import {type CliConfig, type Output} from '@sanity/cli-core'
import {resolveTitleUpdate} from '@sanity/cli-test/mocks/cli-build/manifest'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  createDeployment,
  updateUserApplication,
  type UserApplicationResolved,
} from '../../../services/userApplications.js'
import {buildApp} from '../../build/buildApp.js'
import {createMockOutput} from '../../dev/__tests__/testHelpers.js'
import {deployApp, logAppDeployed, syncApplicationMetadata} from '../deployApp.js'
import {findUserApplication} from '../findUserApplication.js'
import {resolveAppDeployTarget} from '../resolveDeployTarget.js'
import {type DeployAppOptions, type DeployFlags} from '../types.js'

vi.mock(
  import('@sanity/cli-build/_internal/manifest'),
  () => import('@sanity/cli-test/mocks/cli-build/manifest'),
)

vi.mock(import('@sanity/blueprints/resolve'), async () => ({
  findBlueprintFile: vi.fn(),
  readBlueprint: vi.fn(),
}))
vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getLocalPackageVersion: vi.fn(async () => '1.0.0'),
}))
vi.mock('../../../services/userApplications.js', () => ({
  createDeployment: vi.fn(),
  updateUserApplication: vi.fn(),
}))
vi.mock('../../build/buildApp.js', () => ({buildApp: vi.fn()}))
vi.mock('../checkDir.js', () => ({checkDir: vi.fn()}))
vi.mock('../findUserApplication.js', () => ({findUserApplication: vi.fn()}))
vi.mock(import('../resolveDeployTarget.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  resolveAppDeployTarget: vi.fn(),
}))
vi.mock('@sanity/cli-core/ux', async () => import('@sanity/cli-test/mocks/cli-core/ux'))
vi.mock('tar', () => ({c: vi.fn(() => ({pipe: vi.fn()}))}))

const mockOutput = () => ({log: vi.fn(), warn: vi.fn()}) as unknown as Output

describe('logAppDeployed', () => {
  test("updating prints the dashboard URL from the deployed app's organization", () => {
    const output = mockOutput()

    logAppDeployed({
      applicationId: 'app-1',
      cliConfig: {app: {organizationId: 'config-org'}, deployment: {appId: 'app-1'}} as CliConfig,
      created: false,
      organizationId: 'org-1',
      output,
      title: 'My App',
    })

    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining('Success! Application deployed to'),
    )
    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining('Updated the existing application.'),
    )
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('/@org-1/application/app-1'))
  })

  test.each([false, true])(
    'creating with createRequested=%s explains how to redeploy',
    (createRequested) => {
      const output = mockOutput()

      logAppDeployed({
        applicationId: 'app-2',
        cliConfig: {app: {organizationId: 'org-1'}} as CliConfig,
        created: true,
        createRequested,
        organizationId: 'org-1',
        output,
        title: 'New App',
      })

      const logged = vi
        .mocked(output.log)
        .mock.calls.map((call) => call[0])
        .join('\n')
      expect(logged).toContain('Created a new application.')
      expect(logged).toContain('Save `deployment.appId`')
      expect(logged.includes('omit --create')).toBe(createRequested)
      expect(logged).toContain("appId: 'app-2'")
    },
  )
})

describe('syncApplicationMetadata', () => {
  const baseApp = {
    dashboardStatus: 'default',
    id: 'app-1',
    organizationId: 'org-1',
    title: 'My App',
    type: 'coreApp',
  } as UserApplicationResolved

  afterEach(() => vi.clearAllMocks())

  test('does not PATCH when nothing changed', async () => {
    const result = await syncApplicationMetadata({
      application: baseApp,
      manifest: undefined,
      output: mockOutput(),
      visibility: 'default',
    })

    expect(updateUserApplication).not.toHaveBeenCalled()
    expect(result).toBe(baseApp)
  })

  test('treats an unset dashboardStatus as default, so visibility "default" is a no-op', async () => {
    await syncApplicationMetadata({
      application: {...baseApp, dashboardStatus: undefined} as UserApplicationResolved,
      manifest: undefined,
      output: mockOutput(),
      visibility: 'default',
    })

    expect(updateUserApplication).not.toHaveBeenCalled()
  })

  test('PATCHes only dashboardStatus when visibility changed', async () => {
    vi.mocked(updateUserApplication).mockResolvedValue({...baseApp, dashboardStatus: 'unlisted'})

    await syncApplicationMetadata({
      application: baseApp,
      manifest: undefined,
      output: mockOutput(),
      visibility: 'unlisted',
    })

    expect(updateUserApplication).toHaveBeenCalledWith({
      applicationId: 'app-1',
      appType: 'coreApp',
      body: {dashboardStatus: 'unlisted'},
    })
  })

  test('PATCHes only title when the manifest title changed', async () => {
    resolveTitleUpdate.mockReturnValueOnce({from: 'Original', to: 'Renamed'})
    vi.mocked(updateUserApplication).mockResolvedValue({...baseApp, title: 'Renamed'})

    await syncApplicationMetadata({
      application: baseApp,
      manifest: {title: 'Renamed', version: '1'} as CoreAppManifest,
      output: mockOutput(),
      visibility: undefined,
    })

    expect(updateUserApplication).toHaveBeenCalledWith({
      applicationId: 'app-1',
      appType: 'coreApp',
      body: {title: 'Renamed'},
    })
  })

  test('PATCHes both title and dashboardStatus in one call when both changed', async () => {
    resolveTitleUpdate.mockReturnValueOnce({from: 'Original', to: 'Renamed'})
    vi.mocked(updateUserApplication).mockResolvedValue({
      ...baseApp,
      dashboardStatus: 'unlisted',
      title: 'Renamed',
    })

    await syncApplicationMetadata({
      application: baseApp,
      manifest: {title: 'Renamed', version: '1'} as CoreAppManifest,
      output: mockOutput(),
      visibility: 'unlisted',
    })

    expect(updateUserApplication).toHaveBeenCalledTimes(1)
    expect(updateUserApplication).toHaveBeenCalledWith({
      applicationId: 'app-1',
      appType: 'coreApp',
      body: {dashboardStatus: 'unlisted', title: 'Renamed'},
    })
  })
})

const mockFindBlueprintFile = vi.mocked(findBlueprintFile)
const mockReadBlueprint = vi.mocked(readBlueprint)
const mockFindUserApplication = vi.mocked(findUserApplication)

type BlueprintInfo = Awaited<ReturnType<typeof readBlueprint>>

const existingApp = {
  appHost: 'my-app',
  id: 'app-1',
  organizationId: 'org-1',
  title: 'My App',
  type: 'coreApp',
} as UserApplicationResolved

/**
 * A blueprint found at `/root/sanity.blueprint.ts`, declaring `resources`.
 * A resource's `root` is resolved relative to that file, so `'.'` is the
 * `/root` app these options deploy.
 */
function mockBlueprint(resources: Record<string, unknown>[]) {
  mockFindBlueprintFile.mockReturnValue('/root/sanity.blueprint.ts')
  mockReadBlueprint.mockResolvedValue({resources} as unknown as BlueprintInfo)
}

function deployOptions(flags: Partial<DeployFlags> = {}): DeployAppOptions {
  return {
    cliConfig: {app: {organizationId: 'org-1'}, deployment: {appId: 'app-1'}},
    flags: {build: true, json: false, ...flags},
    output: createMockOutput(),
    projectRoot: {directory: '/root', path: '/root/sanity.cli.ts'},
    sourceDir: '/root/dist',
  } as unknown as DeployAppOptions
}

/** Stands in for the process exit a real run's `output.error` performs. */
function failOnError(options: DeployAppOptions) {
  return vi.mocked(options.output.error).mockImplementation(() => {
    throw new Error('exit')
  })
}

describe('deployApp (blueprint-managed app)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // `clearAllMocks` keeps implementations, so reset the blueprint stubs back
    // to "no blueprint next to the app" — otherwise one suite's blueprint
    // blocks every deploy that follows it.
    mockFindBlueprintFile.mockReset().mockReturnValue(undefined)
    mockReadBlueprint.mockReset()
    mockFindUserApplication.mockResolvedValue(existingApp)
    // Only the dry run resolves a target; a real deploy goes through
    // `findUserApplication` above.
    vi.mocked(resolveAppDeployTarget).mockResolvedValue({
      application: existingApp,
      type: 'found',
    })
  })

  test('an app referenced by a blueprint is blocked before anything is built or shipped', async () => {
    const options = deployOptions()
    const error = failOnError(options)
    mockBlueprint([{name: 'app', root: '.', type: 'sanity.application'}])

    await expect(deployApp(options)).rejects.toThrow('exit')

    expect(error.mock.calls[0][0]).toBe(
      'Using the `deploy` command for an app that is referenced by a blueprint is not allowed: ' +
        'Deploy the app using the `blueprints deploy` command',
    )
    expect(error.mock.calls[0][1]).toEqual({exit: 1})
    expect(mockFindUserApplication).not.toHaveBeenCalled()
    expect(buildApp).not.toHaveBeenCalled()
    expect(createDeployment).not.toHaveBeenCalled()
  })

  test('a blueprint referencing a different app does not block the deploy', async () => {
    const options = deployOptions()
    mockBlueprint([{name: 'app', root: './other-app', type: 'sanity.application'}])

    await deployApp(options)

    expect(options.output.error).not.toHaveBeenCalled()
    expect(createDeployment).toHaveBeenCalledWith(expect.objectContaining({applicationId: 'app-1'}))
  })

  test('a blueprint studio at the same root does not block an app deploy', async () => {
    const options = deployOptions()
    mockBlueprint([{name: 'studio', root: '.', type: 'sanity.studio'}])

    await deployApp(options)

    expect(options.output.error).not.toHaveBeenCalled()
    expect(createDeployment).toHaveBeenCalled()
  })

  test('no blueprint file allows the deploy to continue', async () => {
    const options = deployOptions()

    await deployApp(options)

    expect(mockReadBlueprint).not.toHaveBeenCalled()
    expect(createDeployment).toHaveBeenCalled()
  })

  test('a dry run collects the block as a failing check instead of deploying', async () => {
    const options = deployOptions({'dry-run': true})
    mockBlueprint([{name: 'app', root: '.', type: 'sanity.application'}])

    await deployApp(options)

    const planned = vi
      .mocked(options.output.log)
      .mock.calls.map((call) => call[0])
      .join('\n')
    expect(planned).toContain(
      'Using the `deploy` command for an app that is referenced by a blueprint is not allowed',
    )
    expect(options.output.error).toHaveBeenCalledWith('Deploy blocked by failing checks.', {
      exit: 1,
    })
    expect(createDeployment).not.toHaveBeenCalled()
  })
})

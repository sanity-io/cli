import {type CliConfig, type Output} from '@sanity/cli-core'
import {
  createStudio,
  deployWorkbenchApp,
  getWorkbench,
  listApplications,
} from '@sanity/workbench-cli/deploy'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {buildStudio} from '../../build/buildStudio.js'
import {deployStudio} from '../deployStudio.js'
import {deployStudioSchemasAndManifests} from '../deployStudioSchemasAndManifests.js'
import {type DeployAppOptions, type DeployFlags} from '../types.js'

vi.mock(import('@sanity/workbench-cli/deploy'), async (importOriginal) => ({
  ...(await importOriginal()),
  checkBuiltOutput: vi.fn(),
  createStudio: vi.fn(),
  deployWorkbenchApp: vi.fn(),
  getWorkbench: vi.fn(),
  listApplications: vi.fn(),
}))
vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getLocalPackageVersion: vi.fn(async () => '4.10.0'),
}))
vi.mock('@sanity/cli-core/ux', async () => import('@sanity/cli-test/mocks/cli-core/ux'))
vi.mock('../../build/buildStudio.js', () => ({buildStudio: vi.fn()}))
vi.mock('../deployStudioSchemasAndManifests.js', () => ({
  deployStudioSchemasAndManifests: vi.fn(async () => ({workspaces: []})),
}))
vi.mock('../../manifest/extractCoreAppManifest.js', () => ({readIconFromPath: vi.fn()}))
vi.mock('../../../services/userApplications.js', () => ({createDeployment: vi.fn()}))

const mockGetWorkbench = vi.mocked(getWorkbench)
const mockCreateStudio = vi.mocked(createStudio)
const mockDeployWorkbenchApp = vi.mocked(deployWorkbenchApp)
const mockListApplications = vi.mocked(listApplications)
const mockBuildStudio = vi.mocked(buildStudio)

function workbenchStudio(overrides: Record<string, unknown> = {}) {
  return {
    name: 'my-studio',
    services: [],
    slug: 'my-studio',
    views: [],
    ...overrides,
  } as unknown as ReturnType<typeof getWorkbench>
}

function deployOptions(
  {cliConfig, flags}: {cliConfig?: Partial<CliConfig>; flags?: Partial<DeployFlags>} = {},
  output: Output = {error: vi.fn(), log: vi.fn(), warn: vi.fn()} as unknown as Output,
): DeployAppOptions {
  return {
    cliConfig: {
      api: {projectId: 'project-1'},
      app: {organizationId: 'org-1'},
      ...cliConfig,
    },
    flags: {build: true, json: true, ...flags},
    output,
    projectRoot: {directory: '/root', path: '/root/sanity.cli.ts'},
    sourceDir: '/root/dist',
  } as unknown as DeployAppOptions
}

function deployedPayload(output: Output) {
  return JSON.parse(vi.mocked(output.log).mock.calls.at(-1)![0] as string)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetWorkbench.mockReturnValue(workbenchStudio())
  mockListApplications.mockResolvedValue([])
  mockCreateStudio.mockResolvedValue({applicationId: 'studio-1', rollback: vi.fn()})
  vi.mocked(deployStudioSchemasAndManifests).mockResolvedValue({
    workspaces: [],
  } as unknown as Awaited<ReturnType<typeof deployStudioSchemasAndManifests>>)
})

describe('deployStudio (federated studio)', () => {
  describe('auto-updates', () => {
    test('warns and deploys pinned when `deployment.autoUpdates` is set', async () => {
      const output = {error: vi.fn(), log: vi.fn(), warn: vi.fn()} as unknown as Output

      await deployStudio(deployOptions({cliConfig: {deployment: {autoUpdates: true}}}, output))

      expect(output.warn).toHaveBeenCalledWith(
        expect.stringContaining("Auto-updates aren't supported for federated studios yet"),
      )
      expect(mockDeployWorkbenchApp).toHaveBeenCalledWith(
        expect.objectContaining({isAutoUpdating: false}),
      )
      expect(mockBuildStudio).toHaveBeenCalledWith(
        expect.objectContaining({autoUpdatesEnabled: false}),
      )
    })

    test('says nothing when auto-updates were never configured', async () => {
      const output = {error: vi.fn(), log: vi.fn(), warn: vi.fn()} as unknown as Output

      await deployStudio(deployOptions({}, output))

      expect(output.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("Auto-updates aren't supported"),
      )
      expect(mockDeployWorkbenchApp).toHaveBeenCalledWith(
        expect.objectContaining({isAutoUpdating: false}),
      )
    })
  })

  describe('visibility', () => {
    test('is forwarded to the create and the deployment when declared', async () => {
      mockGetWorkbench.mockReturnValue(workbenchStudio({visibility: 'unlisted'}))

      await deployStudio(deployOptions())

      expect(mockCreateStudio).toHaveBeenCalledWith(
        expect.objectContaining({visibility: 'unlisted'}),
      )
      expect(mockDeployWorkbenchApp).toHaveBeenCalledWith(
        expect.objectContaining({visibility: 'unlisted'}),
      )
    })

    test('is left undefined when the app declares none', async () => {
      await deployStudio(deployOptions())

      expect(mockCreateStudio.mock.calls[0][0].visibility).toBeUndefined()
      expect(mockDeployWorkbenchApp.mock.calls[0][0].visibility).toBeUndefined()
    })
  })

  describe('the reported target', () => {
    test('a first deploy reports the created id and the slug it was created at', async () => {
      const output = {error: vi.fn(), log: vi.fn(), warn: vi.fn()} as unknown as Output

      await deployStudio(deployOptions({}, output))

      expect(deployedPayload(output)).toMatchObject({
        deployed: true,
        target: {
          action: 'create',
          applicationId: 'studio-1',
          slug: 'my-studio',
          url: 'https://org-1.sanity.run/studio/studio-1',
        },
      })
    })

    test('a redeploy targets `deployment.appId` and omits the slug', async () => {
      const output = {error: vi.fn(), log: vi.fn(), warn: vi.fn()} as unknown as Output

      await deployStudio(deployOptions({cliConfig: {deployment: {appId: 'studio-9'}}}, output))

      expect(mockCreateStudio).not.toHaveBeenCalled()
      const {target} = deployedPayload(output)
      expect(target).toMatchObject({action: 'update', applicationId: 'studio-9'})
      expect(target).not.toHaveProperty('slug')
    })
  })

  test('a taken slug blocks the deploy before anything is created', async () => {
    const output = {error: vi.fn(), log: vi.fn(), warn: vi.fn()} as unknown as Output
    // output.error exits in a real run, so a failing check aborts the sequence
    vi.mocked(output.error).mockImplementation(() => {
      throw new Error('exit')
    })
    mockListApplications.mockResolvedValue([
      {
        id: 'existing-1',
        organizationId: 'org-1',
        slug: 'my-studio',
        title: 'Holder',
        type: 'coreApp',
      },
    ] as unknown as Awaited<ReturnType<typeof listApplications>>)

    // runDeploy's catch re-raises through the same stub, so assert the first error
    await expect(deployStudio(deployOptions({}, output))).rejects.toThrow('exit')

    expect(vi.mocked(output.error).mock.calls[0][0]).toContain('already exists at slug "my-studio"')
    expect(mockCreateStudio).not.toHaveBeenCalled()
    expect(mockBuildStudio).not.toHaveBeenCalled()
  })
})

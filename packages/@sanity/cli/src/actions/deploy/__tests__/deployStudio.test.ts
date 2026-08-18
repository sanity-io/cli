import {SchemaExtractionError} from '@sanity/cli-build/_internal/extract'
import {type CliConfig, exitCodes, type Output} from '@sanity/cli-core'
import {
  createStudio,
  deployWorkbenchApp,
  getApplication,
  listApplications,
} from '@sanity/workbench-cli/deploy'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {buildStudio} from '../../build/buildStudio.js'
import {createMockOutput, workbenchApp} from '../../dev/__tests__/testHelpers.js'
import {deployStudio} from '../deployStudio.js'
import {deployStudioSchemasAndManifests} from '../deployStudioSchemasAndManifests.js'
import {type DeployAppOptions, type DeployFlags} from '../types.js'

vi.mock(import('@sanity/workbench-cli/deploy'), async (importOriginal) => ({
  ...(await importOriginal()),
  checkBuiltOutput: vi.fn(),
  createStudio: vi.fn(),
  deployWorkbenchApp: vi.fn(),
  getApplication: vi.fn(),
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

const mockCreateStudio = vi.mocked(createStudio)
const mockDeployWorkbenchApp = vi.mocked(deployWorkbenchApp)
const mockGetApplication = vi.mocked(getApplication)
const mockListApplications = vi.mocked(listApplications)
const mockBuildStudio = vi.mocked(buildStudio)

// `getWorkbench` is left unmocked: it resolves the branded `app` below.
function deployOptions({
  app,
  cliConfig,
  flags,
}: {
  app?: Record<string, unknown>
  cliConfig?: Partial<CliConfig>
  flags?: Partial<DeployFlags>
} = {}): DeployAppOptions {
  return {
    cliConfig: {
      api: {projectId: 'project-1'},
      app: workbenchApp({name: 'my-studio', organizationId: 'org-1', slug: 'my-studio', ...app}),
      ...cliConfig,
    },
    flags: {build: true, json: true, ...flags},
    output: createMockOutput(),
    projectRoot: {directory: '/root', path: '/root/sanity.cli.ts'},
    sourceDir: '/root/dist',
  } as unknown as DeployAppOptions
}

function deployedPayload(output: Output) {
  return JSON.parse(vi.mocked(output.log).mock.calls.at(-1)![0] as string)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListApplications.mockResolvedValue([])
  mockCreateStudio.mockResolvedValue({
    application: {
      id: 'studio-1',
      organizationId: 'org-1',
      slug: 'my-studio',
      title: 'My Studio',
      type: 'studio',
    },
    rollback: vi.fn(),
  })
  vi.mocked(deployStudioSchemasAndManifests).mockResolvedValue({
    workspaces: [],
  } as unknown as Awaited<ReturnType<typeof deployStudioSchemasAndManifests>>)
})

describe('deployStudio (federated studio)', () => {
  test('`deployment.autoUpdates` warns and still deploys pinned', async () => {
    const options = deployOptions({cliConfig: {deployment: {autoUpdates: true}}})

    await deployStudio(options)

    expect(options.output.warn).toHaveBeenCalledWith(
      expect.stringContaining("Auto-updates aren't supported yet"),
    )
    expect(mockDeployWorkbenchApp).toHaveBeenCalledWith(
      expect.objectContaining({isAutoUpdating: false}),
    )
    expect(mockBuildStudio).toHaveBeenCalledWith(
      expect.objectContaining({autoUpdatesEnabled: false}),
    )
  })

  test('says nothing when auto-updates were never configured', async () => {
    const options = deployOptions()

    await deployStudio(options)

    expect(options.output.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("Auto-updates aren't supported"),
    )
    expect(mockDeployWorkbenchApp).toHaveBeenCalledWith(
      expect.objectContaining({isAutoUpdating: false}),
    )
  })

  test('a declared visibility reaches both the create and the deployment', async () => {
    await deployStudio(deployOptions({app: {visibility: 'unlisted'}}))

    expect(mockCreateStudio).toHaveBeenCalledWith(expect.objectContaining({visibility: 'unlisted'}))
    expect(mockDeployWorkbenchApp).toHaveBeenCalledWith(
      expect.objectContaining({visibility: 'unlisted'}),
    )
  })

  test('a first deploy reports the created id and the slug it was created at', async () => {
    const options = deployOptions()

    await deployStudio(options)

    expect(deployedPayload(options.output)).toMatchObject({
      action: 'create',
      application: {id: 'studio-1', slug: 'my-studio'},
      deployed: true,
      payload: {appId: null, slug: 'my-studio', type: 'studio'},
      url: 'https://org-1.sanity.run/studio/studio-1',
    })
  })

  test('a redeploy targets `deployment.appId` and reports the resolved record', async () => {
    mockGetApplication.mockResolvedValue({
      id: 'studio-9',
      organizationId: 'org-1',
      slug: 'my-studio',
      title: 'My Studio',
      type: 'studio',
    })
    const options = deployOptions({cliConfig: {deployment: {appId: 'studio-9'}}})

    await deployStudio(options)

    expect(mockCreateStudio).not.toHaveBeenCalled()
    const {action, application, payload} = deployedPayload(options.output)
    expect(action).toBe('update')
    expect(payload.appId).toBe('studio-9')
    expect(application).toMatchObject({id: 'studio-9', slug: 'my-studio'})
  })

  test('derives one deduped datasets access entry per unique workspace dataset', async () => {
    // Two workspaces share proj-1.production; a third adds proj-1.staging.
    vi.mocked(deployStudioSchemasAndManifests).mockResolvedValue({
      workspaces: [
        {dataset: 'production', projectId: 'proj-1'},
        {dataset: 'production', projectId: 'proj-1'},
        {dataset: 'staging', projectId: 'proj-1'},
      ],
    } as unknown as Awaited<ReturnType<typeof deployStudioSchemasAndManifests>>)

    await deployStudio(deployOptions())

    expect(mockDeployWorkbenchApp).toHaveBeenCalledWith(
      expect.objectContaining({
        access: [
          {resourceId: 'proj-1.production', resourceType: 'dataset'},
          {resourceId: 'proj-1.staging', resourceType: 'dataset'},
        ],
      }),
    )
  })

  test('derives empty access when the manifest has no workspaces', async () => {
    await deployStudio(deployOptions())

    expect(mockDeployWorkbenchApp).toHaveBeenCalledWith(expect.objectContaining({access: []}))
  })

  test('a taken slug blocks the deploy before anything is created', async () => {
    const options = deployOptions()
    // A real run exits inside output.error; throwing stands in for that, and
    // runDeploy re-raises through the same stub, so assert the first call.
    const error = vi.mocked(options.output.error).mockImplementation(() => {
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
    ])

    await expect(deployStudio(options)).rejects.toThrow('exit')

    expect(error.mock.calls[0][0]).toContain('already exists at slug "my-studio"')
    expect(mockCreateStudio).not.toHaveBeenCalled()
    expect(mockBuildStudio).not.toHaveBeenCalled()
  })

  test('reports schema extraction errors without validation details', async () => {
    const options = deployOptions()
    vi.mocked(deployStudioSchemasAndManifests).mockRejectedValue(
      new SchemaExtractionError('Workspace base paths must share the same first segment'),
    )
    const outputError = vi.mocked(options.output.error).mockImplementation((message) => {
      throw new Error(String(message))
    })

    await expect(deployStudio(options)).rejects.toThrow(
      'Workspace base paths must share the same first segment',
    )
    expect(outputError).toHaveBeenCalledWith(
      expect.stringContaining('Workspace base paths must share the same first segment'),
      {exit: exitCodes.RUNTIME_ERROR},
    )
  })
})

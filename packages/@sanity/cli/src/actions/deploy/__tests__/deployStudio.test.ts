import {findBlueprintFile, readBlueprint} from '@sanity/blueprints/resolve'
import {SchemaExtractionError} from '@sanity/cli-build/_internal/extract'
import {type CliConfig, exitCodes, type Output} from '@sanity/cli-core'
import {readBuiltManifest} from '@sanity/workbench-cli/build'
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

vi.mock(import('@sanity/blueprints/resolve'), async () => ({
  findBlueprintFile: vi.fn(),
  readBlueprint: vi.fn(),
}))
vi.mock(import('@sanity/workbench-cli/build'), async (importOriginal) => ({
  ...(await importOriginal()),
  readBuiltManifest: vi.fn(),
}))
vi.mock(import('@sanity/workbench-cli/deploy'), async (importOriginal) => ({
  ...(await importOriginal()),
  createStudio: vi.fn(),
  deployWorkbenchApp: vi.fn(),
  getApplication: vi.fn(),
  listApplications: vi.fn(),
}))
vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  // Stubbed so the blueprint check never reads the developer's own auth config.
  getCliToken: vi.fn(async () => 'token'),
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
const mockFindBlueprintFile = vi.mocked(findBlueprintFile)
const mockReadBlueprint = vi.mocked(readBlueprint)

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

/** The `--json` envelope the deploy emitted, which stdout receives verbatim. */
function deployedPayload(output: Output) {
  return vi.mocked(output.logJson).mock.calls.at(-1)![0] as {
    action: string
    application: Record<string, unknown>
    payload: Record<string, unknown>
    url: string
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // `clearAllMocks` keeps implementations, so reset the blueprint stubs back to
  // "no blueprint next to the studio" — otherwise one suite's blueprint blocks
  // every deploy that follows it.
  mockFindBlueprintFile.mockReset().mockReturnValue(undefined)
  mockReadBlueprint.mockReset()
  mockListApplications.mockResolvedValue([])
  mockBuildStudio.mockResolvedValue({mfManifest: {id: 'my-studio'}})
  vi.mocked(readBuiltManifest).mockResolvedValue({id: 'my-studio'})
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
  test('`deployment.autoUpdates` builds and deploys as auto-updating', async () => {
    const options = deployOptions({cliConfig: {deployment: {autoUpdates: true}}})

    await deployStudio(options)

    expect(mockDeployWorkbenchApp).toHaveBeenCalledWith(
      expect.objectContaining({isAutoUpdating: true}),
    )
    expect(mockBuildStudio).toHaveBeenCalledWith(
      expect.objectContaining({autoUpdatesEnabled: true}),
    )
  })

  test('deploys pinned when auto-updates were never configured', async () => {
    const options = deployOptions()

    await deployStudio(options)

    expect(mockDeployWorkbenchApp).toHaveBeenCalledWith(
      expect.objectContaining({isAutoUpdating: false}),
    )
  })

  test("ships the build's federation manifest without re-reading the directory", async () => {
    const mfManifest = {id: 'built'}
    mockBuildStudio.mockResolvedValueOnce({mfManifest})

    await deployStudio(deployOptions())

    expect(mockDeployWorkbenchApp).toHaveBeenCalledWith(expect.objectContaining({mfManifest}))
    expect(vi.mocked(readBuiltManifest)).not.toHaveBeenCalled()
  })

  test('--no-build ships the federation manifest read from the output directory', async () => {
    const mfManifest = {id: 'prebuilt'}
    vi.mocked(readBuiltManifest).mockResolvedValueOnce(mfManifest)

    await deployStudio(deployOptions({flags: {build: false}}))

    expect(mockBuildStudio).not.toHaveBeenCalled()
    expect(vi.mocked(readBuiltManifest)).toHaveBeenCalledWith('/root/dist')
    expect(mockDeployWorkbenchApp).toHaveBeenCalledWith(expect.objectContaining({mfManifest}))
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
      url: 'https://org-1.sanity.run/studios/my-studio',
    })
    expect(vi.mocked(deployStudioSchemasAndManifests).mock.calls[0][0]).toEqual(
      expect.objectContaining({applicationId: 'studio-1'}),
    )
  })

  test('prints the workbench URL at the configured slug', async () => {
    const options = deployOptions({flags: {json: false}})

    await deployStudio(options)

    expect(options.output.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Success! Studio deployed to https://org-1.sanity.run/studios/my-studio',
      ),
    )
  })

  test('a redeploy targets `deployment.appId` and reports the resolved record', async () => {
    mockGetApplication.mockResolvedValue({
      id: 'studio-9',
      organizationId: 'org-1',
      slug: 'old-slug',
      title: 'My Studio',
      type: 'studio',
    })
    const options = deployOptions({cliConfig: {deployment: {appId: 'studio-9'}}})

    await deployStudio(options)

    expect(mockCreateStudio).not.toHaveBeenCalled()
    const {action, application, payload, url} = deployedPayload(options.output)
    expect(action).toBe('update')
    expect(payload.appId).toBe('studio-9')
    expect(application).toMatchObject({id: 'studio-9', slug: 'old-slug'})
    expect(url).toBe('https://org-1.sanity.run/studios/my-studio')
    expect(vi.mocked(deployStudioSchemasAndManifests).mock.calls[0][0]).toEqual(
      expect.objectContaining({applicationId: 'studio-9'}),
    )
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

type BlueprintInfo = Awaited<ReturnType<typeof readBlueprint>>

/**
 * A blueprint found at `/root/sanity.blueprint.ts`, declaring `resources`.
 * A resource's `root` is resolved relative to that file, so `'.'` is the
 * `/root` studio these options deploy.
 */
function mockBlueprint(resources: Record<string, unknown>[]) {
  mockFindBlueprintFile.mockReturnValue('/root/sanity.blueprint.ts')
  mockReadBlueprint.mockResolvedValue({resources} as unknown as BlueprintInfo)
}

/** Stands in for the process exit a real run's `output.error` performs. */
function failOnError(options: DeployAppOptions) {
  return vi.mocked(options.output.error).mockImplementation(() => {
    throw new Error('exit')
  })
}

describe('deployStudio (blueprint-managed studio)', () => {
  test('a studio referenced by a blueprint is blocked before anything is created', async () => {
    const options = deployOptions()
    const error = failOnError(options)
    mockBlueprint([{name: 'studio', root: '.', type: 'sanity.studio'}])

    await expect(deployStudio(options)).rejects.toThrow('exit')

    expect(error.mock.calls[0][0]).toBe(
      'Using the `deploy` command for a studio that is referenced by a blueprint is not allowed: ' +
        'Deploy the studio using the `blueprints deploy` command',
    )
    expect(error.mock.calls[0][1]).toEqual({exit: 1})
    expect(mockCreateStudio).not.toHaveBeenCalled()
    expect(mockBuildStudio).not.toHaveBeenCalled()
    expect(mockDeployWorkbenchApp).not.toHaveBeenCalled()
    expect(vi.mocked(deployStudioSchemasAndManifests)).not.toHaveBeenCalled()
  })

  test('a blueprint referencing a different studio does not block the deploy', async () => {
    const options = deployOptions()
    mockBlueprint([{name: 'studio', root: './other-studio', type: 'sanity.studio'}])

    await deployStudio(options)

    expect(options.output.error).not.toHaveBeenCalled()
    expect(mockDeployWorkbenchApp).toHaveBeenCalledWith(
      expect.objectContaining({applicationId: 'studio-1'}),
    )
  })

  test('no blueprint file leaves the deploy untouched and reads no blueprint', async () => {
    const options = deployOptions()
    mockFindBlueprintFile.mockReturnValue(undefined)

    await deployStudio(options)

    expect(mockReadBlueprint).not.toHaveBeenCalled()
    expect(mockDeployWorkbenchApp).toHaveBeenCalled()
  })
})

describe('deployStudio --external (federated studio)', () => {
  const externalFlags = {external: true, json: false, url: 'https://studio.example.com/'}

  test('registers the studio at the --url origin and ships a manifest-only deployment', async () => {
    const options = deployOptions({flags: externalFlags})
    const mfManifest = {id: 'built'}
    mockBuildStudio.mockResolvedValueOnce({mfManifest})

    await deployStudio(options)

    expect(mockCreateStudio).toHaveBeenCalledWith(
      expect.objectContaining({externalUrl: 'https://studio.example.com', slug: 'my-studio'}),
    )
    expect(mockDeployWorkbenchApp).toHaveBeenCalledWith(
      expect.objectContaining({applicationId: 'studio-1', isExternal: true, mfManifest}),
    )
    // Brett needs a schema descriptor per workspace, so the schema still deploys.
    expect(vi.mocked(deployStudioSchemasAndManifests).mock.calls[0][0]).toEqual(
      expect.objectContaining({applicationId: 'studio-1', isExternal: false}),
    )
    expect(mockBuildStudio).toHaveBeenCalled()
    expect(vi.mocked(readBuiltManifest)).not.toHaveBeenCalled()
  })

  test('prints what the host must serve, and that the fresh build needs copying', async () => {
    const options = deployOptions({flags: externalFlags})

    await deployStudio(options)

    const logged = vi
      .mocked(options.output.log)
      .mock.calls.map(([line]) => line)
      .join('\n')
    expect(logged).toContain('/mf-manifest.json')
    expect(logged).toContain('Access-Control-Allow-Origin')
    expect(logged).toContain('https://org-1.sanity.run')
    expect(logged).toContain('cookies')
    expect(logged).toContain('copy it to your host')
  })

  test('a first deploy without --url fails before anything is created', async () => {
    const options = deployOptions({flags: {...externalFlags, url: undefined}})
    const error = vi.mocked(options.output.error).mockImplementation(() => {
      throw new Error('exit')
    })

    await expect(deployStudio(options)).rejects.toThrow('exit')

    expect(error.mock.calls[0][0]).toContain('URL')
    expect(mockCreateStudio).not.toHaveBeenCalled()
    expect(mockDeployWorkbenchApp).not.toHaveBeenCalled()
  })

  test('a first deploy with --no-build fails before anything is created', async () => {
    const options = deployOptions({flags: {...externalFlags, build: false}})
    const error = vi.mocked(options.output.error).mockImplementation(() => {
      throw new Error('exit')
    })

    await expect(deployStudio(options)).rejects.toThrow('exit')

    expect(error.mock.calls[0][0]).toContain('A first deploy cannot skip the build (--no-build)')
    expect(mockCreateStudio).not.toHaveBeenCalled()
    expect(mockDeployWorkbenchApp).not.toHaveBeenCalled()
  })

  test('a redeploy of an external studio ships its manifest without --external', async () => {
    mockGetApplication.mockResolvedValue({
      externalUrl: 'https://studio.example.com',
      id: 'studio-9',
      organizationId: 'org-1',
      slug: 'my-studio',
      title: 'My Studio',
      type: 'studio',
    })
    const options = deployOptions({
      cliConfig: {deployment: {appId: 'studio-9'}},
      flags: {build: false, json: false},
    })

    await deployStudio(options)

    expect(mockCreateStudio).not.toHaveBeenCalled()
    expect(mockBuildStudio).not.toHaveBeenCalled()
    expect(mockDeployWorkbenchApp).toHaveBeenCalledWith(
      expect.objectContaining({applicationId: 'studio-9', isExternal: true}),
    )
    const logged = vi.mocked(options.output.log).mock.calls.map(([line]) => line)
    expect(logged.join('\n')).not.toContain('copy it to your host')
  })
})

import {StudioManifest} from 'sanity'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {deployStudioSchemasAndManifestsWorker} from '../deployStudioSchemasAndManifestsWorker.js'
import {
  type DeployStudioSchemasAndManifestsWorkerData,
  type DeployStudioSchemasAndManifestsWorkerMessage,
} from '../types.js'

const mockWorkerBuildStudioSchemasAndManifests = vi.hoisted(() => vi.fn())
const mockExtractValidationFromSchemaError = vi.hoisted(() => vi.fn())
const mockUpdateWorkspacesSchemas = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-build/_internal/extract', () => ({
  extractValidationFromSchemaError: mockExtractValidationFromSchemaError,
  workerBuildStudioSchemasAndManifests: mockWorkerBuildStudioSchemasAndManifests,
}))

vi.mock(import('../../schema/updateWorkspaceSchema.js'), () => ({
  updateWorkspacesSchemas: mockUpdateWorkspacesSchemas,
}))

vi.mock('@sanity/cli-core', () => ({
  subdebug: () => vi.fn(),
}))

const projectId = 'test-project-id'

const studioManifest: StudioManifest = {
  buildId: '"build-id"',
  bundleVersion: '3.0.0',
  version: '2.0.0',
  workspaces: [],
}

function createWorkspaceManifest(overrides: Record<string, unknown> = {}) {
  return {
    basePath: '/',
    dataset: 'production',
    name: 'default',
    projectId,
    schema: [{name: 'post', type: 'document'}],
    title: 'Default',
    tools: [],
    ...overrides,
  }
}

function createWorkerData(
  overrides: Partial<DeployStudioSchemasAndManifestsWorkerData> = {},
): DeployStudioSchemasAndManifestsWorkerData {
  return {
    configPath: '/studio/sanity.config.ts',
    isExternal: false,
    outPath: 'dist/static',
    projectId,
    schemaRequired: false,
    verbose: false,
    workDir: '/studio',
    ...overrides,
  }
}

function createPort() {
  const messages: DeployStudioSchemasAndManifestsWorkerMessage[] = []
  return {
    messages,
    port: {
      postMessage: (message: DeployStudioSchemasAndManifestsWorkerMessage) => {
        messages.push(message)
      },
    },
  }
}

/** The manifests the stubbed build hands to the worker's `workspaceManifestsHandler`. */
let handedManifests: Record<string, unknown>[] = []

beforeEach(() => {
  handedManifests = [createWorkspaceManifest()]
  mockExtractValidationFromSchemaError.mockResolvedValue(undefined)
  mockUpdateWorkspacesSchemas.mockResolvedValue(undefined)
  // Mirrors cli-build: the build invokes the handler, and a handler failure fails the build.
  mockWorkerBuildStudioSchemasAndManifests.mockImplementation(async (options) => {
    await options.workspaceManifestsHandler?.(handedManifests)
    return {studioManifest, type: 'success', workspaceManifests: handedManifests}
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('deployStudioSchemasAndManifestsWorker', () => {
  test('posts the studio manifest back on success', async () => {
    const {messages, port} = createPort()

    await deployStudioSchemasAndManifestsWorker(port, createWorkerData())

    expect(messages).toEqual([{studioManifest, type: 'success'}])
  })

  test('hands the validated worker data to the build', async () => {
    const {port} = createPort()

    await deployStudioSchemasAndManifestsWorker(port, createWorkerData({verbose: true}))

    expect(mockWorkerBuildStudioSchemasAndManifests).toHaveBeenCalledWith(
      expect.objectContaining({
        configPath: '/studio/sanity.config.ts',
        isExternal: false,
        outPath: 'dist/static',
        projectId,
        schemaRequired: false,
        verbose: true,
        workDir: '/studio',
        workspaceManifestsHandler: expect.any(Function),
      }),
    )
  })

  test('rejects malformed worker data without posting a message', async () => {
    const {messages, port} = createPort()

    await expect(
      deployStudioSchemasAndManifestsWorker(port, {...createWorkerData(), projectId: 42}),
    ).rejects.toThrow()

    expect(messages).toEqual([])
    expect(mockWorkerBuildStudioSchemasAndManifests).not.toHaveBeenCalled()
  })

  describe('schema deployment', () => {
    test('maps workspace manifests onto schema inputs', async () => {
      const {port} = createPort()
      handedManifests = [
        createWorkspaceManifest(),
        createWorkspaceManifest({
          dataset: 'staging',
          name: 'staging',
          projectId: 'other-project',
          schema: [{name: 'author', type: 'document'}],
          title: undefined,
        }),
      ]

      await deployStudioSchemasAndManifestsWorker(port, createWorkerData({verbose: true}))

      expect(mockUpdateWorkspacesSchemas).toHaveBeenCalledWith({
        verbose: true,
        workspaces: [
          {
            dataset: 'production',
            manifestSchema: [{name: 'post', type: 'document'}],
            name: 'default',
            projectId,
            title: 'Default',
          },
          {
            dataset: 'staging',
            manifestSchema: [{name: 'author', type: 'document'}],
            name: 'staging',
            projectId: 'other-project',
            title: undefined,
          },
        ],
      })
    })

    test('deploys schemas for an internal studio', async () => {
      const {port} = createPort()

      await deployStudioSchemasAndManifestsWorker(
        port,
        createWorkerData({isExternal: false, schemaRequired: false}),
      )

      expect(mockUpdateWorkspacesSchemas).toHaveBeenCalledTimes(1)
    })

    test('skips deployment for an external studio that does not require the schema', async () => {
      const {messages, port} = createPort()

      await deployStudioSchemasAndManifestsWorker(
        port,
        createWorkerData({isExternal: true, schemaRequired: false}),
      )

      expect(mockUpdateWorkspacesSchemas).not.toHaveBeenCalled()
      // The build still completes and reports back
      expect(messages).toEqual([{studioManifest, type: 'success'}])
    })

    test('deploys schemas for an external studio when the schema is required', async () => {
      const {port} = createPort()

      await deployStudioSchemasAndManifestsWorker(
        port,
        createWorkerData({isExternal: true, schemaRequired: true}),
      )

      expect(mockUpdateWorkspacesSchemas).toHaveBeenCalledTimes(1)
    })

    test('does not run the handler when the build never calls it', async () => {
      const {messages, port} = createPort()
      mockWorkerBuildStudioSchemasAndManifests.mockResolvedValue({
        studioManifest: null,
        type: 'success',
        workspaceManifests: [],
      })

      await deployStudioSchemasAndManifestsWorker(port, createWorkerData())

      expect(mockUpdateWorkspacesSchemas).not.toHaveBeenCalled()
      expect(messages).toEqual([{studioManifest: null, type: 'success'}])
    })
  })

  describe('failures', () => {
    test('posts a serialized error with the extracted validation', async () => {
      const {messages, port} = createPort()
      const validation = [{path: [], problems: []}]
      const failure = new Error('No workspaces found')
      mockWorkerBuildStudioSchemasAndManifests.mockRejectedValue(failure)
      mockExtractValidationFromSchemaError.mockResolvedValue(validation)

      await deployStudioSchemasAndManifestsWorker(port, createWorkerData())

      expect(messages).toEqual([{error: 'No workspaces found', type: 'error', validation}])
      expect(mockExtractValidationFromSchemaError).toHaveBeenCalledWith(failure, '/studio')
    })

    test('omits validation when the failure is not a schema error', async () => {
      const {messages, port} = createPort()
      mockWorkerBuildStudioSchemasAndManifests.mockRejectedValue(new Error('ENOENT'))

      await deployStudioSchemasAndManifestsWorker(port, createWorkerData())

      expect(messages).toEqual([{error: 'ENOENT', type: 'error', validation: undefined}])
    })

    test('stringifies non-Error failures', async () => {
      const {messages, port} = createPort()
      mockWorkerBuildStudioSchemasAndManifests.mockRejectedValue('kaboom')

      await deployStudioSchemasAndManifestsWorker(port, createWorkerData())

      expect(messages).toEqual([{error: 'kaboom', type: 'error', validation: undefined}])
    })

    test('reports a failed schema deployment as an error message', async () => {
      const {messages, port} = createPort()
      mockUpdateWorkspacesSchemas.mockRejectedValue(new Error('Failed to deploy 1/1 schemas'))

      await deployStudioSchemasAndManifestsWorker(port, createWorkerData())

      expect(messages).toEqual([
        {error: 'Failed to deploy 1/1 schemas', type: 'error', validation: undefined},
      ])
    })
  })
})

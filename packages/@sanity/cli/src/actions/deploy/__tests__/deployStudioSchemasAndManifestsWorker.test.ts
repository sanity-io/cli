import {type WorkspaceSchemaInput} from '@sanity/cli-build/_internal/manifest'
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
const mockSpin = vi.hoisted(() => ({
  fail: vi.fn(),
  start: vi.fn(),
  succeed: vi.fn(),
}))
const mockSpinner = vi.hoisted(() => vi.fn())

vi.mock(import('@sanity/cli-build/_internal/extract'), () => ({
  extractValidationFromSchemaError: mockExtractValidationFromSchemaError,
  workerBuildStudioSchemasAndManifests: mockWorkerBuildStudioSchemasAndManifests,
}))

vi.mock(import('../../schema/updateWorkspaceSchema.js'), () => ({
  updateWorkspacesSchemas: mockUpdateWorkspacesSchemas,
}))

vi.mock('@sanity/cli-core', () => ({
  subdebug: () => vi.fn(),
}))

vi.mock('@sanity/cli-core/ux', () => ({
  spinner: mockSpinner,
}))

const projectId = 'test-project-id'

const studioManifest: StudioManifest = {
  buildId: '"build-id"',
  bundleVersion: '3.0.0',
  version: '2.0.0',
  workspaces: [],
}

function createSchemaInput(overrides: Partial<WorkspaceSchemaInput> = {}): WorkspaceSchemaInput {
  return {
    dataset: 'production',
    manifestSchema: [{name: 'post', type: 'document'}],
    name: 'default',
    projectId,
    title: 'Default',
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

/**
 * The schema inputs the stubbed build hands to the worker's `workspaceSchemaHandler`.
 */
let handedSchemaInputs: WorkspaceSchemaInput[] = []

beforeEach(() => {
  handedSchemaInputs = [createSchemaInput()]
  mockExtractValidationFromSchemaError.mockResolvedValue(undefined)
  mockUpdateWorkspacesSchemas.mockResolvedValue(undefined)
  mockSpinner.mockReturnValue(mockSpin)
  // Mirrors cli-build: the build invokes the handler, and a handler failure fails the build.
  mockWorkerBuildStudioSchemasAndManifests.mockImplementation(async (options) => {
    await options.workspaceSchemaHandler?.(handedSchemaInputs)
    return {schemaInputs: handedSchemaInputs, studioManifest, type: 'success'}
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
        schemaRequired: false,
        verbose: true,
        workDir: '/studio',
        workspaceSchemaHandler: expect.any(Function),
      }),
      {
        onGenerateManifestDone: expect.any(Function),
        onGenerateManifestFail: expect.any(Function),
        onGenerateManifestStart: expect.any(Function),
      },
    )
  })

  test('rejects malformed worker data without posting a message', async () => {
    const {messages, port} = createPort()

    await expect(
      deployStudioSchemasAndManifestsWorker(port, {...createWorkerData(), configPath: 42}),
    ).rejects.toThrow()

    expect(messages).toEqual([])
    expect(mockWorkerBuildStudioSchemasAndManifests).not.toHaveBeenCalled()
  })

  describe('manifest generation listeners', () => {
    test('starts the spinner when generation starts', async () => {
      const {port} = createPort()
      mockWorkerBuildStudioSchemasAndManifests.mockImplementation(async (_options, listeners) => {
        listeners.onGenerateManifestStart()
        return {schemaInputs: null, studioManifest, type: 'success'}
      })

      await deployStudioSchemasAndManifestsWorker(port, createWorkerData())

      expect(mockSpin.start).toHaveBeenCalledTimes(1)
      expect(mockSpin.succeed).not.toHaveBeenCalled()
      expect(mockSpin.fail).not.toHaveBeenCalled()
    })

    test('succeeds the spinner when generation is done', async () => {
      const {messages, port} = createPort()
      mockWorkerBuildStudioSchemasAndManifests.mockImplementation(async (_options, listeners) => {
        listeners.onGenerateManifestStart()
        listeners.onGenerateManifestDone()
        return {schemaInputs: null, studioManifest, type: 'success'}
      })

      await deployStudioSchemasAndManifestsWorker(port, createWorkerData())

      expect(mockSpin.start).toHaveBeenCalledTimes(1)
      expect(mockSpin.succeed).toHaveBeenCalledWith('Generated studio manifest')
      expect(mockSpin.fail).not.toHaveBeenCalled()
      expect(messages).toEqual([{studioManifest, type: 'success'}])
    })

    test('fails the spinner with the error message when generation fails', async () => {
      const {messages, port} = createPort()
      const failure = new Error('Failed to upload schema for workspace "default"')
      mockWorkerBuildStudioSchemasAndManifests.mockImplementation(async (_options, listeners) => {
        listeners.onGenerateManifestStart()
        listeners.onGenerateManifestFail(failure)
        throw failure
      })

      await deployStudioSchemasAndManifestsWorker(port, createWorkerData())

      expect(mockSpin.start).toHaveBeenCalledTimes(1)
      expect(mockSpin.fail).toHaveBeenCalledWith('Failed to upload schema for workspace "default"')
      expect(mockSpin.succeed).not.toHaveBeenCalled()
      expect(messages).toEqual([
        {
          error: 'Failed to upload schema for workspace "default"',
          type: 'error',
          validation: undefined,
        },
      ])
    })

    test('fails the spinner with a generic message for non-Error failures', async () => {
      const {port} = createPort()
      mockWorkerBuildStudioSchemasAndManifests.mockImplementation(async (_options, listeners) => {
        listeners.onGenerateManifestStart()
        listeners.onGenerateManifestFail('auth failure')
        return {schemaInputs: null, studioManifest, type: 'success'}
      })

      await deployStudioSchemasAndManifestsWorker(port, createWorkerData())

      expect(mockSpin.fail).toHaveBeenCalledWith('Unknown error')
    })
  })

  describe('schema deployment', () => {
    test('deploys the schema inputs handed back by the build', async () => {
      const {port} = createPort()
      handedSchemaInputs = [
        createSchemaInput(),
        createSchemaInput({
          dataset: 'staging',
          manifestSchema: [{name: 'author', type: 'document'}],
          name: 'staging',
          projectId: 'other-project',
          title: undefined,
        }),
      ]

      await deployStudioSchemasAndManifestsWorker(port, createWorkerData())

      expect(mockUpdateWorkspacesSchemas).toHaveBeenCalledWith({
        verbose: false,
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

    test('passes the verbose flag through to the schema deployment', async () => {
      const {port} = createPort()

      await deployStudioSchemasAndManifestsWorker(port, createWorkerData({verbose: true}))

      expect(mockUpdateWorkspacesSchemas).toHaveBeenCalledWith(
        expect.objectContaining({verbose: true}),
      )
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

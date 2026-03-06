import {resolve} from 'node:path'

import {type CliConfig, getCliConfig} from '@sanity/cli-core'
import {testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, beforeAll, beforeEach, describe, expect, test, vi} from 'vitest'

import {ValidateDocumentsCommand} from '../validate.js'

const VALID_DOCS_PATH = resolve(
  import.meta.dirname,
  '../../../../test/__fixtures__/valid-documents.ndjson',
)

const mocks = vi.hoisted(() => ({
  getGlobalCliClient: vi.fn(),
  validateDocuments: vi.fn(),
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: mocks.getGlobalCliClient,
  }
})

vi.mock('../../../actions/documents/validate.js', () => ({
  validateDocuments: mocks.validateDocuments,
}))

describe('#documents:validate flag passthrough', () => {
  let cwd: string
  let cliConfig: CliConfig

  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeAll(async () => {
    cwd = await testFixture('basic-studio')
    cliConfig = await getCliConfig(cwd)
  })

  beforeEach(() => {
    process.chdir(cwd)
    mocks.getGlobalCliClient.mockResolvedValue({
      config: () => ({
        dataset: cliConfig.api?.dataset,
        projectId: cliConfig.api?.projectId,
        token: 'test-token',
      }),
    })
    mocks.validateDocuments.mockResolvedValue(undefined)
  })

  test('passes --project-id to validateDocuments action', async () => {
    const {error} = await testCommand(ValidateDocumentsCommand, [
      '--yes',
      '--file',
      VALID_DOCS_PATH,
      '--format',
      'json',
      '--project-id',
      'override-project',
    ])

    if (error) throw error
    expect(mocks.validateDocuments).toHaveBeenCalledWith(
      expect.objectContaining({projectId: 'override-project'}),
    )
  })

  test('passes --dataset to validateDocuments action', async () => {
    const {error} = await testCommand(ValidateDocumentsCommand, [
      '--yes',
      '--file',
      VALID_DOCS_PATH,
      '--format',
      'json',
      '--dataset',
      'override-dataset',
    ])

    if (error) throw error
    expect(mocks.validateDocuments).toHaveBeenCalledWith(
      expect.objectContaining({dataset: 'override-dataset'}),
    )
  })

  test('passes --workspace to validateDocuments action', async () => {
    const {error} = await testCommand(ValidateDocumentsCommand, [
      '--yes',
      '--file',
      VALID_DOCS_PATH,
      '--format',
      'json',
      '--workspace',
      'production',
    ])

    if (error) throw error
    expect(mocks.validateDocuments).toHaveBeenCalledWith(
      expect.objectContaining({workspace: 'production'}),
    )
  })

  test('passes --level to validateDocuments action', async () => {
    const {error} = await testCommand(ValidateDocumentsCommand, [
      '--yes',
      '--file',
      VALID_DOCS_PATH,
      '--format',
      'json',
      '--level',
      'error',
    ])

    if (error) throw error
    expect(mocks.validateDocuments).toHaveBeenCalledWith(expect.objectContaining({level: 'error'}))
  })

  test('passes --max-custom-validation-concurrency to validateDocuments action', async () => {
    const {error} = await testCommand(ValidateDocumentsCommand, [
      '--yes',
      '--file',
      VALID_DOCS_PATH,
      '--format',
      'json',
      '--max-custom-validation-concurrency',
      '10',
    ])

    if (error) throw error
    expect(mocks.validateDocuments).toHaveBeenCalledWith(
      expect.objectContaining({maxCustomValidationConcurrency: 10}),
    )
  })

  test('passes --max-fetch-concurrency to validateDocuments action', async () => {
    const {error} = await testCommand(ValidateDocumentsCommand, [
      '--yes',
      '--file',
      VALID_DOCS_PATH,
      '--format',
      'json',
      '--max-fetch-concurrency',
      '50',
    ])

    if (error) throw error
    expect(mocks.validateDocuments).toHaveBeenCalledWith(
      expect.objectContaining({maxFetchConcurrency: 50}),
    )
  })

  test('passes resolved --file path as ndjsonFilePath to validateDocuments action', async () => {
    const {error} = await testCommand(ValidateDocumentsCommand, [
      '--yes',
      '--file',
      VALID_DOCS_PATH,
      '--format',
      'json',
    ])

    if (error) throw error
    expect(mocks.validateDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ndjsonFilePath: VALID_DOCS_PATH}),
    )
  })

  test('uses default values when optional flags are omitted', async () => {
    const {error} = await testCommand(ValidateDocumentsCommand, [
      '--yes',
      '--file',
      VALID_DOCS_PATH,
      '--format',
      'json',
    ])

    if (error) throw error
    expect(mocks.validateDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: undefined,
        level: 'warning',
        maxCustomValidationConcurrency: 5,
        maxFetchConcurrency: 25,
        projectId: undefined,
        workspace: undefined,
      }),
    )
  })
})

import path from 'node:path'

import {exitCodes} from '@sanity/cli-core'
import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import * as uxMocks from '@sanity/cli-test/mocks/cli-core/ux'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {ValidateDocumentsCommand} from '../validate'

const mockValidateDocuments = vi.hoisted(() => vi.fn())
const mockReporters = vi.hoisted(() => ({json: vi.fn(), ndjson: vi.fn(), pretty: vi.fn()}))
const mockRootError = vi.hoisted(() => class extends Error {}) // TODO: consider adding to a cli-core/errors mock, as cli-core/errors pulls in @sanity/client, which is huge
const mockStat = vi.hoisted(() => vi.fn())

vi.mock('node:fs/promises', () => ({
  stat: mockStat,
}))
vi.mock(
  '@sanity/cli-core/SanityCommand',
  () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)
vi.mock('@sanity/cli-core/ux', () => import('@sanity/cli-test/mocks/cli-core/ux'))
vi.mock('@sanity/cli-core/errors', () => ({ProjectRootNotFoundError: mockRootError}))
vi.mock('../../../actions/documents/types.js', () => ({}))
vi.mock('../../../actions/documents/validate.js', () => ({
  validateDocuments: mockValidateDocuments,
}))
vi.mock('../../../actions/documents/validation/reporters/index.js', () => ({
  reporters: mockReporters,
}))

const cliConfig = {studioHost: 'sanity.lol'}

describe('ValidateDocumentsCommand', () => {
  beforeEach(() => {
    mockValidateDocuments.mockResolvedValue('info')
    uxMocks.confirm.mockResolvedValue(true)
    mockStat.mockResolvedValue({isFile: () => true})
    mocks.SanityCmdGetCliConfig.mockResolvedValue(cliConfig)
    mocks.SanityCmdIsUnattended.mockReturnValue(false)
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should hint at running from project dir if ProjectRootNotFoundError thrown', async () => {
    mocks.SanityCmdGetProjectRoot.mockRejectedValueOnce(new mockRootError('derp'))

    await ValidateDocumentsCommand.run([])

    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
      expect.stringContaining('must be run from within a Sanity project'),
      {exit: 1},
    )
  })

  test('bails if confirmation denied in attended mode', async () => {
    uxMocks.confirm.mockResolvedValue(false)

    await ValidateDocumentsCommand.run([])

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith('Validation cancelled')
    expect(mocks.OclifCmdExit).toHaveBeenCalledWith(exitCodes.USER_ABORT)
    expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
  })

  test('bails if file provided cannot be validated', async () => {
    mockStat.mockResolvedValueOnce({isFile: () => false})

    await ValidateDocumentsCommand.run(['--file', '/some/file'])

    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
      expect.stringContaining('is not a file'),
      {exit: 2},
    )
  })

  test('bails if file provided does not exist', async () => {
    mockStat.mockRejectedValueOnce(new Error('not found'))

    await ValidateDocumentsCommand.run(['--file', '/some/file'])

    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
      expect.stringContaining('File not found'),
      {exit: 2},
    )
  })

  test('calls validateDocuments with all flags and does not error if return is not error', async () => {
    const ndjsonFilePath = path.join('some', 'file')
    const dataset = 'staging'
    const workspace = 'homeoffice'
    const level = 'info'
    const maxCustomValidationConcurrency = 10
    const maxFetchConcurrency = 10

    await ValidateDocumentsCommand.run([
      '--file',
      ndjsonFilePath,
      '--dataset',
      dataset,
      '--workspace',
      workspace,
      '--level',
      level,
      '--max-custom-validation-concurrency',
      String(maxCustomValidationConcurrency),
      '--max-fetch-concurrency',
      String(maxFetchConcurrency),
    ])

    expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
    expect(mockValidateDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset,
        level,
        maxCustomValidationConcurrency,
        maxFetchConcurrency,
        ndjsonFilePath: expect.stringContaining(ndjsonFilePath),
        studioHost: cliConfig.studioHost,
        workspace,
      }),
    )
  })

  test('calls validateDocuments with default values for flags and does not error if return is not error', async () => {
    await ValidateDocumentsCommand.run([])

    expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
    expect(mockValidateDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: undefined,
        level: 'warning',
        maxCustomValidationConcurrency: 5,
        maxFetchConcurrency: 25,
      }),
    )
  })

  test('calls validateDocuments and exits if return is error', async () => {
    mockValidateDocuments.mockResolvedValue('error')
    const ndjsonFilePath = '/some/file'
    const dataset = 'staging'

    await ValidateDocumentsCommand.run(['--file', ndjsonFilePath, '--dataset', dataset])

    expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
    expect(mocks.OclifCmdExit).toHaveBeenCalledWith(1)
  })

  test('calls validateDocuments and errors if it throws', async () => {
    mockValidateDocuments.mockRejectedValue('boom')
    const ndjsonFilePath = '/some/file'
    const dataset = 'staging'

    await ValidateDocumentsCommand.run(['--file', ndjsonFilePath, '--dataset', dataset])

    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith('boom', {exit: 1})
  })

  describe('bad flags', () => {
    test.each([
      {
        args: ['--level', 'critical'],
        description: 'unsupported level flag',
        expectedError: 'Expected --level=critical to be one of: error, warning, info',
      },
      {
        args: ['--max-custom-validation-concurrency', 'abc'],
        description: 'non-integer max-custom-validation-concurrency',
        expectedError: 'Expected an integer but received: abc',
      },
      {
        args: ['--max-fetch-concurrency', 'xyz'],
        description: 'non-integer max-fetch-concurrency',
        expectedError: 'Expected an integer but received: xyz',
      },
    ])('throws error for $description', async ({args, expectedError}) => {
      await expect(ValidateDocumentsCommand.run(args)).rejects.toThrow(
        expect.objectContaining({message: expect.stringContaining(expectedError)}),
      )
    })

    test('errors with unrecognized format flag', async () => {
      await expect(ValidateDocumentsCommand.run(['--format', 'xml'])).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining(
            'Expected --format=xml to be one of: json, ndjson, pretty',
          ),
        }),
      )
    })
  })
})

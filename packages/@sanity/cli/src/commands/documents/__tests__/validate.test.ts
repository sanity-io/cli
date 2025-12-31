import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {ValidateDocumentsCommand} from '../validate.js'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  isFile: vi.fn(),
  validate: vi.fn(),
}))

vi.mock('node:fs', () => ({
  default: {
    promises: {
      stat: vi.fn().mockResolvedValue({
        isFile: mocks.isFile,
      }),
    },
    resolve: vi.fn((dir, file) => `/resolved/${file}`),
  },
}))

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    confirm: mocks.confirm,
  }
})

vi.mock('../../../actions/documents/validate.js', () => ({
  validateDocuments: mocks.validate,
}))

const mockConfirm = mocks.confirm
const mockIsFile = mocks.isFile
const mockValidate = mocks.validate

const testProjectId = 'test-project'
const testDataset = 'test-dataset'

const defaultMocks = {
  cliConfig: {api: {dataset: testDataset, projectId: testProjectId}},
  globalApiClient: {
    config: vi.fn(() => ({
      dataset: testDataset,
      projectId: testProjectId,
    })),
  } as never,
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

describe('#documents:validate', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })
  beforeEach(() => {
    mockConfirm.mockResolvedValue(true)
    mockIsFile.mockReturnValue(true)
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['documents validate', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Validate documents in a dataset against the studio schema

      USAGE
        $ sanity documents validate [-d <value>] [--file <value>] [--format <value>]
          [--level error|warning|info] [--max-custom-validation-concurrency <value>]
          [--max-fetch-concurrency <value>] [--workspace <value>] [-y]

      FLAGS
        -d, --dataset=<value>                            Override the dataset used. By
                                                         default, this is derived from
                                                         the given workspace
        -y, --yes                                        Skips the first confirmation
                                                         prompt
            --file=<value>                               Provide a path to either an
                                                         .ndjson file or a tarball
                                                         containing an .ndjson file
            --format=<value>                             The output format used to
                                                         print the found validation
                                                         markers and report progress
            --level=<option>                             [default: warning] The
                                                         minimum level reported out.
                                                         Defaults to warning
                                                         <options: error|warning|info>
            --max-custom-validation-concurrency=<value>  [default: 5] Specify how many
                                                         custom validators can run
                                                         concurrently
            --max-fetch-concurrency=<value>              [default: 25] Specify how
                                                         many \`client.fetch\` requests
                                                         are allow concurrency at once
            --workspace=<value>                          The name of the workspace to
                                                         use when downloading and
                                                         validating all documents

      DESCRIPTION
        Validate documents in a dataset against the studio schema

      EXAMPLES
        Validates all documents in a Sanity project with more than one workspace

          $ sanity documents validate --workspace default

        Override the dataset specified in the workspace

          $ sanity documents validate --workspace default --dataset staging

        Save the results of the report into a file

          $ sanity documents validate --yes > report.txt

        Report out info level validation markers too

          $ sanity documents validate --level info

      "
    `)
  })

  test('throws error if user enters unsupported level flag', async () => {
    const {error} = await testCommand(ValidateDocumentsCommand, ['--level', 'critical'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Expected --level=critical to be one of: error, warning, info')
  })

  test('throws error if user enters non integer max-custom-validation-concurrency flag', async () => {
    const {error} = await testCommand(
      ValidateDocumentsCommand,
      ['--max-custom-validation-concurrency', 'abc'],
      {mocks: defaultMocks},
    )

    expect(error?.message).toContain('Expected an integer but received: abc')
  })

  test('throws error if user enters non integer max-fetch-concurrency flag', async () => {
    const {error} = await testCommand(
      ValidateDocumentsCommand,
      ['--max-fetch-concurrency', 'xyz'],
      {mocks: defaultMocks},
    )

    expect(error?.message).toContain('Expected an integer but received: xyz')
  })

  test('prompts user to confirm by default and exits if they do not want to continue', async () => {
    mockConfirm.mockResolvedValue(false)

    const {stdout} = await testCommand(ValidateDocumentsCommand, [], {mocks: defaultMocks})

    expect(stdout).toMatchInlineSnapshot(`
      "⚠ Warning: This command downloads all documents from your dataset and processes them through your local schema within a simulated browser environment.

      Potential pitfalls:

      - Processes all documents locally (excluding assets). Large datasets may require more resources.
      - Executes all custom validation functions. Some functions may need to be refactored for compatibility.
      - Not all standard browser features are available and may cause issues while loading your Studio.
      - Adheres to document permissions. Ensure this account can see all desired documents.
      User aborted
      "
    `)
    expect(mockConfirm).toHaveBeenCalledWith({
      default: true,
      message: expect.stringContaining('Are you sure you want to continue?'),
    })
    expect(mockConfirm).toHaveBeenCalled()
  })

  test('skips confirm if user uses yes flag', async () => {
    await testCommand(ValidateDocumentsCommand, ['--y'], {mocks: defaultMocks})

    expect(mockConfirm).not.toHaveBeenCalled()
  })

  test('exits if format is incorrect value', async () => {
    const {error} = await testCommand(ValidateDocumentsCommand, ['--format', 'xml'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain(
      "Did not recognize format 'xml'. Available formats are 'json', 'ndjson', and 'pretty'",
    )
  })

  test('exits if user inputs invalid file path in flag', async () => {
    mockIsFile.mockReturnValue(false)

    const {error} = await testCommand(
      ValidateDocumentsCommand,
      ['--file', '/non/existent/file.ndjson'],
      {mocks: defaultMocks},
    )

    expect(error?.message).toContain("'--file' must point to a valid ndjson file or tarball")
  })

  test('validateDocuments is called with the correct params', async () => {
    mockValidate.mockResolvedValue('warning')

    await testCommand(
      ValidateDocumentsCommand,
      [
        '--yes',
        '--dataset',
        'my-dataset',
        '--workspace',
        'my-workspace',
        '--level',
        'info',
        '--max-custom-validation-concurrency',
        '10',
        '--max-fetch-concurrency',
        '50',
        '--file',
        '/path/to/file.ndjson',
      ],
      {mocks: defaultMocks},
    )

    expect(mockValidate).toHaveBeenCalledWith({
      clientConfig: expect.any(Object),
      dataset: 'my-dataset',
      level: 'info',
      maxCustomValidationConcurrency: 10,
      maxFetchConcurrency: 50,
      ndjsonFilePath: expect.stringContaining('file.ndjson'),
      reporter: expect.any(Function),
      studioHost: undefined,
      workDir: '/test/path',
      workspace: 'my-workspace',
    })
  })

  test('exits with code 1 if validateDocuments returns overall level as error', async () => {
    mockValidate.mockResolvedValue('error')

    const {error} = await testCommand(ValidateDocumentsCommand, [], {mocks: defaultMocks})

    expect(error?.oclif?.exit).toBe(1)
  })

  test('exits with code 0 if validateDocuments does not return overall level as error', async () => {
    mockValidate.mockResolvedValue('warning')

    const {error} = await testCommand(ValidateDocumentsCommand, [], {mocks: defaultMocks})

    expect(error).toBe(undefined)
  })
})

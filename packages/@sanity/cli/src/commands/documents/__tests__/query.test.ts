import {runCommand} from '@oclif/test'
import {chalk} from '@sanity/cli-core/ux'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {QueryDocumentCommand} from '../query.js'

const testProjectId = 'test-project'
const testDataset = 'production'

const defaultMocks = {
  cliConfig: {api: {dataset: testDataset, projectId: testProjectId}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

const mockFetch = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      fetch: mockFetch,
    }),
  }
})

describe('#documents:query', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['documents query', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Query for documents

      USAGE
        $ sanity documents query QUERY [--anonymous] [--api-version <value>] [-d
          <value>] [--pretty] [-p <value>]

      ARGUMENTS
        QUERY  GROQ query to run against the dataset

      FLAGS
        -d, --dataset=<value>      Dataset to query (overrides config)
        -p, --project=<value>      Project ID to query (overrides config)
            --anonymous            Send the query without any authorization token
            --api-version=<value>  [env: SANITY_CLI_QUERY_API_VERSION] API version to
                                   use (defaults to 2025-08-15)
            --pretty               Colorize JSON output

      DESCRIPTION
        Query for documents

      EXAMPLES
        Fetch 5 documents of type "movie"

          $ sanity documents query '*[_type == "movie"][0..4]'

        Fetch title of the oldest movie in the dataset named "staging"

          $ sanity documents query '*[_type == "movie"]|order(releaseDate \\
            asc)[0]{title}' --dataset staging

        Use API version v2021-06-07 and do a query

          $ sanity documents query '*[_id == "header"] { "headerText": \\
            pt::text(body) }' --api-version v2021-06-07

      "
    `)
  })

  test('executes query successfully with basic options', async () => {
    const mockResults = [
      {
        _id: 'movie1',
        _type: 'movie',
        title: 'The Matrix',
      },
      {
        _id: 'movie2',
        _type: 'movie',
        title: 'Inception',
      },
    ]

    mockFetch.mockResolvedValue(mockResults)

    const {stdout} = await testCommand(QueryDocumentCommand, ['*[_type == "movie"]'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('"_id": "movie1"')
    expect(stdout).toContain('"title": "The Matrix"')
    expect(mockFetch).toHaveBeenCalledWith('*[_type == "movie"]')
  })

  test('executes query with pretty flag for colorized output', async () => {
    const mockResults = [{_id: 'test', title: 'Test Movie'}]

    mockFetch.mockResolvedValue(mockResults)

    const originalChalkLevel = chalk.level
    // Force colorization
    chalk.level = 3

    const {stdout} = await testCommand(QueryDocumentCommand, ['*[_type == "movie"]', '--pretty'], {
      capture: {
        stripAnsi: false,
      },
      mocks: defaultMocks,
    })

    // Reset chalk level
    chalk.level = originalChalkLevel

    expect(mockFetch).toHaveBeenCalledWith('*[_type == "movie"]')
    expect(stdout).toContain('"_id"')
    expect(stdout).toContain('test')
    // eslint-disable-next-line no-control-regex
    expect(stdout).toMatch(/\u001B\[\d+m/)
  })

  test('uses dataset flag to override config', async () => {
    const mockResults = [{_id: 'test', title: 'Test'}]
    const overrideDataset = 'staging'

    mockFetch.mockResolvedValue(mockResults)

    const {stdout} = await testCommand(
      QueryDocumentCommand,
      ['*[_type == "movie"]', '--dataset', overrideDataset],
      {
        mocks: defaultMocks,
      },
    )

    expect(stdout).toContain('"_id": "test"')
    expect(mockFetch).toHaveBeenCalledWith('*[_type == "movie"]')
  })

  test('uses project flag to override config', async () => {
    const mockResults = [{_id: 'test', title: 'Test'}]

    mockFetch.mockResolvedValue(mockResults)

    const {stdout} = await testCommand(
      QueryDocumentCommand,
      ['*[_type == "movie"]', '--project', 'other-project'],
      {
        mocks: defaultMocks,
      },
    )

    expect(stdout).toContain('"_id": "test"')
    expect(mockFetch).toHaveBeenCalledWith('*[_type == "movie"]')
  })

  test('uses anonymous flag to skip authentication', async () => {
    const mockResults = [{_id: 'test', title: 'Test'}]

    mockFetch.mockResolvedValue(mockResults)

    const {stdout} = await testCommand(
      QueryDocumentCommand,
      ['*[_type == "movie"]', '--anonymous'],
      {
        mocks: defaultMocks,
      },
    )

    expect(stdout).toContain('"_id": "test"')
    expect(mockFetch).toHaveBeenCalledWith('*[_type == "movie"]')
  })

  test('uses custom API version', async () => {
    const mockResults = [{_id: 'test', title: 'Test'}]
    const customApiVersion = 'v2021-06-07'

    mockFetch.mockResolvedValue(mockResults)

    const {stdout} = await testCommand(
      QueryDocumentCommand,
      ['*[_type == "movie"]', '--api-version', customApiVersion],
      {
        mocks: defaultMocks,
      },
    )

    expect(stdout).toContain('"_id": "test"')
    expect(mockFetch).toHaveBeenCalledWith('*[_type == "movie"]')
  })

  test('shows warning and uses default API version when not specified', async () => {
    const mockResults = [{_id: 'test', title: 'Test'}]

    mockFetch.mockResolvedValue(mockResults)

    const {stderr, stdout} = await testCommand(QueryDocumentCommand, ['*[_type == "movie"]'], {
      mocks: defaultMocks,
    })

    expect(stderr).toContain('--api-version not specified, using `2025-08-15`')
    expect(stdout).toContain('"_id": "test"')
  })

  test('fails when no project ID is configured or provided', async () => {
    const {error} = await testCommand(QueryDocumentCommand, ['*[_type == "movie"]'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {dataset: testDataset}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('sanity.cli.ts does not contain a project identifier')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when no dataset is configured or provided', async () => {
    const {error} = await testCommand(QueryDocumentCommand, ['*[_type == "movie"]'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: testProjectId}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No dataset specified')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when query returns null/undefined', async () => {
    mockFetch.mockResolvedValue(null)

    const {error} = await testCommand(QueryDocumentCommand, ['*[_type == "nonexistent"]'], {
      mocks: defaultMocks,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Query returned no results')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles query execution errors', async () => {
    const queryError = new Error('Invalid query syntax')

    mockFetch.mockRejectedValue(queryError)

    const {error} = await testCommand(QueryDocumentCommand, ['invalid query'], {
      mocks: defaultMocks,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Invalid GROQ query syntax: Invalid query syntax')
    expect(error?.message).toContain('Query: invalid query')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('uses environment variable for API version when set', async () => {
    const mockResults = [{_id: 'test', title: 'Test'}]
    const envApiVersion = 'v2023-01-01'

    // Mock environment variable
    vi.stubEnv('SANITY_CLI_QUERY_API_VERSION', envApiVersion)

    mockFetch.mockResolvedValue(mockResults)

    const {stdout} = await testCommand(QueryDocumentCommand, ['*[_type == "movie"]'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('"_id": "test"')
    expect(mockFetch).toHaveBeenCalledWith('*[_type == "movie"]')

    vi.unstubAllEnvs()
  })
})

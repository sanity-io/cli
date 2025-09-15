import {runCommand} from '@oclif/test'
import {getCliConfig, getProjectCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {type DatasetAliasDefinition} from '../../../services/datasets.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {ListDatasetCommand} from '../list.js'

vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/path',
    root: '/test/path',
    type: 'studio',
  }),
}))

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn().mockResolvedValue({
    api: {
      projectId: 'test-project',
    },
  }),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock('../../../../../cli-core/src/services/apiClient.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../../cli-core/src/services/apiClient.js')>()
  return {
    ...actual,
    getProjectCliClient: vi.fn(),
  }
})

const mockGetProjectCliClient = vi.mocked(getProjectCliClient)

const setupMockClient = (
  datasets = [{name: 'production'}, {name: 'test'}],
  aliases: DatasetAliasDefinition[] = [{datasetName: 'production', name: 'prod'}],
  aliasError?: Error,
) => {
  const mockRequest = aliasError
    ? vi.fn().mockRejectedValue(aliasError)
    : vi.fn().mockResolvedValue(aliases)

  mockGetProjectCliClient.mockResolvedValue({
    datasets: {
      list: vi.fn().mockResolvedValue(datasets),
    },
    request: mockRequest,
  } as never)
}

describe('#dataset:list', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['dataset list', '--help'])
    expect(stdout).toMatchInlineSnapshot(`
      "List datasets of your project

      USAGE
        $ sanity dataset list

      DESCRIPTION
        List datasets of your project

      EXAMPLES
        List datasets of your project

          $ sanity dataset list

      "
    `)
  })

  test('lists datasets successfully', async () => {
    setupMockClient([{name: 'production'}, {name: 'test'}, {name: 'development'}], [])

    const {stdout} = await testCommand(ListDatasetCommand, [])
    expect(stdout).toBe('production\ntest\ndevelopment\n')
  })

  test('lists datasets and aliases successfully', async () => {
    setupMockClient(
      [{name: 'production'}, {name: 'test'}],
      [
        {datasetName: 'production', name: 'prod'},
        {datasetName: 'test', name: 'staging'},
      ],
    )

    const {stdout} = await testCommand(ListDatasetCommand, [])
    expect(stdout).toBe('production\ntest\n~prod -> production\n~staging -> test\n')
  })

  test('handles unlinked aliases', async () => {
    setupMockClient(
      [{name: 'production'}],
      [
        {datasetName: 'production', name: 'prod'},
        {datasetName: null, name: 'old'},
      ],
    )

    const {stdout} = await testCommand(ListDatasetCommand, [])
    expect(stdout).toBe('production\n~prod -> production\n~old -> <unlinked>\n')
  })

  test('handles empty dataset list', async () => {
    setupMockClient([], [])

    const {stdout} = await testCommand(ListDatasetCommand, [])
    expect(stdout).toBe('No datasets found for this project.\n')
  })

  test('handles alias fetch failure gracefully', async () => {
    setupMockClient([{name: 'production'}], [], new Error('Alias service unavailable'))

    const {stdout} = await testCommand(ListDatasetCommand, [])
    expect(stdout).toBe('production\n')
  })

  test('shows error when no project ID is found', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {projectId: undefined},
    })

    const {error} = await testCommand(ListDatasetCommand, [])
    expect(error?.message).toBe(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API errors when listing datasets ', async () => {
    const listError = new Error('Internal Server Error')
    Object.assign(listError, {statusCode: 500})

    mockGetProjectCliClient.mockResolvedValue({
      datasets: {
        list: vi.fn().mockRejectedValue(listError),
      },
    } as never)

    const {error} = await testCommand(ListDatasetCommand, [])
    expect(error?.message).toContain('Dataset list retrieval failed')
    expect(error?.message).toContain('Internal Server Error')
    expect(error?.oclif?.exit).toBe(1)
  })
})

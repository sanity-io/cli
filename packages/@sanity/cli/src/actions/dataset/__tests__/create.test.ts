import {createMockOutput} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createDataset as createDatasetService} from '../../../services/datasets.js'
import {createDataset} from '../create.js'
import {determineDatasetAclMode} from '../determineDatasetAclMode.js'

const mockSpinnerSucceed = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/ux', () => ({
  spinner: vi.fn(() => ({
    start: vi.fn(() => ({succeed: mockSpinnerSucceed})),
  })),
}))
vi.mock('../../../services/datasets.js', () => ({
  createDataset: vi.fn(),
}))
vi.mock('../determineDatasetAclMode.js', () => ({
  determineDatasetAclMode: vi.fn(),
}))

const mockCreateDatasetService = vi.mocked(createDatasetService)
const mockDetermineDatasetAclMode = vi.mocked(determineDatasetAclMode)
const output = createMockOutput()
const dataset = {aclMode: 'public' as const, datasetName: 'production'}
const options = {
  datasetName: 'production',
  output,
  projectFeatures: [],
  projectId: 'project-id',
}

describe('actions/dataset/create', () => {
  beforeEach(() => {
    mockDetermineDatasetAclMode.mockResolvedValue('public')
    mockCreateDatasetService.mockResolvedValue(dataset)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('logs human-readable success output by default', async () => {
    await expect(createDataset(options)).resolves.toEqual(dataset)

    expect(output.log).toHaveBeenCalledWith('Dataset created successfully')
  })

  test('omits human-readable success output when silent', async () => {
    await expect(createDataset({...options, silent: true})).resolves.toEqual(dataset)

    expect(output.log).not.toHaveBeenCalled()
  })
})

import {afterEach, describe, expect, test, vi} from 'vitest'

import {promptForAppTemplateSetup} from '../promptForAppTemplateSetup.js'

const mockSelect = vi.hoisted(() => vi.fn())
const mockListProjects = vi.hoisted(() => vi.fn())
const mockGetOrCreateProject = vi.hoisted(() => vi.fn())
const mockGetOrCreateDataset = vi.hoisted(() => vi.fn())
const mockPromptForProjectCreation = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/ux', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core/ux')>()),
  select: mockSelect,
}))
vi.mock('../../../../services/projects.js', () => ({
  listProjects: mockListProjects,
}))
vi.mock('../getOrCreateProject.js', () => ({
  getOrCreateProject: mockGetOrCreateProject,
}))
vi.mock('../getOrCreateDataset.js', () => ({
  getOrCreateDataset: mockGetOrCreateDataset,
}))
vi.mock('../promptForProjectCreation.js', () => ({
  promptForProjectCreation: mockPromptForProjectCreation,
}))

function setup(overrides: Partial<Parameters<typeof promptForAppTemplateSetup>[0]> = {}) {
  const trace = {log: vi.fn()}
  const promise = promptForAppTemplateSetup({
    coupon: undefined,
    dataset: undefined,
    datasetDefault: false,
    newProject: undefined,
    organization: undefined,
    organizationId: 'org-123',
    output: {} as never,
    planId: undefined,
    project: undefined,
    trace: trace as never,
    unattended: false,
    user: {} as never,
    visibility: undefined,
    ...overrides,
  })
  return {promise, trace}
}

function datasetSteps(trace: {log: ReturnType<typeof vi.fn>}) {
  return trace.log.mock.calls
    .map(([entry]) => entry)
    .filter((entry) => entry.step === 'createOrSelectDataset')
}

describe('promptForAppTemplateSetup telemetry', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('logs a skipped dataset when the user skips project setup', async () => {
    mockListProjects.mockResolvedValueOnce([])
    mockSelect.mockResolvedValueOnce('__skip__')

    const {promise, trace} = setup()
    await promise

    expect(mockGetOrCreateDataset).not.toHaveBeenCalled()
    expect(datasetSteps(trace)).toEqual([
      {datasetName: '', selectedOption: 'skip', step: 'createOrSelectDataset'},
    ])
  })

  test('logs the dataset choice when the user picks an existing project', async () => {
    mockListProjects.mockResolvedValueOnce([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Existing',
        id: 'pid',
        organizationId: 'org',
      },
    ])
    mockSelect.mockResolvedValueOnce('pid')
    mockGetOrCreateDataset.mockResolvedValueOnce({datasetName: 'production', userAction: 'select'})

    const {promise, trace} = setup({visibility: 'private'})
    await promise

    expect(datasetSteps(trace)).toEqual([
      {
        datasetName: 'production',
        selectedOption: 'select',
        step: 'createOrSelectDataset',
        visibility: 'private',
      },
    ])
  })

  test('logs the dataset choice when the user creates a new project', async () => {
    mockListProjects.mockResolvedValueOnce([])
    mockSelect.mockResolvedValueOnce('__new__')
    mockPromptForProjectCreation.mockResolvedValueOnce({displayName: 'New', projectId: 'new-pid'})
    mockGetOrCreateDataset.mockResolvedValueOnce({datasetName: 'staging', userAction: 'create'})

    const {promise, trace} = setup()
    await promise

    expect(datasetSteps(trace)).toEqual([
      {
        datasetName: 'staging',
        selectedOption: 'create',
        step: 'createOrSelectDataset',
        visibility: undefined,
      },
    ])
  })

  test('logs a skipped dataset when unattended without a project flag', async () => {
    const {promise, trace} = setup({unattended: true})
    await promise

    expect(mockGetOrCreateProject).not.toHaveBeenCalled()
    expect(datasetSteps(trace)).toEqual([
      {datasetName: '', selectedOption: 'skip', step: 'createOrSelectDataset'},
    ])
  })

  test('logs the dataset when a project flag is passed', async () => {
    mockGetOrCreateProject.mockResolvedValueOnce({displayName: 'Flagged', projectId: 'pid'})
    mockGetOrCreateDataset.mockResolvedValueOnce({datasetName: 'production', userAction: 'none'})

    const {promise, trace} = setup({dataset: 'production', project: 'pid', unattended: true})
    await promise

    expect(mockListProjects).not.toHaveBeenCalled()
    expect(datasetSteps(trace)).toEqual([
      {
        datasetName: 'production',
        selectedOption: 'none',
        step: 'createOrSelectDataset',
        visibility: undefined,
      },
    ])
  })
})

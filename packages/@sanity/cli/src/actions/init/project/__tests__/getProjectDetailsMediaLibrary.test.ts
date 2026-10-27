/**
 * The media-library-config template records only `app.organizationId`, so
 * `getProjectDetails` must never run the project/dataset setup for it —
 * no "Configure a project for this app?" prompt, no throwaway project or
 * dataset creation, and no organization override from a selected project.
 */
import {afterEach, describe, expect, test, vi} from 'vitest'

import {getProjectDetails} from '../getProjectDetails.js'

const mockListOrganizations = vi.hoisted(() => vi.fn())
const mockPromptForAppTemplateSetup = vi.hoisted(() => vi.fn())
const mockPromptUserForOrganization = vi.hoisted(() => vi.fn())
const mockGetOrCreateProject = vi.hoisted(() => vi.fn())
const mockGetOrCreateDataset = vi.hoisted(() => vi.fn())

vi.mock('../../../../services/organizations.js', () => ({
  listOrganizations: mockListOrganizations,
}))
vi.mock('../promptForAppTemplateSetup.js', () => ({
  promptForAppTemplateSetup: mockPromptForAppTemplateSetup,
}))
vi.mock('../promptUserForOrganization.js', () => ({
  promptUserForOrganization: mockPromptUserForOrganization,
}))
vi.mock('../getOrCreateProject.js', () => ({
  getOrCreateProject: mockGetOrCreateProject,
}))
vi.mock('../getOrCreateDataset.js', () => ({
  getOrCreateDataset: mockGetOrCreateDataset,
}))

function setup(overrides: Partial<Parameters<typeof getProjectDetails>[0]> = {}) {
  const output = {
    error: vi.fn(),
    log: vi.fn(),
    logDiagnostic: vi.fn(),
    logJson: vi.fn(),
    warn: vi.fn(),
  }
  const trace = {log: vi.fn()}
  const promise = getProjectDetails({
    coupon: undefined,
    dataset: undefined,
    datasetDefault: false,
    isAppTemplate: true,
    isMediaLibraryTemplate: true,
    newProject: undefined,
    organization: undefined,
    output: output as never,
    planId: undefined,
    project: undefined,
    showDefaultConfigPrompt: false,
    trace: trace as never,
    unattended: false,
    user: {} as never,
    visibility: undefined,
    ...overrides,
  })
  return {output, promise, trace}
}

describe('getProjectDetails for the media-library-config template', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('with --organization: skips all prompts and returns the org unchanged', async () => {
    const {promise} = setup({organization: 'org-flag'})

    await expect(promise).resolves.toEqual({
      datasetName: '',
      displayName: '',
      isFirstProject: false,
      organizationId: 'org-flag',
      projectId: '',
    })
    expect(mockPromptUserForOrganization).not.toHaveBeenCalled()
    expect(mockPromptForAppTemplateSetup).not.toHaveBeenCalled()
    expect(mockGetOrCreateProject).not.toHaveBeenCalled()
    expect(mockGetOrCreateDataset).not.toHaveBeenCalled()
  })

  test('without --organization: prompts for the org only, never for a project', async () => {
    mockListOrganizations.mockResolvedValueOnce([{id: 'org-prompted', name: 'Acme'}])
    mockPromptUserForOrganization.mockResolvedValueOnce('org-prompted')

    const {promise, trace} = setup()

    await expect(promise).resolves.toEqual({
      datasetName: '',
      displayName: '',
      isFirstProject: false,
      organizationId: 'org-prompted',
      projectId: '',
    })
    expect(mockPromptUserForOrganization).toHaveBeenCalledTimes(1)
    expect(mockPromptForAppTemplateSetup).not.toHaveBeenCalled()
    expect(trace.log).toHaveBeenCalledWith({
      datasetName: '',
      selectedOption: 'skip',
      step: 'createOrSelectDataset',
    })
  })

  test('project flags are warned about and cannot stand in for the org prompt', async () => {
    mockListOrganizations.mockResolvedValueOnce([{id: 'org-prompted', name: 'Acme'}])
    mockPromptUserForOrganization.mockResolvedValueOnce('org-prompted')

    const {output, promise} = setup({project: 'proj-1'})

    await expect(promise).resolves.toMatchObject({
      organizationId: 'org-prompted',
      projectId: '',
    })
    expect(mockPromptUserForOrganization).toHaveBeenCalledTimes(1)
    expect(mockPromptForAppTemplateSetup).not.toHaveBeenCalled()
    expect(output.warn).toHaveBeenCalledWith(
      'Project flags are ignored for the media-library-config template — it only records the organization.',
    )
  })

  test('control: a regular app template still runs the project setup', async () => {
    mockPromptForAppTemplateSetup.mockResolvedValueOnce({
      datasetName: 'production',
      displayName: 'My project',
      organizationId: 'org-from-project',
      projectId: 'proj-1',
    })

    const {promise} = setup({isMediaLibraryTemplate: false, organization: 'org-flag'})

    await expect(promise).resolves.toMatchObject({
      datasetName: 'production',
      organizationId: 'org-from-project',
      projectId: 'proj-1',
    })
    expect(mockPromptForAppTemplateSetup).toHaveBeenCalledTimes(1)
  })
})

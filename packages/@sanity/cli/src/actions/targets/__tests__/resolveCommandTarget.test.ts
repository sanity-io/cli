import {beforeEach, expect, test, vi} from 'vitest'

import {resolveCommandTarget} from '../resolveCommandTarget.js'

const {checkout, getDeployedStack, listDatasets, promptForDataset, promptForProject, select} =
  vi.hoisted(() => ({
    checkout: vi.fn(),
    getDeployedStack: vi.fn(),
    listDatasets: vi.fn(),
    promptForDataset: vi.fn(),
    promptForProject: vi.fn(),
    select: vi.fn(),
  }))

vi.mock('../../../util/checkoutBlueprint.js', () => ({getCheckoutBlueprint: checkout}))
vi.mock('../../../services/blueprints.js', () => ({getDeployedStack}))
vi.mock('../../../services/datasets.js', () => ({listDatasets}))
vi.mock('../../../prompts/promptForDataset.js', () => ({promptForDataset}))
vi.mock('../../../prompts/promptForProject.js', () => ({promptForProject}))
vi.mock('@sanity/cli-core/ux', () => ({select}))

const loadCliConfig = vi.fn()
const query = {loadCliConfig, needsDataset: true, unattended: true} as const
const projectStack = {scopeId: 'linkedproject', scopeType: 'project', stackId: 'ST-checkout'}
const orgStack = {scopeId: 'org-abc', scopeType: 'organization', stackId: 'ST-organization'}

beforeEach(() => {
  vi.resetAllMocks()
  loadCliConfig.mockResolvedValue({})
})

test('resolves the real deployed dataset name from a project Stack', async () => {
  checkout.mockReturnValue(projectStack)
  getDeployedStack.mockResolvedValue({
    resources: [
      {
        externalId: 'linkedproject:actual-dataset',
        name: 'logical-name',
        type: 'sanity.project.dataset',
      },
      {externalId: 'otherproject:dataset', type: 'sanity.project.dataset'},
      {externalId: null, name: 'future-dataset', type: 'sanity.project.dataset'},
    ],
  })

  await expect(resolveCommandTarget(query)).resolves.toEqual({
    dataset: 'actual-dataset',
    projectId: 'linkedproject',
  })
  expect(loadCliConfig).not.toHaveBeenCalled()
  expect(getDeployedStack).toHaveBeenCalledWith(projectStack)
})

test('uses Studio CLI config when no checkout is linked', async () => {
  loadCliConfig.mockResolvedValue({api: {dataset: 'classic', projectId: 'classicproject'}})

  await expect(resolveCommandTarget(query)).resolves.toEqual({
    dataset: 'classic',
    projectId: 'classicproject',
  })
  await expect(resolveCommandTarget({...query, project: 'otherproject'})).rejects.toThrow(
    'Dataset is required. Try again with `--dataset <name>`.',
  )
  expect(getDeployedStack).not.toHaveBeenCalled()
})

test('uses the organization Stack default project and can narrow by explicit dataset', async () => {
  checkout.mockReturnValue(orgStack)
  getDeployedStack.mockResolvedValue({
    defaultProjectId: 'alpha',
    resources: [
      {externalId: 'alpha:production', type: 'sanity.project.dataset'},
      {externalId: 'beta:staging', type: 'sanity.project.dataset'},
    ],
  })

  await expect(resolveCommandTarget(query)).resolves.toEqual({
    dataset: 'production',
    projectId: 'alpha',
  })
  await expect(resolveCommandTarget({...query, dataset: 'staging'})).resolves.toEqual({
    dataset: 'staging',
    projectId: 'beta',
  })
})

test('asks for a choice among deployed candidates and requires flags unattended', async () => {
  checkout.mockReturnValue(orgStack)
  getDeployedStack.mockResolvedValue({
    resources: [
      {externalId: 'alpha:production', type: 'sanity.project.dataset'},
      {externalId: 'alpha:preview', type: 'sanity.project.dataset'},
      {externalId: 'beta:staging', type: 'sanity.project.dataset'},
    ],
  })

  await expect(resolveCommandTarget(query)).rejects.toThrow(
    'Try again with `--project <project-id>`.',
  )
  await expect(resolveCommandTarget({...query, project: 'alpha'})).rejects.toThrow(
    'Try again with `--dataset <name>`.',
  )
  expect(select).not.toHaveBeenCalled()

  select.mockResolvedValueOnce('alpha').mockResolvedValueOnce('preview')
  await expect(resolveCommandTarget({...query, unattended: false})).resolves.toEqual({
    dataset: 'preview',
    projectId: 'alpha',
  })
  expect(select).toHaveBeenNthCalledWith(1, {
    choices: [
      {name: 'alpha', value: 'alpha'},
      {name: 'beta', value: 'beta'},
    ],
    message: 'Select a project from this Stack',
  })
  expect(select).toHaveBeenNthCalledWith(2, {
    choices: [
      {name: 'preview', value: 'preview'},
      {name: 'production', value: 'production'},
    ],
    message: 'Select a dataset from this Stack',
  })
})

test('offers live datasets when the Stack has only an undeployed declaration', async () => {
  checkout.mockReturnValue(projectStack)
  getDeployedStack.mockResolvedValue({
    resources: [{externalId: null, name: 'declared', type: 'sanity.project.dataset'}],
  })
  const datasets = [{name: 'live-dataset'}]
  listDatasets.mockResolvedValue(datasets)
  promptForDataset.mockResolvedValue('live-dataset')

  await expect(resolveCommandTarget(query)).rejects.toThrow(
    'No deployed dataset found in the linked Stack for this project. Try again with `--dataset <name>`.',
  )
  await expect(resolveCommandTarget({...query, unattended: false})).resolves.toEqual({
    dataset: 'live-dataset',
    projectId: 'linkedproject',
  })
  expect(listDatasets).toHaveBeenCalledExactlyOnceWith('linkedproject')
  expect(promptForDataset).toHaveBeenCalledExactlyOnceWith({datasets})
  expect(select).not.toHaveBeenCalled()
})

test('uses both explicit flags without consulting either local config or the Stack', async () => {
  await expect(
    resolveCommandTarget({...query, dataset: 'requested', project: 'otherproject'}),
  ).resolves.toEqual({dataset: 'requested', projectId: 'otherproject'})

  expect(checkout).not.toHaveBeenCalled()
  expect(loadCliConfig).not.toHaveBeenCalled()
  expect(getDeployedStack).not.toHaveBeenCalled()
})

test('does not look up the Stack for a different explicit project in a project-scoped checkout', async () => {
  checkout.mockReturnValue(projectStack)
  await expect(resolveCommandTarget({...query, project: 'otherproject'})).rejects.toThrow(
    'Dataset is required. Try again with `--dataset <name>`.',
  )
  expect(getDeployedStack).not.toHaveBeenCalled()
})

test('requires both flags when running unattended outside any configured checkout', async () => {
  await expect(resolveCommandTarget(query)).rejects.toThrow(
    'Project is required. Try again with `--project <project-id> --dataset <name>`.',
  )
  expect(promptForProject).not.toHaveBeenCalled()
  expect(listDatasets).not.toHaveBeenCalled()
})

test.each([undefined, orgStack])(
  'prompts for a project and dataset without deployed or configured targets (%s)',
  async (stack) => {
    checkout.mockReturnValue(stack)
    getDeployedStack.mockResolvedValue({resources: []})
    promptForProject.mockResolvedValue('chosenproject')
    const datasets = [{name: 'staging'}, {name: 'production'}]
    listDatasets.mockResolvedValue(datasets)
    promptForDataset.mockResolvedValue('staging')

    await expect(resolveCommandTarget({...query, unattended: false})).resolves.toEqual({
      dataset: 'staging',
      projectId: 'chosenproject',
    })
    expect(promptForProject).toHaveBeenCalledExactlyOnceWith({organizationId: stack?.scopeId})
    expect(listDatasets).toHaveBeenCalledExactlyOnceWith('chosenproject')
    expect(promptForDataset).toHaveBeenCalledExactlyOnceWith({datasets})
  },
)

test('reports broken Stack access with a flag that skips the lookup', async () => {
  checkout.mockReturnValue(projectStack)
  getDeployedStack.mockRejectedValue(new Error('Forbidden'))

  await expect(resolveCommandTarget(query)).rejects.toThrow(
    'Could not read Stack ST-checkout. Check your Stack access. Try again with `--dataset <name>`.',
  )
  await expect(resolveCommandTarget({...query, dataset: 'requested'})).resolves.toEqual({
    dataset: 'requested',
    projectId: 'linkedproject',
  })
  expect(getDeployedStack).toHaveBeenCalledTimes(1)
})

test('reports an unreadable link with flags that bypass the checkout', async () => {
  checkout.mockImplementation(() => {
    throw new Error('Invalid JSON')
  })

  await expect(resolveCommandTarget(query)).rejects.toThrow(
    'Could not read the local Blueprint Stack link. Check .sanity/blueprint.config.json. Try again with `--project <project-id> --dataset <name>`.',
  )
})

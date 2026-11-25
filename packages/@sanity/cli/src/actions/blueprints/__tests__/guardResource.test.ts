import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {beforeEach, expect, onTestFinished, test, vi} from 'vitest'

import {getBlueprintResourceProblem, guardBlueprintDataset} from '../guardResource.js'

const {getCheckoutBlueprint, getCheckoutManifest, getDeployedStack, getProjectById} = vi.hoisted(
  () => ({
    getCheckoutBlueprint: vi.fn(),
    getCheckoutManifest: vi.fn(),
    getDeployedStack: vi.fn(),
    getProjectById: vi.fn(),
  }),
)

vi.mock('../../../util/checkoutBlueprint.js', () => ({getCheckoutBlueprint, getCheckoutManifest}))
vi.mock('../../../services/blueprints.js', () => ({getDeployedStack}))
vi.mock('../../../services/projects.js', () => ({getProjectById}))

const projectScope = {id: 'project-one', type: 'project'} as const
const target = {id: 'production', label: 'dataset "production"', type: 'sanity.project.dataset'}
const projectLink = {
  directory: '/test/linked',
  scopeId: 'project-one',
  scopeType: 'project',
  stackId: 'ST-project',
}
const orgLink = {...projectLink, scopeId: 'org-a', scopeType: 'organization', stackId: 'ST-org'}

beforeEach(() => {
  vi.resetAllMocks()
  getCheckoutBlueprint.mockReturnValue(projectLink)
})

test('checks deployed resource identity within the linked Stack', async () => {
  getDeployedStack.mockResolvedValue({
    name: 'Deployment',
    resources: [
      {externalId: 'project-two:production', type: target.type},
      {externalId: 'project-one:production', type: 'sanity.project.webhook'},
      {externalId: 'project-one:production', type: target.type},
    ],
  })

  await expect(getBlueprintResourceProblem(projectScope, target, 'delete')).resolves.toEqual({
    exitCode: 2,
    message: expect.stringContaining('Blueprint Stack "Deployment" manages dataset "production"'),
  })
  expect(getDeployedStack).toHaveBeenCalledExactlyOnceWith(projectLink)
  expect(getProjectById).not.toHaveBeenCalled()
})

test('checks an organization Stack for a project in that organization', async () => {
  getCheckoutBlueprint.mockReturnValue(orgLink)
  getProjectById.mockResolvedValue({organizationId: 'org-a'})
  getDeployedStack.mockResolvedValue({
    name: 'Organization Stack',
    resources: [{externalId: 'project-one:production', type: target.type}],
  })

  await expect(getBlueprintResourceProblem(projectScope, target, 'edit')).resolves.toMatchObject({
    message: expect.stringContaining('Blueprint Stack "Organization Stack" manages'),
  })
  expect(getDeployedStack).toHaveBeenCalledExactlyOnceWith(orgLink)
})

test('skips a linked Stack outside the requested project or organization', async () => {
  await expect(
    getBlueprintResourceProblem({...projectScope, id: 'project-two'}, target, 'delete'),
  ).resolves.toBeUndefined()

  getCheckoutBlueprint.mockReturnValue(orgLink)
  getProjectById.mockResolvedValue({organizationId: 'org-b'})
  await expect(getBlueprintResourceProblem(projectScope, target, 'delete')).resolves.toBeUndefined()

  expect(getDeployedStack).not.toHaveBeenCalled()
})

test('stops a write if the linked Stack cannot be read', async () => {
  getDeployedStack.mockRejectedValue(new Error('Forbidden'))

  await expect(getBlueprintResourceProblem(projectScope, target, 'delete')).resolves.toEqual({
    exitCode: 1,
    message:
      'Could not check whether the linked Stack ST-project manages dataset "production". Forbidden',
  })
})

test('checks pending declarations before fetching the Stack and allows references', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'blueprint-guard-'))
  onTestFinished(() => rm(dir, {force: true, recursive: true}))
  const path = join(dir, 'sanity.blueprint.json')
  getCheckoutManifest.mockReturnValue(path)
  getDeployedStack.mockResolvedValue({name: 'Deployment', resources: []})
  const writeManifest = (ownershipAction?: {type: 'reference'}) =>
    writeFile(
      path,
      JSON.stringify({
        resources: [
          {
            datasetName: 'production',
            ...(ownershipAction ? {lifecycle: {ownershipAction}} : {}),
            name: 'candidate',
            type: target.type,
          },
        ],
      }),
    )
  const output = {
    error: vi.fn((message) => {
      throw new Error(String(message))
    }),
  }

  await writeManifest()
  await expect(
    guardBlueprintDataset(output, projectScope.id, 'production', 'delete'),
  ).rejects.toThrow('A Blueprint manages dataset "production"')
  expect(getDeployedStack).not.toHaveBeenCalled()

  await writeManifest({type: 'reference'})
  await expect(
    guardBlueprintDataset(output, projectScope.id, 'production', 'delete'),
  ).resolves.toBeUndefined()
  expect(getDeployedStack).toHaveBeenCalledOnce()
})

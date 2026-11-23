import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

// eslint-disable-next-line import-js/no-extraneous-dependencies -- Vitest is a test-only dependency
import {afterEach, beforeEach, expect, test, vi} from 'vitest'

import {bootstrapBlueprint} from './bootstrapBlueprint.js'

const api = vi.hoisted(() => ({
  createDataset: vi.fn(),
  listDatasets: vi.fn(),
  request: vi.fn(),
  user: vi.fn(),
}))

vi.mock('@sanity/client', () => ({
  createClient: () => ({
    users: {getById: api.user},
    withConfig: () => ({
      datasets: {create: api.createDataset, list: api.listDatasets},
      request: api.request,
    }),
  }),
}))

let outputPath

beforeEach(async () => {
  vi.resetAllMocks()
  outputPath = await mkdtemp(join(tmpdir(), 'create-sanity-blueprint-'))
  api.listDatasets.mockResolvedValue([{name: 'production'}])
  api.request.mockImplementation(async ({url}) =>
    url === '/projects' ? {projectId: 'abc123'} : {id: 'ST-example'},
  )
})

afterEach(async () => {
  await rm(outputPath, {force: true, recursive: true})
})

test.each([
  ['existing project', {project: 'abc123'}],
  ['new project', {organization: 'org-id', projectName: 'New Project'}],
])('sets up a Blueprint for an %s', async (_, project) => {
  await bootstrapBlueprint({dataset: 'production', outputPath, token: 'test', ...project}, vi.fn())

  expect(api.user).toHaveBeenCalledExactlyOnceWith('me')
  expect(api.createDataset).toHaveBeenCalledTimes('projectName' in project ? 1 : 0)
  expect(api.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      body: expect.objectContaining({scopeId: 'abc123', scopeType: 'project'}),
      method: 'POST',
      url: '/blueprints/stacks',
    }),
  )
  expect(
    JSON.parse(await readFile(join(outputPath, 'sanity.blueprint.json'), 'utf8')),
  ).toMatchObject({resources: [], values: {dataset: 'production'}})
  expect(
    JSON.parse(await readFile(join(outputPath, '.sanity/blueprint.config.json'), 'utf8')),
  ).toMatchObject({projectId: 'abc123', stackId: 'ST-example'})
})

test('checks the destination before making requests', async () => {
  await writeFile(join(outputPath, 'sanity.blueprint.json'), '{}')

  await expect(
    bootstrapBlueprint(
      {dataset: 'production', outputPath, project: 'abc123', token: 'test'},
      vi.fn(),
    ),
  ).rejects.toThrow('already exists')
  expect(api.user).not.toHaveBeenCalled()
  expect(api.request).not.toHaveBeenCalled()
})

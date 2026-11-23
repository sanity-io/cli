import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, expect, test, vi} from 'vitest'

import {initBlueprint} from '../initBlueprint.js'

const request = vi.hoisted(() => vi.fn())
vi.mock('@sanity/cli-core/apiClient', () => ({
  getGlobalCliClient: vi.fn().mockResolvedValue({request}),
}))

let outputPath: string
const output = {log: vi.fn()}

beforeEach(async () => {
  vi.stubEnv('SANITY_AUTH_TOKEN', 'test-only')
  vi.stubEnv('SANITY_INTERNAL_ENV', 'http://localhost:1')
  outputPath = await mkdtemp(join(tmpdir(), 'init-blueprint-'))
  request.mockReset().mockResolvedValue({id: 'ST-init123456'})
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(outputPath, {force: true, recursive: true})
})

test('writes a project-scoped Blueprint and connects it to a new Stack', async () => {
  const result = await initBlueprint({
    datasetName: 'staging',
    output,
    outputPath,
    projectId: 'abc123',
  })

  expect(request).toHaveBeenCalledExactlyOnceWith({
    body: {
      document: {resources: []},
      name: expect.stringMatching(/^init-abc123-[0-9a-f]{8}$/),
      scopeId: 'abc123',
      scopeType: 'project',
      useProjectBasedId: false,
    },
    headers: {'x-sanity-scope-id': 'abc123', 'x-sanity-scope-type': 'project'},
    method: 'POST',
    url: '/blueprints/stacks',
  })
  expect(JSON.parse(await readFile(result.blueprintPath, 'utf8'))).toMatchObject({
    blueprintVersion: '2024-10-01',
    resources: [],
    values: {dataset: 'staging'},
  })
  expect(JSON.parse(await readFile(result.configPath, 'utf8'))).toMatchObject({
    projectId: 'abc123',
    stackId: 'ST-init123456',
  })
})

test('preserves an existing Blueprint and skips Stack creation', async () => {
  const existing = join(outputPath, 'blueprint.ts')
  await writeFile(existing, 'export default {}\n')

  await expect(
    initBlueprint({datasetName: 'production', output, outputPath, projectId: 'abc123'}),
  ).rejects.toThrow('blueprint.ts already exists.')
  expect(await readFile(existing, 'utf8')).toBe('export default {}\n')
  expect(request).not.toHaveBeenCalled()
})

test('preserves the scaffold and provides a recovery command if Stack creation fails', async () => {
  request.mockRejectedValueOnce(new Error('Permission denied'))

  await expect(
    initBlueprint({datasetName: 'production', output, outputPath, projectId: 'abc123'}),
  ).rejects.toThrow('npx @sanity/cli blueprints init --project-id abc123')
  expect(
    JSON.parse(await readFile(join(outputPath, 'sanity.blueprint.json'), 'utf8')).values,
  ).toEqual({dataset: 'production'})
  await expect(
    readFile(join(outputPath, '.sanity', 'blueprint.config.json')),
  ).rejects.toMatchObject({
    code: 'ENOENT',
  })
})

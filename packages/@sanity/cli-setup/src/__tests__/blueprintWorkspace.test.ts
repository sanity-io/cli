import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, expect, test, vi} from 'vitest'

import {initializeBlueprintWorkspace, JSON_BLUEPRINT_CONTENT} from '../blueprintWorkspace.js'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'blueprint-workspace-'))
})

afterEach(async () => {
  await rm(directory, {force: true, recursive: true})
})

test('initializes the requested folder without changing an enclosing Blueprint', async () => {
  const enclosing = join(directory, 'sanity.blueprint.json')
  await writeFile(enclosing, '{}')
  const {blueprintPath, configPath, gitignore} = await initializeBlueprintWorkspace({
    blueprintExtension: 'json',
    jsonContent: {...JSON_BLUEPRINT_CONTENT, values: {dataset: 'production'}},
    outputPath: join(directory, 'child'),
    resolveConfig: async () => ({projectId: 'abc123', stackId: 'ST-example'}),
  })

  expect(await readFile(enclosing, 'utf8')).toBe('{}')
  expect(JSON.parse(await readFile(blueprintPath, 'utf8'))).toMatchObject({
    resources: [],
    values: {dataset: 'production'},
  })
  expect(JSON.parse(await readFile(configPath, 'utf8'))).toMatchObject({
    blueprintConfigVersion: 'v2025-05-08',
    projectId: 'abc123',
    stackId: 'ST-example',
  })
  expect(gitignore.action).toBe('created')
})

test('checks the local target before resolving a Stack', async () => {
  const existing = join(directory, 'sanity.blueprint.ts')
  await writeFile(existing, 'export default {}')
  const resolveConfig = vi.fn()

  await expect(
    initializeBlueprintWorkspace({
      blueprintExtension: 'json',
      outputPath: directory,
      resolveConfig,
    }),
  ).rejects.toThrow('already exists')

  expect(resolveConfig).not.toHaveBeenCalled()
  expect(await readFile(existing, 'utf8')).toBe('export default {}')
})

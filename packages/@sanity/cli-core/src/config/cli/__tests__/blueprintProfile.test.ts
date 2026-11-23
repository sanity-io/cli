import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, expect, test, vi} from 'vitest'

import {runWithCliExecutionContext} from '../../../executionContext.js'
import {
  getBlueprintProfile,
  isBlueprintMode,
  runWithBlueprintProfile,
  saveBlueprintProfile,
} from '../blueprintProfile.js'

let configDir: string

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), 'sanity-profiles-'))
  for (const key of [
    'SANITY_BLUEPRINT_PATH',
    'SANITY_BLUEPRINT_PROFILE',
    'SANITY_BLUEPRINT_STACK_ID',
    'SANITY_CLI_MODE',
    'SANITY_DATASET',
    'SANITY_ORGANIZATION_ID',
    'SANITY_PROJECT_ID',
  ]) {
    vi.stubEnv(key, undefined)
  }
  vi.stubEnv('SANITY_BLUEPRINT_CONFIG_DIR', configDir)
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(configDir, {force: true, recursive: true})
})

test('selects a profile explicitly and lets legacy mode override selection', async () => {
  await saveBlueprintProfile('preview', {dataset: 'drafts', projectId: 'preview'})
  expect(isBlueprintMode()).toBe(false)
  expect(await getBlueprintProfile()).toBeUndefined()

  vi.stubEnv('SANITY_BLUEPRINT_PROFILE', 'preview')
  expect(await getBlueprintProfile()).toMatchObject({
    dataset: 'drafts',
    name: 'preview',
    projectId: 'preview',
  })

  vi.stubEnv('SANITY_CLI_MODE', 'legacy')
  expect(await getBlueprintProfile()).toBeUndefined()
})

test('does not carry a profile dataset, manifest, or stack into an unrelated project', async () => {
  await saveBlueprintProfile('preview', {
    blueprintPath: join(configDir, 'blueprint.json'),
    dataset: 'drafts',
    organizationId: 'previeworg',
    projectId: 'preview',
    stackId: 'ST-preview',
  })
  vi.stubEnv('SANITY_BLUEPRINT_PROFILE', 'preview')
  vi.stubEnv('SANITY_PROJECT_ID', 'production')
  expect(await getBlueprintProfile()).toMatchObject({
    blueprintPath: undefined,
    dataset: undefined,
    organizationId: undefined,
    projectId: 'production',
    stackId: undefined,
  })
  vi.stubEnv('SANITY_DATASET', 'live')
  expect(await getBlueprintProfile()).toMatchObject({dataset: 'live', projectId: 'production'})
})

test('supports explicit environment targets without a saved profile', async () => {
  vi.stubEnv('SANITY_CLI_MODE', 'blueprints')
  vi.stubEnv('SANITY_ORGANIZATION_ID', 'previeworg')
  vi.stubEnv('SANITY_BLUEPRINT_STACK_ID', 'ST-preview')
  expect(await getBlueprintProfile()).toMatchObject({
    organizationId: 'previeworg',
    stackId: 'ST-preview',
  })
  expect(await runWithCliExecutionContext({}, getBlueprintProfile)).toBeUndefined()
})

test('fails for missing, invalid, and unsafe profile selections', async () => {
  vi.stubEnv('SANITY_BLUEPRINT_PROFILE', 'missing')
  await expect(getBlueprintProfile()).rejects.toThrow('blueprints profiles set --help')
  await writeFile(join(configDir, 'missing.json'), '{"dataset":"unsafe"}')
  await expect(getBlueprintProfile()).rejects.toThrow('Could not load Blueprint profile')
  vi.stubEnv('SANITY_BLUEPRINT_PROFILE', '../private')
  await expect(getBlueprintProfile()).rejects.toThrow('Use a profile name')
})

test('saves independent profiles concurrently and replaces a profile as a unit', async () => {
  await Promise.all([
    saveBlueprintProfile('preview', {dataset: 'drafts', projectId: 'preview'}),
    saveBlueprintProfile('prod', {dataset: 'live', projectId: 'prod'}),
  ])
  await saveBlueprintProfile('preview', {projectId: 'preview2'})
  vi.stubEnv('SANITY_BLUEPRINT_PROFILE', 'preview')
  expect(await getBlueprintProfile()).toMatchObject({dataset: undefined, projectId: 'preview2'})
  vi.stubEnv('SANITY_BLUEPRINT_PROFILE', 'prod')
  expect(await getBlueprintProfile()).toMatchObject({dataset: 'live', projectId: 'prod'})
})

test('keeps the selected settings stable during an invocation', async () => {
  await saveBlueprintProfile('preview', {projectId: 'preview1'})
  vi.stubEnv('SANITY_BLUEPRINT_PROFILE', 'preview')
  await runWithBlueprintProfile(async () => {
    expect(await getBlueprintProfile()).toMatchObject({projectId: 'preview1'})
    await saveBlueprintProfile('preview', {projectId: 'preview2'})
    expect(await getBlueprintProfile()).toMatchObject({projectId: 'preview1'})
  })
  expect(await getBlueprintProfile()).toMatchObject({projectId: 'preview2'})
})

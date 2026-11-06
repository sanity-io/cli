import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {readAppFunctionManifest, writeAppFunctionManifest} from '../appFunctionManifest.js'

const mockReadFunctionBuild = vi.hoisted(() => vi.fn())

vi.mock('@sanity/runtime-cli/functions/build', () => ({readFunctionBuild: mockReadFunctionBuild}))

const identity = {appId: 'app-1', organizationId: 'org-1', stackId: 'stack-1'}
const cleanup = {
  event: {dayOfMonth: '*', dayOfWeek: '1-5', hour: '8', minute: '0', month: '*'},
  name: 'cleanup',
  timezone: 'Europe/Oslo',
  type: 'cron' as const,
}

let workDir: string

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'app-function-manifest-'))
  mockReadFunctionBuild.mockResolvedValue({})
})

afterEach(async () => {
  await rm(workDir, {force: true, recursive: true})
})

async function writeRawManifest(functions: unknown[]) {
  const file = join(workDir, '.sanity', 'functions', '.manifest.json')
  await mkdir(join(workDir, '.sanity', 'functions'), {recursive: true})
  await writeFile(
    file,
    JSON.stringify({...identity, environment: 'production', functions, version: 1}),
  )
}

describe('app function manifest', () => {
  test('round-trips pubsub and scheduled function triggers', async () => {
    const functions = [{name: 'greet', type: 'pubsub' as const}, cleanup]
    await writeAppFunctionManifest(workDir, {...identity, functions})

    const raw = JSON.parse(
      await readFile(join(workDir, '.sanity', 'functions', '.manifest.json'), 'utf8'),
    )
    expect(raw).toMatchObject({environment: 'production', functions, version: 1})
    await expect(readAppFunctionManifest({...identity, workDir})).resolves.toMatchObject({
      functions,
    })
    expect(mockReadFunctionBuild).toHaveBeenCalledWith({
      name: 'cleanup',
      src: join('.sanity', 'functions', 'cleanup'),
      workDir,
    })
  })

  test('requires a trigger type, so builds from before scheduled functions are rebuilt', async () => {
    await writeRawManifest([{name: 'greet'}])

    await expect(readAppFunctionManifest({...identity, workDir})).rejects.toThrow(
      'Cannot deploy the function build',
    )
  })

  test('rejects a scheduled function without all cron fields', async () => {
    await writeRawManifest([{...cleanup, event: {hour: '8', minute: '0'}}])

    await expect(readAppFunctionManifest({...identity, workDir})).rejects.toThrow(
      'Run sanity build, or deploy without --no-build.',
    )
  })
})

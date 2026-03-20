import {mkdir, mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, test} from 'vitest'

import {resolveRegistrySource} from '../resolveRegistrySource.js'

describe('resolveRegistrySource', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, {force: true, recursive: true})))
    tempDirs.length = 0
  })

  test('resolves local source path with --local', async () => {
    const localRegistryDir = await mkdtemp(join(tmpdir(), 'registry-local-'))
    tempDirs.push(localRegistryDir)

    const resolved = await resolveRegistrySource({
      local: true,
      source: localRegistryDir,
    })

    expect(resolved.directory).toBe(localRegistryDir)
    expect(resolved.sourceLabel).toContain('local:')
    await resolved.cleanup()
  })

  test('resolves local source subdirectory with --local', async () => {
    const localRegistryDir = await mkdtemp(join(tmpdir(), 'registry-local-'))
    tempDirs.push(localRegistryDir)
    await mkdir(join(localRegistryDir, 'packages/core'), {recursive: true})

    const resolved = await resolveRegistrySource({
      local: true,
      source: localRegistryDir,
      subdir: 'packages/core',
    })

    expect(resolved.directory).toBe(join(localRegistryDir, 'packages/core'))
    await resolved.cleanup()
  })

  test('throws if local source path does not exist', async () => {
    await expect(
      resolveRegistrySource({
        local: true,
        source: '/path/that/does/not/exist',
      }),
    ).rejects.toThrow('Local registry path')
  })
})

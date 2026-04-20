import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {resolveRunnerPackage} from '../resolveRunnerPackage.js'

describe('resolveRunnerPackage', () => {
  let tempRoot: string

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'sanity-runner-pkg-test-'))
  })

  afterEach(async () => {
    await rm(tempRoot, {force: true, recursive: true})
  })

  async function buildFakeRunnerLayout(pkgName: string, version = '1.0.0'): Promise<string> {
    const runnerRoot = tempRoot
    const pkgDir = join(runnerRoot, 'node_modules', pkgName)
    const binDir = join(runnerRoot, 'node_modules', '.bin')
    await mkdir(join(pkgDir, 'bin'), {recursive: true})
    await mkdir(binDir, {recursive: true})
    await writeFile(join(pkgDir, 'bin', 'sanity'), '#!/usr/bin/env node\n')
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify({name: pkgName, version}))
    const binLink = join(binDir, 'sanity')
    await symlink(join(pkgDir, 'bin', 'sanity'), binLink)
    return binLink
  }

  test('resolves `sanity` package with its own version from the install', async () => {
    const binLink = await buildFakeRunnerLayout('sanity', '5.21.0')
    expect(await resolveRunnerPackage(binLink)).toEqual({
      installedVersion: '5.21.0',
      packageName: 'sanity',
    })
  })

  test('resolves `@sanity/cli` package with its own version from the install', async () => {
    const binLink = await buildFakeRunnerLayout('@sanity/cli', '6.3.2')
    expect(await resolveRunnerPackage(binLink)).toEqual({
      installedVersion: '6.3.2',
      packageName: '@sanity/cli',
    })
  })

  test('falls back to `@sanity/cli` + fallbackVersion when the path does not exist', async () => {
    expect(await resolveRunnerPackage('/does/not/exist/node_modules/.bin/sanity', '9.9.9')).toEqual(
      {
        installedVersion: '9.9.9',
        packageName: '@sanity/cli',
      },
    )
  })

  test('falls back to `@sanity/cli` + fallbackVersion for an empty path', async () => {
    expect(await resolveRunnerPackage('', '9.9.9')).toEqual({
      installedVersion: '9.9.9',
      packageName: '@sanity/cli',
    })
  })
})

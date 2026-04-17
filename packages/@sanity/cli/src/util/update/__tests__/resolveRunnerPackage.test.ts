import {mkdir, mkdtemp, symlink, writeFile} from 'node:fs/promises'
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
    // mkdtemp dirs auto-cleanup isn't guaranteed, but leaving them under
    // $TMPDIR is harmless for a unit test.
  })

  async function buildFakeRunnerLayout(pkgName: string): Promise<string> {
    // Mirror the real layout: <runnerRoot>/node_modules/<pkg>/bin/sanity
    //                         <runnerRoot>/node_modules/.bin/sanity -> ../<pkg>/bin/sanity
    const runnerRoot = tempRoot
    const pkgDir = join(runnerRoot, 'node_modules', pkgName)
    const binDir = join(runnerRoot, 'node_modules', '.bin')
    await mkdir(join(pkgDir, 'bin'), {recursive: true})
    await mkdir(binDir, {recursive: true})
    await writeFile(join(pkgDir, 'bin', 'sanity'), '#!/usr/bin/env node\n')
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify({name: pkgName, version: '1.0.0'}))
    const binLink = join(binDir, 'sanity')
    await symlink(join(pkgDir, 'bin', 'sanity'), binLink)
    return binLink
  }

  test('resolves to `sanity` when invoked from a sanity install', async () => {
    const binLink = await buildFakeRunnerLayout('sanity')
    expect(await resolveRunnerPackage(binLink)).toBe('sanity')
  })

  test('resolves to `@sanity/cli` when invoked from a @sanity/cli install', async () => {
    const binLink = await buildFakeRunnerLayout('@sanity/cli')
    expect(await resolveRunnerPackage(binLink)).toBe('@sanity/cli')
  })

  test('falls back to `@sanity/cli` when the path does not exist', async () => {
    expect(await resolveRunnerPackage('/does/not/exist/node_modules/.bin/sanity')).toBe(
      '@sanity/cli',
    )
  })

  test('falls back to `@sanity/cli` for an empty path', async () => {
    expect(await resolveRunnerPackage('')).toBe('@sanity/cli')
  })
})

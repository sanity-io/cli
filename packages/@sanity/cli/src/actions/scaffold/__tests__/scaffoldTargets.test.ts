import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {afterEach, describe, expect, test} from 'vitest'

import {getUnavailableScaffoldTarget} from '../scaffoldProject.js'

const workDirs: string[] = []

async function createWorkDir(): Promise<string> {
  const workDir = await mkdtemp(path.join(tmpdir(), 'sanity-new-targets-'))
  workDirs.push(workDir)
  return workDir
}

afterEach(async () => {
  await Promise.all(
    workDirs.splice(0).map((workDir) => rm(workDir, {force: true, recursive: true})),
  )
})

describe('getUnavailableScaffoldTarget', () => {
  test('allows absent scaffold targets', async () => {
    const workDir = await createWorkDir()

    await expect(getUnavailableScaffoldTarget(workDir)).resolves.toBeUndefined()
  })

  test('reports a non-empty Studio directory', async () => {
    const workDir = await createWorkDir()
    await mkdir(path.join(workDir, 'sanity'))
    await writeFile(path.join(workDir, 'sanity', 'existing.txt'), 'keep me')

    await expect(getUnavailableScaffoldTarget(workDir)).resolves.toBe('sanity')
  })

  test('reports a frontend path that is a file', async () => {
    const workDir = await createWorkDir()
    await writeFile(path.join(workDir, 'web'), 'keep me')

    await expect(getUnavailableScaffoldTarget(workDir)).resolves.toBe('web')
  })

  test('reports a non-empty frontend directory', async () => {
    const workDir = await createWorkDir()
    await mkdir(path.join(workDir, 'web'))
    await writeFile(path.join(workDir, 'web', 'existing.txt'), 'keep me')

    await expect(getUnavailableScaffoldTarget(workDir)).resolves.toBe('web')
  })

  test('leaves a frontend target alone when the current directory contains a Next.js app', async () => {
    const workDir = await createWorkDir()
    await writeFile(
      path.join(workDir, 'package.json'),
      JSON.stringify({dependencies: {next: '16.0.0'}}),
    )
    await mkdir(path.join(workDir, 'web'))
    await writeFile(path.join(workDir, 'web', 'existing.txt'), 'keep me')

    await expect(getUnavailableScaffoldTarget(workDir)).resolves.toBeUndefined()
  })
})

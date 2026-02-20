import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import semver from 'semver'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'

import {compareDependencyVersions} from '../compareDependencyVersions.js'

describe('compareDependencyVersions (integration)', {timeout: 30_000}, () => {
  let workDir: string

  beforeAll(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'sanity-cli-test-'))
    await writeFile(
      path.join(workDir, 'package.json'),
      JSON.stringify({
        dependencies: {
          // Use an old version so we're guaranteed a mismatch with the CDN's latest
          sanity: '^3.0.0',
        },
        name: 'test-project',
        version: '0.0.0',
      }),
    )
  })

  afterAll(async () => {
    await rm(workDir, {force: true, recursive: true})
  })

  it('fetches remote versions from the CDN and returns mismatches', async () => {
    const result = await compareDependencyVersions(
      [{name: 'sanity', version: '3.0.0'}],
      workDir,
    )

    // The CDN should resolve to a version newer than 3.0.0
    expect(result).toHaveLength(1)

    const [mismatch] = result
    expect(mismatch.pkg).toBe('sanity')
    expect(mismatch.installed).toBe('3.0.0')
    expect(semver.valid(mismatch.remote)).toBeTruthy()
    expect(semver.gt(mismatch.remote, '3.0.0')).toBe(true)
  })
})

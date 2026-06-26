import {mkdirSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, test} from 'vitest'

import {canonicalizeWatchDir} from '../../../../src/actions/dev/canonicalizeWatchDir.js'

describe('canonicalizeWatchDir', () => {
  const created: string[] = []

  afterEach(() => {
    created.length = 0
  })

  test('resolves an existing directory to its canonical real path', () => {
    const dir = join(tmpdir(), `sanity-canon-test-${process.pid}-${Date.now()}`)
    mkdirSync(dir, {recursive: true})
    created.push(dir)

    expect(canonicalizeWatchDir(dir)).toBe(realpathSync.native(dir))
  })

  test('falls back to the input path when it cannot be resolved', () => {
    const missing = join(tmpdir(), `sanity-canon-missing-${process.pid}-${Date.now()}`)

    expect(canonicalizeWatchDir(missing)).toBe(missing)
  })
})

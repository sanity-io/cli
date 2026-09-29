import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {parseBenchArgs} from '../args.ts'
import {acquireLock} from '../lock.ts'

describe('parseBenchArgs', () => {
  test('defaults', () => {
    expect(parseBenchArgs([])).toEqual({
      base: null,
      config: null,
      freshRegistry: false,
      head: null,
      help: false,
      json: false,
      out: null,
      runs: null,
      stateDir: null,
    })
  })

  test('all options', () => {
    expect(
      parseBenchArgs([
        '--base', 'main',
        '--head', 'HEAD~1',
        '--runs', '5',
        '--config', 'c.json',
        '--state-dir', '/state',
        '--out', '/out',
        '--fresh-registry',
        '--json',
        '-h',
      ]),
    ).toEqual({
      base: 'main',
      config: 'c.json',
      freshRegistry: true,
      head: 'HEAD~1',
      help: true,
      json: true,
      out: '/out',
      runs: 5,
      stateDir: '/state',
    })
  })

  test.each(['0', '-1', '1.5', 'many'])('rejects --runs %s', (runs) => {
    expect(() => parseBenchArgs(['--runs', runs])).toThrow('--runs')
  })

  test('rejects unknown options', () => {
    expect(() => parseBenchArgs(['--nope'])).toThrow()
  })
})

describe('acquireLock', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cold-start-lock-'))
  })

  afterEach(async () => {
    await rm(dir, {force: true, recursive: true})
  })

  test('writes its pid and releases', async () => {
    const release = await acquireLock(dir)
    expect(await readFile(join(dir, 'lock', 'pid'), 'utf8')).toBe(String(process.pid))
    await release()
    const again = await acquireLock(dir)
    await again()
  })

  test('takes over a lock whose holder is gone', async () => {
    await mkdir(join(dir, 'lock'))
    await writeFile(join(dir, 'lock', 'pid'), '999999999')
    const release = await acquireLock(dir)
    await release()
  })

  test('takes over a lock without a pid file', async () => {
    await mkdir(join(dir, 'lock'))
    const release = await acquireLock(dir)
    await release()
  })

  test('waits for a live holder', async () => {
    const release = await acquireLock(dir)
    const onWait = vi.fn()
    let acquired = false
    const waiting = acquireLock(dir, {onWait, pollMs: 10}).then((r) => {
      acquired = true
      return r
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(acquired).toBe(false)
    expect(onWait).toHaveBeenCalledExactlyOnceWith(process.pid)
    await release()
    const second = await waiting
    await second()
  })

  test('rethrows unexpected errors', async () => {
    await writeFile(join(dir, 'file'), '')
    await expect(acquireLock(join(dir, 'file'))).rejects.toThrow()
  })
})

import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {loadEnv as viteLoadEnv} from 'vite'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {loadEnv} from '../loadEnv.js'

describe('loadEnv compatibility with Vite', () => {
  let root: string
  let originalEnv: NodeJS.ProcessEnv
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cli-env-test-'))
    originalEnv = {...process.env}
  })
  afterEach(async () => {
    process.env = originalEnv
    vi.unstubAllEnvs()
    await rm(root, {force: true, recursive: true})
  })

  test.each(['VITE_', '', ['SANITY_', 'VITE_']])(
    'preserves precedence, filtering and expansion for prefix %j',
    async (prefix) => {
      await writeFile(
        join(root, '.env'),
        'VITE_VALUE=base\nVITE_FORWARD=$VITE_FINAL\nSANITY_ONLY=studio\nPRIVATE_VALUE=secret\nVITE_DEFAULT=${ABSENT_VAR:-default}',
      )
      await writeFile(join(root, '.env.local'), 'VITE_VALUE=local')
      await writeFile(join(root, '.env.development'), 'VITE_VALUE=mode\nVITE_FINAL=expanded')
      await writeFile(join(root, '.env.development.local'), 'VITE_VALUE=mode-local')
      vi.stubEnv('VITE_SHELL', 'shell')
      const result = loadEnv('development', root, prefix)
      expect(result).toEqual(viteLoadEnv('development', root, prefix))
      expect(result.VITE_VALUE).toBe('mode-local')
      expect(result.VITE_FORWARD).toBe('expanded')
      expect(process.env.VITE_FINAL).toBeUndefined()
    },
  )

  test('shell values win over files and influence expansion', async () => {
    await writeFile(join(root, '.env'), 'VITE_VALUE=file\nVITE_REFERENCE=$VITE_VALUE')
    vi.stubEnv('VITE_VALUE', 'shell')
    expect(loadEnv('production', root)).toEqual(viteLoadEnv('production', root))
    expect(loadEnv('production', root)).toMatchObject({
      VITE_REFERENCE: 'shell',
      VITE_VALUE: 'shell',
    })
  })

  test('handles absent files, directories and explicitly disabled file loading', async () => {
    await mkdir(join(root, '.env'))
    expect(loadEnv('development', root)).toEqual(viteLoadEnv('development', root))
    expect(loadEnv('development', false)).toEqual(viteLoadEnv('development', false))
  })

  test('preserves special variables without overwriting shell values', async () => {
    await writeFile(
      join(root, '.env'),
      'NODE_ENV=production\nBROWSER=firefox\nBROWSER_ARGS=--private',
    )
    delete process.env.VITE_USER_NODE_ENV
    delete process.env.BROWSER
    delete process.env.BROWSER_ARGS
    loadEnv('development', root)
    expect(process.env).toMatchObject({
      BROWSER: 'firefox',
      BROWSER_ARGS: '--private',
      VITE_USER_NODE_ENV: 'production',
    })
    vi.stubEnv('BROWSER', 'chrome')
    loadEnv('development', root)
    expect(process.env.BROWSER).toBe('chrome')
  })

  test('rejects the reserved local mode', () => {
    expect(() => loadEnv('local', root)).toThrow('"local" cannot be used as a mode name')
  })
})

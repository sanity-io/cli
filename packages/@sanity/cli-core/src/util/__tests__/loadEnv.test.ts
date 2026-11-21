import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, expect, test, vi} from 'vitest'

import {loadEnv} from '../loadEnv.js'

afterEach(() => vi.unstubAllEnvs())

test('loads mode files in order, expands variables, and keeps the shell override', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sanity-cli-env-test-'))
  try {
    await writeFile(join(root, '.env'), 'SANITY_TEST_HOST=default\nUNRELATED=private\n')
    await writeFile(join(root, '.env.local'), 'SANITY_TEST_HOST=local\n')
    await writeFile(join(root, '.env.production'), 'SANITY_TEST_HOST=production\n')
    await writeFile(
      join(root, '.env.production.local'),
      'SANITY_TEST_URL=https://$SANITY_TEST_HOST/\nSANITY_TEST_HOST=production-local\n',
    )
    expect(loadEnv('production', root, 'SANITY_TEST_')).toEqual({
      SANITY_TEST_HOST: 'production-local',
      SANITY_TEST_URL: 'https://production-local/',
    })
    vi.stubEnv('SANITY_TEST_HOST', 'shell')
    expect(loadEnv('production', root, 'SANITY_TEST_')).toEqual({
      SANITY_TEST_HOST: 'shell',
      SANITY_TEST_URL: 'https://shell/',
    })
  } finally {
    await rm(root, {force: true, recursive: true})
  }
})

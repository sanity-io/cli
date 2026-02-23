import {readdirSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {getCliConfig} from '@sanity/cli-core'
import {describe, expect, test} from 'vitest'

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../test/__fixtures__/cli-configs',
)

const fixtureNames = readdirSync(FIXTURES_DIR, {withFileTypes: true})
  .filter((entry) => entry.isDirectory() && entry.name !== 'error-both-ts-and-js')
  .map((entry) => entry.name)
  .toSorted()

describe('#getCliConfig', () => {
  test('should error when both ts and js files are present', async () => {
    const cwd = join(FIXTURES_DIR, 'error-both-ts-and-js')
    await expect(getCliConfig(cwd)).rejects.toThrow('Multiple CLI config files found')
  })

  test.each(fixtureNames)('%s', async (fixtureName) => {
    const cwd = join(FIXTURES_DIR, fixtureName)

    const config = await getCliConfig(cwd)
    expect(config).toBeDefined()
  })
})

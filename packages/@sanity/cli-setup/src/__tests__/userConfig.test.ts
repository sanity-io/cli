import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, expect, test} from 'vitest'

import {readHostCliUserConfig} from '../userConfig.js'

let directory: string
let path: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'sanity-user-config-'))
  path = join(directory, 'config.json')
})

afterEach(async () => {
  await rm(directory, {force: true, recursive: true})
})

test('uses an empty config when the file is missing', () => {
  expect(readHostCliUserConfig(path)).toEqual({})
})

test.each(['null', '[]', '"not an object"', 'invalid JSON'])(
  'uses an empty config when the file contains %s',
  async (content) => {
    await writeFile(path, content)
    expect(readHostCliUserConfig(path)).toEqual({})
  },
)

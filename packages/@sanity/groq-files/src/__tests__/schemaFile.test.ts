import {mkdtemp, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {describe, expect, it} from 'vitest'

import {loadSchemaFile} from '../schemaFile.js'

describe('loadSchemaFile', () => {
  it('reads the array written by `sanity schema extract`', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'groq-schema-'))
    const path = join(directory, 'schema.json')
    await writeFile(path, '[{"name":"post","type":"document","attributes":{}}]')
    const loaded = await loadSchemaFile(path)
    expect(loaded.note).toBeUndefined()
    expect(loaded.schema).toEqual([{attributes: {}, name: 'post', type: 'document'}])
    expect(loaded.bytes?.length).toBeGreaterThan(0)
  })

  it('explains a missing, unparsable, or mis-shaped file instead of throwing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'groq-schema-'))
    const missing = await loadSchemaFile(join(directory, 'nope.json'))
    expect(missing.schema).toBeUndefined()
    expect(missing.note).toContain('sanity schema extract')

    const invalid = join(directory, 'invalid.json')
    await writeFile(invalid, '{')
    const unparsable = await loadSchemaFile(invalid)
    expect(unparsable.schema).toBeUndefined()
    expect(unparsable.note).toContain('Could not parse schema JSON')
    expect(unparsable.bytes).toBeDefined()

    const object = join(directory, 'object.json')
    await writeFile(object, '{"types": []}')
    const shaped = await loadSchemaFile(object)
    expect(shaped.schema).toBeUndefined()
    expect(shaped.note).toContain('must be the array')
  })
})

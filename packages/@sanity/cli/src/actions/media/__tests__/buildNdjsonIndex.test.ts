import {EOL} from 'node:os'
import {Readable} from 'node:stream'

import {describe, expect, it} from 'vitest'

import {buildNdjsonIndex} from '../buildNdjsonIndex.js'

interface Entry {
  id: string
  value: string
}

const ndjson = (
  [
    {id: 'a', value: 'a0'},
    {id: 'b', value: 'b0'},
    {id: 'b', value: 'b1'},
  ] satisfies Entry[]
)
  .map((entry) => JSON.stringify(entry))
  .join(EOL)

const stream = () => Readable.from(ndjson)

describe('buildNdjsonIndex', () => {
  it('builds a Map from key field to value field', async () => {
    const index = await buildNdjsonIndex(stream(), 'id', 'value')

    expect(index).toBeInstanceOf(Map)
    expect(index.size).toBe(2) // 'a' and 'b' (last 'b' wins)
    expect(index.get('a')).toBe('a0')
    expect(index.get('b')).toBe('b1') // last entry for duplicate key
  })

  it('returns an empty Map for an empty stream', async () => {
    const emptyStream = Readable.from('')
    const index = await buildNdjsonIndex(emptyStream, 'id', 'value')

    expect(index).toBeInstanceOf(Map)
    expect(index.size).toBe(0)
  })

  it('skips empty lines', async () => {
    const ndjsonWithEmptyLines = [
      JSON.stringify({id: 'a', value: 'a0'}),
      '',
      JSON.stringify({id: 'b', value: 'b0'}),
      '   ',
      JSON.stringify({id: 'c', value: 'c0'}),
    ].join(EOL)

    const index = await buildNdjsonIndex(Readable.from(ndjsonWithEmptyLines), 'id', 'value')

    expect(index.size).toBe(3)
    expect(index.get('a')).toBe('a0')
    expect(index.get('b')).toBe('b0')
    expect(index.get('c')).toBe('c0')
  })

  it('skips entries missing the key field', async () => {
    const ndjsonWithMissingKeys = [
      JSON.stringify({id: 'a', value: 'a0'}),
      JSON.stringify({value: 'no-key'}),
      JSON.stringify({id: 'c', value: 'c0'}),
    ].join(EOL)

    const index = await buildNdjsonIndex(Readable.from(ndjsonWithMissingKeys), 'id', 'value')

    expect(index.size).toBe(2)
    expect(index.get('a')).toBe('a0')
    expect(index.get('c')).toBe('c0')
  })

  it('stores undefined when value field is missing from entry', async () => {
    const ndjsonWithMissingValue = [JSON.stringify({id: 'a'})].join(EOL)

    const index = await buildNdjsonIndex(Readable.from(ndjsonWithMissingValue), 'id', 'value')

    expect(index.size).toBe(1)
    expect(index.has('a')).toBe(true)
    expect(index.get('a')).toBeUndefined()
  })

  it('throws an error if invalid JSON is encountered', async () => {
    const invalidNdjson = [ndjson, `{ invalid`].join(EOL)
    const invalidStream = Readable.from(invalidNdjson)

    await expect(buildNdjsonIndex(invalidStream, 'id', 'value')).rejects.toThrow()
  })
})

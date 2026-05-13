import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {buildRequestBody, parseHeaderFlags} from '../body.js'

describe('buildRequestBody', () => {
  test('GET with no body flags returns {body: null, contentType: null}', async () => {
    const result = await buildRequestBody({
      fieldPairs: [],
      filePairs: [],
      inputPath: null,
      method: 'GET',
    })
    expect(result).toEqual({body: null, contentType: null})
  })

  test('GET with body flags errors — HTTP semantics', async () => {
    await expect(
      buildRequestBody({
        fieldPairs: ['foo=bar'],
        filePairs: [],
        inputPath: null,
        method: 'GET',
      }),
    ).rejects.toThrow(/GET requests do not take a body/)
  })

  test('POST with no body flags errors with a hint at -f/-F/--input', async () => {
    await expect(
      buildRequestBody({
        fieldPairs: [],
        filePairs: [],
        inputPath: null,
        method: 'POST',
      }),
    ).rejects.toThrow(/POST needs a request body/)
  })

  test('body-required error names required fields when a schema hint is passed', async () => {
    // When the call command knows the operation's required body fields,
    // it threads them through so the error names them — an agent can
    // self-correct on the next attempt without re-fetching the spec.
    await expect(
      buildRequestBody({
        fieldPairs: [],
        filePairs: [],
        inputPath: null,
        method: 'POST',
        schemaHint: {
          docsCommand: 'sanity api spec agent-actions --operation=generate --format=json',
          requiredFields: ['schemaId', 'instruction'],
        },
      }),
    ).rejects.toThrow(/Required fields: schemaId, instruction/)
  })

  test('-f and --input together are rejected as mutually exclusive', async () => {
    await expect(
      buildRequestBody({
        fieldPairs: ['foo=bar'],
        filePairs: [],
        inputPath: '/dev/null',
        method: 'POST',
      }),
    ).rejects.toThrow(/mutually exclusive/)
  })

  test('-f parses JSON values when valid', async () => {
    const {body, contentType} = await buildRequestBody({
      fieldPairs: ['count=42', 'tags=["a","b"]', 'name=Bob'],
      filePairs: [],
      inputPath: null,
      method: 'POST',
    })
    expect(contentType).toBe('application/json')
    expect(JSON.parse(body!)).toEqual({count: 42, name: 'Bob', tags: ['a', 'b']})
  })

  test('-f falls back to string when value is not valid JSON', async () => {
    const {body} = await buildRequestBody({
      fieldPairs: ['greeting=hello world'],
      filePairs: [],
      inputPath: null,
      method: 'POST',
    })
    expect(JSON.parse(body!)).toEqual({greeting: 'hello world'})
  })

  test('dotted keys produce nested objects', async () => {
    const {body} = await buildRequestBody({
      fieldPairs: ['profile.name=Bob', 'profile.age=42'],
      filePairs: [],
      inputPath: null,
      method: 'POST',
    })
    expect(JSON.parse(body!)).toEqual({profile: {age: 42, name: 'Bob'}})
  })

  test('mixing scalar then dotted at same key errors instead of silently overwriting', async () => {
    await expect(
      buildRequestBody({
        fieldPairs: ['foo=1', 'foo.bar=2'],
        filePairs: [],
        inputPath: null,
        method: 'POST',
      }),
    ).rejects.toThrow(/non-object value/)
  })

  test('-f with empty key errors', async () => {
    await expect(
      buildRequestBody({
        fieldPairs: ['=bare'],
        filePairs: [],
        inputPath: null,
        method: 'POST',
      }),
    ).rejects.toThrow(/key must be non-empty/)
  })

  test('-f with no `=` errors', async () => {
    await expect(
      buildRequestBody({
        fieldPairs: ['nope'],
        filePairs: [],
        inputPath: null,
        method: 'POST',
      }),
    ).rejects.toThrow(/key=value form/)
  })
})

describe('buildRequestBody — file-backed inputs', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'api-body-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, {force: true, recursive: true})
  })

  test('-F reads the file and slots its parsed JSON contents under the key', async () => {
    const path = join(tempDir, 'patch.json')
    await writeFile(path, JSON.stringify({set: {title: 'New'}}))

    const {body} = await buildRequestBody({
      fieldPairs: [],
      filePairs: [`mutations=@${path}`],
      inputPath: null,
      method: 'POST',
    })
    expect(JSON.parse(body!)).toEqual({mutations: {set: {title: 'New'}}})
  })

  test('-F without leading `@` errors', async () => {
    await expect(
      buildRequestBody({
        fieldPairs: [],
        filePairs: ['mutations=raw-string'],
        inputPath: null,
        method: 'POST',
      }),
    ).rejects.toThrow(/file values must start with @/)
  })

  test('-F with nonexistent path errors with the path in the message', async () => {
    await expect(
      buildRequestBody({
        fieldPairs: [],
        filePairs: ['mutations=@/nonexistent/path/to/file.json'],
        inputPath: null,
        method: 'POST',
      }),
    ).rejects.toThrow(/cannot read file/)
  })

  test('--input reads the file verbatim and detects application/json', async () => {
    const path = join(tempDir, 'body.json')
    await writeFile(path, '{"foo": 1}')

    const result = await buildRequestBody({
      fieldPairs: [],
      filePairs: [],
      inputPath: path,
      method: 'POST',
    })
    expect(result.contentType).toBe('application/json')
    expect(result.body).toBe('{"foo": 1}')
  })

  test('--input for non-JSON falls back to application/octet-stream', async () => {
    const path = join(tempDir, 'body.bin')
    await writeFile(path, 'not json at all')

    const result = await buildRequestBody({
      fieldPairs: [],
      filePairs: [],
      inputPath: path,
      method: 'POST',
    })
    expect(result.contentType).toBe('application/octet-stream')
    expect(result.body).toBe('not json at all')
  })

  test('--input with missing file errors with the path in the message', async () => {
    await expect(
      buildRequestBody({
        fieldPairs: [],
        filePairs: [],
        inputPath: '/nonexistent/body.json',
        method: 'POST',
      }),
    ).rejects.toThrow(/Cannot read --input file/)
  })
})

describe('parseHeaderFlags', () => {
  test('parses Name: Value pairs into a lower-cased map', () => {
    expect(parseHeaderFlags(['X-Trace: abc', 'Accept: application/json'])).toEqual({
      accept: 'application/json',
      'x-trace': 'abc',
    })
  })

  test('later occurrences override earlier ones', () => {
    expect(parseHeaderFlags(['X-Trace: first', 'x-trace: second'])).toEqual({'x-trace': 'second'})
  })

  test('rejects values without `:`', () => {
    expect(() => parseHeaderFlags(['no-colon'])).toThrow(/Name: Value/)
  })

  test('rejects empty header names', () => {
    expect(() => parseHeaderFlags([': value'])).toThrow(/header name must be non-empty/)
  })
})

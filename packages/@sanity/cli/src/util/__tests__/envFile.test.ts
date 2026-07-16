import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {appendEnvValues} from '../envFile.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanity-envfile-'))
})

afterEach(() => {
  fs.rmSync(dir, {force: true, recursive: true})
})

describe('appendEnvValues', () => {
  test('creates the file with banner comments and quoted values', () => {
    const envPath = path.join(dir, '.env')

    const result = appendEnvValues(
      envPath,
      {SANITY_DATASET: 'production', SANITY_PROJECT_ID: 'abc123'},
      {banner: ['claim me: https://example.com/claim']},
    )

    expect(result).toEqual({
      created: true,
      skippedKeys: [],
      wroteKeys: ['SANITY_DATASET', 'SANITY_PROJECT_ID'],
    })
    expect(fs.readFileSync(envPath, 'utf8')).toBe(
      '# claim me: https://example.com/claim\n' +
        'SANITY_DATASET="production"\n' +
        'SANITY_PROJECT_ID="abc123"\n',
    )
  })

  test('appends to an existing file without clobbering its contents', () => {
    const envPath = path.join(dir, '.env')
    fs.writeFileSync(envPath, 'OTHER_KEY=other\n')

    const result = appendEnvValues(envPath, {SANITY_PROJECT_ID: 'abc123'})

    expect(result.created).toBe(false)
    expect(result.wroteKeys).toEqual(['SANITY_PROJECT_ID'])
    expect(fs.readFileSync(envPath, 'utf8')).toBe('OTHER_KEY=other\n\nSANITY_PROJECT_ID="abc123"\n')
  })

  test('never overwrites existing keys, including `export`-prefixed ones', () => {
    const envPath = path.join(dir, '.env')
    fs.writeFileSync(envPath, 'export SANITY_API_TOKEN=keep-me\nSANITY_PROJECT_ID=existing\n')

    const result = appendEnvValues(envPath, {
      SANITY_API_TOKEN: 'new-token',
      SANITY_DATASET: 'production',
      SANITY_PROJECT_ID: 'abc123',
    })

    expect(result.skippedKeys).toEqual(['SANITY_API_TOKEN', 'SANITY_PROJECT_ID'])
    expect(result.wroteKeys).toEqual(['SANITY_DATASET'])
    const contents = fs.readFileSync(envPath, 'utf8')
    expect(contents).toContain('export SANITY_API_TOKEN=keep-me')
    expect(contents).toContain('SANITY_PROJECT_ID=existing')
    expect(contents).toContain('SANITY_DATASET="production"')
    expect(contents).not.toContain('new-token')
  })

  test('writes nothing when every key already exists', () => {
    const envPath = path.join(dir, '.env')
    const original = 'SANITY_PROJECT_ID=existing'
    fs.writeFileSync(envPath, original)

    const result = appendEnvValues(envPath, {SANITY_PROJECT_ID: 'abc123'}, {banner: ['unused']})

    expect(result).toEqual({created: false, skippedKeys: ['SANITY_PROJECT_ID'], wroteKeys: []})
    expect(fs.readFileSync(envPath, 'utf8')).toBe(original)
  })
})

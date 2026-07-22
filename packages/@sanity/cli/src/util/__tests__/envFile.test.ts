import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {appendEnvValues, readEnvValues} from '../envFile.js'

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
    fs.writeFileSync(envPath, 'export SANITY_AUTH_TOKEN=keep-me\nSANITY_PROJECT_ID=existing\n')

    const result = appendEnvValues(envPath, {
      SANITY_AUTH_TOKEN: 'new-token',
      SANITY_DATASET: 'production',
      SANITY_PROJECT_ID: 'abc123',
    })

    expect(result.skippedKeys).toEqual(['SANITY_AUTH_TOKEN', 'SANITY_PROJECT_ID'])
    expect(result.wroteKeys).toEqual(['SANITY_DATASET'])
    const contents = fs.readFileSync(envPath, 'utf8')
    expect(contents).toContain('export SANITY_AUTH_TOKEN=keep-me')
    expect(contents).toContain('SANITY_PROJECT_ID=existing')
    expect(contents).toContain('SANITY_DATASET="production"')
    expect(contents).not.toContain('new-token')
  })

  test('a blank template line counts as existing: skipped, never edited', () => {
    // `SANITY_PROJECT_ID=` with no value — the classic .env.example leftover. Line presence,
    // not value presence, decides ownership: the writer must not edit or duplicate the line.
    // (Callers surface the skipped keys' values instead — see the mint flow.)
    const envPath = path.join(dir, '.env')
    const original = 'SANITY_PROJECT_ID=\nSANITY_AUTH_TOKEN=""\n'
    fs.writeFileSync(envPath, original)

    const result = appendEnvValues(envPath, {
      SANITY_AUTH_TOKEN: 'sk-new',
      SANITY_DATASET: 'production',
      SANITY_PROJECT_ID: 'abc123',
    })

    expect(result).toEqual({
      created: false,
      skippedKeys: ['SANITY_AUTH_TOKEN', 'SANITY_PROJECT_ID'],
      wroteKeys: ['SANITY_DATASET'],
    })
    expect(fs.readFileSync(envPath, 'utf8')).toBe(`${original}\nSANITY_DATASET="production"\n`)
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

describe('readEnvValues', () => {
  test('returns an empty object when the file is missing', () => {
    expect(readEnvValues(path.join(dir, '.env'), ['SANITY_PROJECT_ID'])).toEqual({})
  })

  test('matches the runtime env grammar: quotes, comments, export, empties, last-wins', () => {
    // One tripwire for the dotenv dependency: these are the grammar behaviors the guardrail
    // relies on. If a dotenv major bump ever changes one, this fails before the guard can lie.
    const envPath = path.join(dir, '.env')
    fs.writeFileSync(
      envPath,
      'SANITY_PROJECT_ID="shadowed"\n' +
        "SANITY_DATASET='pro#duction' # inline note\n" +
        'export SANITY_AUTH_TOKEN=sk-token # robot\n' +
        'SANITY_PROJECT_ID="abc123" # minted 2026-07-22\n' +
        'SANITY_CLAIM_URL=\n',
    )

    expect(
      readEnvValues(envPath, [
        'SANITY_AUTH_TOKEN',
        'SANITY_DATASET',
        'SANITY_PROJECT_ID',
        'SANITY_CLAIM_URL',
      ]),
    ).toEqual({
      // export prefix accepted, unquoted inline comment stripped:
      SANITY_AUTH_TOKEN: 'sk-token',
      // quoted: `#` inside the quotes is data, the comment after them is not:
      SANITY_DATASET: 'pro#duction',
      // duplicate keys: the last assignment wins, exactly like the runtime injection:
      SANITY_PROJECT_ID: 'abc123',
      // SANITY_CLAIM_URL: empty value → omitted entirely
    })
  })
})

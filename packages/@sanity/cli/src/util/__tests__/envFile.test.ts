import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {appendEnvValues, ensureEnvGitignored, isEnvTracked, readEnvValues} from '../envFile.js'

const git = (dir: string, ...args: string[]) =>
  execFileSync('git', args, {cwd: dir, stdio: 'ignore'})

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanity-envfile-'))
})

afterEach(() => {
  fs.rmSync(dir, {force: true, recursive: true})
})

describe('ensureEnvGitignored', () => {
  test('creates .gitignore with a .env entry when none exists', () => {
    expect(ensureEnvGitignored(dir)).toEqual({added: true, ignored: true})
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')).toBe('.env\n')
  })

  test('appends .env to an existing .gitignore, preserving contents', () => {
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n*.local')

    expect(ensureEnvGitignored(dir)).toEqual({added: true, ignored: true})
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')).toBe(
      'node_modules\n*.local\n.env\n',
    )
  })

  test('is a no-op when .env is already ignored (with or without a leading slash)', () => {
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n/.env\n')

    expect(ensureEnvGitignored(dir)).toEqual({added: false, ignored: true})
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')).toBe('node_modules\n/.env\n')
  })

  test('reports not-ignored (never throws) on an unwritable target, so callers can warn', () => {
    // A .gitignore that is actually a directory makes the read/write fail — must fail open, and
    // report ignored:false so the mint flow warns instead of silently leaving the token exposed.
    fs.mkdirSync(path.join(dir, '.gitignore'))

    expect(ensureEnvGitignored(dir)).toEqual({added: false, ignored: false})
  })
})

describe('isEnvTracked', () => {
  test('returns false outside a git repository', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_AUTH_TOKEN=sk\n')
    expect(isEnvTracked(dir)).toBe(false)
  })

  test('returns false when .env exists but is untracked', () => {
    git(dir, 'init')
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_AUTH_TOKEN=sk\n')
    expect(isEnvTracked(dir)).toBe(false)
  })

  test('returns true once .env is tracked by git', () => {
    git(dir, 'init')
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_AUTH_TOKEN=sk\n')
    git(dir, 'add', '.env')
    expect(isEnvTracked(dir)).toBe(true)
  })
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

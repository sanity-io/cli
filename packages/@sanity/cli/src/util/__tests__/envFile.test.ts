import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {appendEnvValues, ensureEnvGitignored, GUARDED_ENV_KEYS, inspectEnvKeys} from '../envFile.js'

let directory: string
let envPath: string

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sanity-mint-env-'))
  envPath = path.join(directory, '.env')
})

afterEach(() => {
  fs.rmSync(directory, {force: true, recursive: true})
})

describe('appendEnvValues', () => {
  test('creates a quoted env block with a comment banner', () => {
    expect(
      appendEnvValues(
        envPath,
        {
          SANITY_AUTH_TOKEN: 'sk-token',
          SANITY_PROJECT_ID: 'abc123',
        },
        {banner: ['Claim it: https://www.sanity.io/claim/token']},
      ),
    ).toEqual({
      created: true,
      skippedKeys: [],
      wroteKeys: ['SANITY_AUTH_TOKEN', 'SANITY_PROJECT_ID'],
    })

    expect(fs.readFileSync(envPath, 'utf8')).toBe(
      [
        '# Claim it: https://www.sanity.io/claim/token',
        'SANITY_AUTH_TOKEN="sk-token"',
        'SANITY_PROJECT_ID="abc123"',
        '',
      ].join('\n'),
    )
  })

  test('never overwrites existing assignment lines', () => {
    fs.writeFileSync(envPath, 'export SANITY_PROJECT_ID="existing"\n')

    expect(
      appendEnvValues(envPath, {
        SANITY_AUTH_TOKEN: 'sk-token',
        SANITY_PROJECT_ID: 'replacement',
      }),
    ).toEqual({
      created: false,
      skippedKeys: ['SANITY_PROJECT_ID'],
      wroteKeys: ['SANITY_AUTH_TOKEN'],
    })

    const contents = fs.readFileSync(envPath, 'utf8')
    expect(contents).toContain('SANITY_PROJECT_ID="existing"')
    expect(contents).not.toContain('SANITY_PROJECT_ID="replacement"')
    expect(contents).toContain('SANITY_AUTH_TOKEN="sk-token"')
  })
})

describe('inspectEnvKeys', () => {
  test('distinguishes blank placeholders from effective values', () => {
    fs.writeFileSync(envPath, ['SANITY_AUTH_TOKEN=', 'SANITY_PROJECT_ID="abc123"', ''].join('\n'))

    expect(inspectEnvKeys(envPath, GUARDED_ENV_KEYS)).toEqual({
      blankKeys: ['SANITY_AUTH_TOKEN'],
      presentKeys: ['SANITY_AUTH_TOKEN', 'SANITY_PROJECT_ID'],
      values: {SANITY_PROJECT_ID: 'abc123'},
    })
  })

  test('returns an empty inspection when the file does not exist', () => {
    expect(inspectEnvKeys(envPath, GUARDED_ENV_KEYS)).toEqual({
      blankKeys: [],
      presentKeys: [],
      values: {},
    })
  })
})

describe('ensureEnvGitignored', () => {
  test('adds the pattern once and preserves existing contents', () => {
    fs.writeFileSync(path.join(directory, '.gitignore'), 'node_modules\n')

    expect(ensureEnvGitignored(directory, '.env*')).toEqual({added: true, ignored: true})
    expect(ensureEnvGitignored(directory, '.env*')).toEqual({added: false, ignored: true})
    expect(fs.readFileSync(path.join(directory, '.gitignore'), 'utf8')).toBe(
      'node_modules\n.env*\n',
    )
  })
})

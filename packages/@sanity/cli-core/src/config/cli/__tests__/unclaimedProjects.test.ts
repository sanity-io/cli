import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {resolveMintedProjectToken} from '../unclaimedProjects.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanity-unclaimed-'))
})

afterEach(() => {
  fs.rmSync(dir, {force: true, recursive: true})
  vi.unstubAllEnvs()
})

describe('resolveMintedProjectToken', () => {
  test('returns the ledger token for the project id in the directory .env', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')

    expect(resolveMintedProjectToken({abc123: {projectId: 'abc123', token: 'sk-robot'}}, dir)).toBe(
      'sk-robot',
    )
  })

  test('reads the directory .env, not a shell-exported SANITY_PROJECT_ID from another project', () => {
    // A stale shell export must not steal a different project's ledger token — the value in this
    // directory's .env wins.
    vi.stubEnv('SANITY_PROJECT_ID', 'otherproj')
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')

    expect(
      resolveMintedProjectToken(
        {
          abc123: {projectId: 'abc123', token: 'sk-robot'},
          otherproj: {projectId: 'otherproj', token: 'sk-wrong'},
        },
        dir,
      ),
    ).toBe('sk-robot')
  })

  test('follows dotenv grammar: strips inline comments and takes the last value', () => {
    // Matches readEnvValues (mint/init/logout/nudges) rather than a divergent first-match parser.
    fs.writeFileSync(
      path.join(dir, '.env'),
      '# SANITY_PROJECT_ID="commented"\nSANITY_PROJECT_ID=stale\nSANITY_PROJECT_ID=abc123 # inline\n',
    )

    expect(resolveMintedProjectToken({abc123: {projectId: 'abc123', token: 'sk-robot'}}, dir)).toBe(
      'sk-robot',
    )
  })

  test('returns undefined when the directory has no .env project id', () => {
    expect(
      resolveMintedProjectToken({abc123: {projectId: 'abc123', token: 'sk-robot'}}, dir),
    ).toBeUndefined()
  })

  test('returns undefined when the ledger has no record for that project', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="other"\n')

    expect(
      resolveMintedProjectToken({abc123: {projectId: 'abc123', token: 'sk-robot'}}, dir),
    ).toBeUndefined()
  })

  test('returns undefined when the record carries no token', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')

    expect(resolveMintedProjectToken({abc123: {projectId: 'abc123'}}, dir)).toBeUndefined()
  })

  test('returns undefined when the ledger is empty or absent', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')

    expect(resolveMintedProjectToken({}, dir)).toBeUndefined()
    expect(resolveMintedProjectToken(undefined, dir)).toBeUndefined()
  })
})

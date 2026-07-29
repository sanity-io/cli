import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {resolveMintedProjectCredential, resolveMintedProjectToken} from '../unclaimedProjects.js'

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

  test('falls back to the directory .env token when the ledger write is absent', () => {
    fs.writeFileSync(
      path.join(dir, '.env'),
      'SANITY_PROJECT_ID="abc123"\nSANITY_AUTH_TOKEN="sk-env-robot"\n',
    )

    expect(resolveMintedProjectToken(undefined, dir)).toBe('sk-env-robot')
  })

  test('keeps the ledger token authoritative when the directory .env token differs', () => {
    fs.writeFileSync(
      path.join(dir, '.env'),
      'SANITY_PROJECT_ID="abc123"\nSANITY_AUTH_TOKEN="sk-env-robot"\n',
    )

    expect(
      resolveMintedProjectToken({abc123: {projectId: 'abc123', token: 'sk-ledger-robot'}}, dir),
    ).toBe('sk-ledger-robot')
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

  test('returns undefined when neither the ledger nor .env has a token for that project', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="other"\n')

    expect(
      resolveMintedProjectToken({abc123: {projectId: 'abc123', token: 'sk-robot'}}, dir),
    ).toBeUndefined()
  })

  test('returns undefined when the record and .env carry no token', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')

    expect(resolveMintedProjectToken({abc123: {projectId: 'abc123'}}, dir)).toBeUndefined()
  })

  test('returns undefined when the record token is empty or whitespace-only', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')

    expect(
      resolveMintedProjectToken({abc123: {projectId: 'abc123', token: ''}}, dir),
    ).toBeUndefined()
    expect(
      resolveMintedProjectToken({abc123: {projectId: 'abc123', token: '   '}}, dir),
    ).toBeUndefined()
  })

  test('returns undefined when the ledger is empty or absent and .env carries no token', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')

    expect(resolveMintedProjectToken({}, dir)).toBeUndefined()
    expect(resolveMintedProjectToken(undefined, dir)).toBeUndefined()
  })
})

describe('resolveMintedProjectCredential', () => {
  test('returns the ledger token together with the project id that selected it', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')

    expect(
      resolveMintedProjectCredential({abc123: {projectId: 'abc123', token: 'sk-robot'}}, dir),
    ).toEqual({projectId: 'abc123', token: 'sk-robot'})
  })

  test('resolves the mint-root ledger credential from generated, renamed, and deep frontends', () => {
    const frontendDirectories = [
      path.join(dir, 'web'),
      path.join(dir, 'existing-frontend'),
      path.join(dir, 'existing-frontend', 'packages', 'site'),
    ]
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')

    for (const frontendDirectory of frontendDirectories) {
      fs.mkdirSync(frontendDirectory, {recursive: true})
      expect(
        resolveMintedProjectCredential(
          {abc123: {projectId: 'abc123', token: 'sk-robot'}},
          frontendDirectory,
        ),
      ).toEqual({projectId: 'abc123', token: 'sk-robot'})
    }
  })

  test('a nearer credential boundary blocks the mint root even when incomplete or malformed', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')
    const records = {abc123: {projectId: 'abc123', token: 'sk-robot'}}
    const nearerBoundaries = [
      'SANITY_AUTH_TOKEN="sk-nearer"\n',
      'SANITY_CLAIM_URL=\n',
      'SANITY_PROJECT_ID=\n',
      'SANITY_PROJECT_ID\n',
      'export SANITY_PROJECT_ID\n',
    ]

    for (const [index, contents] of nearerBoundaries.entries()) {
      const descendant = path.join(dir, `frontend-${index}`, 'deep')
      fs.mkdirSync(descendant, {recursive: true})
      fs.writeFileSync(path.join(path.dirname(descendant), '.env'), contents)

      expect(resolveMintedProjectCredential(records, descendant)).toBeUndefined()
    }
  })

  test('recovers the mint-root .env token from generated and unrelated nested frontends', () => {
    const generatedFrontend = path.join(dir, 'web')
    const frontend = path.join(dir, 'existing-frontend')
    const descendant = path.join(frontend, 'packages', 'site')
    fs.mkdirSync(generatedFrontend)
    fs.mkdirSync(descendant, {recursive: true})
    fs.writeFileSync(
      path.join(dir, '.env'),
      'SANITY_PROJECT_ID="abc123"\nSANITY_AUTH_TOKEN="sk-env-robot"\n',
    )
    fs.writeFileSync(
      path.join(frontend, '.env'),
      '# SANITY_PROJECT_ID="commented"\nSANITY_AUTH_TOKEN_HINT="not-a-token"\nDATABASE_URL="postgres://localhost"\n',
    )
    fs.writeFileSync(
      path.join(frontend, 'packages', '.env.local'),
      'SANITY_PROJECT_ID="ignored-local-file"\n',
    )

    for (const cwd of [generatedFrontend, descendant]) {
      expect(resolveMintedProjectCredential(undefined, cwd)).toEqual({
        projectId: 'abc123',
        token: 'sk-env-robot',
      })
    }
  })

  test('an unreadable nearer .env fails closed instead of inheriting the mint root', () => {
    const frontend = path.join(dir, 'web')
    const descendant = path.join(frontend, 'deep')
    fs.mkdirSync(descendant, {recursive: true})
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')
    fs.mkdirSync(path.join(frontend, '.env'))

    expect(
      resolveMintedProjectCredential(
        {abc123: {projectId: 'abc123', token: 'sk-robot'}},
        descendant,
      ),
    ).toBeUndefined()
  })

  test('returns the root .env credential when no ledger record was persisted', () => {
    fs.writeFileSync(
      path.join(dir, '.env'),
      'SANITY_PROJECT_ID="abc123"\nSANITY_AUTH_TOKEN="sk-env-robot"\n',
    )

    expect(resolveMintedProjectCredential(undefined, dir)).toEqual({
      projectId: 'abc123',
      token: 'sk-env-robot',
    })
  })

  test('returns undefined when no valid credential can be resolved', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')

    expect(resolveMintedProjectCredential({abc123: {projectId: 'abc123'}}, dir)).toBeUndefined()
    expect(resolveMintedProjectCredential(undefined, dir)).toBeUndefined()
    expect(resolveMintedProjectCredential('not-a-ledger', dir)).toBeUndefined()
  })

  test('rejects ledger records whose own project id is missing or mismatched', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')

    expect(
      resolveMintedProjectCredential({abc123: {token: 'sk-missing-project'}}, dir),
    ).toBeUndefined()
    expect(
      resolveMintedProjectCredential(
        {abc123: {projectId: 'otherproj', token: 'sk-mismatched-project'}},
        dir,
      ),
    ).toBeUndefined()
  })

  test('falls back to the selected .env token when its ledger record is malformed', () => {
    fs.writeFileSync(
      path.join(dir, '.env'),
      'SANITY_PROJECT_ID="abc123"\nSANITY_AUTH_TOKEN="sk-env-robot"\n',
    )

    expect(
      resolveMintedProjectCredential(
        {abc123: {projectId: 'otherproj', token: 'sk-mismatched-project'}},
        dir,
      ),
    ).toEqual({projectId: 'abc123', token: 'sk-env-robot'})
  })

  test('rejects an empty or whitespace-only token instead of constructing a credential', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')

    expect(
      resolveMintedProjectCredential({abc123: {projectId: 'abc123', token: ''}}, dir),
    ).toBeUndefined()
    expect(
      resolveMintedProjectCredential({abc123: {projectId: 'abc123', token: '   '}}, dir),
    ).toBeUndefined()
  })
})

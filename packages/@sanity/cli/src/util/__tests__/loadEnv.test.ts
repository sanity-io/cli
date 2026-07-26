import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {loadEnv} from '../loadEnv.js'

describe('loadEnv', () => {
  let envDir: string

  beforeEach(() => {
    envDir = mkdtempSync(join(tmpdir(), 'sanity-loadenv-'))
  })

  afterEach(() => {
    rmSync(envDir, {force: true, recursive: true})
    delete process.env.SANITY_STUDIO_LOADENV_TEST
  })

  it('throws when mode is "local"', () => {
    expect(() => loadEnv('local', envDir, '')).toThrow(/cannot be used as a mode name/)
  })

  it('returns empty object when no env files exist and no process.env vars match', () => {
    expect(loadEnv('development', envDir, 'SANITY_LOADENV_NO_MATCH_')).toEqual({})
  })

  it('loads variables from .env', () => {
    writeFileSync(join(envDir, '.env'), 'SANITY_STUDIO_API=https://api.example.com\n')
    expect(loadEnv('development', envDir, '')).toMatchObject({
      SANITY_STUDIO_API: 'https://api.example.com',
    })
  })

  it('gives more specific files precedence: .env < .env.local < .env.[mode] < .env.[mode].local', () => {
    writeFileSync(join(envDir, '.env'), 'A=base\nB=base\nC=base\nD=base\n')
    writeFileSync(join(envDir, '.env.local'), 'B=local\nC=local\nD=local\n')
    writeFileSync(join(envDir, '.env.development'), 'C=dev\nD=dev\n')
    writeFileSync(join(envDir, '.env.development.local'), 'D=dev-local\n')
    expect(loadEnv('development', envDir, '')).toMatchObject({
      A: 'base',
      B: 'local',
      C: 'dev',
      D: 'dev-local',
    })
  })

  it('does not load files for other modes', () => {
    writeFileSync(join(envDir, '.env.production'), 'ONLY_PROD=1\n')
    expect(loadEnv('development', envDir, '')).not.toHaveProperty('ONLY_PROD')
  })

  it('expands variable references between entries', () => {
    writeFileSync(join(envDir, '.env'), 'BASE=https://example.com\nFULL=${BASE}/api\n')
    expect(loadEnv('development', envDir, '')).toMatchObject({
      FULL: 'https://example.com/api',
    })
  })

  it('does not mutate process.env during expansion', () => {
    writeFileSync(join(envDir, '.env'), 'SANITY_STUDIO_LOADENV_TEST=from-file\n')
    loadEnv('development', envDir, '')
    expect(process.env.SANITY_STUDIO_LOADENV_TEST).toBeUndefined()
  })

  it('filters by prefix', () => {
    writeFileSync(join(envDir, '.env'), 'SANITY_STUDIO_X=1\nSECRET=2\n')
    const env = loadEnv('development', envDir, 'SANITY_STUDIO_')
    expect(env).toMatchObject({SANITY_STUDIO_X: '1'})
    expect(env).not.toHaveProperty('SECRET')
  })

  it('lets existing process.env values take priority over file values', () => {
    process.env.SANITY_STUDIO_LOADENV_TEST = 'from-process'
    writeFileSync(join(envDir, '.env'), 'SANITY_STUDIO_LOADENV_TEST=from-file\n')
    expect(loadEnv('development', envDir, '')).toMatchObject({
      SANITY_STUDIO_LOADENV_TEST: 'from-process',
    })
  })
})

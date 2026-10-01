import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {apiUrl} from '../src/api.js'
import {getLoginUrl, getProviderName, getUserDisplayName} from '../src/auth.js'
import {configPath, getToken, readConfig, storeToken} from '../src/config.js'
import {validateDatasetName} from '../src/dataset.js'
import {createCommand, helpText} from '../src/help.js'
import {isNextJsProject, slugify, unattendedErrors} from '../src/init.js'
import {getIgnoredBuildScripts, getInstallCommand, hasCommand} from '../src/packageManager.js'
import {registryFor, resolveLatestVersions} from '../src/versions.js'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'create-sanity-test-'))
})
afterEach(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await rm(dir, {force: true, recursive: true})
})

describe('apiUrl', () => {
  test('builds global and project URLs with the CLI tag', () => {
    expect(apiUrl({apiVersion: '2025-09-22', url: '/projects'})).toBe(
      'https://api.sanity.io/v2025-09-22/projects?tag=sanity.cli',
    )
    expect(apiUrl({apiVersion: 'v1', projectId: 'abc', query: {a: 'b'}, url: '/datasets'})).toBe(
      'https://abc.api.sanity.io/v1/datasets?a=b&tag=sanity.cli',
    )
  })

  test('uses the staging host', () => {
    vi.stubEnv('SANITY_INTERNAL_ENV', 'staging')
    expect(apiUrl({apiVersion: 'v1', url: '/users/me'})).toBe(
      'https://api.sanity.work/v1/users/me?tag=sanity.cli',
    )
  })
})

describe('config', () => {
  test('reads the token from the environment before the config file', async () => {
    const file = join(dir, 'config.json')
    vi.stubEnv('SANITY_CLI_CONFIG_PATH', file)
    expect(configPath()).toBe(file)
    expect(getToken()).toBeUndefined()
    await writeFile(file, JSON.stringify({authToken: 'stored', telemetryConsent: {x: 1}}))
    expect(getToken()).toBe('stored')
    vi.stubEnv('SANITY_AUTH_TOKEN', ' from-env ')
    expect(getToken()).toBe('from-env')
  })

  test('storing a token keeps other settings and resets telemetry consent', async () => {
    const file = join(dir, 'nested', 'config.json')
    vi.stubEnv('SANITY_CLI_CONFIG_PATH', file)
    storeToken('first')
    await writeFile(file, JSON.stringify({authToken: 'first', other: true, telemetryConsent: 1}))
    storeToken('second')
    expect(readConfig()).toEqual({authToken: 'second', other: true})
  })

  test('ignores invalid config files', async () => {
    const file = join(dir, 'config.json')
    vi.stubEnv('SANITY_CLI_CONFIG_PATH', file)
    await writeFile(file, '[1]')
    expect(readConfig()).toEqual({})
  })

  test('uses a separate staging config directory', () => {
    vi.stubEnv('SANITY_INTERNAL_ENV', 'staging')
    expect(configPath()).toMatch(/sanity-staging[/\\]config\.json$/)
  })
})

describe('auth helpers', () => {
  test('provider and user names', () => {
    expect(getProviderName('google')).toBe('Google')
    expect(getProviderName('github')).toBe('GitHub')
    expect(getProviderName('sanity')).toBe('Email')
    expect(getProviderName('sanity-token')).toBe('an API token')
    expect(getProviderName('saml-acme')).toBe('SAML')
    expect(getProviderName('okta')).toBe('Okta')
    expect(getUserDisplayName({email: null, id: 'u1', name: 'Robot', provider: 'x'})).toBe('Robot')
    expect(getUserDisplayName({email: 'a@b.c', id: 'u1', name: 'A', provider: 'x'})).toBe('a@b.c')
  })

  test('login URL carries token type, label and callback origin', () => {
    const url = getLoginUrl(
      'https://api.sanity.io/v1/auth/login/github',
      new URL('http://localhost:1234/callback'),
    )
    expect(url.searchParams.get('type')).toBe('token')
    expect(url.searchParams.get('origin')).toBe('http://localhost:1234/callback')
    expect(url.searchParams.get('label')).toMatch(/ \/ /)
  })
})

describe('validateDatasetName', () => {
  test.each([
    ['', 'Dataset name is missing'],
    ['Prod', 'Dataset name must be all lowercase characters'],
    ['a', 'Dataset name must be at least two characters long'],
    ['a'.repeat(65), 'Dataset name must be at most 64 characters'],
    ['-ab', 'Dataset name must start with a letter or a number'],
    ['a.b', 'Dataset name must only contain letters, numbers, dashes and underscores'],
    ['ab-', 'Dataset name must not end with a dash or an underscore'],
  ])('%s', (name, message) => {
    expect(validateDatasetName(name)).toBe(message)
  })

  test('accepts valid names', () => {
    expect(validateDatasetName('production')).toBe(false)
    expect(validateDatasetName('my_data-1')).toBe(false)
  })
})

describe('help', () => {
  test('names the create command for the running package manager', () => {
    expect(createCommand('pnpm/10.7.1 npm/? node/v22.14.0 darwin arm64')).toBe(
      'pnpm create sanity@latest',
    )
    expect(createCommand('yarn/4.0.0 npm/? node/v22')).toBe('yarn create sanity')
    expect(createCommand('bun/1.2.0 npm/? node/v22')).toBe('bun create sanity@latest')
    expect(createCommand('npm/10.9.0 node/v22')).toBe('npm create sanity@latest')
    expect(createCommand('')).toBe('npm create sanity@latest')
  })

  test('lists flags and never references sanity init as the command', () => {
    vi.stubEnv('npm_config_user_agent', 'npm/10.9.0 node/v22')
    const text = helpText()
    expect(text).toMatch(/\$ npm create sanity@latest/)
    expect(text).toMatch(/--output-path <path>/)
    expect(text).not.toMatch(/\$ sanity init/)
  })
})

describe('init helpers', () => {
  test('unattended Studio setup requires output path, project and organization', () => {
    expect(
      unattendedErrors({outputPath: '/x', project: 'p'} as Parameters<typeof unattendedErrors>[0]),
    ).toEqual([])
    expect(unattendedErrors({} as Parameters<typeof unattendedErrors>[0])).toHaveLength(3)
    expect(
      unattendedErrors({
        organization: 'o',
        outputPath: '/x',
        projectName: 'New',
      } as Parameters<typeof unattendedErrors>[0]),
    ).toEqual([])
  })

  test('slugify', () => {
    expect(slugify('Crème Brûlée Studio!')).toBe('creme-brulee-studio')
    expect(slugify('  Æsir  Ørsted ')).toBe('-aesir-orsted-')
  })

  test('detects Next.js projects', async () => {
    expect(isNextJsProject(dir)).toBe(false)
    await writeFile(join(dir, 'package.json'), JSON.stringify({dependencies: {next: '15'}}))
    expect(isNextJsProject(dir)).toBe(true)
    await writeFile(join(dir, 'package.json'), '{')
    expect(isNextJsProject(dir)).toBe(false)
  })
})

describe('package manager helpers', () => {
  test('install command', () => {
    expect(getInstallCommand('pnpm')).toBe('pnpm install')
    expect(getInstallCommand('manual')).toBe('npm install')
  })

  test('finds commands on PATH and in node_modules/.bin', async () => {
    expect(hasCommand('node', dir)).toBe(true)
    expect(hasCommand('definitely-not-a-command-xyz', dir)).toBe(false)
  })

  test('parses pnpm ignored build scripts', () => {
    const out = 'ERR_PNPM_IGNORED_BUILDS  Ignored build scripts: esbuild@0.25.0, sharp@0.34.0. Run…'
    expect(getIgnoredBuildScripts(out)).toEqual(['esbuild@0.25.0', 'sharp@0.34.0'])
    expect(getIgnoredBuildScripts('all good')).toBeUndefined()
  })
})

describe('registry', () => {
  test('prefers scoped registries, then npm config, then .npmrc, with auth', async () => {
    const rc = join(dir, '.npmrc')
    await writeFile(
      rc,
      [
        'registry=https://rc.example/',
        '@acme:registry=https://acme.example/npm',
        '//acme.example/npm/:_authToken=${ACME_TOKEN}',
        '# comment',
      ].join('\n'),
    )
    vi.stubEnv('npm_config_userconfig', join(dir, 'missing'))
    vi.stubEnv('npm_config_registry', '')
    vi.stubEnv('ACME_TOKEN', 'secret')
    expect(registryFor('sanity', dir)).toEqual({url: 'https://rc.example/'})
    expect(registryFor('@acme/pkg', dir)).toEqual({
      authorization: 'Bearer secret',
      url: 'https://acme.example/npm/',
    })
    vi.stubEnv('npm_config_registry', 'http://127.0.0.1:4873')
    expect(registryFor('sanity', dir)).toEqual({url: 'http://127.0.0.1:4873/'})
  })

  test('resolves latest ranges and keeps explicit ones', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/missing')) return new Response('', {status: 404})
      if (url.endsWith('/broken')) throw new Error('network down')
      return Response.json({'dist-tags': {latest: '1.2.3'}})
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('npm_config_registry', 'https://registry.example/')
    const versions = await resolveLatestVersions({
      '@sanity/vision': 'latest',
      broken: 'latest',
      missing: 'latest',
      react: '^19',
      sanity: 'latest',
    })
    expect(versions).toEqual({
      '@sanity/vision': '^1.2.3',
      broken: 'latest',
      missing: 'latest',
      react: '^19',
      sanity: '^1.2.3',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://registry.example/@sanity%2Fvision',
      expect.objectContaining({headers: expect.objectContaining({accept: expect.any(String)})}),
    )
  })
})

describe('ui', () => {
  test('prompts refuse to run without an interactive terminal', async () => {
    const {confirm, InitError, input, isInteractive, select, spinner} = await import('../src/ui.js')
    expect(isInteractive()).toBe(false)
    for (const prompt of [
      () => confirm({message: 'ok?'}),
      () => input({message: 'name?'}),
      () => select({choices: [{value: 'a'}], message: 'pick'}),
    ]) {
      expect(prompt).toThrow(InitError)
    }
    expect(spinner('working').text).toBe('working')
  })
})

import {fileURLToPath} from 'node:url'

import {Config} from '@oclif/core'
import {mockApi} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterAll, afterEach, beforeAll, describe, expect, test, vi} from 'vitest'

import {CORS_API_VERSION} from '../../services/cors.js'
import {runSanityCli} from '../commands.js'

const projectId = 'test-project'

let config: Config

beforeAll(async () => {
  // Keep tests hermetic: never let token resolution fall back to the
  // developer's real stored CLI login.
  vi.stubEnv('SANITY_CLI_CONFIG_PATH', '/nonexistent/sanity-cli-test-config.json')

  // Bare oclif config rooted at the monorepo root (which has no oclif
  // configuration) — same approach as @sanity/cli-test's testCommand. Avoids
  // loading this package's plugins/hooks and does not require a dist build.
  config = await Config.load(fileURLToPath(new URL('../../../../../..', import.meta.url)))
})

afterAll(() => {
  vi.unstubAllEnvs()
})

function corsOrigin(origin: string, id = 1) {
  return {
    allowCredentials: true,
    createdAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    id,
    origin,
    projectId,
    updatedAt: null,
  }
}

describe('runSanityCli', () => {
  afterEach(() => {
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('runs a command from string args, using the provided token', async () => {
    mockApi({apiVersion: CORS_API_VERSION, uri: `/projects/${projectId}/cors`})
      .matchHeader('authorization', 'Bearer user-token')
      .reply(200, [corsOrigin('https://example.com')])

    const result = await runSanityCli({
      args: `cors list --project-id ${projectId}`,
      config,
      token: 'user-token',
    })

    expect(result).toEqual({exitCode: 0, output: 'https://example.com'})
  })

  test('accepts a pre-split argv array', async () => {
    mockApi({apiVersion: CORS_API_VERSION, uri: `/projects/${projectId}/cors`})
      .matchHeader('authorization', 'Bearer user-token')
      .reply(200, [corsOrigin('https://example.com')])

    const result = await runSanityCli({
      args: ['cors', 'list', '--project-id', projectId],
      config,
      token: 'user-token',
    })

    expect(result).toEqual({exitCode: 0, output: 'https://example.com'})
  })

  test('tolerates a leading `sanity` token and quoted values', async () => {
    mockApi({apiVersion: CORS_API_VERSION, uri: `/projects/${projectId}/cors`})
      .matchHeader('authorization', 'Bearer user-token')
      .reply(200, [corsOrigin('https://example.com')])

    const result = await runSanityCli({
      args: `sanity cors list --project-id "${projectId}"`,
      config,
      token: 'user-token',
    })

    expect(result).toEqual({exitCode: 0, output: 'https://example.com'})
  })

  test('supports colon-separated command ids', async () => {
    mockApi({apiVersion: CORS_API_VERSION, uri: `/projects/${projectId}/cors`})
      .matchHeader('authorization', 'Bearer user-token')
      .reply(200, [corsOrigin('https://example.com')])

    const result = await runSanityCli({
      args: `cors:list --project-id ${projectId}`,
      config,
      token: 'user-token',
    })

    expect(result).toEqual({exitCode: 0, output: 'https://example.com'})
  })

  test('concurrent invocations use their own token and capture their own output', async () => {
    mockApi({apiVersion: CORS_API_VERSION, uri: `/projects/project-a/cors`})
      .matchHeader('authorization', 'Bearer token-a')
      .delay(50)
      .reply(200, [{...corsOrigin('https://user-a.example.com'), projectId: 'project-a'}])
    mockApi({apiVersion: CORS_API_VERSION, uri: `/projects/project-b/cors`})
      .matchHeader('authorization', 'Bearer token-b')
      .delay(5)
      .reply(200, [{...corsOrigin('https://user-b.example.com'), projectId: 'project-b'}])

    const [resultA, resultB] = await Promise.all([
      runSanityCli({args: 'cors list --project-id project-a', config, token: 'token-a'}),
      runSanityCli({args: 'cors list --project-id project-b', config, token: 'token-b'}),
    ])

    expect(resultA).toEqual({exitCode: 0, output: 'https://user-a.example.com'})
    expect(resultB).toEqual({exitCode: 0, output: 'https://user-b.example.com'})
  })

  test('reports command failures through exitCode and output without throwing', async () => {
    mockApi({apiVersion: CORS_API_VERSION, uri: `/projects/${projectId}/cors`})
      .matchHeader('authorization', 'Bearer bogus-token')
      .reply(401, {error: 'Unauthorized', message: 'Session not found', statusCode: 401})

    const previousExitCode = process.exitCode
    const result = await runSanityCli({
      args: `cors list --project-id ${projectId}`,
      config,
      token: 'bogus-token',
    })

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('CORS origins list retrieval failed')
    expect(result.output).toContain('Session not found')
    // A failed invocation must not change the host process's exit status
    expect(process.exitCode).toBe(previousExitCode)
  })

  test('reports invalid flags as a usage error', async () => {
    const result = await runSanityCli({
      args: 'cors list --no-such-flag',
      config,
      token: 'user-token',
    })

    expect(result.exitCode).toBe(2)
    expect(result.output).toContain('Nonexistent flag')
  })

  test('never resolves project context from the host filesystem', async () => {
    // Run from inside a fixture that has a resolvable sanity.cli.ts. Without
    // the execution-context guard, the command would walk up from cwd, find
    // the fixture project, and use its projectId. Instead it must fail with
    // an explicit "provide a project ID" error, proving cwd is never read.
    const fixtureDir = fileURLToPath(
      new URL('../../../../../../fixtures/basic-studio', import.meta.url),
    )
    const previousCwd = process.cwd()
    process.chdir(fixtureDir)
    try {
      const result = await runSanityCli({args: 'cors list', config, token: 'user-token'})

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('Unable to determine project ID')
    } finally {
      process.chdir(previousCwd)
    }
  })

  test('rejects commands outside the allowlist', async () => {
    const result = await runSanityCli({args: 'login', config, token: 'user-token'})

    expect(result.exitCode).toBe(2)
    expect(result.output).toContain('Unknown or unsupported command: login')
    expect(result.output).toContain('cors list')
  })

  test('rejects real CLI commands that are not allowlisted', async () => {
    const result = await runSanityCli({args: 'datasets list', config, token: 'user-token'})

    expect(result.exitCode).toBe(2)
    expect(result.output).toContain('Unknown or unsupported command: datasets list')
  })

  test('rejects empty args', async () => {
    const result = await runSanityCli({args: '', config, token: 'user-token'})

    expect(result.exitCode).toBe(2)
    expect(result.output).toContain('Unknown or unsupported command')
  })

  test('reports unterminated quotes as a usage error', async () => {
    const result = await runSanityCli({
      args: 'cors add "https://example.com',
      config,
      token: 'user-token',
    })

    expect(result.exitCode).toBe(2)
    expect(result.output).toContain('Unterminated double quote')
  })
})

import {fileURLToPath} from 'node:url'

import {Config} from '@oclif/core'
import {CLI_TELEMETRY_SYMBOL, exitCodes} from '@sanity/cli-core'
import {mockApi} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterAll, afterEach, beforeAll, describe, expect, test, vi} from 'vitest'

import {CORS_API_VERSION} from '../../services/cors.js'
import {PROJECTS_API_VERSION} from '../../services/projects.js'
import {USERS_API_VERSION} from '../../services/user.js'
import {commandPolicies} from '../invokeSanityCli/commandPolicies/index.js'
import {invokeSanityCli} from '../invokeSanityCli/index.js'

const projectId = 'test-project'

/**
 * All tests run against the CLI package's real oclif config (topics and
 * command manifest from oclif.config.js and dist/): command resolution and
 * help both need it. The dist build it depends on is guaranteed by the
 * pretest script.
 */
let config: Config

beforeAll(async () => {
  // Keep tests hermetic: never let token resolution fall back to the
  // developer's real stored CLI login.
  vi.stubEnv('SANITY_CLI_CONFIG_PATH', '/nonexistent/sanity-cli-test-config.json')
  vi.stubEnv('SANITY_INTERNAL_ENV', 'production')

  config = await Config.load(fileURLToPath(new URL('../../..', import.meta.url)))
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

/**
 * Invoke with the test transport. Command modules load from the compiled
 * dist build (outside vitest's mock graph), and the sanity client's default
 * undici transport bypasses nock — so each invocation's execution context
 * carries the nock-patched global fetch instead. The execution context's
 * production transport hygiene (e.g. lineage stripping) still applies on
 * top of it.
 */
function invoke(options: Parameters<typeof invokeSanityCli>[0]) {
  return invokeSanityCli({fetch: (url, init) => globalThis.fetch(url, init), ...options})
}

describe('invokeSanityCli', () => {
  afterEach(() => {
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('the mcp policy covers this package and explicitly-owned plugin commands', () => {
    // Exhaustiveness keeps the policy honest: a new CLI command fails here
    // until it is deliberately categorized (allow/conditional/deny), and a
    // policy entry for a removed command fails too. Command ids come from the
    // loaded oclif config — the same source invokeSanityCli resolves against —
    // scoped to this package's own visible commands. Sanity-owned plugin
    // commands can opt in explicitly; every other plugin command fails closed.
    const commandIds = config.commands
      .filter((command) => command.pluginName === config.pjson.name && !command.hidden)
      .map((command) => command.id)
      .toSorted()
    const localPolicyIds = Object.entries(commandPolicies.mcp)
      .filter(([, policy]) => policy.pluginName === undefined)
      .map(([id]) => id)
      .toSorted()

    expect(localPolicyIds).toEqual(commandIds)

    for (const [id, policy] of Object.entries(commandPolicies.mcp)) {
      if (!policy.pluginName) continue
      expect(config.findCommand(id)?.pluginName).toBe(policy.pluginName)
    }
  })

  test('the functions logs policy permits only explicit bounded remote reads', () => {
    const policy = commandPolicies.mcp['functions:logs']
    const validFlags = {'project-id': projectId, stack: 'production'}

    expect(policy.pluginName).toBe('@sanity/runtime-cli')
    expect(policy.validate({args: {name: 'onPublish'}, flags: validFlags})).toBe(true)
    expect(policy.validate({args: {}, flags: validFlags})).toBe(false)
    expect(policy.validate({args: {name: 'onPublish'}, flags: {'project-id': projectId}})).toBe(
      false,
    )
    expect(
      policy.validate({
        args: {name: 'onPublish'},
        flags: {...validFlags, 'organization-id': 'org-id'},
      }),
    ).toBe(false)
    expect(policy.validate({args: {name: 'onPublish'}, flags: {...validFlags, watch: true}})).toBe(
      false,
    )
    expect(policy.validate({args: {name: 'onPublish'}, flags: {...validFlags, delete: true}})).toBe(
      false,
    )
  })

  test('refuses a plugin policy when a different plugin owns the command', async () => {
    const command = config.findCommand('functions:logs')
    if (!command) throw new Error('Expected functions:logs command')
    const originalPluginName = command.pluginName
    command.pluginName = 'third-party-plugin'

    try {
      const invocation = await invoke({
        args: `functions logs onPublish --project-id ${projectId} --stack production`,
        config,
        source: 'mcp',
        token: 'user-token',
      })
      const help = await invoke({
        args: 'functions logs --help',
        config,
        source: 'mcp',
        token: 'user-token',
      })

      expect(invocation.exitCode).toBe(exitCodes.USAGE_ERROR)
      expect(invocation.output).toContain('Unknown or unsupported command')
      expect(invocation.output.split('Available commands: ')[1]).not.toContain('functions logs')
      expect(help.exitCode).toBe(exitCodes.USAGE_ERROR)
      expect(help.output).toContain('Unknown or unsupported command')
    } finally {
      command.pluginName = originalPluginName
    }
  })

  test('resolves its own oclif config by default, without a config override', async () => {
    // Regression test: `loadCliCommandConfig` must resolve this package's own
    // root (where package.json and the oclif manifest live), not some other
    // ancestor directory, when a caller doesn't supply `config` (as every
    // other test in this file does).
    const result = await invoke({args: '--help', source: 'mcp', token: 'user-token'})

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('USAGE')
    expect(result.output).toContain('Manage CORS origins for your project')
  })

  test('an allowed invocation does not consult or mutate representative host state', async () => {
    mockApi({apiVersion: CORS_API_VERSION, uri: `/projects/${projectId}/cors`})
      .matchHeader('authorization', 'Bearer invocation-token')
      .reply(function () {
        expect(this.req.headers['x-sanity-lineage']).toBeUndefined()
        return [200, [corsOrigin('https://isolated.example.com')]]
      })

    const globalRegistry = globalThis as Record<symbol, unknown>
    const previousTelemetry = globalRegistry[CLI_TELEMETRY_SYMBOL]
    const hostTelemetry = {log: vi.fn()}
    globalRegistry[CLI_TELEMETRY_SYMBOL] = hostTelemetry
    const previousEnv = {
      authToken: process.env.SANITY_AUTH_TOKEN,
      lineage: process.env.X_SANITY_LINEAGE,
      sanityEnv: process.env.SANITY_INTERNAL_ENV,
    }
    process.env.SANITY_AUTH_TOKEN = 'host-token'
    process.env.X_SANITY_LINEAGE = 'host-lineage'
    process.env.SANITY_INTERNAL_ENV = 'staging'

    const cwd = vi.spyOn(process, 'cwd').mockImplementation(() => {
      throw new Error('host cwd accessed')
    })
    const stdout = vi.spyOn(process.stdout, 'write')
    const stderr = vi.spyOn(process.stderr, 'write')
    const once = vi.spyOn(process, 'once')
    const off = vi.spyOn(process, 'off')

    try {
      const result = await invoke({
        args: `cors list --project-id ${projectId}`,
        sanityEnv: 'production',
        source: 'mcp',
        token: 'invocation-token',
      })

      expect(result).toEqual({
        commandId: 'cors:list',
        exitCode: 0,
        output: 'https://isolated.example.com',
      })
      expect(cwd).not.toHaveBeenCalled()
      expect(stdout).not.toHaveBeenCalled()
      expect(stderr).not.toHaveBeenCalled()
      expect(once).not.toHaveBeenCalledWith('SIGINT', expect.any(Function))
      expect(off).not.toHaveBeenCalledWith('SIGINT', expect.any(Function))
      expect(globalRegistry[CLI_TELEMETRY_SYMBOL]).toBe(hostTelemetry)
      expect(process.env.SANITY_AUTH_TOKEN).toBe('host-token')
      expect(process.env.X_SANITY_LINEAGE).toBe('host-lineage')
      expect(process.env.SANITY_INTERNAL_ENV).toBe('staging')
    } finally {
      cwd.mockRestore()
      stdout.mockRestore()
      stderr.mockRestore()
      once.mockRestore()
      off.mockRestore()
      globalRegistry[CLI_TELEMETRY_SYMBOL] = previousTelemetry
      if (previousEnv.authToken === undefined) delete process.env.SANITY_AUTH_TOKEN
      else process.env.SANITY_AUTH_TOKEN = previousEnv.authToken
      if (previousEnv.lineage === undefined) delete process.env.X_SANITY_LINEAGE
      else process.env.X_SANITY_LINEAGE = previousEnv.lineage
      if (previousEnv.sanityEnv === undefined) delete process.env.SANITY_INTERNAL_ENV
      else process.env.SANITY_INTERNAL_ENV = previousEnv.sanityEnv
    }
  })

  test('table output reaches the caller instead of the host console', async () => {
    // Regression test: commands that rendered their table with
    // `printTable()` wrote straight to `console.log`, which bypasses the
    // execution context's stdout sink. The invocation still exited 0, so
    // callers got a successful result carrying an empty string. Asserting
    // that `process.stdout` is untouched is what makes this test meaningful —
    // a test that only stubs `process.stdout.write` cannot tell the two paths
    // apart, since `console.log` writes through that same stub.
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      uri: `/invitations/project/${projectId}`,
    }).reply(200, [])
    mockApi({apiVersion: PROJECTS_API_VERSION, projectId, uri: `/projects/${projectId}`}).reply(
      200,
      {
        id: projectId,
        members: [
          {id: 'user1', isRobot: false, roles: [{title: 'Administrator'}]},
          {id: 'user2', isRobot: false, roles: [{title: 'Developer'}]},
        ],
      },
    )
    mockApi({apiVersion: USERS_API_VERSION, uri: '/users/user1,user2'}).reply(200, [
      {createdAt: '2023-01-01', displayName: 'User One', id: 'user1'},
      {createdAt: '2023-01-02', displayName: 'User Two', id: 'user2'},
    ])

    const stdout = vi.spyOn(process.stdout, 'write')

    try {
      const result = await invoke({
        args: `users list --project-id ${projectId}`,
        config,
        source: 'mcp',
        token: 'user-token',
      })

      expect(result.exitCode).toBe(0)
      expect(result.commandId).toBe('users:list')
      expect(result.output).not.toBe('')
      expect(result.output).toContain('User One')
      expect(result.output).toContain('Administrator')
      expect(result.output).toContain('user2')
      expect(result.output).toContain('2023-01-02')
      expect(stdout).not.toHaveBeenCalled()
    } finally {
      stdout.mockRestore()
    }
  })

  test('an empty table renders as a message rather than an empty result', async () => {
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      uri: `/invitations/project/${projectId}`,
    }).reply(200, [])
    mockApi({apiVersion: PROJECTS_API_VERSION, projectId, uri: `/projects/${projectId}`}).reply(
      200,
      {id: projectId, members: []},
    )
    mockApi({apiVersion: USERS_API_VERSION, uri: '/users/'}).reply(200, [])

    const result = await invoke({
      args: `users list --project-id ${projectId}`,
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result).toEqual({
      commandId: 'users:list',
      exitCode: 0,
      output: 'No members found for this project.',
    })
  })

  test('runs a command from string args, using the provided token', async () => {
    mockApi({apiVersion: CORS_API_VERSION, uri: `/projects/${projectId}/cors`})
      .matchHeader('authorization', 'Bearer user-token')
      .reply(200, [corsOrigin('https://example.com')])

    const result = await invoke({
      args: `cors list --project-id ${projectId}`,
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result).toEqual({commandId: 'cors:list', exitCode: 0, output: 'https://example.com'})
  })

  test('accepts a pre-split argv array', async () => {
    mockApi({apiVersion: CORS_API_VERSION, uri: `/projects/${projectId}/cors`})
      .matchHeader('authorization', 'Bearer user-token')
      .reply(200, [corsOrigin('https://example.com')])

    const result = await invoke({
      args: ['cors', 'list', '--project-id', projectId],
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result).toEqual({commandId: 'cors:list', exitCode: 0, output: 'https://example.com'})
  })

  test('tolerates a leading `sanity` token and quoted values', async () => {
    mockApi({apiVersion: CORS_API_VERSION, uri: `/projects/${projectId}/cors`})
      .matchHeader('authorization', 'Bearer user-token')
      .reply(200, [corsOrigin('https://example.com')])

    const result = await invoke({
      args: `sanity cors list --project-id "${projectId}"`,
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result).toEqual({commandId: 'cors:list', exitCode: 0, output: 'https://example.com'})
  })

  test.each([
    ['double quotes', `cors list --project-id="${projectId}"`],
    ['single quotes', `cors list --project-id='${projectId}'`],
  ])('strips %s glued to --flag= tokens like a shell would', async (_style, args) => {
    mockApi({apiVersion: CORS_API_VERSION, uri: `/projects/${projectId}/cors`})
      .matchHeader('authorization', 'Bearer user-token')
      .reply(200, [corsOrigin('https://example.com')])

    const result = await invoke({
      args,
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result).toEqual({commandId: 'cors:list', exitCode: 0, output: 'https://example.com'})
  })

  test('supports colon-separated command ids', async () => {
    mockApi({apiVersion: CORS_API_VERSION, uri: `/projects/${projectId}/cors`})
      .matchHeader('authorization', 'Bearer user-token')
      .reply(200, [corsOrigin('https://example.com')])

    const result = await invoke({
      args: `cors:list --project-id ${projectId}`,
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result).toEqual({commandId: 'cors:list', exitCode: 0, output: 'https://example.com'})
  })

  test('concurrent invocations use their own environment, token, and output', async () => {
    mockApi({apiVersion: CORS_API_VERSION, uri: `/projects/project-a/cors`})
      .matchHeader('authorization', 'Bearer token-a')
      .delay(50)
      .reply(200, [{...corsOrigin('https://user-a.example.com'), projectId: 'project-a'}])
    mockApi({
      apiHost: 'https://api.sanity.work',
      apiVersion: CORS_API_VERSION,
      uri: `/projects/project-b/cors`,
    })
      .matchHeader('authorization', 'Bearer token-b')
      .delay(5)
      .reply(200, [{...corsOrigin('https://user-b.example.com'), projectId: 'project-b'}])

    const [resultA, resultB] = await Promise.all([
      invoke({
        args: 'cors list --project-id project-a',
        config,
        sanityEnv: 'production',
        source: 'mcp',
        token: 'token-a',
      }),
      invoke({
        args: 'cors list --project-id project-b',
        config,
        sanityEnv: 'staging',
        source: 'mcp',
        token: 'token-b',
      }),
    ])

    expect(resultA).toEqual({
      commandId: 'cors:list',
      exitCode: 0,
      output: 'https://user-a.example.com',
    })
    expect(resultB).toEqual({
      commandId: 'cors:list',
      exitCode: 0,
      output: 'https://user-b.example.com',
    })
  })

  test('reports command failures through exitCode and output without throwing', async () => {
    mockApi({apiVersion: CORS_API_VERSION, uri: `/projects/${projectId}/cors`})
      .matchHeader('authorization', 'Bearer bogus-token')
      .reply(401, {error: 'Unauthorized', message: 'Session not found', statusCode: 401})

    const previousExitCode = process.exitCode
    const result = await invoke({
      args: `cors list --project-id ${projectId}`,
      config,
      source: 'mcp',
      token: 'bogus-token',
    })

    expect(result.exitCode).toBe(1)
    expect(result.commandId).toBe('cors:list')
    expect(result.output).toContain('CORS origins list retrieval failed')
    expect(result.output).toContain('Session not found')
    // A failed invocation must not change the host process's exit status
    expect(process.exitCode).toBe(previousExitCode)
  })

  test('reports invalid flags as a usage error', async () => {
    const result = await invoke({
      args: 'cors list --no-such-flag',
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result.exitCode).toBe(2)
    expect(result.commandId).toBe('cors:list')
    expect(result.output).toContain('Nonexistent flag')
  })

  test.each(['hook list --no-such-flag', 'hook:list --no-such-flag'])(
    'resolves the topic alias in `%s` before applying the MCP policy',
    async (args) => {
      const result = await invoke({args, config, source: 'mcp', token: 'user-token'})

      expect(result.exitCode).toBe(2)
      expect(result.commandId).toBe('hooks:list')
      expect(result.output).toContain('Nonexistent flag')
      expect(result.output).not.toContain('Unknown or unsupported command')
    },
  )

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
      const result = await invoke({
        args: 'cors list',
        config,
        source: 'mcp',
        token: 'user-token',
      })

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('Unable to determine project ID')
    } finally {
      process.chdir(previousCwd)
    }
  })

  test('preserves actionable details from command errors', async () => {
    const result = await invoke({
      args: 'backups list',
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result.exitCode).toBe(1)
    expect(result.output).toMatchInlineSnapshot(`
      "ProjectRootNotFoundError: Unable to determine project ID
      Code: PROJECT_ROOT_NOT_FOUND
      Try this:
        * Providing a project ID: --project-id <project-id>
        * Running this command from within a Sanity project directory
        * Running in an interactive terminal to get a project selection prompt
      Caused by: NonInteractiveError: Cannot run "select" prompt in a non-interactive environment. Provide the required value via flags or environment variables, or run in an interactive terminal.
      Code: NON_INTERACTIVE"
    `)
  })

  test.each([
    'login', // denied: performs an authentication flow
    'schemas list', // denied: requires a local project
    'bogus stuff', // does not exist at all
  ])('`%s` is rejected as unknown or unsupported', async (args) => {
    const result = await invoke({args, config, source: 'mcp', token: 'user-token'})

    expect(result.exitCode).toBe(2)
    expect(result.commandId).toBeUndefined()
    expect(result.output).toContain(`Unknown or unsupported command: ${args}`)
    expect(result.output).toContain('cors list')
  })

  test('denied commands are indistinguishable from unknown commands', async () => {
    const denied = await invoke({
      args: 'login',
      config,
      source: 'mcp',
      token: 'user-token',
    })
    const unknown = await invoke({
      args: 'bogus',
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(denied.exitCode).toBe(unknown.exitCode)
    expect(denied.output.replace('login', 'bogus')).toBe(unknown.output)
  })

  test('rejects empty args', async () => {
    const result = await invoke({args: '', config, source: 'mcp', token: 'user-token'})

    expect(result.exitCode).toBe(2)
    expect(result.output).toContain('Unknown or unsupported command')
  })

  test('tolerates unterminated quotes, treating the rest as one token', async () => {
    mockApi({apiVersion: CORS_API_VERSION, uri: `/projects/${projectId}/cors`})
      .matchHeader('authorization', 'Bearer user-token')
      .reply(200, [corsOrigin('https://example.com')])

    const result = await invoke({
      args: `cors list --project-id "${projectId}`,
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result).toEqual({commandId: 'cors:list', exitCode: 0, output: 'https://example.com'})
  })

  test.each([
    ['docs read /docs/studio/installation --web', '--web', 'docs:read'], // --web opens a browser on the host
    ['graphql undeploy --api ios --force', '--api', 'graphql:undeploy'], // --api loads local GraphQL definitions
    ['api users/me --input body.json', '--input', 'api'], // --input reads the host's filesystem or stdin
    ['api users/me --token other-user-token', '--token', 'api'], // --token overrides the MCP user's token
    [
      `functions logs onPublish --project-id ${projectId} --stack production --watch`,
      '--watch',
      'functions:logs',
    ],
    [
      `functions logs onPublish --project-id ${projectId} --stack production --delete --force`,
      '--delete',
      'functions:logs',
    ],
  ])('`%s` is refused by a conditional policy naming the flag', async (args, flag, commandId) => {
    const result = await invoke({args, config, source: 'mcp', token: 'user-token'})

    expect(result.exitCode).toBe(2)
    expect(result.commandId).toBe(commandId)
    expect(result.output).toContain('is not supported here')
    expect(result.output).toContain(flag)
  })

  test.each([
    ['a file', 'api users/me -F body=@payload.json'],
    ['stdin', 'api users/me --field body=@-'],
  ])('`api` field values reading from %s are refused', async (_source, args) => {
    const result = await invoke({args, config, source: 'mcp', token: 'user-token'})

    expect(result.exitCode).toBe(2)
    expect(result.output).toBe('This invocation of `api` is not supported here')
  })

  test.each([
    [
      'Authorization',
      'long flag',
      'api users/me --header "Authorization: Bearer other-user-token"',
    ],
    [
      'Authorization',
      'short flag with mixed casing',
      'api users/me -H "aUtHoRiZaTiOn: Basic credentials"',
    ],
    ['Cookie', 'long flag', 'api users/me --anonymous --header "Cookie: sid=other-user-session"'],
    [
      'Cookie',
      'short flag with mixed casing',
      'api users/me --anonymous -H " cOoKiE : sid=other-user-session"',
    ],
  ])('`api` %s headers using the %s are refused', async (_header, _style, args) => {
    const result = await invoke({args, config, source: 'mcp', token: 'user-token'})

    expect(result.exitCode).toBe(2)
    expect(result.output).toBe('This invocation of `api` is not supported here')
  })

  test.each([
    ['username and password', 'api https://user:pass@api.sanity.io/v1/users/me --anonymous'],
    ['username only', 'api https://user@api.sanity.io/v1/users/me --anonymous'],
  ])('`api` URLs embedding a %s are refused', async (_credentials, args) => {
    const result = await invoke({args, config, source: 'mcp', token: 'user-token'})

    expect(result.exitCode).toBe(2)
    expect(result.output).toBe('This invocation of `api` is not supported here')
  })

  test('the api policy refuses authentication overrides and host input channels', () => {
    const policy = commandPolicies.mcp.api
    const validate = (flags: Record<string, unknown>, endpoint: unknown = 'users/me') =>
      policy.validate({args: {endpoint}, flags})

    expect(validate({})).toBe(true)
    expect(validate({}, 'https://api.sanity.io/v1/users/me')).toBe(true)
    expect(validate({}, 'not a URL')).toBe(true)
    expect(validate({}, 42)).toBe(true)
    expect(validate({field: ['key=value', 'count=1']})).toBe(true)
    expect(validate({field: [42, 'invalid']})).toBe(true)
    expect(validate({header: ['Content-Type: application/json', 'X-Custom: value']})).toBe(true)
    expect(validate({header: [42, 'invalid']})).toBe(true)
    // Raw `-f` fields are always verbatim strings — `@` has no meaning there.
    expect(validate({'raw-field': ['key=@payload.json']})).toBe(true)

    expect(validate({input: 'payload.json'})).toBe(false)
    expect(validate({input: '-'})).toBe(false)
    expect(validate({token: 'other-user-token'})).toBe(false)
    expect(validate({header: ['Authorization: Bearer other-user-token']})).toBe(false)
    expect(validate({header: [' aUtHoRiZaTiOn : Basic credentials']})).toBe(false)
    expect(validate({header: ['Cookie: sid=other-user-session']})).toBe(false)
    expect(validate({header: [' cOoKiE : sid=other-user-session']})).toBe(false)
    expect(validate({field: ['body=@payload.json']})).toBe(false)
    expect(validate({field: ['key=value', 'body=@-']})).toBe(false)
    expect(validate({}, 'https://user:pass@api.sanity.io/v1/users/me')).toBe(false)
    expect(validate({}, 'https://user@api.sanity.io/v1/users/me')).toBe(false)
    expect(validate({}, 'https://:pass@api.sanity.io/v1/users/me')).toBe(false)
  })

  test('the api policy stops checking after finding a host-reading field', () => {
    const policy = commandPolicies.mcp.api
    const flags = {
      field: ['body=@payload.json'],
      get header(): never {
        throw new Error('header should not be read')
      },
    }

    expect(policy.validate({args: {}, flags})).toBe(false)
  })

  test('the api policy stops checking after finding an authentication header', () => {
    const policy = commandPolicies.mcp.api
    const args = {
      get endpoint(): never {
        throw new Error('endpoint should not be read')
      },
    }

    expect(
      policy.validate({args, flags: {header: ['Authorization: Bearer other-user-token']}}),
    ).toBe(false)
  })

  test('invokes a Sanity-owned plugin command with isolated auth and transport', async () => {
    const stackId = 'ST-1234567890'
    const functionId = 'FN-on-publish'
    const functionName = 'onPublish'
    const logEntry = {
      level: 'INFO',
      message: 'Function completed',
      requestId: 'request-1',
      time: '2026-08-20T17:00:00.000Z',
    }

    mockApi({
      apiVersion: 'v2025-04-23',
      includeQueryTag: false,
      uri: '/users/me',
    })
      .matchHeader('authorization', 'Bearer invocation-token')
      .reply(200, {id: 'user-1'})

    mockApi({
      apiVersion: 'v2026-06-15',
      includeQueryTag: false,
      uri: `/blueprints/stacks/${stackId}`,
    })
      .matchHeader('authorization', 'Bearer invocation-token')
      .matchHeader('x-sanity-scope-type', 'project')
      .matchHeader('x-sanity-scope-id', projectId)
      .reply(200, {
        defaultProjectId: projectId,
        displayName: 'Production',
        id: stackId,
        name: 'production',
        resources: [
          {
            externalId: functionId,
            id: 'resource-1',
            name: functionName,
            parameters: {project: projectId},
            type: 'sanity.function.document',
          },
        ],
        scopeId: projectId,
        scopeType: 'project',
      })

    mockApi({
      apiVersion: 'v2025-07-30',
      includeQueryTag: false,
      query: {limit: '1'},
      uri: `/functions/${functionId}/logs`,
    })
      .matchHeader('authorization', 'Bearer invocation-token')
      .matchHeader('x-sanity-scope-type', 'project')
      .matchHeader('x-sanity-scope-id', projectId)
      .reply(200, {logs: [logEntry]})

    const result = await invoke({
      args: `functions logs ${functionName} --project-id ${projectId} --stack ${stackId} --limit 1 --json`,
      config,
      source: 'mcp',
      token: 'invocation-token',
    })

    expect(result).toEqual({
      commandId: 'functions:logs',
      exitCode: 0,
      output: JSON.stringify({logs: [logEntry]}, null, 2),
    })
  })

  test('conditional policies see parsed flags, not raw tokens', async () => {
    // `--web` after `--` is a positional argument, not a flag, so the policy
    // must not refuse it. The command is strict, so oclif's parser rejects
    // the unexpected positional instead — proving the invocation got past
    // the policy gate to real argument parsing.
    const result = await invoke({
      args: ['docs', 'read', '/docs/studio/installation', '--', '--web'],
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result.output).not.toContain('is not supported here')
  })

  test.each(['--help', 'help', 'sanity --help'])(
    '`%s` renders root help scoped to the policy surface',
    async (args) => {
      const result = await invoke({args, config, source: 'mcp', token: 'user-token'})

      expect(result.exitCode).toBe(0)
      expect(result.commandId).toBeUndefined()
      expect(result.output).toContain('USAGE')
      expect(result.output).toContain('TOPICS')
      expect(result.output).toContain('Manage CORS origins for your project')
      expect(result.output).toContain('Manage Sanity projects')
      expect(result.output).toContain('Manage datasets in your project')
      // Fully denied topics must not be advertised
      expect(result.output).not.toContain('migrations')
      expect(result.output).not.toContain('tokens')
      // Plain text for programmatic callers: no ANSI escape codes
      expect(result.output).not.toContain('\u001B')
    },
  )

  test.each(['cors --help', 'help cors'])(
    '`%s` renders topic help listing only invokable commands',
    async (args) => {
      const result = await invoke({args, config, source: 'mcp', token: 'user-token'})

      expect(result.exitCode).toBe(0)
      expect(result.commandId).toBeUndefined()
      expect(result.output).toContain('Manage CORS origins for your project')
      expect(result.output).toContain('cors add')
      expect(result.output).toContain('cors delete')
      expect(result.output).toContain('cors list')
    },
  )

  test.each(['hook --help', 'help hook'])('`%s` resolves topic aliases for help', async (args) => {
    const result = await invoke({args, config, source: 'mcp', token: 'user-token'})

    expect(result.exitCode).toBe(0)
    expect(result.commandId).toBeUndefined()
    expect(result.output).toContain('hooks list')
  })

  test.each(['hook list --help', 'help hook list'])(
    '`%s` resolves topic aliases for command help',
    async (args) => {
      const result = await invoke({args, config, source: 'mcp', token: 'user-token'})

      expect(result.exitCode).toBe(0)
      expect(result.commandId).toBe('hooks:list')
      expect(result.output).toContain('List webhooks for the project')
    },
  )

  test('`-h` is not a help flag, matching the regular CLI dispatch', async () => {
    const result = await invoke({
      args: 'cors list -h',
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result.exitCode).toBe(2)
    expect(result.output).toContain('-h')
  })

  test('topic help omits denied commands within the topic', async () => {
    const result = await invoke({
      args: 'datasets --help',
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('datasets list')
    // datasets export/import touch the local filesystem and are denied
    expect(result.output).not.toContain('datasets export')
    expect(result.output).not.toContain('datasets import')
  })

  test.each(['cors list --help', 'help cors list', 'cors:list --help'])(
    '`%s` renders command help with usage and flags',
    async (args) => {
      const result = await invoke({args, config, source: 'mcp', token: 'user-token'})

      expect(result.exitCode).toBe(0)
      expect(result.commandId).toBe('cors:list')
      expect(result.output).toContain('List CORS origins for the project')
      expect(result.output).toContain('USAGE')
      expect(result.output).toContain('--project-id')
    },
  )

  test('reports a root command id for command-specific help', async () => {
    const result = await invoke({
      args: 'api --help',
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result.exitCode).toBe(0)
    expect(result.commandId).toBe('api')
    expect(result.output).toContain('USAGE')
  })

  test.each([
    ['docs read --help', '--web'],
    ['graphql undeploy --help', '--api'],
    ['functions logs --help', '--watch'],
    ['functions logs --help', '--delete'],
  ])('`%s` omits the policy-denied %s flag', async (args, deniedFlag) => {
    // Help must not advertise surface the policy refuses: the flag disappears
    // from FLAGS/USAGE and examples demonstrating it are dropped.
    const result = await invoke({args, config, source: 'mcp', token: 'user-token'})

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('USAGE')
    expect(result.output).not.toContain(deniedFlag)
  })

  test('`api --help` omits the policy-denied --token flag definition', async () => {
    const result = await invoke({
      args: 'api --help',
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).not.toContain('-t, --token=')
  })

  test('help output is stable across invocations sharing a config', async () => {
    // Regression: oclif's help formatters rewrite command ids in place
    // (`cors:list` → `cors list`); without defensive copies this corrupts the
    // shared config and later help calls lose commands (or execute them)
    const opts = {config, source: 'mcp', token: 'user-token'} as const

    const first = await invoke({args: 'cors --help', ...opts})
    await invoke({args: 'cors list --help', ...opts})
    const second = await invoke({args: 'cors --help', ...opts})

    expect(second.output).toContain('cors list')
    expect(second.output).toBe(first.output)
  })

  test.each([
    'schemas --help', // real topic, fully denied
    'login --help', // real root command, denied
    'datasets export --help', // real command under a visible topic, denied
    'bogus --help', // does not exist at all
  ])('`%s` is rejected identically to an unknown command', async (args) => {
    const result = await invoke({args, config, source: 'mcp', token: 'user-token'})

    expect(result.exitCode).toBe(2)
    expect(result.commandId).toBeUndefined()
    expect(result.output).toContain('Unknown or unsupported command')
    expect(result.output).toContain('Available commands:')
    expect(result.output).toContain('cors add')
  })
})

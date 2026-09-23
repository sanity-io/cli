import {fileURLToPath} from 'node:url'

import {Config, Flags} from '@oclif/core'
import {mcpOverrides, requiredWhenUnattended} from '@sanity/cli-core/flags'
import {beforeAll, describe, expect, test} from 'vitest'

import {
  getMcpToolDefinitions,
  invokeSanityCli,
  type McpToolDefinition,
  mcpToolInputToArgv,
} from '../invokeSanityCli/index.js'

/**
 * All tests run against the CLI package's real oclif config (topics and
 * command manifest from oclif.config.js and dist/): definitions are generated
 * from the same source invokeSanityCli resolves against. The dist build it
 * depends on is guaranteed by the pretest script. Generating the default list
 * doubles as its gate: an entry that is denied or broken makes every test
 * here fail.
 */
let config: Config
let definitions: McpToolDefinition[]

beforeAll(async () => {
  config = await Config.load(fileURLToPath(new URL('../../..', import.meta.url)))
  definitions = await getMcpToolDefinitions({config})
})

function networkDisabled(): never {
  throw new Error('network intentionally disabled')
}

function definition(name: string): McpToolDefinition {
  const found = definitions.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`No generated tool named ${name}`)
  return found
}

describe('getMcpToolDefinitions', () => {
  test('carries the policy read-only marker', () => {
    expect(definitions.filter((tool) => tool.readOnly).map((tool) => tool.name)).toEqual([
      'context_get',
      'context_imports_get',
      'context_imports_list',
      'context_jobs_get',
      'context_list',
    ])
  })

  test('mcpOverrides applies MCP-surface deviations', () => {
    const {properties, required} = definition('context_list').inputSchema

    // Description override: the config-fallback suffix is CLI-only copy.
    expect(properties.organization.description).toBe('Organization to list knowledge bases for')
    expect(properties.organization.description).not.toContain('overrides CLI configuration')
    expect(
      definition('context_imports_create').inputSchema.properties['content-type'].description,
    ).not.toContain('--file')

    // Required override: the CLI resolves the org from config, MCP cannot.
    expect(required).toContain('organization')
    expect(definition('context_create').inputSchema.required).toContain('organization')
  })

  test('excludeMcpToolCommands removes the dedicated-tool surface from freeform invocation', async () => {
    const excluded = await invokeSanityCli({
      args: 'context list --json',
      config,
      excludeMcpToolCommands: true,
      fetch: networkDisabled,
      source: 'mcp',
      token: 't',
    })
    expect(excluded.exitCode).toBe(2)
    expect(excluded.output).toContain('Unknown or unsupported command')

    // Excluded commands vanish from help too…
    const excludedHelp = await invokeSanityCli({
      args: 'context list --help',
      config,
      excludeMcpToolCommands: true,
      fetch: networkDisabled,
      source: 'mcp',
      token: 't',
    })
    expect(excludedHelp.exitCode).toBe(2)
    expect(excludedHelp.output).toContain('Unknown or unsupported command')

    // …while commands outside the list stay freeform-invokable.
    const stillFreeform = await invokeSanityCli({
      args: 'cors list --help',
      config,
      excludeMcpToolCommands: true,
      fetch: networkDisabled,
      source: 'mcp',
      token: 't',
    })
    expect(stillFreeform.exitCode).toBe(0)
  })

  test('omits the json flag from the schema and forces it at invocation', () => {
    const contextList = definition('context_list')

    expect(contextList.inputSchema.properties.json).toBeUndefined()
    expect(contextList.forceJson).toBe(true)
    expect(mcpToolInputToArgv(contextList, {})).toEqual(['context:list', '--json'])
  })

  test('commands without JSON output do not claim it', () => {
    const contextRefresh = definition('context_refresh')

    expect(contextRefresh.forceJson).toBe(false)
    expect(mcpToolInputToArgv(contextRefresh, {knowledgeBaseId: 'kb-abc123'})).toEqual([
      'context:refresh',
      '--',
      'kb-abc123',
    ])
  })

  test.each([
    ['login', 'denied by the MCP policy'], // denied: performs an authentication flow
    ['bogus:list', 'no such command'], // does not exist at all
  ])('requesting `%s` throws instead of narrowing the tool list', async (commandId, reason) => {
    await expect(getMcpToolDefinitions({commands: [commandId], config})).rejects.toThrow(
      `Cannot expose "${commandId}" as an MCP tool: ${reason}`,
    )
  })

  test('builds argv from tool input, including --no- for negated booleans', () => {
    const argv = mcpToolInputToArgv(definition('context_update'), {
      knowledgeBaseId: 'kb-abc123',
      'refresh-enabled': false,
      title: 'New title',
    })

    expect(argv).toEqual([
      'context:update',
      '--no-refresh-enabled',
      '--title',
      'New title',
      '--',
      'kb-abc123',
    ])
  })

  test('a positional value spelled like a flag stays a positional', async () => {
    // This input shape used to START a build (of a kb named "--cancel")
    // instead of cancelling one.
    expect(
      mcpToolInputToArgv(definition('context_build'), {cancel: true, knowledgeBaseId: '--'}),
    ).toEqual(['context:build', '--cancel', '--', '--'])

    // The parser binds a flag-spelled value to the positional: the invocation
    // gets past parsing to the (disabled) network call.
    const result = await invokeSanityCli({
      args: mcpToolInputToArgv(definition('context_get'), {knowledgeBaseId: '--watch'}),
      config,
      fetch: networkDisabled,
      helpRequests: false,
      source: 'mcp',
      token: 't',
    })
    expect(result.commandId).toBe('context:get')
    expect(result.exitCode).toBe(1) // reached execution, failed on the disabled network
  })

  test('passes repeatable flags once per item', () => {
    const repeatable: McpToolDefinition = {
      commandId: 'demo:cmd',
      description: '',
      flagKinds: {tag: 'multiple'},
      forceJson: false,
      inputSchema: {additionalProperties: false, properties: {}, type: 'object'},
      name: 'demo_cmd',
      positionalArguments: [],
      readOnly: false,
      title: 'Demo Cmd',
    }

    expect(mcpToolInputToArgv(repeatable, {tag: ['a', 'b']})).toEqual([
      'demo:cmd',
      '--tag',
      'a',
      '--tag',
      'b',
    ])
  })

  test('emits --json before any input-controlled token', () => {
    // A trailing --json would be demoted to a positional by a `--` value.
    expect(mcpToolInputToArgv(definition('context_list'), {organization: 'org-abc123'})).toEqual([
      'context:list',
      '--json',
      '--organization',
      'org-abc123',
    ])
  })

  test('drops `false` for booleans without a --no- spelling', () => {
    // cancel has no allowNo negation: false means "command default", which is
    // expressed by omitting the flag.
    expect(
      mcpToolInputToArgv(definition('context_build'), {
        cancel: false,
        knowledgeBaseId: 'kb-abc123',
      }),
    ).toEqual(['context:build', '--', 'kb-abc123'])
  })

  test('throws when a positional is supplied after a missing one', () => {
    expect(() =>
      mcpToolInputToArgv(definition('context_imports_delete'), {importId: 'imp-1'}),
    ).toThrow('Cannot pass "importId" without "knowledgeBaseId"')
  })

  test('rejects empty positional values', () => {
    // An empty positional vanishes from the request path, rerouting the call
    // (a document URL becomes the collection URL). The schema also carries
    // minLength: 1 so callers are rejected before the handler.
    expect(() => mcpToolInputToArgv(definition('context_get'), {knowledgeBaseId: ''})).toThrow(
      'Positional argument "knowledgeBaseId" cannot be empty',
    )
    expect(definition('context_get').inputSchema.properties.knowledgeBaseId.minLength).toBe(1)
  })

  test('marks unattended-required flags as required', () => {
    // context:create prompts for title and description in a terminal; MCP is
    // always unattended, so the schema must demand them up front.
    const required = definition('context_create').inputSchema.required ?? []

    expect(required).toContain('title')
    expect(required).toContain('description')
  })

  test('states manifest defaults in property descriptions', async () => {
    // No context command declares a default; backups:list --limit does.
    const [backupsList] = await getMcpToolDefinitions({commands: ['backups:list'], config})

    expect(backupsList.inputSchema.properties.limit.description).toBe(
      'Maximum number of backups returned (default: 30)',
    )
  })

  test('a --help flag value cannot divert the call when help requests are disabled', async () => {
    // Positionals sit behind `--`; only a flag VALUE can still match the raw
    // help-flag scan. helpRequests: false closes that path.
    const args = mcpToolInputToArgv(definition('context_update'), {
      knowledgeBaseId: 'kb-abc123',
      title: '--help',
    })
    const fetch = networkDisabled

    const hijacked = await invokeSanityCli({args, config, fetch, source: 'mcp', token: 't'})
    expect(hijacked.exitCode).toBe(0) // default behavior: a successful help render

    // Interception off: `--help` is consumed as --title's literal value and
    // the invocation proceeds. No help render, no false success.
    const executed = await invokeSanityCli({
      args,
      config,
      fetch,
      helpRequests: false,
      source: 'mcp',
      token: 't',
    })
    expect(executed.commandId).toBe('context:update')
    expect(executed.exitCode).toBe(1)
    expect(executed.output).not.toContain('USAGE')
  })

  test('a --help positional value never renders help, even by default', async () => {
    // isHelpRequest stops scanning at `--`; this pins the guard that keeps
    // positional values inert for callers that don't pass helpRequests: false.
    const result = await invokeSanityCli({
      args: mcpToolInputToArgv(definition('context_get'), {knowledgeBaseId: '--help'}),
      config,
      fetch: networkDisabled,
      source: 'mcp',
      token: 't',
    })

    expect(result.commandId).toBe('context:get')
    expect(result.exitCode).toBe(1) // reached execution, no help render
    expect(result.output).not.toContain('USAGE')
  })

  test.each([
    ['context:get', 'context:get'],
    ['context:list', 'context:get'],
  ])('throws when the command list contains "%s" twice among [%s, …]', async (dupe, other) => {
    await expect(getMcpToolDefinitions({commands: [dupe, other, dupe], config})).rejects.toThrow(
      `Cannot expose "${dupe}" as an MCP tool twice`,
    )
  })

  test('an explicit mcpOverrides required beats the unattended marker, and denial beats both', async () => {
    const fakeCommand = {
      args: {},
      flags: {
        // Marked required-when-unattended, explicitly overridden to optional.
        optional: {name: 'optional', type: 'option'},
        // Policy-denied below; the override must not resurrect it.
        watch: {name: 'watch', type: 'boolean'},
      },
      id: 'context:build',
      load: async () =>
        class {
          static flags = {
            optional: mcpOverrides(requiredWhenUnattended(Flags.string()), {required: false}),
            watch: mcpOverrides(Flags.boolean(), {required: true}),
          }
          runInExecutionContext() {}
        },
    }
    const fakeConfig = {
      findCommand: () => fakeCommand,
      pjson: {name: '@sanity/cli'},
      plugins: new Map(),
    } as never

    const [tool] = await getMcpToolDefinitions({commands: ['context:build'], config: fakeConfig})

    expect(tool.inputSchema.required).toBeUndefined()
    expect(tool.inputSchema.properties.watch).toBeUndefined()
    expect(tool.inputSchema.properties.optional).toBeDefined()
  })

  test('flag and input names from Object.prototype behave like any other name', () => {
    const definition: McpToolDefinition = {
      commandId: 'demo:cmd',
      description: '',
      flagKinds: {toString: 'value' as const},
      forceJson: false,
      inputSchema: {additionalProperties: false, properties: {}, type: 'object'},
      name: 'demo_cmd',
      positionalArguments: [],
      readOnly: false,
      title: 'Demo Cmd',
    }

    // Absent input must not resolve to Object.prototype.toString.
    expect(mcpToolInputToArgv(definition, {})).toEqual(['demo:cmd'])
    expect(mcpToolInputToArgv(definition, {toString: 'x'})).toEqual(['demo:cmd', '--toString', 'x'])
  })

  test('rejects non-boolean values for boolean flags instead of dropping them', () => {
    // A dropped flag never reaches the parser, so {cancel: "true"} would
    // otherwise START a build instead of cancelling one.
    expect(() =>
      mcpToolInputToArgv(definition('context_build'), {cancel: 'true', knowledgeBaseId: 'kb-1'}),
    ).toThrow('Flag "cancel" expects a boolean, got string')
  })

  test('a command can override its tool description via static mcpOverrides', async () => {
    // No listed command uses it yet; the fake pins the mechanism.
    const fakeCommand = {
      args: {},
      flags: {},
      id: 'context:get',
      load: async () =>
        class {
          static mcpOverrides = {description: 'Agent-facing copy'}
          runInExecutionContext() {}
        },
    }
    const fakeConfig = {
      findCommand: () => fakeCommand,
      pjson: {name: '@sanity/cli'},
      plugins: new Map(),
    } as never

    const [tool] = await getMcpToolDefinitions({commands: ['context:get'], config: fakeConfig})
    expect(tool.description).toBe('Agent-facing copy')
  })

  test('refuses commands with hidden positional arguments', async () => {
    // No real command has one; it would bind advertised values to wrong slots.
    const hiddenArgCommand = {
      args: {
        secret: {hidden: true, name: 'secret'},
        visible: {name: 'visible', required: true},
      },
      flags: {},
      id: 'context:get',
      load: async () =>
        class {
          runInExecutionContext() {}
        },
    }
    const fakeConfig = {
      findCommand: () => hiddenArgCommand,
      pjson: {name: '@sanity/cli'},
      plugins: new Map(),
    } as never

    await expect(
      getMcpToolDefinitions({commands: ['context:get'], config: fakeConfig}),
    ).rejects.toThrow('hidden positional arguments are not supported')
  })

  test('the generated Context v1 tool surface', () => {
    // The record of what these commands advertise to MCP callers: a change
    // here is a deliberate change to agent-facing surface, not noise.
    expect(definitions).toMatchSnapshot()
  })
})

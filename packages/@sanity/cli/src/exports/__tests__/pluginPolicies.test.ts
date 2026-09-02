import {fileURLToPath} from 'node:url'

import {Config, Plugin} from '@oclif/core'
import {afterAll, beforeAll, describe, expect, test, vi} from 'vitest'

import {resolveCommandPolicies} from '../invokeSanityCli/commandPolicies/index.js'
import {invokeSanityCli} from '../invokeSanityCli/index.js'

/**
 * Exercises the plugin half of the invocation policy contract against stand-in
 * plugins under `test/__fixtures__/plugins`, so the machinery is covered
 * before any real plugin adopts it. Each fixture stands for one situation a
 * real plugin can put the CLI in: a well-formed declaration, a declaration
 * that cannot be parsed, and a policy module that cannot be loaded at all.
 */

const cliRoot = fileURLToPath(new URL('../../..', import.meta.url))

function fixtureRoot(name: string): string {
  return fileURLToPath(new URL(`../../../test/__fixtures__/plugins/${name}`, import.meta.url))
}

/**
 * An oclif config for this CLI with fixture plugins loaded alongside it.
 * Supplying `plugins` explicitly is oclif's own escape hatch for composing a
 * config, and it keeps the fixtures out of the real dependency tree.
 */
async function loadConfigWithPlugins(...names: string[]): Promise<Config> {
  const rootPlugin = new Plugin({isRoot: true, root: cliRoot, type: 'core'})
  await rootPlugin.load()

  const plugins = new Map<string, Plugin>([[rootPlugin.name, rootPlugin]])
  for (const name of names) {
    const plugin = new Plugin({root: fixtureRoot(name), type: 'core'})
    await plugin.load()
    plugins.set(plugin.name, plugin)
  }

  return Config.load({plugins, root: cliRoot})
}

/**
 * The same, but with one fixture attributed to another as its parent — the
 * shape oclif produces for a plugin that a plugin brought in, rather than one
 * this package declares.
 */
async function loadConfigWithNestedPlugin(name: string, carrier: string): Promise<Config> {
  const rootPlugin = new Plugin({isRoot: true, root: cliRoot, type: 'core'})
  await rootPlugin.load()

  const parent = new Plugin({root: fixtureRoot(carrier), type: 'core'})
  await parent.load()

  const nested = new Plugin({root: fixtureRoot(name), type: 'core'})
  await nested.load()
  // What oclif's loader does when it recurses into a plugin's own plugins.
  nested.parent = parent

  return Config.load({
    plugins: new Map([
      [nested.name, nested],
      [parent.name, parent],
      [rootPlugin.name, rootPlugin],
    ]),
    root: cliRoot,
  })
}

describe('plugin-declared invocation policies', () => {
  let config: Config

  beforeAll(async () => {
    vi.stubEnv('SANITY_CLI_CONFIG_PATH', '/nonexistent/sanity-cli-test-config.json')
    vi.stubEnv('SANITY_INTERNAL_ENV', 'production')

    config = await loadConfigWithPlugins(
      'fixture-plugin',
      'fixture-plugin-malformed',
      'fixture-plugin-broken',
    )
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  test('the fixture plugins contribute the commands the tests rely on', () => {
    // Guards the rest of the file: if oclif stopped discovering the fixture
    // commands, every policy assertion below would pass vacuously.
    expect(config.commands.map((command) => command.id)).toEqual(
      expect.arrayContaining([
        'broken:run',
        'fixtures:echo',
        'fixtures:hidden',
        'fixtures:legacy',
        'fixtures:secret',
        'malformed:run',
      ]),
    )
  })

  test('a declared policy exposes the plugin’s command, attributed to the plugin', async () => {
    const policies = await resolveCommandPolicies(config, 'mcp')

    expect(policies['fixtures:echo']).toMatchObject({
      declaredBy: '@sanity-test/fixture-plugin',
      kind: 'allow',
    })
  })

  test('a plugin’s own deny is honoured', async () => {
    const policies = await resolveCommandPolicies(config, 'mcp')

    expect(policies['fixtures:secret']).toMatchObject({
      declaredBy: '@sanity-test/fixture-plugin',
      kind: 'deny',
    })
  })

  test('entries for commands the plugin does not contribute are ignored', async () => {
    const policies = await resolveCommandPolicies(config, 'mcp')

    // The fixture declares `other:command`, which nothing contributes.
    expect(policies['other:command']).toBeUndefined()
  })

  test('a plugin cannot take over a command this CLI already governs', async () => {
    const policies = await resolveCommandPolicies(config, 'mcp')

    // The fixture declares `login: allow`. The CLI denies it, and the CLI wins.
    expect(policies['login']).toMatchObject({declaredBy: '@sanity/cli', kind: 'deny'})
  })

  test('this CLI’s own commands keep their policies and attribution', async () => {
    const policies = await resolveCommandPolicies(config, 'mcp')

    expect(policies['cors:list']).toMatchObject({declaredBy: '@sanity/cli', kind: 'allow'})
  })

  test('a malformed policy table denies the plugin’s commands', async () => {
    const policies = await resolveCommandPolicies(config, 'mcp')

    // Declared `{kind: 'allow'}` with no `validate`. Reading `kind` alone
    // would have exposed it; the shape check is what stops that.
    expect(policies['malformed:run']).toBeUndefined()
  })

  test('a policy module that cannot be loaded denies the plugin’s commands', async () => {
    const policies = await resolveCommandPolicies(config, 'mcp')

    expect(policies['broken:run']).toBeUndefined()
  })

  test('a plugin contributed by another plugin cannot declare policies', async () => {
    // oclif loads plugins recursively, so a plugin's own plugins land in the
    // same map. Those arrive through a version range this package does not
    // control, so their declarations are ignored however well-formed.
    const nestedConfig = await loadConfigWithNestedPlugin(
      'fixture-plugin',
      'fixture-plugin-malformed',
    )

    // The commands are still contributed; only the declaration is refused.
    // Without this the assertions below would pass on a plugin that simply
    // failed to load.
    expect(nestedConfig.commands.map((command) => command.id)).toEqual(
      expect.arrayContaining(['fixtures:echo', 'fixtures:hidden']),
    )

    const policies = await resolveCommandPolicies(nestedConfig, 'mcp')

    expect(policies['fixtures:echo']).toBeUndefined()
    expect(policies['fixtures:hidden']).toBeUndefined()
  })

  test('resolution is memoized per config', async () => {
    const [first, second] = await Promise.all([
      resolveCommandPolicies(config, 'mcp'),
      resolveCommandPolicies(config, 'mcp'),
    ])

    expect(second).toBe(first)
  })
})

describe('the host veto over plugin declarations', () => {
  test('denies a plugin command the plugin itself allowed', async () => {
    vi.resetModules()
    vi.doMock('../invokeSanityCli/commandPolicies/pluginOverlay.js', () => ({
      deniedPluginCommands: {'fixtures:echo': 'Vetoed by the test'},
      deniedPlugins: {},
    }))

    const {resolveCommandPolicies: resolveWithVeto} =
      await import('../invokeSanityCli/commandPolicies/index.js')
    const config = await loadConfigWithPlugins('fixture-plugin')
    const policies = await resolveWithVeto(config, 'mcp')

    expect(policies['fixtures:echo']).toMatchObject({
      declaredBy: '@sanity-test/fixture-plugin',
      kind: 'deny',
    })
    // The veto subtracts one command rather than the whole plugin.
    expect(policies['fixtures:hidden']).toMatchObject({kind: 'allow'})

    vi.doUnmock('../invokeSanityCli/commandPolicies/pluginOverlay.js')
    vi.resetModules()
  })

  test('denies every command from a vetoed plugin', async () => {
    vi.resetModules()
    vi.doMock('../invokeSanityCli/commandPolicies/pluginOverlay.js', () => ({
      deniedPluginCommands: {},
      deniedPlugins: {'@sanity-test/fixture-plugin': 'Vetoed by the test'},
    }))

    const {resolveCommandPolicies: resolveWithVeto} =
      await import('../invokeSanityCli/commandPolicies/index.js')
    const config = await loadConfigWithPlugins('fixture-plugin')
    const policies = await resolveWithVeto(config, 'mcp')

    expect(policies['fixtures:echo']).toMatchObject({kind: 'deny'})
    expect(policies['fixtures:hidden']).toMatchObject({kind: 'deny'})

    vi.doUnmock('../invokeSanityCli/commandPolicies/pluginOverlay.js')
    vi.resetModules()
  })
})

describe('invoking plugin-contributed commands', () => {
  let config: Config

  beforeAll(async () => {
    vi.stubEnv('SANITY_CLI_CONFIG_PATH', '/nonexistent/sanity-cli-test-config.json')
    vi.stubEnv('SANITY_INTERNAL_ENV', 'production')
    config = await loadConfigWithPlugins('fixture-plugin')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  test('an allowed plugin command runs, with output reaching the caller', async () => {
    const stdout = vi.spyOn(process.stdout, 'write')

    try {
      const result = await invokeSanityCli({
        args: 'fixtures echo hello',
        config,
        source: 'mcp',
        token: 'user-token',
      })

      expect(result).toEqual({
        commandId: 'fixtures:echo',
        exitCode: 0,
        output: 'fixture echo: hello',
      })
      // The plugin resolves its own copy of `@sanity/cli-core`, so this also
      // shows the execution context reaching across package instances.
      expect(stdout).not.toHaveBeenCalled()
    } finally {
      stdout.mockRestore()
    }
  })

  test('a command its own plugin denied is rejected as unknown', async () => {
    const result = await invokeSanityCli({
      args: 'fixtures secret',
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result.exitCode).toBe(2)
    expect(result.commandId).toBeUndefined()
    expect(result.output).toContain('Unknown or unsupported command')
  })

  test('a command that cannot be isolated is rejected even though it is allowed', async () => {
    // `fixtures:legacy` extends oclif's `Command`, so nothing would hold it to
    // the guarantees its `allow` assumes. Running it must not be attempted,
    // and the refusal must look like every other closed door.
    const result = await invokeSanityCli({
      args: 'fixtures legacy',
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result.exitCode).toBe(2)
    expect(result.commandId).toBeUndefined()
    expect(result.output).toContain('Unknown or unsupported command')
  })

  test('help lists a plugin topic and its allowed commands', async () => {
    const result = await invokeSanityCli({
      args: 'fixtures --help',
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('fixtures echo')
    expect(result.output).not.toContain('fixtures secret')
  })

  test('an allowed command that is hidden from CLI users stays hidden but runs', async () => {
    // `fixtures:hidden` is allowed, so it is invocable, but it is `hidden`, so
    // it is not advertised — the same deal a CLI user gets. Hiding is about
    // what help lists; the policy is about what may run.
    const help = await invokeSanityCli({
      args: 'fixtures --help',
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(help.output).not.toContain('fixtures hidden')

    const result = await invokeSanityCli({
      args: 'fixtures hidden',
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('fixture hidden')
  })

  test('root help advertises the plugin topic', async () => {
    const result = await invokeSanityCli({
      args: '--help',
      config,
      source: 'mcp',
      token: 'user-token',
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('Commands contributed by the fixture plugin')
  })
})

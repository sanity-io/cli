import {isInteractive} from '@sanity/cli-core'
import {afterEach, describe, expect, type Mock, test, vi} from 'vitest'

import {getCommandAndConfig} from '../../../../test/helpers/getCommandAndConfig.js'
import hook from '../topicAliases.js'

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  // Default to interactive so alias-rewrite tests exercise the normal path;
  // unattended tests flip this per-case.
  isInteractive: vi.fn(() => true),
}))

const notFoundHook = vi.hoisted(() => vi.fn())
vi.mock('@oclif/plugin-not-found', () => ({default: notFoundHook}))

const isInteractiveMock = isInteractive as Mock

const {config} = await getCommandAndConfig('help')

const context = {
  config,
  debug: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}

describe('commandNotFound topic aliases hook', () => {
  afterEach(() => {
    vi.clearAllMocks()
    isInteractiveMock.mockReturnValue(true)
  })

  describe('singular -> plural alias (directory was renamed)', () => {
    test('rewrites "dataset list" to "datasets list"', async () => {
      const runCommand = vi.spyOn(config, 'runCommand').mockResolvedValue(undefined)

      await hook.call(context, {argv: [], config, context, id: 'dataset:list'})

      expect(runCommand).toHaveBeenCalledWith('datasets:list', [])
      runCommand.mockRestore()
    })

    test('rewrites "document get" to "documents get"', async () => {
      const runCommand = vi.spyOn(config, 'runCommand').mockResolvedValue(undefined)

      await hook.call(context, {argv: ['doc-id'], config, context, id: 'document:get'})

      expect(runCommand).toHaveBeenCalledWith('documents:get', ['doc-id'])
      runCommand.mockRestore()
    })

    test('rewrites "token list" to "tokens list"', async () => {
      const runCommand = vi.spyOn(config, 'runCommand').mockResolvedValue(undefined)

      await hook.call(context, {argv: [], config, context, id: 'token:list'})

      expect(runCommand).toHaveBeenCalledWith('tokens:list', [])
      runCommand.mockRestore()
    })

    test('rewrites "user invite" to "users invite"', async () => {
      const runCommand = vi.spyOn(config, 'runCommand').mockResolvedValue(undefined)

      await hook.call(context, {argv: [], config, context, id: 'user:invite'})

      expect(runCommand).toHaveBeenCalledWith('users:invite', [])
      runCommand.mockRestore()
    })

    test('rewrites "project create" to "projects create"', async () => {
      const runCommand = vi.spyOn(config, 'runCommand').mockResolvedValue(undefined)

      await hook.call(context, {argv: [], config, context, id: 'project:create'})

      expect(runCommand).toHaveBeenCalledWith('projects:create', [])
      runCommand.mockRestore()
    })
  })

  describe('singular -> plural for other renamed topics', () => {
    test('rewrites "schema deploy" to "schemas deploy"', async () => {
      const runCommand = vi.spyOn(config, 'runCommand').mockResolvedValue(undefined)

      await hook.call(context, {argv: [], config, context, id: 'schema:deploy'})

      expect(runCommand).toHaveBeenCalledWith('schemas:deploy', [])
      runCommand.mockRestore()
    })

    test('rewrites "hook list" to "hooks list"', async () => {
      const runCommand = vi.spyOn(config, 'runCommand').mockResolvedValue(undefined)

      await hook.call(context, {argv: [], config, context, id: 'hook:list'})

      expect(runCommand).toHaveBeenCalledWith('hooks:list', [])
      runCommand.mockRestore()
    })

    test('rewrites "backup list" to "backups list"', async () => {
      const runCommand = vi.spyOn(config, 'runCommand').mockResolvedValue(undefined)

      await hook.call(context, {argv: [], config, context, id: 'backup:list'})

      expect(runCommand).toHaveBeenCalledWith('backups:list', [])
      runCommand.mockRestore()
    })
  })

  describe('bare topic aliases', () => {
    test('shows help for "dataset" (bare singular topic)', async () => {
      const runCommand = vi.spyOn(config, 'runCommand').mockResolvedValue(undefined)

      await hook.call(context, {argv: [], config, context, id: 'dataset'})

      expect(runCommand).toHaveBeenCalledWith('help', ['datasets'])
      runCommand.mockRestore()
    })

    test('shows help for "schema" (bare singular topic)', async () => {
      const runCommand = vi.spyOn(config, 'runCommand').mockResolvedValue(undefined)

      await hook.call(context, {argv: [], config, context, id: 'schema'})

      expect(runCommand).toHaveBeenCalledWith('help', ['schemas'])
      runCommand.mockRestore()
    })

    test('shows help for "hook" (bare singular topic)', async () => {
      const runCommand = vi.spyOn(config, 'runCommand').mockResolvedValue(undefined)

      await hook.call(context, {argv: [], config, context, id: 'hook'})

      expect(runCommand).toHaveBeenCalledWith('help', ['hooks'])
      runCommand.mockRestore()
    })
  })

  describe('plugin-provided topic aliases (blueprints, functions)', () => {
    // These topics come from @sanity/runtime-cli plugin. The alias resolves via
    // config.findTopic/findCommand since the plugin is loaded in the test config.
    test('resolves "blueprint" to "blueprints" topic help', async () => {
      const runCommand = vi.spyOn(config, 'runCommand').mockResolvedValue(undefined)

      await hook.call(context, {argv: [], config, context, id: 'blueprint'})

      expect(runCommand).toHaveBeenCalledWith('help', ['blueprints'])
      runCommand.mockRestore()
    })
  })

  describe('unknown commands fall through to plugin-not-found', () => {
    test('falls through for completely unknown command', async () => {
      await hook.call(context, {argv: [], config, context, id: 'notarealcommand'})

      expect(notFoundHook).toHaveBeenCalledWith(expect.objectContaining({id: 'notarealcommand'}))
      expect(context.warn).not.toHaveBeenCalled()
    })

    test('does not rewrite topics without aliases', async () => {
      // "corss" is not a known alias, so it falls through to plugin-not-found
      await hook.call(context, {argv: [], config, context, id: 'corss:list'})

      expect(notFoundHook).toHaveBeenCalledWith(expect.objectContaining({id: 'corss:list'}))
    })
  })

  describe('unattended invocations skip the "did you mean?" prompt', () => {
    test('non-interactive terminal: warns and errors without invoking plugin-not-found', async () => {
      isInteractiveMock.mockReturnValue(false)

      await hook.call(context, {argv: [], config, context, id: 'notarealcommand'})

      expect(notFoundHook).not.toHaveBeenCalled()
      expect(context.warn).toHaveBeenCalledWith('notarealcommand is not a sanity command.')
      expect(context.error).toHaveBeenCalledWith(
        'Run sanity help for a list of available commands.',
        {exit: 127},
      )
    })

    test('mentions the topic in the help pointer when the topic exists', async () => {
      isInteractiveMock.mockReturnValue(false)

      await hook.call(context, {argv: [], config, context, id: 'datasets:notarealcommand'})

      expect(notFoundHook).not.toHaveBeenCalled()
      expect(context.warn).toHaveBeenCalledWith('datasets notarealcommand is not a sanity command.')
      expect(context.error).toHaveBeenCalledWith(
        'Run sanity help datasets for a list of available commands.',
        {exit: 127},
      )
    })

    test.each(['--yes', '-y', '--json'])(
      '%s in argv: skips the prompt even in an interactive terminal',
      async (flag) => {
        await hook.call(context, {argv: [flag], config, context, id: 'notarealcommand'})

        expect(notFoundHook).not.toHaveBeenCalled()
        expect(context.warn).toHaveBeenCalledWith('notarealcommand is not a sanity command.')
        expect(context.error).toHaveBeenCalledWith(
          'Run sanity help for a list of available commands.',
          {exit: 127},
        )
      },
    )

    test('non-flag argv in an interactive terminal still falls through to plugin-not-found', async () => {
      await hook.call(context, {argv: ['some-arg'], config, context, id: 'notarealcommand'})

      expect(notFoundHook).toHaveBeenCalledWith(
        expect.objectContaining({argv: ['some-arg'], id: 'notarealcommand'}),
      )
      expect(context.warn).not.toHaveBeenCalled()
      expect(context.error).not.toHaveBeenCalled()
    })

    test('non-interactive terminal does not affect alias rewrites', async () => {
      isInteractiveMock.mockReturnValue(false)
      const runCommand = vi.spyOn(config, 'runCommand').mockResolvedValue(undefined)

      await hook.call(context, {argv: [], config, context, id: 'dataset:list'})

      expect(runCommand).toHaveBeenCalledWith('datasets:list', [])
      expect(notFoundHook).not.toHaveBeenCalled()
      expect(context.warn).not.toHaveBeenCalled()
      runCommand.mockRestore()
    })
  })

  describe('passes argv through', () => {
    test('forwards flags and args to the resolved command', async () => {
      const runCommand = vi.spyOn(config, 'runCommand').mockResolvedValue(undefined)

      await hook.call(context, {
        argv: ['my-dataset', '--visibility', 'private'],
        config,
        context,
        id: 'dataset:create',
      })

      expect(runCommand).toHaveBeenCalledWith('datasets:create', [
        'my-dataset',
        '--visibility',
        'private',
      ])
      runCommand.mockRestore()
    })
  })
})

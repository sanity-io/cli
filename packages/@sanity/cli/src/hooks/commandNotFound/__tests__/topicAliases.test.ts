import {afterEach, describe, expect, test, vi} from 'vitest'

import {getCommandAndConfig} from '../../../../test/helpers/getCommandAndConfig.js'
import hook from '../topicAliases.js'

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

  describe('plural -> singular alias (directory not yet renamed)', () => {
    test('rewrites "schemas deploy" to "schema deploy"', async () => {
      const runCommand = vi.spyOn(config, 'runCommand').mockResolvedValue(undefined)

      await hook.call(context, {argv: [], config, context, id: 'schemas:deploy'})

      expect(runCommand).toHaveBeenCalledWith('schema:deploy', [])
      runCommand.mockRestore()
    })

    test('rewrites "hooks list" to "hook list"', async () => {
      const runCommand = vi.spyOn(config, 'runCommand').mockResolvedValue(undefined)

      await hook.call(context, {argv: [], config, context, id: 'hooks:list'})

      expect(runCommand).toHaveBeenCalledWith('hook:list', [])
      runCommand.mockRestore()
    })

    test('rewrites "backups list" to "backup list"', async () => {
      const runCommand = vi.spyOn(config, 'runCommand').mockResolvedValue(undefined)

      await hook.call(context, {argv: [], config, context, id: 'backups:list'})

      expect(runCommand).toHaveBeenCalledWith('backup:list', [])
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

    test('shows help for "schemas" (bare plural alias for singular dir)', async () => {
      const runCommand = vi.spyOn(config, 'runCommand').mockResolvedValue(undefined)

      await hook.call(context, {argv: [], config, context, id: 'schemas'})

      expect(runCommand).toHaveBeenCalledWith('help', ['schema'])
      runCommand.mockRestore()
    })
  })

  describe('unknown commands fall through to plugin-not-found', () => {
    test('falls through for completely unknown command', async () => {
      await hook.call(context, {argv: [], config, context, id: 'notarealcommand'})

      // plugin-not-found calls context.warn with "is not a sanity command"
      expect(context.warn).toHaveBeenCalledWith(expect.stringContaining('is not a'))
    })

    test('does not rewrite topics without aliases', async () => {
      // "corss" is not a known alias, so it falls through to plugin-not-found
      await hook.call(context, {argv: [], config, context, id: 'corss:list'})

      expect(context.warn).toHaveBeenCalledWith(expect.stringContaining('is not a'))
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

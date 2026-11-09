import {Parser} from '@oclif/core'
import {describe, expect, test} from 'vitest'

import {Add} from '../../../src/commands/cors/add.js'
import {Undeploy} from '../../../src/commands/graphql/undeploy.js'
import {InitCommand} from '../../../src/commands/init.js'
import {RunMigrationCommand} from '../../../src/commands/migrations/run.js'
import {UnclaimedProjectsCommand} from '../../../src/commands/projects/unclaimed.js'
import {TokensListCommand} from '../../../src/commands/tokens/list.js'

describe.each([Add, InitCommand, RunMigrationCommand, UnclaimedProjectsCommand])(
  '%s project flags',
  (command) => {
    test.each([
      ['--project', '  abc123  '],
      ['--project=abc123'],
      ['-p', 'abc123'],
      ['--project-id', '  abc123  '],
      ['--project-id=abc123'],
    ])('normalizes %j to the canonical project ID', async (...argv) => {
      const {flags} = await Parser.parse(argv, {flags: command.flags})
      expect(flags.project).toBe('abc123')
      expect(flags).not.toHaveProperty('project-id')
    })

    test.each(['--project', '--project-id', '-p'])('rejects an empty %s', async (flag) => {
      await expect(Parser.parse([flag, '  '], {flags: command.flags})).rejects.toThrow(
        'cannot be empty',
      )
    })
  },
)

test.each(['--project', '--project-id', '-p'])(
  'preserves mutually exclusive flags when the project is passed with %s',
  async (flag) => {
    await expect(
      Parser.parse([flag, 'abc123', '--project-name', 'New project'], {flags: InitCommand.flags}),
    ).rejects.toThrow('cannot also be provided')
    await expect(
      Parser.parse([flag, 'abc123', '--api', 'my-api'], {flags: Undeploy.flags}),
    ).rejects.toThrow('cannot also be provided')
    await expect(
      Parser.parse([flag, 'abc123', '--organization', 'org123'], {flags: TokensListCommand.flags}),
    ).rejects.toThrow('cannot also be provided')
  },
)

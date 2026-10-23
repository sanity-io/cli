import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test} from 'vitest'

import {GetKnowledgeBaseCommand} from '../../../src/commands/context/get.js'
import {DownloadImportCommand} from '../../../src/commands/context/imports/download.js'
import {GetImportCommand} from '../../../src/commands/context/imports/get.js'
import {ListImportsCommand} from '../../../src/commands/context/imports/list.js'
import {GetJobCommand} from '../../../src/commands/context/jobs/get.js'
import {ListKnowledgeBasesCommand} from '../../../src/commands/context/list.js'
import {DeployCommand} from '../../../src/commands/deploy.js'
import {DoctorCommand} from '../../../src/commands/doctor.js'
import {InitCommand} from '../../../src/commands/init.js'
import {NewCommand} from '../../../src/commands/new.js'
import {ListOpenApiCommand} from '../../../src/commands/openapi/list.js'
import {CreateProjectCommand} from '../../../src/commands/projects/create.js'
import {ListSchemaCommand} from '../../../src/commands/schemas/list.js'
import {CreateTokenCommand} from '../../../src/commands/tokens/create.js'
import {TokensListCommand} from '../../../src/commands/tokens/list.js'
import {RotateTokenCommand} from '../../../src/commands/tokens/rotate.js'
import {UndeployCommand} from '../../../src/commands/undeploy.js'
import {WhoamiCommand} from '../../../src/commands/whoami.js'

const previousExitCode = process.exitCode

afterEach(() => {
  process.exitCode = previousExitCode
})

describe('JSON argument errors', () => {
  test.each([
    GetKnowledgeBaseCommand,
    ListKnowledgeBasesCommand,
    DownloadImportCommand,
    GetImportCommand,
    ListImportsCommand,
    GetJobCommand,
    DeployCommand,
    DoctorCommand,
    InitCommand,
    NewCommand,
    ListOpenApiCommand,
    CreateProjectCommand,
    ListSchemaCommand,
    CreateTokenCommand,
    TokensListCommand,
    RotateTokenCommand,
    UndeployCommand,
    WhoamiCommand,
  ])('%s returns one JSON error and usage exit code', async (command) => {
    const {stderr, stdout} = await testCommand(command, ['--json', '--not-a-flag'])
    expect(JSON.parse(stdout)).toMatchObject({
      error: {message: expect.stringContaining('Nonexistent flag'), oclif: {exit: 2}},
    })
    expect(stderr).not.toContain('Error:')
    expect(process.exitCode).toBe(2)
  })

  test.each([DeployCommand, DoctorCommand, UndeployCommand])(
    '%s preserves the -j alias for argument errors',
    async (command) => {
      const {stdout} = await testCommand(command, ['-j', '--not-a-flag'])
      expect(JSON.parse(stdout)).toMatchObject({error: {oclif: {exit: 2}}})
      expect(process.exitCode).toBe(2)
    },
  )
})

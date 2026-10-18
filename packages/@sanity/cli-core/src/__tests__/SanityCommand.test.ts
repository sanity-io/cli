import {Command, Config, Flags} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {afterEach, beforeEach, describe, expect, Mock, test, vi} from 'vitest'

import {requiredWhenUnattended} from '../_exports/flags.js'
import {JsonOutputError} from '../errors/JsonOutputError.js'
import {runWithCliExecutionContext} from '../executionContext.js'
import {SanityCommand} from '../SanityCommand.js'

function createMockedRunCommand<T extends typeof Command>(mocks: {
  cliConfig?: Mock
  run: (this: (typeof SanityCommand<T>)['prototype'], ...args: any[]) => Promise<void>
}) {
  return class TestCommand extends SanityCommand<typeof TestCommand> {
    static override flags = {
      project: Flags.string({
        deprecated: {to: 'project-id'},
        description: 'Project ID to import to',
        hidden: true,
      }),
      'project-id': Flags.string({
        char: 'p',
        helpValue: '<id>',
        parse: async (input: string) => {
          const trimmed = input.trim()
          if (trimmed === '') {
            throw new Error('`--project-id` cannot be empty if provided')
          }
          return trimmed
        },
      }),
    }
    public async getCliConfig() {
      return (mocks.cliConfig || vi.fn(() => ({api: {}})))()
    }
    public async run(...args: any[]) {
      return mocks.run.call(this, ...args)
    }
  }
}

function createUnattendedRequiredCommand(isInteractive: boolean) {
  return class TestCommand extends SanityCommand<typeof TestCommand> {
    static override enableJsonFlag = true
    static override flags = {
      force: Flags.boolean({char: 'f'}),
      name: requiredWhenUnattended(Flags.string()),
      yes: Flags.boolean({char: 'y'}),
    }

    public override resolveIsInteractive(): boolean {
      return isInteractive
    }

    public async run(): Promise<void> {
      await this.parse(TestCommand)
    }
  }
}

describe('SanityCommand', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('unattended flag requirements', () => {
    test('allows the flag to be omitted in interactive mode', async () => {
      await expect(createUnattendedRequiredCommand(true).run([])).resolves.toBeUndefined()
    })

    test.each(['--yes', '-y', '-yf'])(
      'requires the flag when invoked with %s',
      async (argument) => {
        await expect(createUnattendedRequiredCommand(true).run([argument])).rejects.toThrow(
          'Missing required flag name',
        )
      },
    )

    test('requires the flag when invoked with --json', async () => {
      const output: string[] = []

      await expect(
        runWithCliExecutionContext({stdout: (line) => output.push(line)}, () =>
          createUnattendedRequiredCommand(true).run(['--json']),
        ),
      ).rejects.toThrow('Missing required flag name')

      expect(output.join('\n')).toContain('Missing required flag name')
    })

    test('requires the flag in a non-interactive environment', async () => {
      await expect(createUnattendedRequiredCommand(false).run([])).rejects.toThrow(
        'Missing required flag name',
      )
    })

    test('does not treat flags after -- as unattended options', async () => {
      await expect(createUnattendedRequiredCommand(true).run(['--', '--yes'])).rejects.toThrow(
        'Unexpected argument: --yes',
      )
    })
  })

  describe('getProjectId', () => {
    let id: string
    beforeEach(() => {
      id = ''
    })
    test('returns --project-id value if provided', async () => {
      const cmdClass = createMockedRunCommand({
        run: async function () {
          id = await this.getProjectId()
        },
      })
      await cmdClass.run(['--project-id', 'torment nexus'])
      expect(id).toEqual('torment nexus')
    })

    test('supports deprecated flag (e.g. --project) value if specified and provided', async () => {
      const cmdClass = createMockedRunCommand({
        run: async function () {
          id = await this.getProjectId({deprecatedFlagName: 'project'})
        },
      })
      await cmdClass.run(['--project', 'oopsy daisy'])
      expect(id).toEqual('oopsy daisy')
    })

    test('supports deprecated short char flag (e.g. --project) value if specified and provided', async () => {
      const cmdClass = createMockedRunCommand({
        run: async function () {
          id = await this.getProjectId({deprecatedFlagName: 'project'})
        },
      })
      await cmdClass.run(['-p', 'torment nexus'])
      expect(id).toEqual('torment nexus')
    })

    test('--project-id takes precedence over deprecated --project', async () => {
      const cmdClass = createMockedRunCommand({
        run: async function () {
          id = await this.getProjectId({deprecatedFlagName: 'project'})
        },
      })
      await cmdClass.run(['--project', 'bad', '--project-id', 'good'])
      expect(id).toEqual('good')
    })

    test('should invoke getCliConfig as fallback return', async () => {
      const cmdClass = createMockedRunCommand({
        cliConfig: vi.fn(() => ({api: {projectId: 'default-project'}})),
        run: async function () {
          id = await this.getProjectId()
        },
      })
      await cmdClass.run([])
      expect(id).toEqual('default-project')
    })

    test('should invoke explictly-provided fallback function as return if nothing returned from cliConfig', async () => {
      const cmdClass = createMockedRunCommand({
        run: async function () {
          id = await this.getProjectId({
            async fallback() {
              return 'manhattan'
            },
          })
        },
      })
      await cmdClass.run([])
      expect(id).toEqual('manhattan')
    })

    test('propagates non-NonInteractiveError from fallback', async () => {
      expect.assertions(1)
      const cmdClass = createMockedRunCommand({
        run: async function () {
          try {
            await this.getProjectId({
              async fallback() {
                throw new Error('boom')
              },
            })
            expect.fail('expected getProjectId to throw')
          } catch (err) {
            expect(err.message).toMatch('boom')
          }
        },
      })
      await cmdClass.run([])
    })

    test('does not call fallback when project ID is found from config', async () => {
      const fallback = vi.fn(() => {
        throw new Error('fallback should not have been called!')
      })
      const cmdClass = createMockedRunCommand({
        cliConfig: vi.fn(() => ({api: {projectId: 'default-project'}})),
        run: async function () {
          id = await this.getProjectId({fallback})
        },
      })
      await cmdClass.run([])
      expect(id).toEqual('default-project')
      expect(fallback).not.toHaveBeenCalled()
    })

    test('does not call fallback when --project-id flag is provided', async () => {
      const fallback = vi.fn(() => {
        throw new Error('fallback should not have been called!')
      })
      const cmdClass = createMockedRunCommand({
        run: async function () {
          id = await this.getProjectId({fallback})
        },
      })
      await cmdClass.run(['--project-id', 'torment nexus'])
      expect(id).toEqual('torment nexus')
      expect(fallback).not.toHaveBeenCalled()
    })

    test('should throw if no project ID was resolved', async () => {
      expect.assertions(1)
      const cmdClass = createMockedRunCommand({
        run: async function () {
          try {
            await this.getProjectId()
            expect.fail('expected getProjectId to throw')
          } catch (err) {
            expect(err.message).toMatch('Unable to determine project ID')
          }
        },
      })
      await cmdClass.run([])
    })
  })

  describe('execution context output routing', () => {
    test('log, warn, logToStderr and logJson route to context sinks', async () => {
      const out: string[] = []
      const err: string[] = []
      const cmdClass = createMockedRunCommand({
        run: async function () {
          this.log('hello %s', 'world')
          this.warn('careful now')
          this.warn(new Error('warned error'))
          this.logToStderr('diagnostics')
          this.logJson({origins: ['https://example.com']})
        },
      })

      await runWithCliExecutionContext(
        {stderr: (line) => err.push(line), stdout: (line) => out.push(line)},
        () => cmdClass.run([]),
      )

      expect(out).toEqual([
        'hello world',
        JSON.stringify({origins: ['https://example.com']}, null, 2),
      ])
      expect(err).toEqual(['Warning: careful now', 'Warning: warned error', 'diagnostics'])
    })

    test('concurrent invocations with different sinks do not cross-talk', async () => {
      const makeCommand = (label: string) =>
        createMockedRunCommand({
          run: async function () {
            await new Promise((resolve) => setTimeout(resolve, label === 'a' ? 20 : 5))
            this.log(`output from ${label}`)
          },
        })

      const outA: string[] = []
      const outB: string[] = []
      await Promise.all([
        runWithCliExecutionContext({stdout: (line) => outA.push(line)}, () =>
          makeCommand('a').run([]),
        ),
        runWithCliExecutionContext({stdout: (line) => outB.push(line)}, () =>
          makeCommand('b').run([]),
        ),
      ])

      expect(outA).toEqual(['output from a'])
      expect(outB).toEqual(['output from b'])
    })

    test('without a context, log writes to process stdout as before', async () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined)
      try {
        const cmdClass = createMockedRunCommand({
          run: async function () {
            this.log('regular cli output')
          },
        })
        await cmdClass.run([])
        expect(consoleLog).toHaveBeenCalledWith('regular cli output')
      } finally {
        consoleLog.mockRestore()
      }
    })
  })

  describe('catch (error handling)', () => {
    test('checks context before reading process.cwd for project resolution', async () => {
      const cwd = vi.spyOn(process, 'cwd').mockImplementation(() => {
        throw new Error('host cwd accessed')
      })
      const cmdClass = createMockedRunCommand({
        run: async function () {
          await this.getProjectRoot()
        },
      })

      try {
        await expect(runWithCliExecutionContext({}, () => cmdClass.run([]))).rejects.toThrow(
          'Project root resolution from the filesystem is disabled',
        )
        expect(cwd).not.toHaveBeenCalled()
      } finally {
        cwd.mockRestore()
      }
    })

    test('under an execution context, a command failure does not touch process.exitCode', async () => {
      const previousExitCode = process.exitCode
      const cmdClass = createMockedRunCommand({
        run: async () => {
          throw new Error('kaboom')
        },
      })

      await expect(
        runWithCliExecutionContext({stderr: () => {}, stdout: () => {}}, () => cmdClass.run([])),
      ).rejects.toThrow('kaboom')

      expect(process.exitCode).toBe(previousExitCode)
    })

    test('without an execution context, a command failure still sets process.exitCode as before', async () => {
      const previousExitCode = process.exitCode
      const cmdClass = createMockedRunCommand({
        run: async () => {
          throw new Error('kaboom')
        },
      })

      try {
        await expect(cmdClass.run([])).rejects.toThrow('kaboom')
        expect(process.exitCode).toBe(1)
      } finally {
        process.exitCode = previousExitCode
      }
    })

    test('under an execution context with --json, the error is logged as JSON and thrown to preserve its exit status', async () => {
      const out: string[] = []
      const previousExitCode = process.exitCode
      const cmdClass = createMockedRunCommand({
        run: async () => {
          throw new Error('kaboom')
        },
      })
      cmdClass.enableJsonFlag = true

      await expect(
        runWithCliExecutionContext({stderr: () => {}, stdout: (line) => out.push(line)}, () =>
          cmdClass.run(['--json']),
        ),
      ).rejects.toThrow('kaboom')

      expect(out.join('\n')).toContain('kaboom')
      expect(process.exitCode).toBe(previousExitCode)
    })
  })
})

describe('JSON command output', () => {
  class JsonCommand extends SanityCommand<typeof JsonCommand> {
    static override enableJsonFlag = true
    static override flags = {
      json: Flags.boolean({char: 'j'}),
      name: Flags.string({char: 'n'}),
      yes: Flags.boolean({char: 'y'}),
    }
    public async run(): Promise<void> {}
  }

  test.each([
    {argv: ['--json'], expected: true},
    {argv: ['-j'], expected: true},
    {argv: ['-yj'], expected: true},
    {argv: ['-jy'], expected: true},
    {argv: ['-nj'], expected: false},
    {argv: ['--name', '-j'], expected: false},
    {argv: ['--', '-j'], expected: false},
    {argv: ['--', '--json'], expected: false},
    {argv: [], expected: false},
  ])('recognizes JSON mode before parsing $argv', ({argv, expected}) => {
    const command = new JsonCommand(argv, {} as Config)
    expect(command.jsonEnabled()).toBe(expected)
  })

  test.each([1, 2, 3, 130])('preserves exit code %s for terminal JSON failures', async (exit) => {
    class FailingCommand extends JsonCommand {
      public override async run(): Promise<void> {
        throw new CLIError('Failed', {exit})
      }
    }
    const previousExitCode = process.exitCode
    const log = vi.spyOn(FailingCommand.prototype, 'logJson').mockImplementation(() => {})
    try {
      await FailingCommand.run(['--json'])
      expect(process.exitCode).toBe(exit)
      expect(log).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          error: expect.objectContaining({message: 'Failed'}),
        }),
      )
    } finally {
      process.exitCode = previousExitCode
      log.mockRestore()
    }
  })

  test.each(['SIGINT', 'ExitPromptError'])('reports %s as JSON with exit 130', async (name) => {
    class AbortedCommand extends JsonCommand {
      public override async run(): Promise<void> {
        throw Object.assign(new Error(name), {name})
      }
    }
    const previousExitCode = process.exitCode
    const log = vi.spyOn(AbortedCommand.prototype, 'logJson').mockImplementation(() => {})
    try {
      await AbortedCommand.run(['--json'])
      expect(process.exitCode).toBe(130)
      expect(log).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          error: expect.objectContaining({message: 'Aborted by user'}),
        }),
      )
    } finally {
      process.exitCode = previousExitCode
      log.mockRestore()
    }
  })

  test.each([0, 1])('does not append an error to a report followed by exit %s', async (exit) => {
    class ReportCommand extends JsonCommand {
      public override async run(): Promise<void> {
        this.logJson({checks: [], passed: exit === 0})
        this.exit(exit)
      }
    }
    const previousExitCode = process.exitCode
    const log = vi.spyOn(ReportCommand.prototype, 'logJson').mockImplementation(() => {})
    try {
      await ReportCommand.run(['--json'])
      expect(process.exitCode).toBe(exit)
      expect(log).toHaveBeenCalledExactlyOnceWith({checks: [], passed: exit === 0})
    } finally {
      process.exitCode = previousExitCode
      log.mockRestore()
    }
  })

  test('preserves a command-specific failure payload', async () => {
    const command = new JsonCommand([], {} as Config)
    const payload = {deployed: false, reason: 'Build failed'}
    expect(command.toErrorJson(new JsonOutputError('Build failed', payload, 1))).toEqual(payload)
  })

  test('environment-selected JSON mode reaches parsed flags', async () => {
    class EnvCommand extends SanityCommand<typeof EnvCommand> {
      static override enableJsonFlag = true
      public override async run(): Promise<void> {
        const {flags} = await this.parse(EnvCommand)
        expect(flags.json).toBe(true)
        expect(this.isUnattended()).toBe(true)
      }
    }
    const config = await Config.load()
    const env = vi
      .spyOn(config, 'scopedEnvVar')
      .mockImplementation((key) => (key === 'CONTENT_TYPE' ? 'json' : undefined))
    try {
      await runWithCliExecutionContext({}, () => new EnvCommand([], config).runInExecutionContext())
    } finally {
      env.mockRestore()
    }
  })
})

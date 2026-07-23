import {Command, Flags} from '@oclif/core'
import {afterEach, beforeEach, describe, expect, Mock, test, vi} from 'vitest'

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
describe('SanityCommand', () => {
  afterEach(() => {
    vi.clearAllMocks()
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
})

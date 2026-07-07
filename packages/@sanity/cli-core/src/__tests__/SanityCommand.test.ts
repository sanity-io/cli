import {Command, Flags} from '@oclif/core'
import {afterEach, beforeEach, describe, expect, Mock, test, vi} from 'vitest'

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

    test('should invoke explictly-provided fallback function as return', async () => {
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
})

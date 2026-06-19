import {vi} from 'vitest'
import type { Command } from '@oclif/core'
import {type CliConfig, type Output, SanityCommand} from '@sanity/cli-core'

// Set up module mocks once before pulling in the module-under-test
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, SanityCommand: MockedSanityCommand}
})

export function mockSanityCommand<T extends typeof SanityCommand<typeof Command>>(
  CommandClass: T,
): T {
  // Mock SanityCommand class methods
  const mockCliCmdGetProjectRoot = vi.hoisted(() => vi.fn())
  const mockCliCmdGetProjectId = vi.hoisted(() => vi.fn())
  const mockCliCmdGetCliConfig = vi.hoisted(() => vi.fn())
  const mockCliCmdExit = vi.hoisted(() => vi.fn())

  const mockOutput: Output = {
    error: vi.fn() as never,
    log: vi.fn(),
    warn: vi.fn(),
  }

  abstract class MockedSanityCommand<T extends typeof Command> extends Command {
    protected async getCliConfig() { return mockCliCmdGetCliConfig() }
    protected async getProjectRoot() { return mockCliCmdGetProjectRoot() }
    protected async getProjectId(...args: Parameters<SanityCommand<T>['getProjectId']>) { return mockCliCmdGetProjectId(...args) }
    // Same implementation as SanityCommand's, minus telemetry
    public async init(): Promise<void> {
      const {args, flags} = await this.parse({
        args: this.ctor.args,
        baseFlags: (super.ctor as typeof SanityCommand).baseFlags,
        enableJsonFlag: this.ctor.enableJsonFlag,
        flags: this.ctor.flags,
        strict: this.ctor.strict,
      })

      this.args = args as Args<T>
      this.flags = flags as Flags<T>

      await super.init()
    }
  }


  return MockedCommand
}

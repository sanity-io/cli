import {Command} from '@oclif/core'
import {type Output, type SanityCommandInterface} from '@sanity/cli-core'
import {vi} from 'vitest'

export function createMockSanityCommand() {
  const mocks = {
    // Mock OCLIF Command methods
    OclifCmdExit: vi.fn((_code?: number) => undefined as never),
    // Mock SanityCommand methods
    SanityCmdGetCliConfig: vi.fn(),
    SanityCmdGetProjectId: vi.fn(),
    SanityCmdGetProjectRoot: vi.fn(),
    SanityCmdIsUnattended: vi.fn(),
    SanityCmdOutputError: vi.fn(() => undefined as never),
    SanityCmdOutputLog: vi.fn(),
    SanityCmdOutputWarn: vi.fn(),
    SanityCmdResolveIsInteractive: vi.fn(),
  }

  return {
    MockedSanityCommand: class MockedSanityCommand
      extends Command
      implements SanityCommandInterface
    {
      args = {}
      flags = {}
      output: Output = {
        error: mocks.SanityCmdOutputError,
        log: mocks.SanityCmdOutputLog,
        warn: mocks.SanityCmdOutputWarn,
      }
      public exit(code?: number) {
        return mocks.OclifCmdExit(code)
      }
      public async getCliConfig() {
        return mocks.SanityCmdGetCliConfig()
      }
      public async getProjectId(opts?: Record<string, any>) {
        return mocks.SanityCmdGetProjectId(opts)
      }
      public async getProjectRoot() {
        return mocks.SanityCmdGetProjectRoot()
      }
      // Same implementation as SanityCommand's, minus telemetry
      public async init(): Promise<void> {
        const {args, flags} = await this.parse({
          args: this.ctor.args,
          baseFlags: super.ctor.baseFlags,
          enableJsonFlag: this.ctor.enableJsonFlag,
          flags: this.ctor.flags,
          strict: this.ctor.strict,
        })

        this.args = args
        this.flags = flags

        await super.init()
      }
      public isUnattended() {
        return mocks.SanityCmdIsUnattended()
      }
      public resolveIsInteractive() {
        return mocks.SanityCmdResolveIsInteractive()
      }
      public async run() {}
    },
    mocks,
  }
}

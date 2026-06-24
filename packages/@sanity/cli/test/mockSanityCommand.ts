import {resolve} from 'node:path'

import {Command, Config} from '@oclif/core'
import {type Output, SanityCommandInterface} from '@sanity/cli-core'
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
      // Use OCLIF_TEST_ROOT, set in vitest configs in this repo, as a fallback root directory for OCLIF.
      // Without this, unit tests yield warnings in console output (not catastrophic, but annoying).
      public static override run<T extends Command>(...args: Parameters<typeof Command.run>) {
        const [argv, opts] = args
        const testRoot = process.env.OCLIF_TEST_ROOT
          ? resolve(process.cwd(), process.env.OCLIF_TEST_ROOT)
          : undefined
        if (typeof opts === 'string' || opts instanceof Config) {
          return super.run(argv, opts) as Promise<ReturnType<T['run']>>
        }
        return super.run(argv, {
          ...opts,
          root: opts?.root ?? testRoot ?? process.cwd(),
        }) as Promise<ReturnType<T['run']>>
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

import {type GenericCmd, getConfig} from '@heroku-cli/test-utils'
import {Command, type Interfaces} from '@oclif/core'
import {type Output, type SanityCommandInterface} from '@sanity/cli-core'
import {vi} from 'vitest'

// Get cached OCLIF config right on import
const oclifConfig = await getConfig()

interface CommandInstance {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  run(): Promise<any>
}
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
class MockedSanityCommand extends Command implements SanityCommandInterface {
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
}
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    SanityCommand: MockedSanityCommand,
  }
})

export async function createMockSanityCommand(CommandClass: GenericCmd) {
  // Cast to constructor type to handle protected constructors
  const Ctor = CommandClass as {new (argv: string[], config: Interfaces.Config): CommandInstance}
  return {
    createCmdInstance: (args: string[]) => {
      return new Ctor(args, oclifConfig)
    },
    mocks,
  }
}

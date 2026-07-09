import {Command} from '@oclif/core'
import {type Output, ProjectRootResult, type SanityCommandInterface} from '@sanity/cli-core/types'
import {Mock, vi} from 'vitest'

interface MockCollection {
  DefaultProjectRoot: ProjectRootResult
  OclifCmdExit: Mock<Command['exit']>
  SanityCmdGetCliConfig: Mock
  SanityCmdGetProjectId: Mock
  SanityCmdGetProjectRoot: Mock<() => ProjectRootResult>
  SanityCmdIsUnattended: Mock
  SanityCmdOutput: Output
  SanityCmdResolveIsInteractive: Mock
}

const DefaultProjectRoot = {
  directory: '/some/path/to/cli-test/mocks',
  path: '/some/path/to/cli-test/mocks/sanity.studio.ts',
  type: 'studio' as const,
}

/**
 * @internal
 */
export const mocks: MockCollection = {
  DefaultProjectRoot,
  // Mock OCLIF Command methods
  OclifCmdExit: vi.fn((_code?: number) => undefined as never),
  // Mock SanityCommand methods
  SanityCmdGetCliConfig: vi.fn(),
  SanityCmdGetProjectId: vi.fn(() => 'cli-test-mock-project-id'),
  SanityCmdGetProjectRoot: vi.fn(() => DefaultProjectRoot),
  SanityCmdIsUnattended: vi.fn(),
  SanityCmdOutput: createMockOutput(),
  SanityCmdResolveIsInteractive: vi.fn(),
}

/**
 * @internal
 */
export function createMockOutput(): Output {
  return {
    error: vi.fn(() => undefined as never),
    log: vi.fn(),
    warn: vi.fn(),
  }
}

/**
 * A mocked SanityCommand, for use in mocking out the `@sanity/cli-core/SanityCommand` module's command class.
 * @internal
 */
export class SanityCommand extends Command implements SanityCommandInterface {
  args = {}
  flags = {}
  output: Output = mocks.SanityCmdOutput
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
  public async tryGetCliConfig() {
    return this.getCliConfig()
  }
}

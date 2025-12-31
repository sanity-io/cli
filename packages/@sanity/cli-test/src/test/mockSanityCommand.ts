import {type Command} from '@oclif/core'
import {
  type CliConfig,
  type GlobalCliClientOptions,
  type ProjectCliClientOptions,
  type ProjectRootResult,
  SanityCommand,
} from '@sanity/cli-core'
import {type SanityClient} from '@sanity/client'

type MockClient = Partial<SanityClient> & Record<string, unknown>

export interface MockSanityCommandOptions {
  /**
   * Mock CLI config (required if command uses getCliConfig or getProjectId)
   */
  cliConfig?: CliConfig
  /**
   * Mock global API client (returned by getGlobalApiClient)
   */
  globalApiClient?:
    | ((opts: GlobalCliClientOptions) => MockClient | Promise<MockClient>)
    | MockClient
  /**
   * Mock whether the terminal is interactive (used by isUnattended)
   */
  isInteractive?: boolean
  /**
   * Mock project API client (returned by getProjectApiClient)
   */
  projectApiClient?:
    | ((opts: ProjectCliClientOptions) => MockClient | Promise<MockClient>)
    | MockClient
  /**
   * Mock project root result (required if command uses getProjectRoot)
   */
  projectRoot?: ProjectRootResult
  /**
   * Mock authentication token (passed to API clients, bypasses getCliToken)
   */
  token?: string
}

/**
 * Creates a testable subclass of a command with mocked SanityCommand dependencies.
 *
 * @example
 * ```ts
 * // Basic config mocking
 * const TestAdd = mockSanityCommand(Add, {
 *   cliConfig: { api: { projectId: 'test-project' } }
 * })
 *
 * // With mock API client
 * const mockClient = {
 *   getDocument: vi.fn().mockResolvedValue({ _id: 'doc1', title: 'Test' }),
 *   fetch: vi.fn().mockResolvedValue([]),
 * }
 * const TestGet = mockSanityCommand(GetDocumentCommand, {
 *   cliConfig: { api: { projectId: 'test-project', dataset: 'production' } },
 *   projectApiClient: mockClient,
 * })
 *
 * const {stdout} = await testCommand(TestGet, ['doc1'])
 * expect(mockClient.getDocument).toHaveBeenCalledWith('doc1')
 * ```
 */
export function mockSanityCommand<T extends typeof SanityCommand<typeof Command>>(
  CommandClass: T,
  options: MockSanityCommandOptions = {},
): T {
  // Create a subclass that overrides methods when mocks are provided
  // Note: we use @ts-expect-error because TypeScript can't properly infer
  // the relationship between the generic CommandClass and SanityCommand
  // @ts-expect-error - TypeScript struggles with abstract class subclassing
  class MockedCommand extends CommandClass {
    protected getCliConfig(): Promise<CliConfig> {
      if (options.cliConfig) {
        return Promise.resolve(options.cliConfig)
      }
      return super.getCliConfig()
    }

    protected getGlobalApiClient(args: GlobalCliClientOptions) {
      if (options.globalApiClient) {
        const result =
          typeof options.globalApiClient === 'function'
            ? options.globalApiClient(args)
            : options.globalApiClient
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return Promise.resolve(result) as any
      }
      // Pass token if provided (bypasses getCliToken)
      const argsWithToken = options.token ? {...args, token: options.token} : args
      return super.getGlobalApiClient(argsWithToken)
    }

    protected getProjectApiClient(args: ProjectCliClientOptions) {
      if (options.projectApiClient) {
        const result =
          typeof options.projectApiClient === 'function'
            ? options.projectApiClient(args)
            : options.projectApiClient
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return Promise.resolve(result) as any
      }
      // Pass token if provided (bypasses getCliToken)
      const argsWithToken = options.token ? {...args, token: options.token} : args
      return super.getProjectApiClient(argsWithToken)
    }

    protected getProjectRoot(): Promise<ProjectRootResult> {
      if (options.projectRoot) {
        return Promise.resolve(options.projectRoot)
      }
      return super.getProjectRoot()
    }

    protected resolveIsInteractive(): boolean {
      if (options.isInteractive !== undefined) {
        return options.isInteractive
      }
      return super.resolveIsInteractive()
    }
  }

  return MockedCommand as T
}

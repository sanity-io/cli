import {type Command} from '@oclif/core'
import {type CliConfig, type ProjectRootResult, SanityCommand} from '@sanity/cli-core'

import {createTestToken} from './createTestToken'

/**
 * @public
 */
export interface MockSanityCommandOptions {
  /**
   * Mock CLI config (required if command uses getCliConfig or getProjectId)
   */
  cliConfig?: CliConfig
  /**
   * Mock whether the terminal is interactive (used by isUnattended)
   */
  isInteractive?: boolean
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
 * @public
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
  if (options.token) {
    createTestToken(options.token)
  }

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

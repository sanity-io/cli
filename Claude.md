# Important Notes

- This repo is for migration of old CLI to new CLI. The code you will change will always be in `packages/@sanity/cli` code in `packages/@sanity/original-cli` is only for reference.
- When migrating logic from `original-cli` to the new CLI, instead of creating a new file and duplicating the code - first use `git mv` to move it, then `git commit -m 'refactor: migrate … from original CLI` in order to maintain as much history as we can.
- The new CLI is using oclif framework. Docs are here https://oclif.io/docs/api_reference

# Architecture

## Repository Structure

- **`@sanity/cli`**: Main CLI package containing all commands
- **`@sanity/cli-core`**: Base command class and shared utilities
  - Contains `SanityCommand` that all commands extend
  - Provides helper methods for API clients, logging, and error handling
  - Can be extended by external CLI modules
- **`@sanity/cli-test`**: Testing utilities for CLI commands
- **`@sanity/original-cli`**: Legacy CLI code moved from the monorepo (reference only)

## New CLI Structure

- **Commands** (`commands/`): Parse CLI args/flags and orchestrate flow. Keep thin - delegate to actions and services.
- **Actions** (`actions/`): Business logic and validation. Should take options objects, not CLI flags.
- **Services** (`services/`): API client wrappers. Abstract Sanity API requests from actions.
- **Prompters** (`prompts/`): Reusable interactive prompts (select org/project/dataset, etc.).

# Bash Commands

All these commands are run from the root of the repo.

- pnpm test - runs all the unit tests
- pnpm test <test-file> - run tests for specific CLI package. Example: `pnpm  test packages/@sanity/cli/src/commands/documents/__tests__/get.test.ts`
- pnpm test --coverage - runs unit tests that generates coverage reports at the root in `coverage` folder
- pnpm check:types - checks typescript types
- pnpm check:lint - checks for formatting and eslint issues.
- pnpm depcheck - Checks for any extra dependency, files or unnecessary exports
- pnpm build:cli - builds the project
- pnpm watch:cli - builds the project in watch mode (rebuilds on changes)

# Code style

- Use ES modules (import/export) syntax instead of CommonJS (require)
- Use named exports and avoid default exports
- Always include `.js` extension in imports (TypeScript compiles to JS)
- Tests are written using vitest
- Avoid using `any` type. If you need to use it, then use `unknown` type and then cast it to the type you need.
- Use `satisfies` operator for flag definitions: `static override flags = {...} satisfies FlagInput`
- Always prefer async/await over promise chains

# Common Patterns

- Command files: `src/commands/<command-name>.ts`
- Class name for the command should follow the following rule:
  - If it is root command, it should be `FeatureCommand` (e.g., `LoginCommand`)
  - If the command is a subcommand, it should be `ActionFeatureCommand` (e.g., `ListDatasetCommand`, `GetDocumentCommand`)
- Test files should be located in `__tests__` folder relative to the file. Example: `src/commands/__tests__/<command-name>.test.ts`
- When migrating commands, check for existing utilities in `src/utils/` and `@sanity/cli-core`
- Always add tests for new commands with vitest
- Use `testCommand` helper from `@sanity/cli-test` for testing commands
- Always clear mocks in `afterEach()`: `vi.clearAllMocks()`
- Use `vi.mocked()` for type-safe mocking
- Commands should extend `SanityCommand` from `@sanity/cli-core`
- Use `subdebug('namespace:command')` for debug logging

# Testing Patterns

## Client Mocking Strategy

For tests that need to mock Sanity API client methods, use **module-level mocking** with `mockClient` instead of mocking individual service functions.

### When to Use Module-Level Mocking

Use module-level mocking when:

- Tests need to mock API client methods (e.g., `client.users.getById()`, `client.datasets.list()`)
- Services call `getGlobalCliClient` or `getProjectCliClient` directly
- You want fail-fast behavior when unmocked methods are called

### How to Mock the Client

```typescript
import {mockClient, testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

// Create hoisted mocks for client methods
const mockGetById = vi.hoisted(() => vi.fn())

// Mock @sanity/cli-core at module level
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue(
      mockClient({
        users: {
          getById: mockGetById,
        } as never, // Use 'as never' for nested objects
      }),
    ),
  }
})

describe('my command', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('success case', async () => {
    // Configure the mock for this test
    mockGetById.mockResolvedValue({
      email: 'test@example.com',
      id: 'user-123',
      name: 'Test User',
    })

    const {stdout, error} = await testCommand(MyCommand, [])

    expect(error).toBeUndefined()
    expect(stdout).toContain('test@example.com')
  })
})
```

### Key Benefits

1. **Mock once, use everywhere**: All services that call `getGlobalCliClient` automatically use the mock
2. **Fail-fast**: If a test calls an unmocked client method, it throws immediately with a helpful error
3. **Less boilerplate**: No need to mock individual service functions
4. **More realistic**: Tests the actual client method calls that services make

### Common Mock Patterns

```typescript
// Mock nested client objects (datasets, users, projects, etc.)
mockClient({
  datasets: {
    list: vi.fn().mockResolvedValue([...]),
    create: vi.fn().mockResolvedValue({...}),
  } as never,
  users: {
    getById: vi.fn().mockResolvedValue({...}),
  } as never,
})

// Mock both global and project clients
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue(mockClient({...})),
    getProjectCliClient: vi.fn().mockResolvedValue(mockClient({...})),
  }
})
```

### Mocking the Request Method

When tests need to mock `client.request()` for HTTP calls, use `createTestClient()` with `mockApi()`:

```typescript
import {createTestClient, mockApi, mockClient, testCommand} from '@sanity/cli-test'

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  const testClient = createTestClient({
    apiVersion: 'v2021-06-07',
    token: 'test-token',
  })

  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue(
      mockClient({
        request: testClient.request, // ✅ Use real test client request
        users: {
          getById: vi.fn().mockResolvedValue({
            email: 'test@example.com',
            id: 'user-123',
            name: 'Test User',
          }),
        } as never,
      }),
    ),
  }
})

test('with mockApi', async () => {
  // Mock the HTTP endpoint
  mockApi({
    apiVersion: 'v2021-06-07',
    method: 'post',
    uri: '/projects',
  }).reply(200, {
    displayName: 'Test Project',
    projectId: 'project-123',
  })

  const {error, stdout} = await testCommand(MyCommand, [])

  expect(error).toBeUndefined()
  expect(stdout).toContain('project-123')
})
```

**Benefits of this approach:**

- Tests the actual HTTP layer, not just mocked functions
- More realistic integration-style testing
- Better debugging with actual request/response details
- Validates request formatting and response parsing
- Consistent with other HTTP-level tests

**❌ Don't mock request as a plain `vi.fn()`:**

```typescript
// Wrong: manual mocking
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
}))

mockClient({
  request: mocks.request,  // ❌ Wrong
})

mocks.request.mockResolvedValueOnce([...])  // ❌ Wrong
```

**Reference**: See `packages/@sanity/cli/src/commands/__tests__/init/init.plan.test.ts` for a complete example.

## Alternative: HTTP Mocking with mockApi

For integration-style tests that want to test the full stack including the actual client:

```typescript
import {mockApi} from '@sanity/cli-test'

test('with HTTP mocking', async () => {
  mockApi({
    apiVersion: 'v2021-06-07',
    uri: '/users/me',
    method: 'GET',
  }).reply(200, {id: 'user-123', email: 'test@example.com'})

  const {stdout} = await testCommand(MyCommand, [])
  expect(stdout).toContain('test@example.com')
})
```

Use HTTP mocking when you want to test the entire request/response cycle, including request formatting and response parsing.

# Debugging

- To run any command first you have to build the project using `pnpm build:cli`
- For faster iteration, use `pnpm watch:cli` in one terminal and run commands in another
- Run single command: `npx sanity <command>`
- Enable debug logs: `DEBUG=sanity:* npx sanity <command>`
- Most if not all commands need to be run within one of the examples folders.

# Workflow

- Be sure to typecheck, lint, build, depcheck and run tests when you are done.
- Testing coverage should be maximized. Prefer running tests with coverage and the goal is to achieve maximum testing coverage for any new code added.

# Important Notes

- This repo contains the Sanity CLI built with the oclif framework
- Code you work on will be in `packages/@sanity/cli`
- oclif documentation: https://oclif.io/docs/api_reference

# Architecture

## Repository Structure

- **`@sanity/cli`**: Main CLI package containing all commands
- **`@sanity/cli-core`**: Base command class and shared utilities
  - Contains `SanityCommand` that all commands extend
  - Provides helper methods for API clients, logging, and error handling
  - Can be extended by external CLI modules
- **`@sanity/cli-test`**: Testing utilities for CLI commands

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
- pnpm check:deps - Checks for any extra dependency, files or unnecessary exports
- pnpm build:cli - builds the project
- pnpm watch:cli - builds the project in watch mode (rebuilds on changes)

# Exit Code Convention

Commands use a small set of exit codes. These align with oclif defaults and Unix convention.

- **0 - Success**: Command completed normally. This is implicit when `run()` returns without throwing. Only use `this.exit(0)` when you need to short-circuit early on a successful path.
- **1 - Runtime error**: Something went wrong during execution that is not the user's fault. API failures, network errors, missing project config, file system errors, unexpected state. Use `this.error(message, {exit: 1})`.
- **2 - Usage error**: The user provided invalid input to the CLI itself. Bad arguments, unknown flags, invalid flag values, failing input validation. This is oclif's default for `this.error()` and all parse errors, so omitting the `exit` option also gives you 2. Use `this.error(message, {exit: 2})` or `this.error(message)`.
- **3 - User abort**: The user declined a confirmation prompt or otherwise chose not to proceed. The command didn't fail, but it also didn't complete its intended action. Use `this.exit(exitCodes.USER_ABORT)`. Import `exitCodes` from `@sanity/cli-core`.
- **130 - User abort (signal)**: The user cancelled via Ctrl+C or dismissed a prompt without answering. Handled automatically by `SanityCommand.catch()` - commands should not set this manually.

## When to use which

- User passed `--dataset` with a name that doesn't match the allowed pattern? **Exit 2** - they gave bad input.
- The dataset name is valid but the API says it doesn't exist? **Exit 1** - runtime failure.
- `this.error('No project ID found')` when `--project-id` was required but missing? **Exit 2** - usage error.
- API returned 500 while creating a dataset? **Exit 1** - runtime failure.
- User says "no" to "Deploy anyway despite version mismatch?" **Exit 3** - user chose not to proceed. The command ran correctly, but the action was not performed.
- User hits Ctrl+C during a prompt? **Exit 130** - handled by base class, no action needed.

## In practice

- For `this.error()`: pass `{exit: 1}` for runtime errors, `{exit: 2}` (or omit) for usage errors.
- For user-declined prompts: `this.exit(exitCodes.USER_ABORT)` after logging a message like "Deploy cancelled."
- For custom error classes extending `CLIError`: set `exit` in the constructor options.
- For `this.exit()`: only use for early termination (exit 0 for success, exit 1 for programmatic failure like `doctor` checks failing).
- Worker processes using `process.exit()` directly should follow the same convention.

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

For tests that need to mock Sanity API client methods, use **module-level mocking** by mocking the client functions directly.

### When to Use Module-Level Mocking

Use module-level mocking when:

- Tests need to mock API client methods (e.g., `client.users.getById()`, `client.datasets.list()`)
- Services call `getGlobalCliClient` or `getProjectCliClient` directly

### How to Mock the Client

```typescript
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

// Create hoisted mocks for client methods
const mockGetById = vi.hoisted(() => vi.fn())

// Mock @sanity/cli-core at module level
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      users: {
        getById: mockGetById,
      },
    }),
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
2. **Less boilerplate**: No need to mock individual service functions
3. **More realistic**: Tests the actual client method calls that services make

### Common Mock Patterns

```typescript
// Mock nested client objects (datasets, users, projects, etc.)
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      datasets: {
        list: vi.fn().mockResolvedValue([...]),
        create: vi.fn().mockResolvedValue({...}),
      },
      users: {
        getById: vi.fn().mockResolvedValue({...}),
      },
    }),
  }
})

// Mock both global and project clients
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({...}),
    getProjectCliClient: vi.fn().mockResolvedValue({...}),
  }
})
```

### Mocking the Request Method

When tests need to mock `client.request()` for HTTP calls, use `createTestClient()` with `mockApi()`:

```typescript
import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  const testClient = createTestClient({
    apiVersion: 'v2021-06-07',
    token: 'test-token',
  })

  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      request: testClient.request, // ✅ Use real test client request
      users: {
        getById: vi.fn().mockResolvedValue({
          email: 'test@example.com',
          id: 'user-123',
          name: 'Test User',
        }),
      },
    }),
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

  if (error) throw error
  expect(stdout).toContain('project-123')
})
```

**Benefits of this approach:**

- Tests the actual HTTP layer, not just mocked functions
- More realistic integration-style testing
- Better debugging with actual request/response details
- Validates request formatting and response parsing
- Consistent with other HTTP-level tests

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

## Testing Hierarchy and Service Mocking

### Testing Rules for AI Agents

When writing tests for CLI commands, follow these rules strictly:

#### ALWAYS:

1. **Default to HTTP mocking** - Use `mockApi()` as your first choice unless the test specifically requires client method mocking
2. **Mock at the highest level possible** - HTTP > Client > Action > Service (in that order)
3. **Use hoisted mocks** - Use `vi.hoisted(() => vi.fn())` for client method mocks
4. **Clear mocks in afterEach** - Always include `vi.clearAllMocks()` in `afterEach()`
5. **Test error cases** - Include both success and error scenarios
6. **Use `if (error) throw error`** in success tests - NOT `expect(error).toBeUndefined()`. This gives better stack traces on failure.
7. **Assert `expect(error).toBeInstanceOf(Error)`** in error tests - along with exit code and message assertions

#### NEVER:

1. **Never mock service files for HTTP API calls** - Use client or HTTP mocking instead
2. **Never leave mocks active between tests** - Always clear in `afterEach()`
3. **Never use `any` in mock types** - Use proper typing or `unknown`
4. **Never mock without verifying the mock was called** - Add assertions for mock calls

#### Service Mocking: PROHIBITED - No Exceptions

**❌ WRONG - NEVER DO THIS:**

```typescript
// This is ALWAYS incorrect - don't mock service files
vi.mock('../../services/users.js', () => ({
  getUserById: vi.fn(),
}))
```

**✅ CORRECT - Do this instead:**

```typescript
// Mock the client method that the service uses
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      users: {
        getById: vi.fn().mockResolvedValue({id: 'user-123', email: 'test@example.com'}),
      },
    }),
  }
})
```

#### Decision Flow for Test Mocking

When writing a test, ask:

1. **Does the test need to verify HTTP request/response behavior?**
   - YES → Use `mockApi()` (preferred)
   - NO → Continue to #2

2. **Does the command call client methods directly?**
   - YES → Mock `getProjectCliClient()` or `getGlobalCliClient()` with hoisted mocks
   - NO → Continue to #3

3. **Does the command call an action with complex logic?**
   - YES, and action is tested separately → Mock the action function
   - YES, but action is not tested → Mock the client (don't mock the action)
   - NO → Mock the client

4. **NEVER mock service files** - No exceptions, always use client or HTTP mocking

#### Why Service Mocking is Problematic

Service mocking breaks when code is refactored:

```typescript
// ❌ Service mock - test passes even if client method changes
vi.mock('../../services/datasets.js', () => ({
  listDatasets: vi.fn().mockResolvedValue([...]),
}))

// Service refactored to use different client method → test still passes!
// But production code is broken because client method changed

// ✅ Client mock - test fails if client method changes
vi.mock('@sanity/cli-core', async (importOriginal) => {
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      datasets: {
        list: vi.fn().mockResolvedValue([...]), // Must match actual client API
      },
    }),
  }
})

// Service refactored → test must update → catches breaking changes!
```

#### Quick Reference

**For simple HTTP API tests:**

```typescript
mockApi({uri: '/endpoint'}).reply(200, {...})
```

**For testing multiple client methods:**

```typescript
const mockMethod = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      resource: {method: mockMethod},
    }),
  }
})
```

**For testing with real HTTP + mocked methods:**

```typescript
const testClient = createTestClient({apiVersion: '...', token: '...'})

vi.mock('@sanity/cli-core', async () => {
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      request: testClient.request, // Real HTTP
      users: {getById: vi.fn()}, // Mocked
    }),
  }
})

mockApi({uri: '/endpoint'}).reply(200, {...})
```

# Debugging

- To run any command first you have to build the project using `pnpm build:cli`
- For faster iteration, use `pnpm watch:cli` in one terminal and run commands in another
- Run single command: `npx sanity <command>`
- Enable debug logs: `DEBUG=sanity:* npx sanity <command>`
- Most if not all commands need to be run within one of the fixture folders.

# Workflow

- Be sure to typecheck, lint, build, depcheck and run tests when you are done.
- Testing coverage should be maximized. Prefer running tests with coverage and the goal is to achieve maximum testing coverage for any new code added.

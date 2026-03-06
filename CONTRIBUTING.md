# Contributing to Sanity CLI

Welcome! This guide helps contributors work effectively on the Sanity CLI project.

Before contributing, please read our [code of conduct](https://github.com/sanity-io/cli/blob/main/CODE_OF_CONDUCT.md).

## Quick Start

1. **Install dependencies**: `pnpm install`
2. **Build the CLI**: `pnpm build:cli`
3. **Run tests**: `pnpm test`
4. **Create a feature branch**: `git checkout -b feature/my-feature`

For detailed setup, see [Development Workflow](#development-workflow).

---

## Project Architecture

### Repository Structure

- **`@sanity/cli`**: Main CLI package containing all commands
- **`@sanity/cli-core`**: Base command class and shared utilities
  - Contains `SanityCommand` that all commands extend
  - Provides helper methods for API clients, logging, and error handling
  - Can be extended by external CLI modules
- **`@sanity/cli-test`**: Testing utilities for CLI commands

### Separation of Concerns

The CLI follows a strict layered architecture:

```
┌─────────────────────────────────────┐
│  Commands (CLI Interface)           │  Parse args, orchestrate flow
├─────────────────────────────────────┤
│  Actions (Business Logic)           │  Validation, complex operations
├─────────────────────────────────────┤
│  Services (API Interaction)         │  Sanity API client wrappers
├─────────────────────────────────────┤
│  Prompters (Reusable UI)            │  Interactive prompts
└─────────────────────────────────────┘
```

**Commands** (`commands/`) parse CLI arguments and flags, then orchestrate the flow by calling actions and services. Keep these thin - they should not contain business logic.

**Actions** (`actions/`) contain business logic, validation, and complex operations. These functions should accept options objects (not CLI-specific flags) so they can be called from anywhere, not just commands.

**Services** (`services/`) wrap Sanity API client calls. They abstract API interactions from actions, making it easier to test and modify API integration separately from business logic.

**Prompters** (`prompts/`) provide reusable interactive prompts like "select or create an organization/project/dataset". These help maintain consistency across commands.

### Directory Structure

```
packages/@sanity/cli/src/
├── actions/          # Business logic (testable, reusable)
├── commands/         # oclif command definitions
├── config/           # Configuration loading
├── hooks/            # oclif lifecycle hooks
├── prompts/          # Reusable prompt components
├── services/         # API client wrappers
├── types/            # Type definitions
└── utils/            # Shared utilities
```

---

## Development Workflow

### Setup

```bash
# Install dependencies
pnpm install

# Build the CLI
pnpm build:cli

# Run from fixtures folder
cd fixtures/basic-studio
npx sanity <command>
```

### Development Loop

```bash
# Watch mode (rebuilds on changes)
pnpm watch:cli

# In another terminal, test your changes
cd fixtures/basic-studio
DEBUG=sanity:* npx sanity <your-command>
```

### Quality Checks

Before submitting a PR, run:

```bash
pnpm check:types     # TypeScript checking
pnpm check:lint      # ESLint + Prettier
pnpm check:deps      # Unused dependencies
pnpm test            # Run all tests
pnpm test --coverage # Coverage report
pnpm changeset       # Add a changeset (if your change affects published packages)
```

---

## Code Standards

### Module System

Always use ES Modules:

```typescript
// Good
import {myFunction} from './utils/myUtil.js'
export {myFunction}

// Bad
import myFunction from './utils/myUtil' // No default exports
const x = require('./x') // No CommonJS
```

**Important**: Include `.js` extension in imports (TypeScript compiles to JS).

### TypeScript

Strict typing is required:

```typescript
// Good
const flags = {
  dataset: Flags.string({description: 'Dataset name'}),
} satisfies FlagInput

catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error'
}

// Bad
const flags = {...} as any
catch (error: any) { }
```

**Rules:**

- Never use `any` type
- Use `unknown` in catch blocks and narrow appropriately
- Use `satisfies` for flag definitions
- Enable all strict TypeScript flags
- Always prefer async/await over promise chains

### Naming Conventions

| Type         | Convention             | Example              |
| ------------ | ---------------------- | -------------------- |
| Root command | `FeatureCommand`       | `LoginCommand`       |
| Subcommand   | `ActionFeatureCommand` | `ListDatasetCommand` |
| Test file    | `feature.test.ts`      | `login.test.ts`      |
| Service file | `feature.ts`           | `datasets.ts`        |

### File Location Conventions

- Command files: `src/commands/<topic>/<command-name>.ts`
- Test files: `__tests__/` folder relative to the file being tested (e.g., `src/commands/__tests__/<command-name>.test.ts`)
- Commands extend `SanityCommand` from `@sanity/cli-core`
- When adding or migrating commands, check for existing utilities in `src/utils/` and `@sanity/cli-core`

---

## Exit Code Convention

Commands use a small set of exit codes aligned with oclif defaults and Unix convention.

- **0 - Success**: Command completed normally. Implicit when `run()` returns without throwing. Only use `this.exit(0)` when you need to short-circuit early on a successful path.
- **1 - Runtime error**: Something went wrong during execution that is not the user's fault. API failures, network errors, missing project config, file system errors, unexpected state. Use `this.error(message, {exit: 1})`.
- **2 - Usage error**: The user provided invalid input to the CLI itself. Bad arguments, unknown flags, invalid flag values, failing input validation. This is oclif's default for `this.error()` and all parse errors, so omitting the `exit` option also gives you 2. Use `this.error(message, {exit: 2})` or `this.error(message)`.
- **3 - User abort**: The user declined a confirmation prompt or otherwise chose not to proceed. The command didn't fail, but it also didn't complete its intended action. Use `this.exit(exitCodes.USER_ABORT)`. Import `exitCodes` from `@sanity/cli-core`.
- **130 - User abort (signal)**: The user cancelled via Ctrl+C or dismissed a prompt without answering. Handled automatically by `SanityCommand.catch()` - commands should not set this manually.

### When to Use Which

- User passed `--dataset` with a name that doesn't match the allowed pattern? **Exit 2** - they gave bad input.
- The dataset name is valid but the API says it doesn't exist? **Exit 1** - runtime failure.
- `this.error('No project ID found')` when `--project-id` was required but missing? **Exit 2** - usage error.
- API returned 500 while creating a dataset? **Exit 1** - runtime failure.
- User says "no" to "Deploy anyway despite version mismatch?" **Exit 3** - user chose not to proceed.
- User hits Ctrl+C during a prompt? **Exit 130** - handled by base class, no action needed.

### In Practice

- For `this.error()`: pass `{exit: 1}` for runtime errors, `{exit: 2}` (or omit) for usage errors.
- For user-declined prompts: `this.exit(exitCodes.USER_ABORT)` after logging a message like "Deploy cancelled."
- For custom error classes extending `CLIError`: set `exit` in the constructor options.
- For `this.exit()`: only use for early termination (exit 0 for success, exit 1 for programmatic failure like `doctor` checks failing).
- Worker processes using `process.exit()` directly should follow the same convention.

---

## Testing Requirements

### Coverage Goals

- **New code**: Maximum coverage
- **Modified code**: Maintain or improve existing coverage
- Run `pnpm test --coverage` to check

### Test Structure

```typescript
import {describe, test, expect, afterEach, vi} from 'vitest'
import {testCommand} from '@sanity/cli-test'

describe('feature description', () => {
  afterEach(() => {
    vi.clearAllMocks() // Always clean up
  })

  test('success scenario', async () => {
    // 1. Mock dependencies
    vi.mocked(dependency).mockResolvedValue(mockData)

    // 2. Execute command
    const {stdout, stderr, error} = await testCommand(Command, ['args'])

    // 3. Assert - use throw for better stack traces on failure
    if (error) throw error
    expect(stdout).toContain('expected')
  })

  test('error scenario', async () => {
    vi.mocked(dependency).mockRejectedValue(new Error('fail'))

    const {error} = await testCommand(Command, ['args'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to')
    expect(error?.oclif?.exit).toBe(1)
  })
})
```

### Testing Rules

- Use `testCommand()` helper from `@sanity/cli-test` for command execution
- Use `vi.mocked()` for type-safe mocking
- Use `vi.hoisted(() => vi.fn())` for client method mocks
- Clear mocks in `afterEach()` with `vi.clearAllMocks()`
- Test both success and error paths
- In success tests, use `if (error) throw error` - NOT `expect(error).toBeUndefined()` (better stack traces on failure)
- In error tests, assert `expect(error).toBeInstanceOf(Error)` along with exit code and message assertions
- Never use `any` in mock types - use proper typing or `unknown`
- Never leave mocks active between tests
- Never mock without verifying the mock was called - add assertions for mock calls

### Mocking Strategy: What to Mock and When

Follow this hierarchy when writing tests (prefer higher levels):

#### 1. HTTP-Level Mocking (Preferred)

**Pattern A: Pure HTTP Mocking (Simplest)**

Mock HTTP endpoints directly:

```typescript
import {mockApi} from '@sanity/cli-test'

test('lists users successfully', async () => {
  mockApi({
    apiVersion: 'v2021-06-07',
    uri: '/projects/my-project/users',
    method: 'GET',
  }).reply(200, [{id: 'user-1', email: 'test@example.com'}])

  const {stdout, error} = await testCommand(UsersListCommand, ['--project', 'my-project'])

  if (error) throw error
  expect(stdout).toContain('test@example.com')
})
```

**Pattern B: HTTP with Test Client**

For commands that need both HTTP mocking and client methods:

```typescript
import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  const testClient = createTestClient({
    apiVersion: 'v2021-06-07',
    token: 'test-token',
  })

  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      request: testClient.request,
      users: {
        getById: vi.fn().mockResolvedValue({...}),
      },
    }),
  }
})

test('creates project', async () => {
  mockApi({
    apiVersion: 'v2021-06-07',
    method: 'POST',
    uri: '/projects',
  }).reply(200, {projectId: 'test-project'})

  const {stdout, error} = await testCommand(CreateProjectCommand, ['Test Project'])

  if (error) throw error
  expect(stdout).toContain('test-project')
})
```

**Choose HTTP mocking when:**

- Testing error handling from API responses
- Testing request formatting and response parsing
- Integration-style tests
- Avoiding mocking implementation details

#### 2. Client-Level Mocking (Default for Unit Tests)

Mock API client methods directly:

```typescript
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

const mockGetById = vi.hoisted(() => vi.fn())
const mockListDatasets = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      users: {
        getById: mockGetById,
      },
      datasets: {
        list: mockListDatasets,
      },
    }),
  }
})

describe('my command', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('fetches user and datasets', async () => {
    mockGetById.mockResolvedValue({id: 'user-123', email: 'test@example.com'})
    mockListDatasets.mockResolvedValue([{name: 'production'}])

    const {stdout, error} = await testCommand(MyCommand, [])

    if (error) throw error
    expect(stdout).toContain('test@example.com')
    expect(mockGetById).toHaveBeenCalledWith('user-123')
    expect(mockListDatasets).toHaveBeenCalled()
  })

  test('handles API error', async () => {
    mockGetById.mockRejectedValue(new Error('API error'))

    const {error} = await testCommand(MyCommand, [])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to fetch user')
    expect(error?.oclif?.exit).toBe(1)
  })
})
```

**Choose client mocking when:**

- Testing command orchestration logic
- Multiple client methods are called
- Need fine-grained control over mock behavior
- Don't need to test HTTP request/response details

#### 3. Action-Level Mocking (Sometimes)

Mock action functions when they have complex logic tested separately:

```typescript
vi.mock('../../actions/build/buildApp.js', () => ({
  buildApp: vi.fn(),
}))

const mockBuildApp = vi.mocked(buildApp)

test('deploy command calls build', async () => {
  mockBuildApp.mockResolvedValue({success: true})

  await testCommand(DeployCommand, [])

  expect(mockBuildApp).toHaveBeenCalledWith(expect.objectContaining({...}))
})
```

**Choose action mocking when:**

- Action has complex business logic tested in its own test file
- Action has side effects (file system operations, spawning processes)
- Testing command orchestration without action implementation details

#### Never Mock Service Files

Do not mock service files directly. Mock the client or HTTP layer instead.

```typescript
// Wrong - don't mock service files
vi.mock('../../services/users.js', () => ({
  getUserById: vi.fn(),
}))

// Correct - mock the client that services use
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

**Why:** Service mocks don't break when the service's internal client usage changes - meaning tests keep passing while production code is broken. Client-level mocks catch these breaking changes because they must match the actual client API.

### How to Choose Your Mocking Strategy

1. **Does the command make HTTP requests that you need to test?**
   - Yes -> Use `mockApi()` (HTTP-level mocking)
   - No -> Continue to #2

2. **Does the command call multiple client methods?**
   - Yes -> Use client-level mocking
   - No -> Continue to #3

3. **Does the command call an action with complex logic?**
   - Yes, and action is tested separately -> Mock the action
   - Yes, but action is NOT tested separately -> Mock the client
   - No -> Mock the client

### Refactoring Tests That Mock Services

If you encounter a test that mocks a service file:

1. Identify what API calls the service makes
2. Replace service mock with:
   - `mockApi()` for HTTP-level testing (preferred)
   - Client-level mocking if multiple client methods are needed
3. Update assertions to verify the same behavior
4. Run tests to ensure they still pass

---

## Command Implementation

### Basic Command Structure

```typescript
import {getProjectCliClient, SanityCommand, subdebug} from '@sanity/cli-core'
import {Args, Flags, type FlagInput} from '@oclif/core'

const debug = subdebug('namespace:command')

export class MyCommand extends SanityCommand<typeof MyCommand> {
  static override description = 'What this command does'

  static override examples = [
    '<%= config.bin %> <%= command.id %> arg-example',
    '<%= config.bin %> <%= command.id %> --flag-example',
  ]

  static override args = {
    myArg: Args.string({
      description: 'Argument description',
      required: true,
    }),
  }

  static override flags = {
    myFlag: Flags.string({
      char: 'f',
      description: 'Flag description',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(MyCommand)

    // 1. Get config & validate
    const cliConfig = await this.getCliConfig()
    const projectId = cliConfig.api?.projectId
    if (!projectId) {
      this.error('Project ID not found')
    }

    // 2. Get API client (if needed)
    const client = await getProjectCliClient({
      apiVersion: 'v2021-06-07',
      projectId,
      requireUser: true,
    })

    // 3. Execute logic (preferably call action)
    try {
      const result = await performAction(client, args.myArg)
      this.log(JSON.stringify(result, null, 2))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      debug('Operation failed', error)
      this.error(`Failed: ${message}`, {exit: 1})
    }
  }
}
```

### Error Handling Pattern

```typescript
import {subdebug} from '@sanity/cli-core'

const debug = subdebug('feature:action')

try {
  const result = await operation()
  return result
} catch (error) {
  // Log detailed error for debugging
  debug('Operation failed', error)

  // Show user-friendly message
  const message = error instanceof Error ? error.message : 'Unknown error'
  this.error(`User-facing message: ${message}`, {exit: 1})
}
```

### Interactive Prompts

```typescript
import {select, input, confirm} from '@inquirer/prompts'

// Selection prompt
const dataset = await select({
  message: 'Select dataset:',
  choices: datasets.map((d) => ({
    name: d.name,
    value: d.name,
  })),
})

// Text input with validation
const name = await input({
  message: 'Enter name:',
  validate: (value) => value.length > 0 || 'Name is required',
})

// Confirmation
const confirmed = await confirm({
  message: 'Are you sure?',
  default: false,
})
```

### Output Formatting

```typescript
// Colorized JSON
import {colorizeJson} from '@sanity/cli-core'
this.log(colorizeJson(data))

// Colors
import {styleText} from 'node:util'
this.log(styleText('green', 'Success!'))
this.log(styleText('yellow', 'Warning:'), 'Something to note')
this.log(styleText('red', 'Error:'), 'Operation failed')

// JSON output
this.log(JSON.stringify(data, null, 2))

// Symbols
import {logSymbols} from '@sanity/cli-core'
this.log(`${logSymbols.success} Operation completed`)
this.log(`${logSymbols.error} Operation failed`)
this.log(`${logSymbols.info} Additional information`)
this.log(`${logSymbols.warning} Proceed with caution`)

// Spinner
import {spinner} from '@sanity/cli-core'
const spin = spinner('Loading...').start()
await operation()
spin.stop()

// Tables
import {Table} from 'console-table-printer'
const table = new Table({
  columns: [
    {name: 'id', title: 'ID'},
    {name: 'name', title: 'Name'},
  ],
})
datasets.forEach((d) => table.addRow(d))
table.printTable()
```

### Debug Logging

```typescript
import {subdebug} from '@sanity/cli-core'

const debug = subdebug('feature:subfeature')

debug('Operation started', {args, flags})
debug('API response', response)
```

Enable with: `DEBUG=sanity:* npx sanity <command>`

---

## Service Layer

Keep API interactions in `services/`:

```typescript
// services/datasets.ts
import {getProjectCliClient} from '@sanity/cli-core'

export const DATASET_API_VERSION = 'v2025-09-16'

export async function listDatasets(projectId: string) {
  const client = await getProjectCliClient({
    apiVersion: DATASET_API_VERSION,
    projectId,
    requireUser: true,
  })
  return client.datasets.list()
}

export async function createDataset(
  projectId: string,
  name: string,
  options?: CreateDatasetOptions,
) {
  const client = await getProjectCliClient({
    apiVersion: DATASET_API_VERSION,
    projectId,
    requireUser: true,
  })
  return client.datasets.create(name, options)
}
```

Commands should call services, not make API requests directly.

---

## Pull Request Process

### Before Submitting

- [ ] Code follows architecture patterns (Commands/Actions/Services)
- [ ] All tests pass: `pnpm test`
- [ ] TypeScript compiles: `pnpm check:types`
- [ ] Code is linted: `pnpm check:lint`
- [ ] Dependencies checked: `pnpm check:deps`
- [ ] Test coverage maintained or improved: `pnpm test --coverage`
- [ ] Examples updated if needed
- [ ] Documentation updated if needed

### PR Checklist

1. **Title**: Use conventional commits format
   - `feat:` for new features
   - `fix:` for bug fixes
   - `refactor:` for code improvements
   - `test:` for test additions
   - `docs:` for documentation

2. **Description**: Include:
   - What changed and why
   - How to test the changes
   - Any breaking changes
   - Related issues/tickets

3. **Tests**:
   - Add tests for new functionality
   - Update tests for modified functionality
   - Ensure all tests pass

4. **Documentation**:
   - Update command descriptions
   - Update examples

---

## Testing Preview Packages

We use [pkg.pr.new](https://pkg.pr.new) to generate preview packages for pull requests. This allows you to test changes before they're merged and published to npm.

### Requesting Preview Packages

To publish preview packages for your PR:

1. Add the `trigger: preview` label to your pull request
2. Wait for the "Publish Preview Packages" workflow to complete
3. A comment will be automatically posted with installation instructions

### Installing Preview Packages

Once preview packages are published, you can install them using npm or pnpm:

```bash
# Install a specific preview package
npm install https://pkg.pr.new/@sanity/cli@<commit-sha>

# Install all preview packages
npm install \
  https://pkg.pr.new/@sanity/cli@<commit-sha> \
  https://pkg.pr.new/@sanity/cli-core@<commit-sha> \
  https://pkg.pr.new/@sanity/cli-test@<commit-sha> \
  https://pkg.pr.new/@sanity/eslint-config-cli@<commit-sha>
```

Or use pnpm:

```bash
pnpm add https://pkg.pr.new/@sanity/cli@<commit-sha>
```

### Testing the CLI

You can test preview CLI packages in several ways:

```bash
# Install globally
npm install -g https://pkg.pr.new/@sanity/cli@<commit-sha>
sanity --help

# Or use npx directly
npx https://pkg.pr.new/@sanity/cli@<commit-sha> --help

# Or test in a project
cd my-sanity-project
npm install https://pkg.pr.new/@sanity/cli@<commit-sha>
npx sanity dev
```

### Preview Package Lifecycle

- Preview packages are generated for each commit on labeled PRs
- The PR comment updates with new URLs on subsequent commits
- Preview packages remain available as long as the PR is open
- Preview packages are automatically cleaned up after the PR is closed

---

## Releasing

This project uses [Changesets](https://github.com/changesets/changesets) for version management and publishing.

### Adding a Changeset

When you make a change that should be released, add a changeset:

```bash
pnpm changeset
```

This will prompt you to:
1. **Select packages** that are affected by your change
2. **Choose a bump type** (patch, minor, or major)
3. **Write a summary** of the change (this becomes the changelog entry)

A markdown file will be created in the `.changeset/` directory. Commit this file with your PR.

### When to Add a Changeset

- **Always** for `feat:`, `fix:`, `perf:`, and `revert:` commits
- **Not needed** for `chore:`, `refactor:`, `test:`, `docs:`, `style:`, `build:`, `ci:` commits (unless they affect the public API)

### Bump Type Guide

| Change Type | Bump | Example |
|-------------|------|---------|
| New feature | `minor` | New command, new flag |
| Bug fix | `patch` | Fix crash, fix incorrect output |
| Breaking change | `major` | Remove command, change flag behavior |
| Performance improvement | `patch` | Faster startup, less memory |

### How Releases Work

1. **PRs with changesets** are merged to `main`
2. The **Release workflow** automatically creates a "Version Packages" PR that:
   - Bumps package versions based on accumulated changesets
   - Updates `CHANGELOG.md` files
   - Removes consumed changeset files
3. **Merging the Version Packages PR** triggers publishing to npm
4. **GitHub Releases** are automatically created for each published package

### Manual Publishing

If you need to force-publish without new changesets:

1. Go to **Actions** → **Release** workflow
2. Click **Run workflow**
3. Check **Force publish packages to NPM**
4. Click **Run workflow**

### Pre-releases

`@sanity/cli` is currently published with the `alpha` npm dist tag. Other packages (`@sanity/cli-core`, `@sanity/cli-test`, `@sanity/eslint-config-cli`) publish with the `latest` tag.

## Resources

- [Project README](./README.md)
- [oclif Documentation](https://oclif.io/docs)
- [Vitest Documentation](https://vitest.dev/)
- [@inquirer/prompts](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/prompts)

---

Thank you for contributing to Sanity CLI!

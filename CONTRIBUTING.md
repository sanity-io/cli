# Contributing to Sanity CLI

Welcome! This guide helps contributors work effectively on the Sanity CLI project.

Before contributing, please read our [code of conduct](https://github.com/sanity-io/cli/blob/main/CODE_OF_CONDUCT.md).

## Quick Start

1. **Install dependencies**: `pnpm install`
2. **Build the CLI**: `pnpm build:cli`
3. **Run all tests**: `pnpm test`
4. **Create a feature branch**: `git checkout -b feature/my-feature`

For detailed setup, see [Development Workflow](#development-workflow).

---

## Project Architecture

### Repository Structure

- **`@sanity/cli`**: Main CLI package containing all commands
- **`@sanity/cli-build`**: Base logic for building Apps and Studios
- **`@sanity/cli-core`**: Base command class and shared utilities
  - Contains `SanityCommand` that all commands extend
  - Provides helper methods for API clients, logging, and error handling
  - Can be extended by external CLI modules
- **`@sanity/cli-test`**: Integration testing utilities for use with non-unit-tests

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

# Manually test from a fixtures folder
cd fixtures/basic-studio
npx sanity <command>
```

### Development Loop

```bash
# Watch mode (rebuilds on changes)
pnpm watch:cli

# In another terminal, manually test your changes
cd fixtures/basic-studio
DEBUG=sanity:* npx sanity <your-command>
```

### Quality Checks

Before submitting a PR, run:

```bash
pnpm check:types           # TypeScript checking
pnpm check:lint            # ESLint + Prettier
pnpm check:deps            # Unused dependencies
pnpm test:unit             # Run only unit tests
pnpm test:coverage         # Code coverage report based on unit tests
pnpm test:integration      # Run only integration tests
pnpm test                  # Run all tests
pnpm changeset             # Add a changeset (if your change affects published packages)
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
  - Commands extend `SanityCommand` from `@sanity/cli-core`
- Unit Test files: `__tests__/` folder relative to the file being tested (e.g., `src/commands/__tests__/<command-name>.test.ts`)
  - Unit tests for `SanityCommands` should leverage `createMockSanityCommand()` test helper from `@sanity/cli/test/mockSanityCommand.ts`
- Integration Test files: `test/integration` folder located in the root of the package and mirroring the `src/` path of the main module(s) under test (e.g. `test/integration/commands/__tests__/<command-name>.test.ts`)
- When adding or migrating commands, check for existing utilities in `src/utils/` and `@sanity/cli-core`

---

## Exit Code Convention

Commands use a small set of exit codes aligned with oclif defaults and Unix convention.

- **0 - Success**: Command completed normally. Implicit when `run()` returns without throwing. Only use `this.exit(0)` when you need to short-circuit early on a successful path.
- **1 - Runtime error**: Something went wrong during execution that is not the user's fault. API failures, network errors, missing project config, file system errors, unexpected state. Use `this.output.error(message, {exit: 1})`.
- **2 - Usage error**: The user provided invalid input to the CLI itself. Bad arguments, unknown flags, invalid flag values, failing input validation. This is oclif's default for `this.output.error()` and all parse errors, so omitting the `exit` option also gives you 2. Use `this.output.error(message, {exit: 2})` or `this.output.error(message)`.
- **3 - User abort**: The user declined a confirmation prompt or otherwise chose not to proceed. The command didn't fail, but it also didn't complete its intended action. Use `this.exit(exitCodes.USER_ABORT)`. Import `exitCodes` from `@sanity/cli-core`.
- **130 - User abort (signal)**: The user cancelled via Ctrl+C or dismissed a prompt without answering. Handled automatically by `SanityCommand.catch()` - commands should not set this manually.

### When to Use Which

- User passed `--dataset` with a name that doesn't match the allowed pattern? **Exit 2** - they gave bad input.
- The dataset name is valid but the API says it doesn't exist? **Exit 1** - runtime failure.
- `this.output.error('No project ID found')` when `--project-id` was required but missing? **Exit 2** - usage error.
- API returned 500 while creating a dataset? **Exit 1** - runtime failure.
- User says "no" to "Deploy anyway despite version mismatch?" **Exit 3** - user chose not to proceed.
- User hits Ctrl+C during a prompt? **Exit 130** - handled by base class, no action needed.

### In Practice

- For `this.output.error()`: pass `{exit: 1}` for runtime errors, `{exit: 2}` (or omit) for usage errors.
- For user-declined prompts: `this.exit(exitCodes.USER_ABORT)` after logging a message like "Deploy cancelled."
- For custom error classes extending `CLIError`: set `exit` in the constructor options.
- For `this.exit()`: only use for early termination (exit 0 for success, exit 1 for programmatic failure like `doctor` checks failing).
- Worker processes using `process.exit()` directly should follow the same convention.

---

## Testing Requirements

This project employs three different types of tests: unit, integration and end-to-end (e2e). Ideally the amounts of each test type is distributed in a [test pyramid](https://martinfowler.com/articles/practical-test-pyramid.html), with unit tests making up a majority of the tests while integration and e2e tests are employed sparingly, covering critical paths. All three types of tests are necessary to ensure a solid quality assurance process, but the tradeoffs between them should be understood in order to balance test reliability, infrastructure requirements, costs and test execution times.

**Unit tests** target a single source file (unit), mocking out a majority (ideally all!) of its dependencies in order to be able to exercise every logical branch within the unit via manipulation of its mocks. Because these tests mock out dependencies - and thus expensive I/O operations like file and network calls - unit tests are _fast_ - executing in a few milliseconds at most. Due to their single-unit narrow scope, unit tests are heavily coupled to the implementation of the unit they are testing. As a unit evolves and changes, typically so must its unit test. Unit tests in this project are stored next to the unit they are testing, under the `__tests__/` directory where the unit exists and named the same as the unit they are testing together with a `.test.ts` extension.

**Integration tests** (also known as "service tests") have broader scope (target more than a single source file) and may or may not employ mocking. As a result, these tests are more expensive than unit tests in terms of execution time and setup, and may be coupled to specific filesystem fixtures or configurations. As a result of a lack of mocking, they are also more brittle and can be subject to so-called 'flakiness' - transient or intermittent issues due to e.g. network partitions, low level operating system race conditions, resource exhaustion, etc. Integration tests in this project are stored under the `test/integration/` directory of each package.

**End-to-end (E2E) tests** (also known as "UI tests") have even-broader scope, typically being completely detached from any specific implementation and are written in a more black-box manner, mimicking end-user interactions. They often integrate with live remote environments (staging or production). For these reasons, E2E tests are even-more expensive than integration tests and generally even-less reliable. E2E are stored under `@sanity/packages/cli-e2e`.

The three test types exist on a continuum: from fastest/cheapest/most-coupled-to-implementation to slowest/most-expensive/least-coupled-to-implementation.

### Test Code Coverage Goals

- Code coverage is _only_ reported from unit test execution. Reporting code coverage from heavier integration or E2E tests, which may coincidentally exercise code paths unrelated to the tests, falsely increases code coverage, giving a false sense of security.
- **New code**: Maximum coverage
- **Modified code**: Maintain or improve existing coverage
- Run `pnpm test:coverage` to get a per-file test coverage report printed to your terminal. This command accepts one or path parameters to test files in order to more granularly report test coverage.

### Writing Tests

This section describes how to write unit and integration tests, which apply to all packages in this repository. Guidance on how to write E2E tests is covered in more detail in the `packages/@sanity/cli-e2e` package documentation.

#### Writing Unit Tests

Unit tests are our primary tool for quality assurance. Before writing integration or E2E tests, unit tests should be written. Mock out all imported modules as part of the beginning of the test; a unit test exercises a specific module, not its dependencies. If you need to test logic within an imported module, write a unit test for the imported module! Do not unit test third party dependencies.

The following is an example unit test for a fake `source-under-test.ts` file. It breaks down the test into static imports, mock setup and module mocking, and finally the test cases themselves, with mock manipulation in different test cases.

```typescript
import {describe, test, expect, afterEach, vi} from 'vitest'

import {thingBeingTested} from '../source-under-test.ts'

// Hoisted granular mocks defined that individual tests can adjust as needed
const mockDependencyMethod = vi.hoisted(() => vi.fn())
const mockOtherDependencyMethod = vi.hoisted(() => vi.fn())

// Module imported in ../source-under-test.ts is mocked. Not ethat `vi.mock` and `vi.hoisted` are executed _before_ any
// static imports by vitest as part of its transpilation, which is these mocks are in place by the time `thingBeingTested`
// is imported.
vi.mock(import('../dependency-that-source-under-test-relies-on.ts'), () => ({
  dependencyMethod: mockDependencyMethod,
}))
// Another module imported in ../source-under-test.ts is mocked, but this one allowing for the module being mocked to be
// truly imported. This may be useful when mocking out very large or complex modules where you want to preserve the module's
// implementation. Note that calling `importOriginal` will pull in the entire module, possibly bloating the import graph;
// use sparingly and judiciously to keep unit tests fast. `pnpm test:unit path/to/your/test/file.test.ts` will print out a
// summary of import path durations during test execution and the slowest modules contributing to slow import times.
vi.mock(import('../other-dependency-that-source-under-test-relies-on.ts'), (importOriginal) => async {
  const actual = await importOriginal()
  return {
    ...actual,
    otherDependencyMethod: mockOtherDependencyMethod,
  }
})

describe('thingBeingTested', () => {
  afterEach(() => {
    vi.clearAllMocks() // Always clean up
  })

  test('success scenario', async () => {
    // 1. Mock dependencies
    mockDependencyMethod.mockResolvedValue({data: 'some mocked data'})
    mockOtherDependencyMethod.mockReturnValue({data: 'some other mocked data'})

    // 2. Invoke the export being exercised from the module-under-test
    const result = await thingBeingTested()

    // 3. Assert on the results return and/or on the state of the mocks
    expect(result).toContain('expected')
    expect(mockDependencyMethod).toHaveBeenCalledWith('some expected parameter value')
  })

  test('error scenario', async () => {
    mockDependencyMethod.mockRejectedValue(new Error('fail'))

    await expect(thingBeingTested()).rejects.toThrow('fail')
  })
})
```

For an example of a unit test employing solid mocking practices, see `packages/@sanity/cli/src/actions/telemetry/__tests__/resolveConsent.test.ts`. It mocks all imported modules but one (a dependency-less `isTrueish` helper method), and when the test is run with code coverage reporting enabled (`pnpm test:coverage packages/@sanity/cli/src/actions/telemetry/__tests__/resolveConsent.test.ts`) yields 100% code coverage on the module-under-test.

##### Writing Unit Tests for a `SanityCommand` Implementation

OCLIF `Command` class implementations for the `packages/@sanity/cli` project should extend from the the `@sanity/cli` package's `SanityCommand.ts` class, which provides affordances like retrieving Sanity configurations, terminal output helper methods and automatic flag parsing (implementation of commands are described in more detail in [Command Implementation](#command-implementation)). To make testing of these CLI command entry points easier, there is a mock `SanityCommand` implementation that can be used as a module mock: `packages/@sanity/cli/test/mockSanityCommand.ts`. All other unit testing guidelines in the previous section should also be followed for unit testing `SanityCommand`-extended classes.

The key differences for unit testing a Command class compared to any unit testing any other module are:

1. The use of the `createMockSanityCommand` test helper, which returns the `MockSanityCommand` to install as a subsitute for `SanityCommand`, as well as the `mocks` shimmed into this mock class.
2. The need to dynamically import the command being tested using `await import`. This is due to the need to execute the `createMockSanityCommand` helper first before pulling in command-under-test.

For details on affordances provided by the mock `SanityCommand`, see its source at `packages/@sanity/cli/test/mockSanityCommand.ts`. The most common assertions used in `SanityCommand` unit tests are asserting on what is displayed in the terminal as a result of running the command. The `SanityCmdOutput*` properties exposed on the `mocks` object returned by `createMockSanityCommand()` allow for asserting on how `output.log`, `output.warn` and `output.error` are called within the Command.

For an example of a unit test leveraging the mock `SanityCommand` class, see `packages/@sanity/cli/src/commands/__tests__/doctor.test.ts`.

#### Writing Integration Tests

Sometimes, critical use cases call for leveraging heavier integration tests. Segregate heavy tests that use the filesystem (e.g. test fixtures) or may take longer to run into the `test/integration` folder of the relevant package. If a heavy integration test must be used, use the `testCommand()` and `testFixture()` helpers from `@sanity/cli-test` for command execution. Note that this shells out to a live terminal and thus is inherently slower.

In order to avoid flaky integration tests - especially those that interact with real servers (or any asynchronous work) - we need to take extra care to stay reliable on slow CI runners and when running in parallel with other test files. Three rules:

##### 1. Never sleep for a fixed duration

A fixed `setTimeout` encodes an assumption about how fast the machine is. That assumption will eventually be wrong somewhere, and the resulting failures are intermittent, platform-specific, and expensive to debug. We have had Windows-only CI failures because a login command took longer than a hardcoded 100ms to start its callback server.

```typescript
// BAD: assumes the server is up after 100ms - flaky on slow CI runners
const commandPromise = testCommand(LoginCommand, [])
await new Promise((resolve) => setTimeout(resolve, 100))
await fetch(`http://localhost:4321/callback?...`)

// GOOD: wait for an observable readiness signal, bounded by a deadline that fails the test
const {command, waitForCallbackUrl} = startLogin()
const callbackUrl = await waitForCallbackUrl() // polls the command's output
await completeOAuthCallback(callbackUrl, 'session-id')
```

Find a signal that proves the thing you are waiting for has actually happened:

- A line printed to stdout/stderr: observe it live with the `onOutput` capture option of `testCommand()` (the login command prints its login URL only after the callback server is listening, so the printed URL doubles as a readiness signal)
- A mock having been called: poll with `vi.waitFor(() => expect(mockedOpen).toHaveBeenCalled())`
- A file existing, a port accepting connections, etc.

Polling must have an upper bound, and hitting it should fail the test with a message that explains what never happened. Be generous (10-15 seconds is fine): healthy runs never get near the bound, and a generous bound never causes a flake.

##### 2. Never hardcode port numbers

A hardcoded port is shared global state. Another test file running in a parallel vitest worker can bind the same port, and so can unrelated software on the CI machine. Use port `0` so the OS assigns a unique free port, then discover the actual port through an observable signal (printed output, a mock call) rather than assuming it.

```typescript
beforeEach(() => {
  // OS-assigned ephemeral port: every test gets its own free port
  vi.stubEnv('SANITY_CLI_CALLBACK_PORTS', '0')
})

afterEach(() => {
  vi.unstubAllEnvs()
})
```

`SANITY_CLI_CALLBACK_PORTS` overrides the ports the auth callback server binds to (comma-separated). For testing port fallback behavior, occupy an OS-assigned port first and pass that port explicitly, instead of hardcoding two "known" ports:

```typescript
const blocker = await startBlockingServer() // binds port 0, returns the assigned port
vi.stubEnv('SANITY_CLI_CALLBACK_PORTS', `${blocker.port},0`)
// the command now fails to bind blocker.port and falls back to an OS-assigned port
```

#### 3. Never leave a command running when a test fails

`testCommand()` resolves with an `{error}` property instead of rejecting, so an abandoned command promise never crashes a test - it just keeps running. If a test starts a long-running command and an assertion fails before the command is awaited, the leaked command keeps its server bound and consumes nock mocks registered by later tests. The result is cascading, misleading failures in tests far away from the root cause.

Register cleanup that settles the command even when the test fails, e.g. from an `afterEach` hook.

---

## Command Implementation

Sanity CLI commands all extend from the `SanityCommand` class, which provides several affordances that should be leveraged by commands. See `SanityCommand`'s implementation at `packages/@sanity/cli-core/src/SanityCommand.ts` for details, but particularly useful utilities provided by this class include:

- `stdout`, `stderr` and process exiting/erroring helpers via `this.output`. Crucial to use `this.output` as this allows for easier unit testing of the command via `packages/@sanity/cli/test/mockSanityCommand.ts`.
- `getCliConfig()` helper method for retrieving Sanity-specific configuration.
- `getProjectId()` helper method for retrieving relevant project ID for project-specific CLI commands.
- `getProjectRoot()` helper method for retrieving a filesystem location denoting Sanity project root.

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
      this.output.error('Project ID not found')
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
      this.output.log(JSON.stringify(result, null, 2))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      debug('Operation failed', error)
      this.output.error(`Failed: ${message}`, {exit: 1})
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
  this.output.error(`User-facing message: ${message}`, {exit: 1})
}
```

### Interactive Prompts

```typescript
import {select, input, confirm} from '@sanity/cli-core/ux'

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
this.output.log(colorizeJson(data))

// Colors
import {styleText} from 'node:util'
this.output.log(styleText('green', 'Success!'))
this.output.log(styleText('yellow', 'Warning:'), 'Something to note')
this.output.log(styleText('red', 'Error:'), 'Operation failed')

// JSON output
this.output.log(JSON.stringify(data, null, 2))

// Symbols
import {logSymbols} from '@sanity/cli-core/ux'
this.output.log(`${logSymbols.success} Operation completed`)
this.output.log(`${logSymbols.error} Operation failed`)
this.output.log(`${logSymbols.info} Additional information`)
this.output.log(`${logSymbols.warning} Proceed with caution`)

// Spinner
import {spinner} from '@sanity/cli-core/ux'
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
this.output.log(table.render()) // allows for unit testing table contents via mock SanityCommand output log assertions
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
- [ ] Test coverage maintained or improved: `pnpm test:coverage`
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
  https://pkg.pr.new/@sanity/cli-build@<commit-sha> \
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

### Automatic Changesets

Changesets are **automatically generated** — you never need to run `pnpm changeset` manually.

**For human PRs**, the `generate-changeset` workflow:

1. Reads the **Notes for release** section from your PR description (the template pre-fills this)
2. Derives the bump type from your PR title (`feat:` → minor, `fix:` → patch, `feat!:` → major)
3. Detects affected packages from changed files
4. Commits a changeset file to your PR branch

If you leave the Notes for release section empty, the PR title is used as the changelog entry. Write `N/A` to explicitly skip the changeset (e.g., `N/A: Internal only`).

**For bot PRs** (Renovate, Dependabot), the `changesets-from-conventional-commits` workflow generates changesets from commit messages automatically.

### Manual Changesets

In rare cases where you need full control (e.g., targeting specific packages), you can still run:

```bash
pnpm changeset
```

This creates a changeset file in `.changeset/`. If you do this, write `N/A` in the PR Notes for release section to prevent the auto-generated changeset from duplicating it.

### When a Changeset is Needed

- **Always** for `feat:`, `fix:`, `perf:`, and `revert:` commits
- **Not needed** for `chore:`, `refactor:`, `test:`, `docs:`, `style:`, `build:`, `ci:` commits (unless they affect the public API)

### Bump Type Guide

| Change Type             | Bump    | Example                              |
| ----------------------- | ------- | ------------------------------------ |
| New feature             | `minor` | New command, new flag                |
| Bug fix                 | `patch` | Fix crash, fix incorrect output      |
| Breaking change         | `major` | Remove command, change flag behavior |
| Performance improvement | `patch` | Faster startup, less memory          |

### How Releases Work

1. **PRs with changesets** are merged to `main`
2. The **Release workflow** automatically creates a "Version Packages" PR that:
   - Bumps package versions based on accumulated changesets
   - Updates `CHANGELOG.md` files
   - Removes consumed changeset files
3. **Merging the Version Packages PR** triggers publishing to npm
4. **GitHub Releases** are automatically created for each published package

### Propagating Releases to the Sanity Monorepo

Publishing `@sanity/cli` and `create-sanity` to npm is only the first step. Most users do not depend on `@sanity/cli` directly — they invoke it through `npx sanity` or as a transitive dependency of the `sanity` package. For a release to actually reach those users, the CLI version must also be bumped in the [sanity-io/sanity](https://github.com/sanity-io/sanity) monorepo.

**Do not open this bump PR by hand.** The sanity monorepo has Renovate automation that:

- Detects new `@sanity/cli` releases on npm
- Opens a dependency-update PR
- Pulls the changelog entries from this repo's release notes into the sanity repo's release notes

Manually bumping the version short-circuits that automation and results in missing or duplicated changelog entries. If a release looks stuck, check Renovate in the sanity repo before intervening.

End-to-end flow for a typical change:

1. PR merged into this repo (with a changeset)
2. Changesets bot opens / updates the **Version Packages** PR here
3. Merging the Version Packages PR publishes `@sanity/cli` and `create-sanity` to npm
4. Renovate in sanity-io/sanity opens a PR bumping `@sanity/cli`, importing the changelog
5. That PR is reviewed and merged, which is what ships the change to `npx sanity` users

### Snapshot Releases

Snapshot releases publish ephemeral versions (e.g., `0.0.0-20260327120000`) under a custom npm dist tag for testing:

1. Go to **Actions** → **Snapshot Release** workflow
2. Click **Run workflow**
3. Optionally set the **tag** (default: `snapshot`) and **forceBump** (if no changesets exist)
4. Install with `npm install @sanity/cli@snapshot`

### Prerelease Mode

For sustained prerelease cycles (alpha, beta, rc):

```bash
pnpm pre:enter alpha     # enter prerelease mode
# ... merge PRs with changesets as normal ...
pnpm version-packages    # produces 1.0.0-alpha.0, -alpha.1, etc.
pnpm release             # publishes under the "alpha" dist tag
pnpm pre:exit            # exit prerelease mode, next release is stable
```

### Emergency Publishing

If you need to force-publish all packages without pending changesets:

1. Go to **Actions** → **Snapshot Release** workflow
2. Set **forceBump** to the desired bump type (patch/minor/major)
3. This creates real versions, publishes to `latest`, commits the version bump to `main`, and creates GitHub releases

### npm Dist Tags

| Release type     | Dist tag               | Example                            |
| ---------------- | ---------------------- | ---------------------------------- |
| Standard release | `latest`               | `npm install @sanity/cli`          |
| Snapshot release | `snapshot` (or custom) | `npm install @sanity/cli@snapshot` |
| Prerelease       | `alpha`, `beta`, etc.  | `npm install @sanity/cli@alpha`    |

## Resources

- [Project README](./README.md)
- [oclif Documentation](https://oclif.io/docs)
- [Vitest Documentation](https://vitest.dev/)
- [@inquirer/prompts](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/prompts)

---

Thank you for contributing to Sanity CLI!

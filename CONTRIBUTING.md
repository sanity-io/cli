# Contributing to Sanity CLI

Welcome! This guide helps both human developers and AI agents contribute effectively to the Sanity CLI project.

Before contributing, please read our [code of conduct](https://github.com/sanity-io/cli/blob/main/CODE_OF_CONDUCT.md).

## Quick Start

1. **Install dependencies**: `pnpm install`
2. **Build the CLI**: `pnpm build:cli`
3. **Run tests**: `pnpm test`
4. **Create a feature branch**: `git checkout -b feature/my-feature`

For detailed setup, see [Development Workflow](#development-workflow).

---

### Command Implementation Template

```typescript
import {SanityCommand} from '@sanity/cli-core'
import {Args, Flags, type FlagInput} from '@oclif/core'

export class FeatureCommand extends SanityCommand<typeof FeatureCommand> {
  static override description = 'Brief description'

  static override examples = ['<%= config.bin %> <%= command.id %> [args]']

  static override args = {
    argName: Args.string({
      description: 'Argument description',
      required: true,
    }),
  }

  static override flags = {
    flagName: Flags.string({
      char: 'f',
      description: 'Flag description',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(FeatureCommand)

    // 1. Get config & validate
    const cliConfig = await this.getCliConfig()

    // 2. Get API client if needed
    const client = await this.getProjectApiClient({
      apiVersion: 'v2021-06-07',
      projectId: cliConfig.api?.projectId,
      requireUser: true,
    })

    // 3. Execute business logic (preferably in actions/)
    // 4. Handle errors with debug + user-facing message
  }
}
```

### Test Implementation Template

```typescript
import {describe, test, expect, afterEach, vi} from 'vitest'
import {testCommand} from '@sanity/cli-test'
import {FeatureCommand} from '../feature.js'

const mockGetCliConfig = vi.mocked(getCliConfig)
const mockGetProjectClient = vi.mocked(getProjectClient)

describe('feature command', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('success case', async () => {
    mockGetCliConfig.mockResolvedValue({api: {projectId: 'test'}})
    mockGetProjectClient.mockResolvedValue({
      method: vi.fn().mockResolvedValue({data: 'result'}),
    })

    const {stdout, error} = await testCommand(FeatureCommand, ['arg'])

    expect(error).toBeUndefined()
    expect(stdout).toContain('expected output')
  })

  test('error case', async () => {
    mockGetProjectClient.mockResolvedValue({
      method: vi.fn().mockRejectedValue(new Error('API error')),
    })

    const {error} = await testCommand(FeatureCommand, ['arg'])

    expect(error?.message).toContain('User-facing error')
    expect(error?.oclif?.exit).toBe(1)
  })
})
```

</details>

---

## Project Architecture

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

# Run from examples folder
cd examples/basic-studio
npx sanity <command>
```

### Development Loop

```bash
# Watch mode (rebuilds on changes)
pnpm watch:cli

# In another terminal, test your changes
cd examples/basic-studio
DEBUG=sanity:* npx sanity <your-command>
```

### Quality Checks

Before submitting a PR, run:

```bash
pnpm check:types    # TypeScript checking
pnpm check:lint     # ESLint + Prettier
pnpm depcheck       # Unused dependencies
pnpm test           # Run all tests
pnpm test --coverage # Coverage report
```

---

## Code Standards

### Module System

✅ **Always use ES Modules:**

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

✅ **Strict typing:**

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
- Use `unknown` in catch blocks and cast appropriately
- Use `satisfies` for flag definitions
- Enable all strict TypeScript flags

### Naming Conventions

| Type         | Convention             | Example              |
| ------------ | ---------------------- | -------------------- |
| Root command | `FeatureCommand`       | `LoginCommand`       |
| Subcommand   | `ActionFeatureCommand` | `ListDatasetCommand` |
| Test file    | `feature.test.ts`      | `login.test.ts`      |
| Service file | `feature.ts`           | `datasets.ts`        |

### Async/Await

Always prefer async/await over promise chains:

```typescript
// Good
const data = await fetchData()
const result = await process(data)

// Avoid
fetchData().then(data => process(data)).then(...)
```

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

    // 3. Assert expectations
    expect(error).toBeUndefined()
    expect(stdout).toContain('expected')
  })

  test('error scenario', async () => {
    vi.mocked(dependency).mockRejectedValue(new Error('fail'))

    const {error} = await testCommand(Command, ['args'])

    expect(error?.message).toContain('Failed to')
    expect(error?.oclif?.exit).toBe(1)
  })
})
```

### Testing Patterns

✅ **Do:**

- Use `testCommand()` helper for command execution
- Use `vi.mocked()` for type-safe mocking
- Mock `@sanity/cli-core` functions (getCliConfig, getProjectApiClient)
- Use `mockClient()` for module-level client mocking (preferred)
- Clear mocks in `afterEach()`
- Test both success and error paths
- Use `mockApi` for HTTP mocking when testing full request/response cycle

❌ **Don't:**

- Leave mocks active between tests
- Use `any` in mock types
- Skip error case testing
- Mock individual service functions when you can mock the client instead

### Client Mocking with mockClient

When tests need to mock Sanity API client methods, prefer **module-level mocking** with `mockClient`:

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

describe('feature command', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('success case', async () => {
    mockGetById.mockResolvedValue({
      email: 'test@example.com',
      id: 'user-123',
      name: 'Test User',
    })

    const {stdout, error} = await testCommand(FeatureCommand, [])

    expect(error).toBeUndefined()
    expect(stdout).toContain('test@example.com')
  })

  test('error case', async () => {
    mockGetById.mockRejectedValue(new Error('API error'))

    const {error} = await testCommand(FeatureCommand, [])

    expect(error?.message).toContain('Failed to fetch user')
    expect(error?.oclif?.exit).toBe(1)
  })
})
```

**Benefits:**

- Mock once, all services automatically use the mocked client
- Fail-fast: unmocked methods throw immediately with helpful errors
- Less boilerplate than mocking individual service functions
- More realistic: tests actual client method calls
- For `client.request()` HTTP calls, use `createTestClient()` with `mockApi()` for HTTP-level testing

### Mocking the Request Method

When tests need to mock `client.request()` for HTTP calls, use `createTestClient()` with `mockApi()` for HTTP-level testing:

```typescript
import {createTestClient, mockApi, mockClient, testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

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
        request: testClient.request, // Use real test client request
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

describe('feature command', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('creates project successfully', async () => {
    // Mock the HTTP endpoint
    mockApi({
      apiVersion: 'v2021-06-07',
      method: 'post',
      uri: '/projects',
    }).reply(200, {
      displayName: 'Test Project',
      projectId: 'project-123',
    })

    const {error, stdout} = await testCommand(CreateProjectCommand, ['Test Project'])

    expect(error).toBeUndefined()
    expect(stdout).toContain('project-123')
  })

  test('handles API errors', async () => {
    mockApi({
      apiVersion: 'v2021-06-07',
      method: 'post',
      uri: '/projects',
    }).reply(400, {
      error: 'Invalid project name',
      statusCode: 400,
    })

    const {error} = await testCommand(CreateProjectCommand, [''])

    expect(error?.message).toContain('Invalid project name')
  })
})
```

**Why use this pattern:**

- Tests the actual HTTP layer including request formatting and response parsing
- More realistic integration-style testing
- Better debugging with actual request/response details
- Consistent with other HTTP-level tests in the codebase

**Don't mock `request` as a plain function:**

```typescript
// ❌ Wrong approach
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
}))

mockClient({
  request: mocks.request,  // ❌ Manual mocking
})

mocks.request.mockResolvedValueOnce([...])  // ❌ Manual configuration
```

**Reference**: See `packages/@sanity/cli/src/commands/__tests__/init/init.plan.test.ts` for a complete example.

---

## Command Implementation

### Basic Command Structure

```typescript
import {SanityCommand} from '@sanity/cli-core'
import {Args, Flags, type FlagInput} from '@oclif/core'
import {subdebug} from '@sanity/cli-core'

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
      this.error('Project ID not found', {exit: 1})
    }

    // 2. Get API client (if needed)
    const client = await this.getProjectApiClient({
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
import chalk from 'chalk'
this.log(chalk.green('Success!'))
this.log(chalk.yellow('Warning:'), 'Something to note')
this.log(chalk.red('Error:'), 'Operation failed')

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

## Migration from Original CLI

When migrating functionality from `@sanity/original-cli`:

### 1. Preserve Git History

```bash
# Move file to new location
git mv packages/@sanity/original-cli/src/feature.ts \
       packages/@sanity/cli/src/actions/feature.ts

git commit -m "refactor: migrate feature from original CLI"
```

### 2. Then Modernize

In separate commits:

- Convert to ES modules (`import`/`export`)
- Update to TypeScript strict mode
- Adapt to new architecture patterns
- Add comprehensive tests

### 3. Reference Only

**Never modify** `@sanity/original-cli` - it exists only as a reference for migration.

### AI-Assisted Development

We recommend using the following workflows and conventions when choosing to use AI for development and migration tasks:

#### Using Claude

1. Initial conversion: Let Claude do first pass of OCLIF conversion
2. Incremental changes: Convert flags, then prompts, then logic
3. Review PR comments: Claude reviews PRs automatically
   - Focus on OCLIF-specific patterns
   - Ignore legacy code quality issues
   - Don't fix existing bugs unless critical

#### Recommended Prompting Strategy

```
1. "Update this to the new class-based OCLIF structure"
2. "Convert all flags and arguments to OCLIF format"
3. "Extract prompts to private methods"
4. "Move business logic to actions folder"
```

---

## Pull Request Process

### Before Submitting

- [ ] Code follows architecture patterns (Commands/Actions/Services)
- [ ] All tests pass: `pnpm test`
- [ ] TypeScript compiles: `pnpm check:types`
- [ ] Code is linted: `pnpm check:lint`
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
   - Add migration notes if relevant

---

## Common Patterns

### Debug Logging

```typescript
import {subdebug} from '@sanity/cli-core'

const debug = subdebug('feature:subfeature')

debug('Operation started', {args, flags})
debug('API response', response)
```

Enable with: `DEBUG=sanity:* npx sanity <command>`

### Configuration Loading

```typescript
const cliConfig = await this.getCliConfig()
const projectId = cliConfig.api?.projectId
const dataset = cliConfig.api?.dataset || 'production'
```

### API Client

```typescript
const client = await this.getProjectApiClient({
  apiVersion: 'v2021-06-07',
  projectId,
  dataset: flags.dataset,
  requireUser: true, // Requires authentication
})
```

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

## Resources

- [Project README](./README.md)
- [CLAUDE.md](../../CLAUDE.md) - AI assistant instructions
- [oclif Documentation](https://oclif.io/docs)
- [Vitest Documentation](https://vitest.dev/)
- [@inquirer/prompts](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/prompts)

---

Thank you for contributing to Sanity CLI! 🎉

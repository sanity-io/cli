# @sanity/cli-test

Provides test helpers for the Sanity CLI.

## Quick Start

### 1. Set up vitest global setup

Add the cli-test vitest setup to your `vitest.config.ts`:

```ts
import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['@sanity/cli-test/vitest'],
  },
})
```

This will automatically copy and install dependencies for all bundled examples before tests run.

### 2. Use test examples in your tests

```ts
import {testExample} from '@sanity/cli-test'
import {describe, test} from 'vitest'

describe('my test suite', () => {
  test('should work with basic-studio', async () => {
    const cwd = await testExample('basic-studio')
    // The example is now available at `cwd` with dependencies installed
    // Tests that need built output should build explicitly:
    // await buildExample(cwd)
  })
})
```

## API

### `testExample(exampleName: string, options?: TestExampleOptions): Promise<string>`

Creates an isolated copy of a bundled example for testing. Returns the absolute path to the temporary directory containing the example.

**Parameters:**

- `exampleName` - Name of the example to copy (e.g., 'basic-app', 'basic-studio')
- `options.tempDir` - Optional custom temp directory path (defaults to `process.cwd()/tmp`)

**Returns:** Absolute path to the temporary example directory

**Available Examples:**

- `basic-app` - Basic Sanity application
- `basic-studio` - Basic Sanity Studio
- `multi-workspace-studio` - Multi-workspace Sanity Studio
- `worst-case-studio` - Stress-test Sanity Studio

**Example:**

```ts
import {testExample} from '@sanity/cli-test'

const cwd = await testExample('basic-studio')
// Example is ready at `cwd` with dependencies installed
// Note: Examples are NOT built by default - tests should build if needed
```

### `setup(options?: SetupTestExamplesOptions): Promise<void>`

Vitest global setup function that copies examples and installs dependencies. This is automatically called by vitest when using `@sanity/cli-test/vitest` in your globalSetup config.

**Parameters:**

- `options.additionalExamples` - Glob patterns for additional example directories from your local repo to set up alongside the default bundled examples (e.g., `['examples/*', 'dev/*']`). Only directories containing a `package.json` are included.
- `options.tempDir` - Custom temp directory path (defaults to `process.cwd()/tmp`)

**Note:** Examples are NOT built during setup. Tests that need built output should build explicitly.

**Adding examples from your local repo:**

If your repo has its own example directories that you want to test alongside the default bundled examples, use the `additionalExamples` option to include them:

```ts
// vitest.setup.ts
import {setup as cliTestSetup, teardown} from '@sanity/cli-test/vitest'

export {teardown}

export async function setup(project) {
  return cliTestSetup(project, {
    additionalExamples: ['examples/*', 'dev/*'],
  })
}
```

```ts
// vitest.config.ts
import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['vitest.setup.ts'],
  },
})
```

### `teardown(options?: TeardownTestExamplesOptions): Promise<void>`

Vitest global teardown function that removes the temp directory. This is automatically called by vitest when using `@sanity/cli-test/vitest`.

**Parameters:**

- `options.tempDir` - Custom temp directory path (defaults to `process.cwd()/tmp`)

### `setupWorkerBuild(filePaths: string[]): Promise<void>`

Utility function to compile TypeScript worker files (`.worker.ts`) to JavaScript for use in tests. Must be integrated into a custom vitest global setup file.

**Parameters:**

- `filePaths` - Array of paths to `.worker.ts` files to compile

**Features:**

- Compiles TypeScript to JavaScript using SWC for fast compilation
- Generates source maps for debugging
- Automatically watches for changes in watch mode (detects `VITEST_WATCH=true` or `--watch` flag)
- Handles files from both `@sanity/cli` and `@sanity/cli-core` packages

**Note:** This is a utility function, NOT automatically called. See the "Worker Files" section for integration examples.

**Example:**

```ts
// test/workerBuild.ts
import {setupWorkerBuild} from '@sanity/cli-test/vitest'
import {glob} from 'tinyglobby'

export async function setup() {
  const workerFiles = await glob('**/*.worker.ts', {
    ignore: ['**/node_modules/**', '**/dist/**'],
  })
  return setupWorkerBuild(workerFiles)
}
```

### `teardownWorkerBuild(): Promise<void>`

Utility function to clean up worker build artifacts and close file watchers. Must be integrated into a custom vitest global setup file.

**Features:**

- Closes file watchers if in watch mode
- Deletes all compiled `.js` files that were generated from `.worker.ts` files
- Clears internal tracking of compiled files

**Note:** This is a utility function, NOT automatically called. See the "Worker Files" section for integration examples.

### `testCommand(command: Command, args?: string[])`

Runs the given command with the given arguments and returns the output.

```ts
const {stdout} = await testCommand(DevCommand, ['--host', '0.0.0.0', '--port', '3000'])
```

### `mockApi(api: ApiClient)`

Mocks the sanity/client calls.

```ts
mockApi({
  apiVersion: '2024-01-17',
  method: 'get',
  uri: '/users/me',
  query: {
    recordType: 'user',
  },
}).reply(200, {
  id: 'user-id',
  name: 'John Doe',
  email: 'john.doe@example.com',
})
```

## How It Works

This package bundles pre-configured Sanity examples that can be used for testing. When you call `testExample()`:

1. It creates a unique temporary copy of the requested example
2. Symlinks the node_modules directory from the global setup version (for performance)
3. Returns the path to the isolated test directory

The examples work identically whether this package is used in a monorepo or installed from npm.

## Building Examples

Examples are NOT built during global setup or when calling `testExample()`. Tests that need built output should build explicitly:

```ts
import {exec} from 'node:child_process'
import {promisify} from 'node:util'

const execAsync = promisify(exec)

const cwd = await testExample('basic-studio')
// Build the example before running tests that need it
await execAsync('npx sanity build --yes', {cwd})
```

## Worker Files

Worker files (`.worker.ts`) are TypeScript files that run in separate threads or processes. This package provides utilities to compile these files for testing, but they must be integrated into a custom vitest global setup file.

### Setting Up Worker Compilation

**Step 1: Create a worker setup file** (e.g., `test/workerBuild.ts`):

```ts
import {setupWorkerBuild, teardownWorkerBuild} from '@sanity/cli-test/vitest'
import {glob} from 'tinyglobby'

export async function setup() {
  // Find all .worker.ts files in your project
  const workerFiles = await glob('**/*.worker.ts', {
    cwd: process.cwd(),
    ignore: ['**/node_modules/**', '**/dist/**'],
  })

  return setupWorkerBuild(workerFiles)
}

export async function teardown() {
  return teardownWorkerBuild()
}
```

**Step 2: Add to vitest config:**

```ts
// vitest.config.ts
import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: [
      'test/workerBuild.ts', // Your worker setup
      '@sanity/cli-test/vitest', // Example setup
    ],
  },
})
```

**Features:**

- Compiles TypeScript to JavaScript using SWC for fast compilation
- Generates source maps for debugging
- Automatically watches for changes in watch mode (detects `VITEST_WATCH=true` or `--watch` flag)
- Cleans up compiled `.js` files after tests complete

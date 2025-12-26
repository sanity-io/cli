# @sanity/cli-test

Provides test helpers for the Sanity CLI.

## Quick Start

### 1. Set up vitest global setup

Add the cli-test vitest setup to your `vitest.config.ts`:

```ts
import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['@sanity/cli-test/vitest']
  }
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

### `setupTestExamples(options?: SetupTestExamplesOptions): Promise<void>`

Global setup function that copies examples and installs dependencies. This is automatically called when using `@sanity/cli-test/vitest` in your vitest config.

**Parameters:**
- `options.examples` - Array of example names to set up (defaults to all 4 examples)
- `options.tempDir` - Custom temp directory path (defaults to `process.cwd()/tmp`)

**Note:** Examples are NOT built during setup. Tests that need built output should build explicitly.

### `teardownTestExamples(options?: TeardownTestExamplesOptions): Promise<void>`

Global teardown function that removes the temp directory. This is automatically called when using `@sanity/cli-test/vitest`.

**Parameters:**
- `options.tempDir` - Custom temp directory path (defaults to `process.cwd()/tmp`)

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

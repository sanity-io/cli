---
name: writing-cli-e2e-tests
description: Use when writing, adding, or modifying e2e tests for CLI commands in packages/@sanity/cli-e2e/. Triggers on e2e test creation, new command test coverage, or changes to CLI test infrastructure.
---

# Writing CLI E2E Tests

## Overview

E2e tests run real CLI commands against real infrastructure with real side effects. They validate that commands work end-to-end for both humans (interactive) and agents/CI (non-interactive). This skill defines the philosophy and patterns for writing effective e2e tests in `packages/@sanity/cli-e2e/`.

## When to Use

- Adding e2e test coverage for a new CLI command
- Adding tests for new flags or flows on an existing command
- Modifying CLI behavior that needs e2e validation

## Discovery & Planning

Before writing any tests, read the command source code and present a plan for user approval.

**Step 1: Read the command source.** Find the command in `packages/@sanity/cli/src/commands/` and its action files in `packages/@sanity/cli/src/actions/`. Identify:
- All flags and arguments the command accepts
- All distinct flows and code paths (e.g., `init` has studio, app, and Next.js paths)
- Which flags are interactive prompts that can be bypassed
- What side effects the command produces (files, API calls, data)

**Step 2: Plan the test structure.** Present to the user:
- Proposed file structure (`__tests__/<command>/...`)
- For each file, the list of test names with the CLI command each will run
- Which tests are non-interactive vs interactive
- Any inherently incomplete flows (abort, unauthenticated)

**Step 3: Get user approval.** Wait for the user to review and revise the plan before writing any test code.

Example plan output:
```
__tests__/init/
  init.test.ts
    - "rejects invalid input with helpful error" (smoke test, no auth)
    - "outputs project info without creating files" (--bare, non-interactive)
  init.studio.test.ts
    describe('non-interactive')
      - "creates studio with clean template" → init -y --template clean ...
      - "generates JavaScript files with --no-typescript" → init -y --no-typescript ...
    describe('interactive')
      - "complete flow produces working studio" → init --template clean ... (interactive)
      - "Ctrl+C aborts cleanly" → init (interactive, send Ctrl+C)
  init.app.test.ts
    - "creates app with app-quickstart template" → init -y --template app-quickstart ...
```

## Core Principles

### 1. Test Complete Flows With Thorough Assertions

Run commands to their final outcome — files created, data written, success message printed. A half-finished flow that kills the session partway gives false confidence. Since each full run is expensive, assert everything meaningful from that single invocation: exit code, stdout messages, generated files, config content.

### 2. Cover Both Execution Modes

Every command should have both interactive and non-interactive tests. Non-interactive tests verify agents and CI automation can use the command fully. Interactive tests verify humans get proper prompts, navigation, and feedback. Both modes must work completely — they serve different audiences.

### Inherently Incomplete Flows

Some tests cannot run to completion by design. These are the only acceptable exceptions to the "complete flows" principle:

- **Abort handling (Ctrl+C):** Tests that verify the CLI exits cleanly when the user cancels. Assert on exit code after sending `sendControl('c')`.
- **Unauthenticated prompts:** Tests that verify login prompts appear when no token is provided. These can't complete because there's no real login flow in tests.

Keep these minimal — one or two per command. Every other test should run to completion.

## Choosing Execution Mode

**Is the behavior driven by user prompts/navigation?**
- **YES** → Does the command support flags that bypass the prompts?
  - **YES** → Write BOTH: non-interactive test with flags AND interactive test with prompts
  - **NO** → Interactive test only (PTY)
- **NO** → Non-interactive test only (spawn)

**Non-interactive (spawn):** Command fully driven by flags/args. Fast, reliable, easy stdout/stderr assertions.

**Interactive (PTY):** Tests the prompt experience — selection navigation, text input, abort handling.

**Both:** Most commands should have both. Non-interactive proves the command works. Interactive proves the UX works.

## Test File Organization

All commands get a folder. Each file contains both interactive and non-interactive tests grouped by `describe` blocks.

**For commands with multiple distinct flows**, split files by user flow or functionality:
```
__tests__/
  init/
    init.studio.test.ts
    init.nextjs.test.ts
    init.bare.test.ts
    init.errors.test.ts
  deploy/
    deploy.app.test.ts
    deploy.studio.test.ts
```

**For simpler commands**, a single test file is enough:
```
__tests__/
  datasets/
    datasets.test.ts
  help/
    help.test.ts
```

**Don't create single-test files.** If a flow only has 1-2 tests (e.g., a smoke test or a simple mode like `--bare`), merge it into the command's base `<command>.test.ts` file rather than giving it a dedicated file.

**Test naming:** Descriptive names only — no numeric IDs. The name should describe the behavior being verified.

```typescript
// GOOD
test('creates TypeScript studio with correct config files', ...)

// BAD
test('2.4 default init creates correct TypeScript project', ...)
```

## Available Tools

- **`runCli()`** — Execute CLI commands. `interactive: true` for PTY, default for spawn. See `helpers/runCli.ts`.
- **`testFixture()`** — Get an isolated copy of a pre-built project fixture (e.g., `'basic-studio'`, `'nextjs-app'`). From `@sanity/cli-test`.
- **`createTmpDir()`** — Create an isolated temp directory with a cleanup function. From `@sanity/cli-test`.
- **Interactive session API** — `waitForText(regex)`, `sendKey('ArrowDown')`, `write('text')`, `sendControl('c')`, `getOutput()`, `waitForExit()`, `kill()`. See `helpers/spawnPty.ts`.

Check `@sanity/cli-test` for shared utilities before creating local helpers. Inline CLI args directly in each test for clarity — avoid abstracting args into helper functions as it obscures what each test actually runs.

## Test Structure Patterns

### Non-Interactive Complete Flow

```typescript
test('creates studio with TypeScript and correct config', async () => {
  const tmp = await createTmpDir()
  try {
    const {error, stdout} = await runCli({
      args: ['init', '-y', '--project', projectId, '--dataset', 'production',
             '--output-path', tmp.path, '--template', 'clean', '--typescript',
             '--package-manager', 'pnpm', '--no-git'],
    })

    if (error) throw error

    expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(true)
    expect(existsSync(`${tmp.path}/package.json`)).toBe(true)
    const config = readFileSync(`${tmp.path}/sanity.cli.ts`, 'utf8')
    expect(config).toContain(projectId)
    expect(stdout).toMatch(/sanity docs|sanity help/i)
  } finally {
    await tmp.cleanup()
  }
})
```

### Interactive Complete Flow

```typescript
test('complete interactive flow produces working studio', async () => {
  const tmp = await createTmpDir()
  try {
    const session = await runCli({
      args: ['init', '--project', projectId, '--dataset', 'production',
             '--output-path', tmp.path, '--template', 'clean',
             '--typescript', '--package-manager', 'pnpm', '--no-git'],
      interactive: true,
    })

    const exitCode = await session.waitForExit(90_000)
    expect(exitCode).toBe(0)

    expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(true)
    const output = session.getOutput()
    expect(output).toMatch(/sanity docs|sanity help/i)
  } finally {
    await tmp.cleanup()
  }
})
```

### Testing Unauthenticated Flows

Auth token is always available. To test unauthenticated behavior, override the env:

```typescript
test('no token triggers login prompt', async () => {
  const session = await runCli({
    args: ['init'],
    env: {SANITY_AUTH_TOKEN: ''},
    interactive: true,
  })

  await session.waitForText(/log in|create.*account/i)
  // ... complete the flow
})
```

## Timeouts

Set timeouts at the `describe` block level. The vitest config provides defaults (`testTimeout: 30_000`). If a group of tests needs more time, set it once:

```typescript
describe('studio creation flows', {timeout: 120_000}, () => {
  test('creates studio with TypeScript', async () => {
    // inherits describe timeout
  })

  test('creates studio with JavaScript', async () => {
    // inherits describe timeout
  })
})
```

## Interactive Test Resilience

Interactive tests must be independent of backend data. API responses change — list order, available items, exact text. Tests should not break when backend data shifts.

```typescript
// BAD: depends on list order from API
session.sendKey('ArrowDown') // assumes "production" is second
session.sendKey('ArrowDown')
session.sendKey('Enter')

// GOOD: use flags to pin known values
args: ['init', '--project', projectId, '--dataset', 'production']

// BAD: asserts on specific dynamic content
expect(output).toContain('My Specific Project Name')

// GOOD: asserts on prompt structure
await session.waitForText(/Select project|Create.*project/i)
```

**Rules:**
- Use regex patterns that match structural prompts, not specific data values
- Don't rely on items being at specific positions in selection lists
- Pin known values with flags rather than navigating to them
- Assert on the *type* of prompt shown, not the *content* of dynamic options

## What Belongs in E2E vs Command Tests

E2e tests validate real commands against real infrastructure with real side effects. They are expensive to run and should focus on proving the full flow works.

**Command tests** (`packages/@sanity/cli/src/commands/__tests__/`) test command handlers with mocked HTTP or client methods. They are fast, isolated, and appropriate for testing the full matrix of input validation, flag parsing, error messages, and edge cases.

| Concern | Where to test |
|---------|---------------|
| Flag validation, argument parsing | Command tests |
| Error messages and exit codes for bad input | Command tests |
| Config file parsing, input sanitization | Command tests |
| Complete command flows with real side effects | E2e tests |
| Files generated, APIs called, prompts displayed | E2e tests |

For error handling in e2e, keep a single smoke test per command that confirms the binary rejects bad input. Test the full matrix of validation rules as command tests.

```typescript
// ONE e2e smoke test for error rejection
test('rejects invalid input with helpful error', async () => {
  const {exitCode, stderr} = await runCli({
    args: ['init', '--reconfigure'],
    env: {SANITY_AUTH_TOKEN: ''},
  })
  expect(exitCode).not.toBe(0)
  expect(stderr.length).toBeGreaterThan(0)
})

// Individual validation rules → command tests in
// packages/@sanity/cli/src/commands/__tests__/
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Fragment tests that kill session halfway | Run to completion, assert on outcome |
| One assertion per CLI invocation | Batch related assertions in one test |
| Hardcoded list positions via arrow keys | Use flags to pin values or type to filter |
| Per-test timeouts | Set timeout on describe block |
| Shared state between tests | Own temp dir per test, `try/finally` cleanup |
| `skipIf(!hasToken)` for unauthed tests | Override with `env: {SANITY_AUTH_TOKEN: ''}` |
| Asserting on dynamic API content | Use structural regex patterns |
| Mutating `process.env` directly | Use `vi.stubEnv()` for env overrides |
| Mocking functions, APIs, or services | Never mock in e2e tests — test real infrastructure |
| Testing flag validation in e2e | One smoke test per command; full validation matrix belongs in command tests |

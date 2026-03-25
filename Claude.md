Read and respect rules and conventions from CONTRIBUTING.md. Additionally:

# Quick Reference

All commands are run from the root of the repo.

- `pnpm test` - run all unit tests
- `pnpm test <test-file>` - run specific test file. Example: `pnpm test packages/@sanity/cli/src/commands/documents/__tests__/get.test.ts`
- `pnpm test --coverage` - run tests with coverage report (output in `coverage/`)
- `pnpm check:types` - TypeScript type checking
- `pnpm check:lint` - ESLint + Prettier
- `pnpm check:deps` - unused dependency / export check
- `pnpm build:cli` - build the project
- `pnpm watch:cli` - build in watch mode

# Workflow

- Be sure to typecheck, lint, build, depcheck and run tests when you are done.
- Testing coverage should be maximized. Prefer running tests with coverage and the goal is to achieve maximum testing coverage for any new code added.

# Testing Rules

## ALWAYS:

1. Default to HTTP mocking with `mockApi()` as your first choice
2. Mock at the highest level possible: HTTP > Client > Action (never Service)
3. Use `vi.hoisted(() => vi.fn())` for client method mocks
4. Clear mocks in `afterEach()` with `vi.clearAllMocks()`
5. Test both success and error scenarios
6. Use `if (error) throw error` in success tests - NOT `expect(error).toBeUndefined()`
7. Assert `expect(error).toBeInstanceOf(Error)` in error tests, along with exit code and message

## NEVER:

1. Never mock service files - always use client or HTTP mocking
2. Never leave mocks active between tests
3. Never use `any` in mock types
4. Never mock without verifying the mock was called

## Quick Reference

**Simple HTTP API test:**

```typescript
mockApi({uri: '/endpoint'}).reply(200, {...})
```

**Client method mocking:**

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

**HTTP with mocked methods:**

```typescript
const testClient = createTestClient({apiVersion: '...', token: '...'})

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      request: testClient.request,
      users: {getById: vi.fn()},
    }),
  }
})

mockApi({uri: '/endpoint'}).reply(200, {...})
```

**Reference**: See `packages/@sanity/cli/src/commands/__tests__/init/init.plan.test.ts` for a complete example.

# Testing

Uses vitest. Suite is very large and slow. Minimize full runs.

**Never pipe test output.** The following are all forbidden:

```bash
pnpm test 2>&1 | tail -3      # discards failures
pnpm test 2>&1 | grep FAIL    # runs full suite just to filter
pnpm test 2>&1 | head -20     # discards the information you need
```

Always read results from the JSON file instead (see "Reading test results" below).

## Running tests

First, compute the output path (derived from cwd, matches `vitest.config.ts`):

```bash
TEST_RESULTS="/tmp/test-results-$(echo -n "$(pwd)" | sha1sum | cut -c1-8).json"
```

Then run one of:

```bash
# Only tests affected by uncommitted changes (preferred starting point)
pnpm test --changed --bail=1

# Scoped to package
pnpm test --filter=@sanity/cli --bail=1

# Single file (when debugging a specific failure)
pnpm test packages/@sanity/cli/src/hooks/commandNotFound/__tests__/topicAliases.test.ts

# Full suite (avoid — only for final validation before committing)
pnpm test --bail=3
```

## Reading test results

After ANY test run, read from `$TEST_RESULTS` — never re-run or grep stdout:

```bash
# Get all failures with error messages (truncated)
jq '[.testResults[] | select(.status == "failed") | {
  file: (.name | split("/") | .[-3:] | join("/")),
  failures: [.assertionResults[] | select(.status == "failed") | {
    test: (.ancestorTitles + [.title] | join(" > ")),
    error: (.failureMessages[0] // "" | .[0:500])
  }]
}]' "$TEST_RESULTS"

# Just the failed file paths (for re-running)
jq -r '.testResults[] | select(.status == "failed") | .name' "$TEST_RESULTS"

# Summary counts
jq '{total: .numTotalTests, passed: .numPassedTests, failed: .numFailedTests, files_failed: .numFailedTestSuites}' "$TEST_RESULTS"
```

## Workflow for fixing test failures

1. Compute `TEST_RESULTS` path (see above)
2. Run `--changed` or scoped with `--bail=1`
3. Read `$TEST_RESULTS` for failure details — do not grep stdout
4. Read the failing test file and relevant source to understand the failure
5. Fix the code
6. Re-run ONLY the previously-failing files
7. Once those pass, run the full affected package: `pnpm test --filter=<pkg>`
8. Full suite only as final validation before committing

# Debugging

- Build before running commands: `pnpm build:cli`
- For faster iteration, use `pnpm watch:cli` in one terminal and run commands in another
- Run single command: `npx sanity <command>`
- Enable debug logs: `DEBUG=sanity:* npx sanity <command>`
- Most commands need to be run within one of the fixture folders.

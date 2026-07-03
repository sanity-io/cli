Read and respect rules and conventions from CONTRIBUTING.md. Additionally:

# Quick Reference

All commands are run from the root of the repo.

- `pnpm test:unit` - run all unit tests - first line of defense, should be run first, takes ~20s on a modern machine
- `pnpm test:coverage` - run unit tests with coverage report output to terminal (and report files to `coverage/`)
- `pnpm test:integration` - run all integration tests - much more expensive, takes ~3 mins on a modern machine, use sparingly or as a final validation check
- `pnpm test` - run all tests
- `pnpm test[:unit|:integration] <test-file>` - run specific test file(s); the arg is a path substring match. Example: `pnpm test documents/__tests__/get`
- `pnpm check:types` - TypeScript type checking
- `pnpm check:lint` - ESLint + Prettier
- `pnpm check:deps` - unused dependency / export check
- `pnpm build:cli` - build the project
- `pnpm watch:cli` - build in watch mode
- `pnpm test:e2e <file>` - run specific e2e test file (args pass through to vitest)
- `pnpm test:e2e <file> -t "<pattern>"` - run specific e2e test by name

# Workflow

- Be sure to typecheck, lint, build, depcheck and run tests when you are done.
- Testing coverage should be maximized. Prefer running tests with coverage and the goal is to achieve maximum unit testing coverage for any new code added.
- When creating pull requests, always follow the template in `.github/PULL_REQUEST_TEMPLATE.md`. Do not use your own format.
- Releasable changes need a changeset, normally auto-generated from the PR's "Notes for release" section (empty uses the PR title; `N/A` skips it). See CONTRIBUTING.md "Automatic Changesets"; a hand-authored `.changeset/` file also works and takes precedence.

# Testing Rules

Follow all instructions and guidance laid out in the Testing Requirements section in `CONTRIBUTING.md`.

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

Next determine whether to run unit tests or integration tests. Start with unit tests as they take less time to complete. Depending on the available resources of the local machine, integration tests may experience failures like test worker deaths from OS signals. Older node versions, like node v22, experience these more frequently than newer versions. Export a `RUNTASK` variable choosing which tests to run:

```bash
RUNTASK="test:unit" # or "test:integration" for integration tests, or simply "test" for all tests
```

Then run one of:

```bash
# Only tests affected by uncommitted changes (preferred starting point)
pnpm $RUNTASK --changed --bail=1

# Scoped to package
pnpm $RUNTASK --project=@sanity/cli --bail=1

# Single file (when debugging a specific failure) — the file arg is a substring
# match against the path, so a unique fragment is enough
pnpm $RUNTASK topicAliases

# Single test within a file: by name (-t, a regex) or by line number (needs full path)
pnpm $RUNTASK topicAliases -t "rewrites \"dataset list\""
pnpm $RUNTASK packages/@sanity/cli/src/hooks/commandNotFound/__tests__/topicAliases.test.ts:23

# Full suite (avoid — only for final validation before committing)
pnpm $RUNTASK --bail=3
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
7. Once those pass, run the full affected package: `pnpm $RUNTASK --project=<pkg>`
8. Full suite only as final validation before committing

# Debugging

- Build before running commands: `pnpm build:cli`
- For faster iteration, use `pnpm watch:cli` in one terminal and run commands in another
- Run single command: `npx sanity <command>`
- Enable debug logs: `DEBUG=sanity:* npx sanity <command>`
- Most commands need to be run within one of the fixture folders.

## Cursor Cloud specific instructions

- The update script runs `pnpm install --frozen-lockfile` and `pnpm build:cli` on startup. Dependencies and build artifacts should already be up to date when a session begins.
- The test results JSON file requires `CLAUDECODE=1` (or `CODEX_CI=1`). Set `export CLAUDECODE=1` before running tests so the `$TEST_RESULTS` / `jq` workflow described above works as expected.
- The full test suite takes ~10 minutes. Prefer scoped runs (`--changed`, `--project`, or single files) during development. Before assuming a test failure is caused by your changes, check whether the same test also fails on `origin/main`.
- CLI commands that hit the Sanity API (e.g. `documents query`, `login`) require authentication. Use fixture directories (e.g. `fixtures/basic-studio`) to run commands like `npx sanity debug`, `npx sanity doctor`, or `npx sanity versions` without authentication.
- `pnpm install` may warn about ignored build scripts for `sharp` and `unrs-resolver`. These are safe to ignore; the `pnpm.onlyBuiltDependencies` allowlist in `package.json` already covers the required native modules (`@swc/core`, `esbuild`, `node-pty`).

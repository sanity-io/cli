# @sanity/cli-e2e

End-to-end tests for the Sanity CLI. These tests pack the CLI to a tarball, install it, and run the resulting binary against real infrastructure (Sanity API, real templates, real npm installs) — verifying that the CLI works for both humans (interactive prompts) and agents/CI (non-interactive flag-driven runs).

For test-writing patterns and conventions (test structure, naming, common mistakes), see the [`writing-cli-e2e-tests` skill](../../../.claude/skills/writing-cli-e2e-tests/SKILL.md). This README covers setup, infrastructure, and how to run/debug the tests.

## Unit vs E2E

Two tiers of tests live in this repo. Pick the right one for what you're verifying:

|                  | Unit (`packages/@sanity/cli/src/commands/__tests__/`) | E2E (this package)                                          |
| ---------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| **Runs against** | Mocked HTTP/client                                    | Real CLI binary, real API                                   |
| **Speed**        | Milliseconds                                          | Seconds (each invocation ~10–60s)                           |
| **Driver**       | `testCommand()`                                       | `runCli()`                                                  |
| **Use for**      | Flag parsing, validation, error messages, edge cases  | Full flows: files generated, APIs called, prompts displayed |

Default to unit tests. Reach for an e2e test when the test only has value if the binary actually runs end-to-end.

## Setup

E2E tests need credentials for a real Sanity project. Copy `.env.example` to `.env` and fill in the values:

```bash
SANITY_E2E_TOKEN=<robot token with read+write on the project>
SANITY_E2E_PROJECT_ID=<project id used for all e2e tests>
SANITY_E2E_ORGANIZATION_ID=<org id that owns the project>
```

`globalSetup.ts` loads `.env` automatically (existing env vars take precedence — CI sets them directly).

## Running tests

All commands run from the repo root.

```bash
# Build + run the full suite
pnpm test:e2e

# Run a single file (args after `test:e2e` are passed through to vitest)
pnpm test:e2e __tests__/init/init.studio.yes.test.ts

# Run a single test by name
pnpm test:e2e __tests__/init/init.studio.yes.test.ts -t "creates studio with default"

# Bail on first failure (faster feedback while iterating)
pnpm test:e2e --bail=1

# Verbose reporter (see each test name as it runs)
pnpm test:e2e --reporter=verbose
```

`pnpm test:e2e` runs `pnpm build:cli` first via the `pretest:e2e` hook.

## How `globalSetup` works

Before any test runs, `globalSetup.ts`:

1. Loads `.env` into `process.env`.
2. Packs `@sanity/cli-core`, `@sanity/cli`, and `create-sanity` into tarballs (via `npm pack`).
3. Installs the tarballs into a temp directory and exposes the resolved binary paths as env vars:
   - `E2E_BINARY_PATH` — path to the packed `sanity` binary
   - `E2E_CREATE_SANITY_BINARY_PATH` — path to the packed `create-sanity` binary
4. Initializes test fixtures via `@sanity/cli-test` (copies `fixtures/*`, installs deps).

After the run, the temp dir and tarballs are cleaned up.

### Skipping the pack step

If `E2E_BINARY_PATH` is already set, `globalSetup` skips the pack and uses the provided binary. The scheduled workflow uses this to run e2e against `sanity@latest` from the npm registry instead of the working tree.

To run against a custom binary locally:

```bash
E2E_BINARY_PATH=/path/to/sanity pnpm test:e2e
```

## The `runCli()` API

All tests drive the CLI through `helpers/runCli.ts`. It has two modes — overload-typed so you get the right return shape:

### Non-interactive (default)

```typescript
const {error, exitCode, stdout, stderr} = await runCli({
  args: ['datasets', 'list', '--project-id', getE2EProjectId()],
})

if (error) throw error
expect(stdout.trim().length).toBeGreaterThan(0)
```

`stdio` is piped (no TTY), so `isInteractive()` returns false in the spawned CLI — any prompt is skipped and falls back to its non-interactive default. If you need to test prompt behavior, use interactive mode.

### Interactive (PTY)

```typescript
const session = await runCli({
  args: ['init', '--project', projectId, '--output-path', tmp.path, '--no-mcp', '--no-git'],
  interactive: true,
})

await session.waitForText(/Select project template/i)
await session.selectOption('clean')

await session.waitForText(/Do you want to use TypeScript/i)
session.sendKey('Enter')

const exitCode = await session.waitForExit(90_000)
expect(exitCode).toBe(0)
```

Interactive sessions speak through `node-pty` and expose:

- `waitForText(regex, {timeout?})` — wait for a pattern in the (ANSI-stripped) output
- `selectOption(pattern, {timeout?})` — navigate a select prompt by text and confirm; throws if zero or multiple options match
- `sendKey('Enter' | 'ArrowDown' | ...)` — send a named key
- `sendControl('c')` — send Ctrl+C (SIGINT, exits with 130)
- `write(text)` — write raw text to stdin (for free-text prompts)
- `getOutput()` — full output buffer so far (with ANSI)
- `waitForExit(timeout?)` — resolve with the exit code, reject on timeout
- `kill(signal?)` — kill the process

Always prefer `selectOption(pattern)` over counting `ArrowDown` presses — option order is not stable across template/dataset/project changes.

### Environment helpers

`helpers/runCli.ts` also exports three helpers that read the credentials `globalSetup` injects, so tests don't have to touch `process.env` directly:

- `getE2EProjectId()` — reads `SANITY_E2E_PROJECT_ID`
- `getE2EOrganizationId()` — reads `SANITY_E2E_ORGANIZATION_ID`
- `getE2EDataset()` — currently hardcoded to `'production'` (see the CI env vars note below)

Each throws with a clear message if the underlying env var is missing, so tests fail loudly instead of passing `undefined` to the CLI.

### Common options

- `args: string[]` — args passed to the CLI binary
- `cwd: string` — working directory (use `testFixture()` or `createTmpDir()` from `@sanity/cli-test`)
- `env: Record<string, string>` — additional env overrides; merged onto a sane default that includes `SANITY_AUTH_TOKEN`, disables update notifier, and points `SANITY_CLI_CONFIG_PATH` at a non-existent path so the CLI can't read your local auth config
- `binaryPath: string` — override the resolved binary (used by `create-sanity` tests, which pass `E2E_CREATE_SANITY_BINARY_PATH`)

To test unauthenticated flows, override the token instead of unsetting it globally:

```typescript
await runCli({args: ['init'], env: {SANITY_AUTH_TOKEN: ''}})
```

## Writing tests

See the [`writing-cli-e2e-tests` skill](../../../.claude/skills/writing-cli-e2e-tests/SKILL.md) for the canonical patterns — it covers test structure, naming, complete-flow assertions, both interactive and non-interactive modes, abort handling, and common mistakes.

A minimal smoke test for reference:

```typescript
import {describe, expect, test} from 'vitest'
import {runCli} from '../helpers/runCli.js'

describe('sanity --help', () => {
  test('prints usage information and exits 0', async () => {
    const {error, stdout} = await runCli({args: ['--help']})
    if (error) throw error
    expect(stdout).toContain('USAGE')
    expect(stdout).toContain('COMMANDS')
  })
})
```

## CI

Two workflows run e2e tests:

- **`.github/workflows/e2e.yml`** — runs on PRs that touch `packages/@sanity/cli*`, `packages/create-sanity`, `fixtures/`, or `pnpm-lock.yaml`, and on every push to `main`. Matrix: Node 20/22/24 × 2 vitest shards. Uses the working-tree CLI (packed by `globalSetup`).
- **`.github/workflows/e2e-scheduled.yml`** — runs hourly (and on manual dispatch) against `sanity@latest` from npm. Catches regressions in the published artifact and posts to Slack on failure.

To trigger the scheduled workflow manually against a specific version, use **Run workflow** on the Actions tab and supply a `cli_version` (e.g. `5.20.0`).

To re-run a failed PR run, click **Re-run failed jobs** on the workflow run. Logs include each test's stdout/stderr; failures from the PTY session also dump the captured output, which is usually enough to diagnose.

### CI environment

Both workflows inject the same `SANITY_E2E_*` env vars from GitHub Actions secrets — there is no `.env` file in CI. Currently injected:

- `SANITY_E2E_TOKEN`
- `SANITY_E2E_PROJECT_ID`
- `SANITY_E2E_ORGANIZATION_ID`
- `SANITY_E2E_DATASET` _(injected but currently unused — `getE2EDataset()` is hardcoded to `production`)_

### Adding a new env var

If a test needs a new credential or configuration value:

1. **Read it via `readEnv()`** in `helpers/runCli.ts` (or a new helper next to it) so the test fails loudly with a clear message when the var is missing, rather than passing `undefined` to the CLI.
2. **Document it in `.env.example`** with an empty value so contributors know it's required for local runs.
3. **Add the secret in GitHub** (Settings → Secrets and variables → Actions) on the `sanity-io/cli` repo. Use a secret unless the value is non-sensitive, in which case use a repo-level Variable.
4. **Wire it into both workflows** under the `Run E2E tests` step's `env:` block:
   - `.github/workflows/e2e.yml`
   - `.github/workflows/e2e-scheduled.yml`

## Debugging

- **Run a single failing test by name** (`-t "<pattern>"`) instead of the full suite — each invocation is several seconds.
- **Use `--reporter=verbose`** to see test names as they run; combine with `--bail=1` to stop on first failure.
- **`session.getOutput()`** returns the full PTY buffer at any point — log it when an interactive test wedges. The default `waitForText` timeout error already includes the current output.
- **Check `tmp/`** in this package — `globalSetup` and some tests write there; inspect generated projects after a failure (rerun with the test name to keep the dir intact, since `afterEach` cleans up tmp dirs created via `createTmpDir`).
- **Enable CLI debug logs** by adding `DEBUG: 'sanity:*'` to the test's `env`. Output appears in `stderr` / `session.getOutput()`.
- **`E2E_BINARY_PATH`** lets you point the suite at a manually built binary (skip pack, faster iteration on infra changes).

## Gotchas

- **Spawn mode skips prompts.** Non-interactive tests run with `stdio: ['ignore', 'pipe', 'pipe']` — no TTY. Any prompt the CLI would show is skipped and falls back to its non-prompt default, which may differ from the prompt's default selection. If the fallback differs from what you want, pass the flag explicitly.
- **`CI=true` blocks interactive mode.** `runCli({interactive: true})` deletes `CI` from the spawned env (GitHub Actions sets it) so the CLI shows prompts instead of throwing `NonInteractiveError`.
- **`SANITY_CLI_CONFIG_PATH`** is pointed at a non-existent path so the CLI can't read your local auth config. Tests authenticate exclusively through `SANITY_AUTH_TOKEN` (sourced from `SANITY_E2E_TOKEN`).
- **Timeouts.** Vitest defaults to `testTimeout: 30_000`, `hookTimeout: 120_000`. Long flows (full `init` with install) need a `describe`-level timeout (e.g. `{timeout: 120_000}`). Set timeouts on `describe`, not per test.
- **No mocking in e2e.** Never mock functions, services, or HTTP. If you find yourself wanting to mock, that test belongs in unit tests, not here.
- **Real side effects.** Tests can publish documents, deploy datasets, and import sample data into the e2e project. Use the dedicated e2e project (not a personal one) and clean up where practical.
- **PTY-only on supported platforms.** `node-pty` requires native bindings; if `pnpm install` skips them, interactive tests fail to spawn. CI matrix is Linux-only for now.
- **Lockfile detection in `init`.** If a test pre-creates a lockfile in `tmp.path`, the CLI will auto-detect that package manager and skip the prompt. Useful for testing detection; surprising if unintentional.

## Package layout

- `__tests__/` — test files. Single-file commands live at the top level (`help.test.ts`); commands with multiple flows get a folder (`init/`), with non-interactive and interactive variants split into separate files for sharding.
- `helpers/` — `runCli.ts` (public API), `spawnProcess.ts` / `spawnPty.ts` (transports), `packCli.ts` (used by `globalSetup`), and small utilities for env/keys/binary resolution.
- `globalSetup.ts` — packs and installs the CLI before any test runs.
- `vitest.config.ts`, `.env.example`, `package.json`.

Shared utilities like `testFixture()` and `createTmpDir()` live in [`@sanity/cli-test`](../cli-test). Reach for those before adding helpers here.

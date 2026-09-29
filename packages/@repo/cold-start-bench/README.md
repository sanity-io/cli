# @repo/cold-start-bench

Measures how long a new user waits, with an empty npm cache, before the CLI prints anything after they type:

- `npx sanity@latest init`
- `npm create sanity@latest`

That wait is mostly npm downloading and installing the dependency tree, then the CLI starting up. It is the number to make smaller.

## Running it

```sh
# Measure the working tree (uncommitted changes included) on its own
pnpm bench:cold-start

# Compare against main: the usual way to judge a change
pnpm bench:cold-start --base main

# Machine-readable summary for scripts and agents
pnpm bench:cold-start --base main --json
```

The first run fills a local npm mirror from npmjs.org and takes several minutes. Later runs reuse it. Each timed run takes 20–60 seconds, and the default is 3 runs per variant and entry point. Refs you compare against are built once in a temporary worktree and cached by commit.

Only one measurement runs at a time per machine. A second one waits for the lock, because parallel runs would share CPU and bandwidth and distort each other's timings.

Exit codes: `0` every check passed, `1` a check failed, `2` the harness itself failed.

## What gets measured

For each run the harness:

1. Creates an empty npm cache, home directory and project directory, and an environment with nothing inherited except `PATH`. That means no CI flags, tokens or npm config, and no Sanity login.
2. Starts the command in a pseudo-terminal, as a user's terminal would.
3. Records when the CLI's first own output appears. npm's spinner and `npm warn` lines are not the CLI and are skipped. This time is the **score**.
4. Records when `Fetching providers...` appears, then kills the process. A logged-out `init` prints this just before its first prompt.
5. Records how many packages were installed and their size, plus how many bytes crossed the simulated network.

The **score** is the weighted sum of the median time to first output for both commands (`bench.config.json` → `entries`).

### Checks

| Check           | Fails when                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `runs`          | A run never printed, or never reached the marker (crash, hang, changed flow)                                 |
| `package-count` | Head installs more packages than base (threshold `packageCountIncrease`)                                     |
| `wire-bytes`    | Head downloads more than base by over `wireBytesIncreasePercent`                                             |
| `first-output`  | Head is slower by more than `timeRegressionMinMs` and more than `timeRegressionSpreads` × the measured noise |
| `marker-gap`    | The time from first output to the marker grew by more than `markerGapIncreaseMs`                             |
| `first-screen`  | Warns (doesn't fail) when the output up to the marker differs from base                                      |

### Why the marker

Only the CLI's startup can be gamed by printing early, for example a `console.log` at the top of `bin/run.js`. The install can't: the CLI's code isn't on disk until npm finishes. Normally the marker follows the first output by about 20 ms. If output moves earlier without the CLI getting lighter, that gap grows and `marker-gap` fails.

## How the environment is controlled

- **Local registry.** Verdaccio mirrors npmjs.org. Once a package's metadata has been fetched it is kept for ten years, so repeated runs resolve the same dependency versions and the score only moves when the code does. Delete the mirror with `--fresh-registry`.
- **Simulated network.** A TCP proxy in front of the registry adds bandwidth limits and latency shared across all of npm's connections (`bench.config.json` → `network`). Without it, downloads over localhost would be nearly free, and downloading is most of what users wait for.
- **Releases, not prereleases.** Each variant is published under a patch number far above anything real, e.g. `@sanity/cli-core@3.8.1000000123`. Third-party ranges such as `@sanity/runtime-cli`'s `^3.7.0` pick up the bench build, and npm dedupes exactly as it would for a real release.
- **One variant visible at a time.** An HTTP filter in front of the registry hides the other variant's versions and makes the active variant `latest`. That's why the commands can be exactly what users type.
- **`sanity` stays pinned.** `sanity` lives in a separate repo. The pinned version (`sanityVersion`) is repacked with its `@sanity/cli` dependency pointing at the build under test. Bump it by hand, deliberately.

## For agents optimizing the score

Run `pnpm bench:cold-start --base <sha you started from> --json`. The JSON has `score` (milliseconds, lower is better), `passed`, the `checks`, and per-command `summaries`. Each summary includes downloaded bytes, installed packages and bytes, and the startup gap. `treeDiffs` lists the largest packages you added or removed. Full per-run data is in the `results.json` the output points to, and every measurement is appended to `node_modules/.cache/cold-start-bench/history.jsonl`.

A change counts only if `passed` is `true` and the unit tests still pass. Moving work until after the marker, or printing before the CLI is ready, doesn't count, and the checks above are there to catch it.

## Limits

- The network profile is a reference point, not any particular user's connection. Real users on slower networks gain more from smaller downloads than this score shows.
- Changes in the `sanity` repo itself (its `bin/sanity`, its dependencies) aren't measured. Only the pinned published `sanity` is wrapped.

# @repo/cold-start-bench

A score for how long a new user waits, with an empty npm cache, before the CLI prints anything after typing `npx sanity@latest init` or `npm create sanity@latest`. Lower is better.

```sh
pnpm bench:cold-start            # one run per command, about 95 seconds
pnpm bench:cold-start --runs 3   # confirm a result before keeping it
```

It prints JSON:

- `score`: milliseconds, the average wait over both commands
- `passed`: `false` if a run failed, or if output was printed long before the CLI was ready (a trick that games the score)
- `entries`: per command, the wait, downloaded bytes, installed packages and their size, and the largest packages

Each measurement is also appended to `node_modules/.cache/cold-start-bench/history.jsonl`.

## How it works

1. Builds and packs the CLI packages from the working tree, and wraps them in the published `sanity@6.17.0` (`SANITY_VERSION` in `src/bench.ts`).
2. Publishes them to a local verdaccio mirror of npmjs.org as ordinary releases, so npm resolves and dedupes the tree exactly as it would for a real release. The first run fills the mirror and takes several minutes; later runs reuse it, so dependency versions stay fixed.
3. Runs each command in a pseudo-terminal with an empty npm cache and home directory, and times the CLI's first own output (npm's spinner and warnings don't count).
4. Adds the download time the fetched bytes and requests would take on a 50 Mbit/s, 40 ms connection. That part doesn't vary between runs.

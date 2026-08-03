# @sanity/workbench-cli

Internal implementation detail of the [Sanity CLI](https://github.com/sanity-io/cli).
It backs the CLI's **unstable** workbench support and is not meant to be installed
or imported directly — its API can change or be removed without notice.

Workbench is opt-in per project via `unstable_defineApp` in `sanity.cli.ts`; use it
through the `sanity` CLI, not this package.

Maintainers: see `ARCHITECTURE.md` (not published) for how this package fits together.

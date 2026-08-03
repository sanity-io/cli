# @sanity/workbench-cli

Workbench is the opt-in path for shipping federated app views and background
services from a Sanity studio or SDK app. This package holds the Workbench
implementation that used to live inside `@sanity/cli-build` and `@sanity/cli`,
behind a deliberately small interface so it can be pulled back out if Workbench
doesn't graduate from `unstable_`.

> Experimental. Everything here is gated behind `unstable_defineApp`. Projects
> that never call it keep the CLI's normal dev/build/deploy behaviour.

## What lives here

- The authoring API — `unstable_defineApp`, `unstable_defineView`,
  `unstable_defineService` and their types.
- The Vite module-federation stack — the `federation` plugin and the
  Sanity-specific plugins it composes (environment, extension artifacts,
  federation runtime), plus the remote render helper and artifact types.

## The interface (the part that has to stay clean)

Core touches Workbench in exactly three places. Removing Workbench means
deleting this package and reverting these three seams — nothing else.

1. **The opt-in signal — a global brand symbol.**
   `unstable_defineApp` stamps `Symbol.for('sanity.workbench.defineApp')` on its
   result. `@sanity/cli-core` discriminates on that symbol in `isWorkbenchApp`
   without importing this package (it re-derives the same global symbol), which
   keeps cli-core — the hot path for every command — free of a Workbench
   dependency. The shared contract is just the symbol string.

2. **The authoring API entry — `@sanity/workbench-cli` (`.`).**
   Browser-safe, zod-only. `@sanity/cli` re-exports it on `sanity/cli`
   (`unstable_defineApp`) and the `sanity` runtime entry (`unstable_defineView` /
   `unstable_defineService`). App authors only ever import the `sanity` path.

3. **The build entry — `@sanity/workbench-cli/vite`.**
   Node-only. `@sanity/cli-build`'s `getViteConfig` swaps in the `federation`
   plugin (and uses the artifact types) when `isWorkbenchApp` is set, instead of
   the normal client plugins.

## Dependency direction

```
@sanity/cli  ──►  @sanity/cli-build  ──►  @sanity/workbench-cli  ──►  @sanity/cli-core
     └──────────────────────────────────────────►──────────────────────┘
```

`@sanity/workbench-cli` depends only on `@sanity/cli-core` (type-only). Nothing
in cli-core depends back on it — the brand symbol is the only thing they share.

## Not yet extracted

The dev-server orchestration (registry/lock, dev registration, the workbench
dev server) and the deploy guards still live in `@sanity/cli`. They depend on
core dev-server internals, so moving them needs a small extension interface on
the `dev`/`deploy` commands rather than a straight file move. Tracked as the
next step.

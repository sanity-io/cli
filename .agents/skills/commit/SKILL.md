---
name: commit
description: Use when creating git commits - enforces conventional commit format with correct type prefixes for release-triggering vs non-release changes
---

# Conventional Commits

## Format

```
<type>[(scope)]: <description>
```

- Type and description are **lowercase**
- No period at end
- Imperative mood: "add" not "added"
- Under 100 characters
- Scope is optional, use package or feature area (e.g., `init`, `deploy`, `cli-core`, `deps`, `ci`)

## Release-Triggering Types

These types generate changesets and trigger npm releases:

| Type             | Bump      | Use for                                                    |
| ---------------- | --------- | ---------------------------------------------------------- |
| `feat`           | minor     | New commands, flags, features                              |
| `fix`            | patch     | Bug fixes, crash fixes, incorrect output                   |
| `perf`           | patch     | Performance improvements                                   |
| `revert`         | patch     | Reverting previous changes                                 |
| `feat!` / `fix!` | **major** | Breaking changes (removed commands, changed flag behavior) |

## Non-Release Types

These do **not** trigger releases or changesets:

| Type       | Use for                                    |
| ---------- | ------------------------------------------ |
| `chore`    | Tooling, build config, dependency updates  |
| `refactor` | Code restructuring without behavior change |
| `test`     | Adding or updating tests                   |
| `docs`     | Documentation only                         |
| `style`    | Formatting, whitespace                     |
| `build`    | Build system changes                       |
| `ci`       | CI/CD pipeline changes                     |

## Decision Guide

- Does it change what users experience? Use `feat` or `fix`
- Does it break existing behavior? Add `!` suffix (e.g., `feat!`)
- Is it internal-only with no user impact? Use `chore`, `refactor`, `test`, etc.
- Dependency updates? Use `chore(deps)` unless fixing a user-facing bug, then `fix(deps)`

## Examples from This Repo

```
feat: auto-generate changesets from PR descriptions
feat(embeddings): add projection validation using groq-js
feat(cli): inject __SANITY_STAGING__ global in staging builds
fix(init): strip filename before counting nested folders in import path
fix(deploy): stop spinner before returning from app lookup
refactor(cli-core): replace oclif ux.colorize with node:util styleText
refactor(cli): migrate from zod to zod/mini for smaller bundle size
chore: skip auto-generated changeset when one already exists
chore(ci): use squiggler-app bot as changeset commit author
chore(deps): update swc-tooling
```

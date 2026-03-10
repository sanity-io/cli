# Semantics-Aware Shared Flags Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add required `semantics: 'override' | 'specify'` to shared flag getters so descriptions and help groups are automatically correct, fix mismatched commands, and migrate `dataset import` to shared flags.

**Architecture:** Modify `SharedFlagOptions` (renamed from `FlagOverrides`) to require a `semantics` field. `'override'` auto-appends " (overrides CLI configuration)" and defaults `helpGroup` to `'OVERRIDE'`. `'specify'` uses description as-is with no default helpGroup. Update all ~40 call sites. Migrate `dataset/import` from custom flags to shared flags with `semantics: 'specify'` and `required: true`.

**Tech Stack:** TypeScript, oclif framework, vitest

---

### Task 1: Update `sharedFlags.ts` — new interface and semantics logic

**Files:**

- Modify: `packages/@sanity/cli/src/util/sharedFlags.ts`

**Step 1: Write the failing test**

Create test file:

- Create: `packages/@sanity/cli/src/util/__tests__/sharedFlags.test.ts`

```typescript
import {describe, expect, test} from 'vitest'

import {getDatasetFlag, getProjectIdFlag} from '../sharedFlags.js'

describe('getProjectIdFlag', () => {
  test('override semantics: appends suffix and sets OVERRIDE helpGroup', () => {
    const flags = getProjectIdFlag({semantics: 'override', description: 'Project ID to query'})
    const flag = flags['project-id']
    expect(flag.description).toBe('Project ID to query (overrides CLI configuration)')
    expect(flag.helpGroup).toBe('OVERRIDE')
  })

  test('override semantics: uses default description when none provided', () => {
    const flags = getProjectIdFlag({semantics: 'override'})
    const flag = flags['project-id']
    expect(flag.description).toBe('Project ID to use (overrides CLI configuration)')
    expect(flag.helpGroup).toBe('OVERRIDE')
  })

  test('override semantics: allows helpGroup override', () => {
    const flags = getProjectIdFlag({semantics: 'override', helpGroup: 'CUSTOM'})
    const flag = flags['project-id']
    expect(flag.description).toContain('(overrides CLI configuration)')
    expect(flag.helpGroup).toBe('CUSTOM')
  })

  test('specify semantics: no suffix, no helpGroup', () => {
    const flags = getProjectIdFlag({semantics: 'specify', description: 'Project ID to import to'})
    const flag = flags['project-id']
    expect(flag.description).toBe('Project ID to import to')
    expect(flag.helpGroup).toBeUndefined()
  })

  test('specify semantics: uses default description when none provided', () => {
    const flags = getProjectIdFlag({semantics: 'specify'})
    const flag = flags['project-id']
    expect(flag.description).toBe('Project ID to use')
    expect(flag.helpGroup).toBeUndefined()
  })

  test('specify semantics: allows helpGroup override', () => {
    const flags = getProjectIdFlag({semantics: 'specify', helpGroup: 'CUSTOM'})
    const flag = flags['project-id']
    expect(flag.description).not.toContain('(overrides CLI configuration)')
    expect(flag.helpGroup).toBe('CUSTOM')
  })

  test('char is always p', () => {
    const flags = getProjectIdFlag({semantics: 'override'})
    expect(flags['project-id'].char).toBe('p')
  })

  test('parse trims and validates non-empty', async () => {
    const flags = getProjectIdFlag({semantics: 'override'})
    const parse = flags['project-id'].parse!
    await expect(parse('  abc  ', {})).resolves.toBe('abc')
    await expect(parse('  ', {})).rejects.toThrow('cannot be empty')
  })
})

describe('getDatasetFlag', () => {
  test('override semantics: appends suffix and sets OVERRIDE helpGroup', () => {
    const flags = getDatasetFlag({semantics: 'override', description: 'Dataset to query'})
    const flag = flags.dataset
    expect(flag.description).toBe('Dataset to query (overrides CLI configuration)')
    expect(flag.helpGroup).toBe('OVERRIDE')
  })

  test('specify semantics: no suffix, no helpGroup', () => {
    const flags = getDatasetFlag({semantics: 'specify', description: 'Dataset to import to'})
    const flag = flags.dataset
    expect(flag.description).toBe('Dataset to import to')
    expect(flag.helpGroup).toBeUndefined()
  })

  test('specify semantics: allows required override', () => {
    const flags = getDatasetFlag({
      semantics: 'specify',
      description: 'Dataset to import to',
      required: true,
    })
    const flag = flags.dataset
    expect(flag.required).toBe(true)
  })

  test('char is always d', () => {
    const flags = getDatasetFlag({semantics: 'override'})
    expect(flags.dataset.char).toBe('d')
  })

  test('parse trims and validates non-empty', async () => {
    const flags = getDatasetFlag({semantics: 'override'})
    const parse = flags.dataset.parse!
    await expect(parse('  staging  ', {})).resolves.toBe('staging')
    await expect(parse('  ', {})).rejects.toThrow('cannot be empty')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test packages/@sanity/cli/src/util/__tests__/sharedFlags.test.ts`
Expected: FAIL — `semantics` property does not exist on `FlagOverrides`

**Step 3: Implement the shared flags changes**

Replace `packages/@sanity/cli/src/util/sharedFlags.ts` with:

```typescript
import {Flags} from '@oclif/core'

/**
 * Controls how the flag relates to CLI configuration:
 *
 * - `'override'` — The command falls back to CLI config (sanity.cli.ts) when the flag is not
 *   provided. The flag description automatically gets an " (overrides CLI configuration)" suffix,
 *   and `helpGroup` defaults to `'OVERRIDE'`.
 *
 * - `'specify'` — The command does NOT fall back to CLI config; the flag is simply how the user
 *   provides the value. No suffix is appended, and no default `helpGroup` is set.
 */
type FlagSemantics = 'override' | 'specify'

/**
 * Options accepted by the shared flag getters.
 * Locked properties (char, parse, name, helpValue) are excluded to ensure
 * consistent behavior across all commands.
 */
interface SharedFlagOptions {
  /**
   * Controls description suffix and default helpGroup.
   * @see {@link FlagSemantics}
   */
  semantics: FlagSemantics

  dependsOn?: string[]
  description?: string
  env?: string
  exclusive?: string[]
  helpGroup?: string
  hidden?: boolean
  required?: boolean
}

const OVERRIDE_SUFFIX = ' (overrides CLI configuration)'

/**
 * Returns a `--project-id` / `-p` flag definition.
 *
 * Locked: flag name (`project-id`), char (`p`), `helpValue` (`<id>`), and parse (trims + validates non-empty).
 */
export function getProjectIdFlag(options: SharedFlagOptions) {
  const {semantics, description: baseDescription, helpGroup, ...rest} = options
  const description =
    (baseDescription ?? 'Project ID to use') + (semantics === 'override' ? OVERRIDE_SUFFIX : '')

  return {
    'project-id': Flags.string({
      description,
      helpGroup: helpGroup ?? (semantics === 'override' ? 'OVERRIDE' : undefined),
      helpValue: '<id>',
      ...rest,
      char: 'p',
      parse: async (input: string) => {
        const trimmed = input.trim()
        if (trimmed === '') {
          throw new Error('`--project-id` cannot be empty if provided')
        }
        return trimmed
      },
    }),
  }
}

/**
 * Returns a `--dataset` / `-d` flag definition.
 *
 * Locked: flag name (`dataset`), char (`d`), `helpValue` (`<name>`), and parse (trims + validates non-empty).
 */
export function getDatasetFlag(options: SharedFlagOptions) {
  const {semantics, description: baseDescription, helpGroup, ...rest} = options
  const description =
    (baseDescription ?? 'Dataset to use') + (semantics === 'override' ? OVERRIDE_SUFFIX : '')

  return {
    dataset: Flags.string({
      description,
      helpGroup: helpGroup ?? (semantics === 'override' ? 'OVERRIDE' : undefined),
      helpValue: '<name>',
      ...rest,
      char: 'd',
      parse: async (input: string) => {
        const trimmed = input.trim()
        if (trimmed === '') {
          throw new Error('`--dataset` cannot be empty if provided')
        }
        return trimmed
      },
    }),
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test packages/@sanity/cli/src/util/__tests__/sharedFlags.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/@sanity/cli/src/util/sharedFlags.ts packages/@sanity/cli/src/util/__tests__/sharedFlags.test.ts
git commit -m "feat(cli): add required semantics option to shared flag getters

Rename FlagOverrides to SharedFlagOptions and require a semantics field
('override' | 'specify'). Override semantics auto-appends the
'(overrides CLI configuration)' suffix and defaults helpGroup to OVERRIDE.
Specify semantics uses the description as-is with no default helpGroup."
```

---

### Task 2: Update all existing command call sites to pass `semantics: 'override'`

This task updates all ~40 existing commands that call `getProjectIdFlag` or `getDatasetFlag` to pass the new required `semantics` field. The vast majority are `'override'`. Also strip the now-redundant "(overrides CLI configuration)" suffix from custom descriptions.

**Files to modify** (all under `packages/@sanity/cli/src/commands/`):

**Commands using both flags (override for both):**

- `documents/get.ts` — both override
- `documents/query.ts` — both override
- `documents/delete.ts` — both override
- `documents/create.ts` — both override
- `graphql/undeploy.ts` — both override

**Commands using both flags (mixed semantics):**

- `graphql/deploy.ts` — dataset is **specify** (overrides workspace API def, not CLI config)
- `documents/validate.ts` — both are **specify** (overrides workspace, not CLI config)
- `schema/delete.ts` — project-id is override, dataset is **specify**

**Commands using project-id only (all override):**

- `backup/disable.ts`, `backup/download.ts`, `backup/enable.ts`, `backup/list.ts`
- `cors/add.ts`, `cors/delete.ts`, `cors/list.ts`
- `dataset/alias/create.ts`, `dataset/alias/delete.ts`, `dataset/alias/link.ts`, `dataset/alias/unlink.ts`
- `dataset/copy.ts`, `dataset/create.ts`, `dataset/delete.ts`, `dataset/export.ts`, `dataset/list.ts`
- `dataset/embeddings/disable.ts`, `dataset/embeddings/enable.ts`, `dataset/embeddings/status.ts`
- `dataset/visibility/get.ts`, `dataset/visibility/set.ts`
- `graphql/list.ts`
- `hook/attempt.ts`, `hook/create.ts`, `hook/delete.ts`, `hook/list.ts`, `hook/logs.ts`
- `media/delete-aspect.ts`, `media/deploy-aspect.ts`, `media/export.ts`, `media/import.ts`
- `tokens/add.ts`, `tokens/delete.ts`, `tokens/list.ts`
- `users/invite.ts`, `users/list.ts`

**Step 1: Update all override commands**

For each command, the change is mechanical:

- Add `semantics: 'override'` to the options object
- Strip " (overrides CLI configuration)" from custom `description` values (the suffix is now auto-appended)
- If only the default description was used (no custom `description`), just add `semantics: 'override'`

Example transformation for `documents/get.ts`:

```typescript
// Before:
...getProjectIdFlag({
  description: 'Project ID to get document from (overrides CLI configuration)',
}),
...getDatasetFlag({description: 'Dataset to get document from (overrides CLI configuration)'}),

// After:
...getProjectIdFlag({
  semantics: 'override',
  description: 'Project ID to get document from',
}),
...getDatasetFlag({semantics: 'override', description: 'Dataset to get document from'}),
```

**Step 2: Update specify commands**

`graphql/deploy.ts`:

```typescript
// Before:
...getDatasetFlag({description: 'Deploy API for the given dataset'}),

// After:
...getDatasetFlag({semantics: 'specify', description: 'Deploy API for the given dataset'}),
```

`documents/validate.ts`:

```typescript
// Before:
...getProjectIdFlag({
  description: 'Override the project ID used. By default, this is derived from the given workspace',
}),
...getDatasetFlag({
  description: 'Override the dataset used. By default, this is derived from the given workspace',
}),

// After:
...getProjectIdFlag({
  semantics: 'specify',
  description: 'Override the project ID used. By default, this is derived from the given workspace',
}),
...getDatasetFlag({
  semantics: 'specify',
  description: 'Override the dataset used. By default, this is derived from the given workspace',
}),
```

`schema/delete.ts`:

```typescript
// Before:
...getProjectIdFlag({
  description: 'Project ID to delete schema from (overrides CLI configuration)',
}),
...getDatasetFlag({
  description: 'Delete schemas from a specific dataset (overrides CLI configuration)',
}),

// After:
...getProjectIdFlag({
  semantics: 'override',
  description: 'Project ID to delete schema from',
}),
...getDatasetFlag({
  semantics: 'specify',
  description: 'Delete schemas from a specific dataset',
}),
```

`graphql/undeploy.ts`:

```typescript
// Before:
...getProjectIdFlag({
  description: 'Project ID to undeploy GraphQL API from (overrides CLI configuration)',
}),
...getDatasetFlag({description: 'Dataset to undeploy GraphQL API from'}),

// After:
...getProjectIdFlag({
  semantics: 'override',
  description: 'Project ID to undeploy GraphQL API from',
}),
...getDatasetFlag({semantics: 'override', description: 'Dataset to undeploy GraphQL API from'}),
```

**Step 3: Run type check to verify all call sites compile**

Run: `pnpm check:types`
Expected: PASS (no type errors from missing `semantics`)

**Step 4: Run full test suite**

Run: `pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/@sanity/cli/src/commands/
git commit -m "refactor(cli): add semantics to all shared flag call sites

Update all ~40 commands to pass the required semantics option.
Most use 'override' (falls back to CLI config). Commands where flags
don't override CLI config use 'specify':
- graphql/deploy (dataset overrides workspace API def)
- documents/validate (both override workspace, not CLI config)
- schema/delete (dataset targets specific workspace datasets)"
```

---

### Task 3: Migrate `dataset/import` to shared flags

**Files:**

- Modify: `packages/@sanity/cli/src/commands/dataset/import.ts`
- Modify: `packages/@sanity/cli/src/commands/dataset/__tests__/import.test.ts`

**Step 1: Update import command to use shared flags**

In `import.ts`, replace custom `project` and `dataset` flags with shared flags:

```typescript
// Add import:
import {getDatasetFlag, getProjectIdFlag} from '../../util/sharedFlags.js'

// Replace the custom project/dataset flags in static override flags:
// Remove:
//   dataset: Flags.string({char: 'd', description: 'Dataset to import to', required: true}),
//   project: Flags.string({char: 'p', description: 'Project ID to import to', required: true}),
// Add:
//   ...getProjectIdFlag({semantics: 'specify', description: 'Project ID to import to', required: true}),
//   ...getDatasetFlag({semantics: 'specify', description: 'Dataset to import to', required: true}),
//   project: Flags.string({
//     char: undefined as unknown as never, // remove -p shorthand for deprecated flag
//     deprecated: {to: 'project-id'},
//     description: 'Project ID to import to',
//     hidden: true,
//   }),
```

In `run()`, update destructuring:

```typescript
// Before:
// project: projectId,
// After:
// 'project-id': projectIdFlag,

// Add deprecated flag resolution:
// const projectId = projectIdFlag ?? flags.project
```

**Step 2: Update tests to use `--project-id`**

Update `BASE_FLAGS` and individual test calls to use `--project-id` instead of `--project`.
Add a test that verifies `--project` still works (deprecated alias).

**Step 3: Run tests**

Run: `pnpm test packages/@sanity/cli/src/commands/dataset/__tests__/import.test.ts`
Expected: PASS

**Step 4: Run full validation**

Run: `pnpm check:types && pnpm check:lint && pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/@sanity/cli/src/commands/dataset/import.ts packages/@sanity/cli/src/commands/dataset/__tests__/import.test.ts
git commit -m "refactor(cli): migrate dataset import to shared flags

Replace custom --project/--dataset flags with shared flag getters using
semantics: 'specify' (no CLI config fallback, required: true).
Add deprecated --project flag for backwards compatibility.
The import command intentionally does not fall back to CLI config —
users should always explicitly specify where to import."
```

---

### Task 4: Final validation

**Step 1: Run full check suite**

Run: `pnpm check:types && pnpm check:lint && pnpm check:deps && pnpm build:cli && pnpm test`
Expected: ALL PASS

**Step 2: Verify help output for representative commands**

Build and spot-check help text for a few commands to confirm descriptions render correctly:

- An override command: `npx sanity documents get --help`
- A specify command: `npx sanity dataset import --help`
- A mixed command: `npx sanity schema delete --help`

**Step 3: Fix any issues found**

Address any lint, type, or test failures from the full suite.

## Usability Study: `sanity projects create` vs. Other CLI Commands

### Commands Compared

| Command           | Type                     | Complexity                              |
| :---------------- | :----------------------- | :-------------------------------------- |
| `projects create` | Create (global resource) | High \- org selection, optional dataset |
| `dataset create`  | Create (project-scoped)  | Medium \- visibility, embeddings        |
| `cors add`        | Create (project-scoped)  | Medium \- security confirmations        |
| `users invite`    | Create (project-scoped)  | Medium \- role selection                |
| `dataset delete`  | Delete (project-scoped)  | Low \- confirmation only                |

---

### 1\. Project Context Resolution \- Inconsistency

Most commands need a project ID. They resolve it consistently:

```
dataset create:  this.getProjectId({ fallback: () => promptForProject(...) })
cors add:        this.getProjectId({ fallback: () => promptForProject(...) })
users invite:    this.getProjectId({ fallback: () => promptForProject(...) })
dataset delete:  this.getProjectId({ fallback: () => promptForProject(...) })
```

`projects create` doesn't need one (it's creating the project), so this is fine. But it introduces its _own_ context problem: **organization resolution**. The `getOrganization()` action is a 6-file mini-framework (`getOrganization.ts`, `getOrganizationChoices.ts`, `getOrganizationsWithAttachGrantInfo.ts`, `hasProjectAttachGrant.ts`, `findOrganizationByUserName.ts`, `validateOrganizationName.ts`). This is the most complex resolution flow in the entire CLI. For a user who just wants to create a project, being forced through org selection/creation can feel heavy.

**Finding:** The org selection UX is considerably more elaborate than project selection for other commands. Other commands use a single reusable prompter; `projects create` uses a bespoke 6-module pipeline.

---

### 2\. Unattended/CI Mode (`--yes`)

| Command           | Flag      | Behavior                                                                        |
| :---------------- | :-------- | :------------------------------------------------------------------------------ |
| `projects create` | `--yes`   | Uses defaults: name="My Sanity Project", first org with permissions, no dataset |
| `dataset create`  | (none)    | No `--yes` flag at all \- relies on `isUnattended()`                            |
| `cors add`        | (none)    | No `--yes` flag \- origin is required arg, credentials can be flagged           |
| `users invite`    | (none)    | No `--yes` flag \- email \+ role can be passed as args/flags                    |
| `dataset delete`  | `--force` | Skips type-to-confirm                                                           |

**Finding:** `projects create` is the only "create" command with `--yes`. Other commands achieve non-interactivity by accepting all required values as flags/args. This is a UX win for `projects create` since it has many optional sub-steps (org, dataset, visibility), but also means the defaults matter a lot. Creating a project named "My Sanity Project" in CI feels like a footgun \- it's indistinguishable from an accidental run.

**Suggestion:** Consider requiring `projectName` arg when `--yes` is used, or at least warning when the default name is used in CI.

---

### 3\. Flag Design Patterns

**`projects create`** uses custom one-off flags:

```ts
dataset: Flags.string({ parse: async (input) => { ... validate ... } })
'dataset-visibility': Flags.string({ options: ['private', 'public'] })
organization: Flags.string({ helpValue: '<slug|id>' })
yes: Flags.boolean({ char: 'y' })
json: Flags.boolean()
```

**Other commands** use the shared flag system:

```ts
...getProjectIdFlag({ semantics: 'override', description: '...' })
visibility: Flags.string({ options: ALLOWED_ACL_MODES })
```

**Findings:**

- `projects create` doesn't use `getProjectIdFlag` (correct \- it creates the project), but also doesn't use any shared flag utilities. Each flag is hand-rolled.
- The `--dataset` flag does double duty: it's both a boolean signal ("create a dataset") and a string value ("with this name"). The flag description says "Create a dataset" but you pass a name. Compare `--embeddings` on `dataset create` which is a clean boolean.
- `--dataset-visibility` only makes sense with `--dataset`, but there's no `dependsOn` relationship declared (unlike `dataset create`'s `embeddings-projection` which correctly depends on `embeddings`).

---

### 4\. Inline Prompting vs. Dedicated Prompters

| Command           | Prompts                                                                    | Where defined                                    |
| :---------------- | :------------------------------------------------------------------------- | :----------------------------------------------- |
| `projects create` | Project name, org selection, dataset confirm, default config, dataset name | Mix of dedicated prompters \+ inline `confirm()` |
| `dataset create`  | Dataset name                                                               | Dedicated prompter (`promptForDatasetName`)      |
| `cors add`        | Wildcard confirm, credentials confirm                                      | Inline private methods on command class          |
| `users invite`    | Email, role                                                                | Inline private methods on command class          |
| `dataset delete`  | Type-to-confirm                                                            | Inline in `run()`                                |

**Finding:** `projects create` uses the most prompts (up to 5 in a single run). The prompting flow is split between:

- Reusable prompters in `src/prompts/` (`promptForProjectName`, `promptForDatasetName`, `promptForDefaultConfig`)
- An action that does its own prompting (`getOrganization` calls `select()` and `input()`)
- Inline `confirm()` in the command itself

`cors add` keeps its prompts as private methods on the command class \- self-contained and easy to follow. `users invite` does the same. This is arguably cleaner for command-specific prompts.

---

### 5\. Error Handling Strategy

**`projects create`** has a unique "partial success" pattern:

```ts
// Project creation failure = hard error
spin.fail()
this.error(`Failed to create project: ${error}`, {exit: 1})

// Dataset creation failure = warning, project still created
this.warn(`Project created but dataset creation failed: ${error}`)
```

No other command does this. Other commands are all-or-nothing:

- `dataset create`: `this.error(...)` on any failure
- `cors add`: `this.error(...)` on any failure
- `users invite`: `this.error(...)` on any failure

**Finding:** The partial-success pattern is good UX for `projects create` \- you don't want to lose a successfully created project because dataset creation failed. But it could be clearer. The warning goes to stderr while the success output goes to stdout. If using `--json`, the JSON output includes the project but gives no indication that dataset creation failed.

**Suggestion:** In `--json` mode, include a `warnings` array or `dataset: null` with an error field so programmatic consumers know something went wrong.

---

### 6\. Success Output

**`projects create`** (text mode):

```
Project created successfully!
ID: abc123
Name: My Project
Organization: Personal
Dataset: production (public)

Manage your project: https://www.sanity.io/manage/project/abc123
```

**`projects create`** (JSON mode):

```json
{"displayName": "My Project", "projectId": "abc123"}
```

**Other commands:**

- `dataset create`: "Dataset created successfully" (via action spinner)
- `cors add`: "CORS origin added successfully"
- `users invite`: "Invitation sent to [user@example.com](mailto:user@example.com)"
- `dataset delete`: "Dataset deleted successfully"

**Findings:**

- `projects create` is the most informative success output \- it includes the ID, name, org, dataset, and a manage URL. This is great.
- The JSON output is surprisingly sparse \- only `displayName` and `projectId`. It doesn't include the organization, dataset info, or manage URL. Compare this to the text output which includes all of them.
- No other "create" command offers `--json` output, so there's no precedent to follow. But if someone is scripting with `--json`, they probably need the project ID (included) and possibly the dataset name (missing).
- The manage URL in text output is a nice touch that no other command provides.

---

### 7\. Spinner Usage

| Command           | Spinners                                                        |
| :---------------- | :-------------------------------------------------------------- |
| `projects create` | "Creating project" (in command), "Creating dataset" (in action) |
| `dataset create`  | "Creating dataset" (in action layer)                            |
| `cors add`        | None                                                            |
| `users invite`    | None                                                            |

**Finding:** `projects create` uses spinners for the API calls, which is good for longer operations. But the spinners live at different layers \- one in the command, one in the action. `cors add` and `users invite` don't use spinners at all, even though the API calls take similar time. Inconsistent.

---

### 8\. The Dataset Sub-flow Problem

The biggest UX question for `projects create` is whether it should offer dataset creation at all. The flow is:

1. Name your project
2. Pick/create an organization
3. (Project created)
4. "Would you like to create a dataset?"
5. "Use default config?"
6. (If no) "Name your dataset"
7. (If private available) "Public or private?"

That's up to 7 interaction points. Compare `dataset create` which is just:

1. Name your dataset
2. (If private available) "Public or private?"

**Finding:** `projects create` bundles two distinct operations. The `--dataset` flag is the escape hatch for CI, but in interactive mode you're walked through a mini-wizard. This is reasonable for onboarding ("just created a project, probably need a dataset"), but it means `projects create` is doing two jobs. The `promptForDefaultConfig` prompt in particular is odd \- it asks about "default dataset configuration" and then just means "name it production" vs "pick a name."

---

### Summary of Key Findings

1. **Org resolution is over-engineered** relative to how other commands handle context \- 6 action files vs 1 shared prompter for project selection.

2. **`--yes` defaults are risky** \- creating "My Sanity Project" silently in CI is a footgun. Other commands avoid this by requiring values as flags.

3. **`--dataset` flag is overloaded** \- acts as both trigger and value. Missing `dependsOn` for `--dataset-visibility`.

4. **JSON output is incomplete** \- text output shows org, dataset, and manage URL; JSON output only shows name and ID.

5. **Partial-success pattern is good** but invisible in `--json` mode.

6. **Most interactive command in the CLI** \- up to 7 prompts. Could be simplified by not bundling dataset creation.

7. **Spinners are inconsistent** across commands \- some use them, some don't.

8. **Manage URL in success output** is a nice UX pattern other commands could adopt.

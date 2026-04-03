# Post-release E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a CLI release is published to npm, automatically trigger E2E tests against the npm-installed binary and notify Slack on failure.

**Architecture:** Add `workflow_dispatch` trigger to `e2e.yml` with `cli_version`/`cli_package` inputs. When provided, the workflow installs from npm instead of building, sets `E2E_BINARY_PATH`, and the existing `globalSetup` skips the pack step. The release workflow's `post-release` job triggers this via `gh workflow run`.

**Tech Stack:** GitHub Actions workflows (YAML), `slackapi/slack-github-action`, `gh` CLI

**Spec:** `docs/superpowers/specs/2026-04-02-post-release-e2e-design.md`

---

## File Map

| File                            | Action | Responsibility                                                                                             |
| ------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| `.github/workflows/e2e.yml`     | Modify | Add `workflow_dispatch` trigger, conditional build/install, path filter bypass, Slack notification         |
| `.github/workflows/release.yml` | Modify | Expose `publishedPackages` output, add E2E trigger step in `post-release`, add `actions: write` permission |

---

### Task 1: Add `workflow_dispatch` trigger to `e2e.yml`

**Files:**

- Modify: `.github/workflows/e2e.yml:3-7`

- [ ] **Step 1: Add the `workflow_dispatch` trigger with inputs**

In `.github/workflows/e2e.yml`, replace the `on:` block (lines 3-7):

```yaml
on:
  pull_request:
  push:
    branches:
      - main
```

with:

```yaml
on:
  pull_request:
  push:
    branches:
      - main
  workflow_dispatch:
    inputs:
      cli_version:
        description: 'npm version/tag to test (e.g., latest, 3.82.0)'
        required: true
        default: 'latest'
      cli_package:
        description: 'Package to install (e.g., @sanity/cli, sanity)'
        required: false
        default: '@sanity/cli'
```

- [ ] **Step 2: Verify YAML syntax**

Run:

```bash
npx yaml-lint .github/workflows/e2e.yml || echo "Install: npx yaml-lint"
```

Expected: No syntax errors.

---

### Task 2: Add conditional build-or-install steps to `e2e.yml`

**Files:**

- Modify: `.github/workflows/e2e.yml:58-59`

- [ ] **Step 1: Replace the "Build CLI" step with conditional build/install**

In `.github/workflows/e2e.yml`, replace the existing step (lines 58-59):

```yaml
- name: Build CLI
  run: pnpm build:cli
```

with:

```yaml
- name: Build CLI (pack mode)
  if: ${{ !inputs.cli_version }}
  run: pnpm build:cli

- name: Install CLI from npm (registry mode)
  if: ${{ inputs.cli_version }}
  run: |
    INSTALL_DIR=$(mktemp -d)
    PACKAGE="${{ inputs.cli_package || '@sanity/cli' }}"
    npm install --prefix "$INSTALL_DIR" "${PACKAGE}@${{ inputs.cli_version }}"
    echo "E2E_BINARY_PATH=$INSTALL_DIR/node_modules/.bin/sanity" >> $GITHUB_ENV
    "$INSTALL_DIR/node_modules/.bin/sanity" --version
```

**Why two steps instead of one with `if/else`:** GitHub Actions doesn't support `if/else` within a single step. Conditional steps are the standard pattern.

**How `E2E_BINARY_PATH` works:** Writing to `$GITHUB_ENV` makes the variable available to all subsequent steps. The `globalSetup.ts` checks for this variable at the start — if set, it skips the `pnpm pack` + install step and uses the provided binary directly.

---

### Task 3: Skip path filtering in registry mode

**Files:**

- Modify: `.github/workflows/e2e.yml:20`

- [ ] **Step 1: Update the `should_run` output to include `workflow_dispatch`**

In `.github/workflows/e2e.yml`, replace line 20:

```yaml
should_run: ${{ github.event_name == 'push' || steps.filter.outputs.cli == 'true' }}
```

with:

```yaml
should_run: ${{ github.event_name == 'push' || github.event_name == 'workflow_dispatch' || steps.filter.outputs.cli == 'true' }}
```

**Why:** The `changes` job uses `dorny/paths-filter` to skip E2E when CLI files haven't changed. In registry mode (`workflow_dispatch`), there are no file changes — we always want to run.

---

### Task 4: Add Slack notification on failure to `e2e.yml`

**Files:**

- Modify: `.github/workflows/e2e.yml` (after the "Run E2E tests" step)

- [ ] **Step 1: Add Slack notification step after "Run E2E tests"**

In `.github/workflows/e2e.yml`, add the following step after the "Run E2E tests" step (after the current line 66):

```yaml
- name: Notify Slack on failure
  if: ${{ failure() && inputs.cli_version }}
  uses: slackapi/slack-github-action@v2.1.0
  with:
    webhook: ${{ secrets.SLACK_E2E_WEBHOOK_URL }}
    webhook-type: incoming-webhook
    payload: |
      {
        "text": "Post-release E2E failed for ${{ inputs.cli_package || '@sanity/cli' }}@${{ inputs.cli_version }}",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": ":red_circle: *Post-release E2E failed*\n*Package:* `${{ inputs.cli_package || '@sanity/cli' }}@${{ inputs.cli_version }}`\n*Node:* ${{ matrix.node-version }}\n*Run:* <${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View logs>"
            }
          }
        ]
      }
```

**Why `failure() && inputs.cli_version`:** Only notify when (a) the job failed and (b) it was triggered via `workflow_dispatch` with a version. PR failures are visible in PR checks — no need to spam Slack.

- [ ] **Step 2: Commit e2e.yml changes**

```bash
git add .github/workflows/e2e.yml
git commit -m "feat(ci): add workflow_dispatch trigger and Slack notification to E2E workflow

Add registry mode support to e2e.yml:
- workflow_dispatch trigger with cli_version and cli_package inputs
- Conditional build (pack mode) vs npm install (registry mode)
- Skip path filtering for workflow_dispatch events
- Slack notification on failure in registry mode

Sets E2E_BINARY_PATH when installing from npm, which globalSetup
respects by skipping the pack step."
```

---

### Task 5: Wire `release.yml` — expose `publishedPackages` output

**Files:**

- Modify: `.github/workflows/release.yml:21-22`

- [ ] **Step 1: Add `publishedPackages` to release job outputs**

In `.github/workflows/release.yml`, replace lines 21-22:

```yaml
outputs:
  published: ${{ steps.changesets.outputs.published }}
```

with:

```yaml
outputs:
  published: ${{ steps.changesets.outputs.published }}
  publishedPackages: ${{ steps.changesets.outputs.publishedPackages }}
```

The `changesets/action` already produces this output — it just wasn't wired to the job level.

---

### Task 6: Wire `release.yml` — add `actions: write` permission and E2E trigger step

**Files:**

- Modify: `.github/workflows/release.yml:12-15` (permissions)
- Modify: `.github/workflows/release.yml:92-106` (post-release job)

- [ ] **Step 1: Add `actions: write` permission**

In `.github/workflows/release.yml`, replace the permissions block (lines 12-15):

```yaml
permissions:
  contents: write # for version bump commits and tags
  pull-requests: write # for creating Version Packages PR
  id-token: write # to enable use of OIDC for npm provenance
```

with:

```yaml
permissions:
  actions: write # for gh workflow run in post-release
  contents: write # for version bump commits and tags
  pull-requests: write # for creating Version Packages PR
  id-token: write # to enable use of OIDC for npm provenance
```

- [ ] **Step 2: Add E2E trigger step to `post-release` job**

In `.github/workflows/release.yml`, add the following step at the end of the `post-release` job (after line 106):

```yaml
- name: Trigger post-release E2E tests
  env:
    GH_TOKEN: ${{ github.token }}
    PUBLISHED_PACKAGES: ${{ needs.release.outputs.publishedPackages }}
  run: |
    CLI_VERSION=$(echo "$PUBLISHED_PACKAGES" | jq -r '.[] | select(.name == "@sanity/cli") | .version')
    if [ -n "$CLI_VERSION" ]; then
      echo "Triggering E2E tests for @sanity/cli@$CLI_VERSION"
      gh workflow run e2e.yml -f cli_version="$CLI_VERSION"
    else
      echo "No @sanity/cli in published packages, skipping E2E"
    fi
```

**How it works:** `publishedPackages` is a JSON array like `[{"name":"@sanity/cli","version":"6.4.0"},...]`. The `jq` command extracts the version for `@sanity/cli`. If the release didn't include `@sanity/cli` (e.g., only `create-sanity` was bumped), it skips the trigger.

- [ ] **Step 3: Commit release.yml changes**

```bash
git add .github/workflows/release.yml
git commit -m "feat(ci): trigger E2E tests after CLI release

Wire release.yml to trigger e2e.yml via workflow_dispatch after
publishing @sanity/cli to npm. Extracts the CLI version from
changesets publishedPackages output and passes it as cli_version.

Adds actions:write permission for gh workflow run."
```

---

### Task 7: Final validation

- [ ] **Step 1: Validate both workflow files have valid YAML**

```bash
npx yaml-lint .github/workflows/e2e.yml .github/workflows/release.yml
```

Expected: No errors.

- [ ] **Step 2: Review the final state of e2e.yml**

Read `.github/workflows/e2e.yml` and verify:

- `on:` block has `pull_request`, `push`, and `workflow_dispatch` triggers
- `workflow_dispatch` has `cli_version` (required) and `cli_package` (optional) inputs
- `should_run` output includes `workflow_dispatch` event
- "Build CLI (pack mode)" step has `if: ${{ !inputs.cli_version }}`
- "Install CLI from npm (registry mode)" step has `if: ${{ inputs.cli_version }}`
- Slack notification step has `if: ${{ failure() && inputs.cli_version }}`

- [ ] **Step 3: Review the final state of release.yml**

Read `.github/workflows/release.yml` and verify:

- `permissions:` includes `actions: write`
- `release` job `outputs:` includes `publishedPackages`
- `post-release` job has "Trigger post-release E2E tests" step
- The `jq` command filters for `@sanity/cli` and extracts `version`
- `gh workflow run` passes `cli_version` to `e2e.yml`

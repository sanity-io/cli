# Post-release E2E: Run tests against npm-published CLI

**Linear issue:** [SDK-1203](https://linear.app/sanity/issue/SDK-1203/post-release-e2e-run-tests-against-npm-published-cli)
**Depends on:** SDK-1194 (E2E_BINARY_PATH env var mechanism) — implemented
**Date:** 2026-04-02

## Goal

After a CLI release is published to npm, verify the package actually works when installed from the registry. This catches issues that only surface in a real `npm install` — dependency resolution failures, missing files in the published tarball, postinstall script problems, and transitive version conflicts.

## Design

### Approach

The release workflow's existing `post-release` job triggers the E2E workflow via `gh workflow run` (fire-and-forget). The E2E workflow handles failure notification via Slack. This keeps the release workflow simple and avoids blocking the release on E2E results.

### 1. `e2e.yml` — New `workflow_dispatch` trigger

Add a `workflow_dispatch` trigger with two inputs:

- `cli_version` (required, default: `latest`) — the npm version or dist-tag to test
- `cli_package` (optional, default: `@sanity/cli`) — the package to install, allowing both `@sanity/cli` and `sanity`

```yaml
on:
  pull_request:
  push:
    branches: [main]
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

### 2. `e2e.yml` — Conditional build-or-install

Replace the single "Build CLI" step with a conditional:

- **Pack mode** (PR/push, no `cli_version`): runs `pnpm build:cli` as today, `globalSetup` packs and sets `E2E_BINARY_PATH`
- **Registry mode** (`cli_version` provided): installs the specified version from npm into a temp directory, sets `E2E_BINARY_PATH`, `globalSetup` sees it's already set and skips the pack step

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

### 3. `e2e.yml` — Skip path filtering in registry mode

The `changes` job uses `dorny/paths-filter` and only runs E2E when CLI files change. In registry mode there are no file changes, so always run:

```yaml
should_run: ${{ github.event_name == 'push' || github.event_name == 'workflow_dispatch' || steps.filter.outputs.cli == 'true' }}
```

### 4. `e2e.yml` — Slack notification on failure

Notify a Slack channel when E2E tests fail in registry mode. Only fires for `workflow_dispatch` runs (not PR failures, which are visible in PR checks).

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

Requires `SLACK_E2E_WEBHOOK_URL` secret to be configured separately.

### 5. `release.yml` — Wire into post-release

Two changes:

**a) Expose `publishedPackages` as a job output:**

```yaml
release:
  outputs:
    published: ${{ steps.changesets.outputs.published }}
    publishedPackages: ${{ steps.changesets.outputs.publishedPackages }}
```

**b) Add E2E trigger step in `post-release`:**

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

Only triggers when `@sanity/cli` is in the published set (not every release includes it).

**c) Add `actions: write` permission** to the workflow-level permissions (required for `gh workflow run`):

```yaml
permissions:
  contents: write
  pull-requests: write
  id-token: write
  actions: write # for gh workflow run in post-release
```

## Files to modify

| File                            | Change                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/e2e.yml`     | Add `workflow_dispatch` trigger with `cli_version` + `cli_package` inputs, conditional build-or-install step, skip path filtering in registry mode, Slack notification on failure |
| `.github/workflows/release.yml` | Add `publishedPackages` to release job outputs, add E2E trigger step in `post-release`                                                                                            |

## Acceptance criteria

- [ ] `e2e.yml` accepts `cli_version` and `cli_package` inputs via `workflow_dispatch`
- [ ] When `cli_version` is provided: skips `pnpm build:cli`, installs from npm, sets `E2E_BINARY_PATH`
- [ ] When `cli_version` is NOT provided (PR/push): behaves exactly as today (build + pack mode)
- [ ] `globalSetup` correctly skips pack when `E2E_BINARY_PATH` is pre-set
- [ ] Manual dispatch works: can trigger from GitHub Actions UI with a version/tag
- [ ] Path filtering is skipped in registry mode
- [ ] Slack notification fires on E2E failure in registry mode only
- [ ] Release workflow triggers E2E after publish when `@sanity/cli` is in published set
- [ ] Release workflow skips E2E trigger when `@sanity/cli` is not in published set
- [ ] `--version` output matches the installed version

## Verification

```bash
# Manual trigger via GitHub CLI
gh workflow run e2e.yml -f cli_version=latest
gh workflow run e2e.yml -f cli_version=6.3.1
gh workflow run e2e.yml -f cli_version=latest -f cli_package=sanity

# Or via Actions UI: Actions > E2E Tests > Run workflow > enter version
```

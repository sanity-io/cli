# TODO: Fix Claude CI Workflow

Changes needed in `.github/workflows/claude.yml` to allow Claude's commits to trigger GitHub Actions workflows.

## 1. Fix malformed git email (line 35)

`git config user.email` expects only an email address, not a `"Name <email>"` formatted string.

**Current (wrong):**
```yaml
git config --global user.email "squiggler[bot] <squiggler[bot]@users.noreply.github.com>"
```

**Fix:**
```yaml
git config --global user.email "squiggler[bot]@users.noreply.github.com"
```

## 2. Use a non-GITHUB_TOKEN for push authentication

Setting `user.name`/`user.email` in git config only controls commit metadata — it does **not** change which token authenticates the push.

GitHub suppresses Actions workflow triggers for pushes authenticated with `GITHUB_TOKEN`, regardless of the committer identity recorded in the commit.

To make Claude's commits trigger Actions workflows, the push must be authenticated with a different token.

### Options

#### Option A: GitHub App token (recommended)

Generate a short-lived token from a GitHub App and pass it to the action via `github_token`:

```yaml
- name: Generate GitHub App token
  id: app-token
  uses: actions/create-github-app-token@v1
  with:
    app-id: ${{ secrets.APP_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}

- name: Run Claude Code
  uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    github_token: ${{ steps.app-token.outputs.token }}
```

> Requires: creating a GitHub App, installing it on the repo, and storing `APP_ID` and `APP_PRIVATE_KEY` as repository secrets.

#### Option B: Personal Access Token (PAT)

Use a PAT (fine-grained or classic) with `repo` and `workflow` scopes:

```yaml
- name: Run Claude Code
  uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    github_token: ${{ secrets.PAT_TOKEN }}
```

> Requires: creating a PAT and storing it as a repository secret named `PAT_TOKEN`.

### References

- [claude-code-action FAQ](https://github.com/anthropics/claude-code-action/blob/main/docs/faq.md)
- [GitHub docs: triggering a workflow from a workflow](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow#triggering-a-workflow-from-a-workflow)

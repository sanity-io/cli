Review the changes and identify only issues that need fixing. If no PR context is provided, get the diff with:
```
git diff main...HEAD  # committed changes on this branch
git diff --cached     # staged but not yet committed
```

For each issue found:
- State the problem in 1-2 sentences
- Provide the fix or recommendation
- Include line numbers when relevant

Skip:
- Compliments or positive observations
- General assessments
- Explanations of what the code does

Focus on:
- Bugs or logic errors
- Security vulnerabilities
- Performance problems
- Missing error handling
- Inadequate test coverage
- Code matches the existing codebase
- Ensure any new dependency installed is truly necessary or could be accomplished with existing dependencies

## Changeset check

Verify the PR includes an appropriate changeset (`.changeset/*.md` file, excluding README.md):
- If the PR changes code in `packages/` that affects runtime behavior, a changeset is **required**. Flag if missing.
- If the PR is docs-only, CI config, tests-only, or refactoring with no public API/behavior change, a changeset is **not needed**. Flag if one is unnecessarily included.
- If a changeset is present, review it:
  - The bump type (major/minor/patch) should match the scope of the change
  - The summary should follow Sanity product copy conventions (use the `product-copy` skill for guidance): one concise sentence describing the user-facing change for a developer audience. No marketing voice, no "successfully", no exclamation marks, no implementation details, no PR numbers.
  - Flag if the summary is too long, too vague, or describes internals rather than the effect

Keep the entire review short and concise. Be direct and actionable.

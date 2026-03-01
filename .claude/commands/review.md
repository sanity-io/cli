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

Keep the entire review short and concise. Be direct and actionable.

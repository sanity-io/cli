# Important Notes

- This repo is for migration of old CLI to new CLI. The code you will change will always be in `packages/@sanity/cli` code in `packages/@sanity/original-cli` is only for reference.
- When migrating logic from `original-cli` to the new CLI, instead of creating a new file and duplicating the code - first use `git mv` to move it, then `git commit -m 'refactor: migrate … from original CLI` in order to maintain as much history as we can.
- The new CLI is using oclif framework. Docs are here https://oclif.io/docs/api_reference

# Bash Commands

- pnpm test - runs unit tests
- pnpm test --coverage - runs unit tests that genereates coverage reports at the root in `coverage` folder
- pnpm check:types - checks typescript types
- pnpm check:lint - checks for formatting and eslint issues.
- pnpm depcheck - Checks for any extra depedency, files or unessary exports

# Code style

- Use ES modules (import/export) syntax instead of CommonJS (require)
- Use named exports and avoid default exports
- Tests are written using vitest
- Avoid using `any` type. If you need to use it, then use `unknown` type and then cast it to the type you need.

# Workflow

- Be sure to typecheck, lint, depcheck and run tests when you are done.
- Testing coverage should be maximized. Prefer running tests with coverage and the goal is to achive maximum testing coverage for any new code added.

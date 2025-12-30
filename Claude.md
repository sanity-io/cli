# Important Notes

- This repo is for migration of old CLI to new CLI. The code you will change will always be in `packages/@sanity/cli` code in `packages/@sanity/original-cli` is only for reference.
- When migrating logic from `original-cli` to the new CLI, instead of creating a new file and duplicating the code - first use `git mv` to move it, then `git commit -m 'refactor: migrate … from original CLI` in order to maintain as much history as we can.
- The new CLI is using oclif framework. Docs are here https://oclif.io/docs/api_reference

# Architecture

## Repository Structure

- **`@sanity/cli`**: Main CLI package containing all commands
- **`@sanity/cli-core`**: Base command class and shared utilities
  - Contains `SanityCommand` that all commands extend
  - Provides helper methods for API clients, logging, and error handling
  - Can be extended by external CLI modules
- **`@sanity/cli-test`**: Testing utilities for CLI commands
- **`@sanity/original-cli`**: Legacy CLI code moved from the monorepo (reference only)

## New CLI Structure

- **Commands** (`commands/`): Parse CLI args/flags and orchestrate flow. Keep thin - delegate to actions and services.
- **Actions** (`actions/`): Business logic and validation. Should take options objects, not CLI flags.
- **Services** (`services/`): API client wrappers. Abstract Sanity API requests from actions.
- **Prompters** (`prompts/`): Reusable interactive prompts (select org/project/dataset, etc.).

# Bash Commands

All these commands are run from the root of the repo.

- pnpm test - runs all the unit tests
- pnpm test <test-file> - run tests for specific CLI package. Example: `pnpm  test packages/@sanity/cli/src/commands/documents/__tests__/get.test.ts`
- pnpm test --coverage - runs unit tests that generates coverage reports at the root in `coverage` folder
- pnpm check:types - checks typescript types
- pnpm check:lint - checks for formatting and eslint issues.
- pnpm depcheck - Checks for any extra dependency, files or unnecessary exports
- pnpm build:cli - builds the project
- pnpm watch:cli - builds the project in watch mode (rebuilds on changes)

# Code style

- Use ES modules (import/export) syntax instead of CommonJS (require)
- Use named exports and avoid default exports
- Always include `.js` extension in imports (TypeScript compiles to JS)
- Tests are written using vitest
- Avoid using `any` type. If you need to use it, then use `unknown` type and then cast it to the type you need.
- Use `satisfies` operator for flag definitions: `static override flags = {...} satisfies FlagInput`
- Always prefer async/await over promise chains

# Common Patterns

- Command files: `src/commands/<command-name>.ts`
- Class name for the command should follow the following rule:
  - If it is root command, it should be `FeatureCommand` (e.g., `LoginCommand`)
  - If the command is a subcommand, it should be `ActionFeatureCommand` (e.g., `ListDatasetCommand`, `GetDocumentCommand`)
- Test files should be located in `__tests__` folder relative to the file. Example: `src/commands/__tests__/<command-name>.test.ts`
- When migrating commands, check for existing utilities in `src/utils/` and `@sanity/cli-core`
- Always add tests for new commands with vitest
- Use `testCommand` helper from `@sanity/cli-test` for testing commands
- Always clear mocks in `afterEach()`: `vi.clearAllMocks()`
- Use `vi.mocked()` for type-safe mocking
- Commands should extend `SanityCommand` from `@sanity/cli-core`
- Use `subdebug('namespace:command')` for debug logging

# Debugging

- To run any command first you have to build the project using `pnpm build:cli`
- For faster iteration, use `pnpm watch:cli` in one terminal and run commands in another
- Run single command: `npx sanity <command>`
- Enable debug logs: `DEBUG=sanity:* npx sanity <command>`
- Most if not all commands need to be run within one of the examples folders.

# Workflow

- Be sure to typecheck, lint, build, depcheck and run tests when you are done.
- Testing coverage should be maximized. Prefer running tests with coverage and the goal is to achieve maximum testing coverage for any new code added.

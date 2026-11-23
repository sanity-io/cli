# Sanity CLI

## About This Repository

This repository contains the Sanity CLI, built with the [oclif framework](https://oclif.io).

The CLI provides:

- Project initialization and management
- Dataset operations and backups
- Schema deployment and validation
- Development server and deployment tools
- GraphQL API management

For the Sanity Studio and related tools, see the [sanity monorepo](https://github.com/sanity-io/sanity).

## Blueprint profiles

Save a profile once, then select it from any directory.

```sh
sanity blueprints profiles set preview --project abc123 --dataset preview
SANITY_BLUEPRINT_PROFILE=preview sanity datasets list
```

Add `--organization`, `--stack`, or `--path` when you want the profile to identify an organization, a Stack, or a local Blueprint manifest. Profiles are saved in `~/.config/sanity/blueprints/` or `~/.config/sanity-staging/blueprints/` for staging. Run `sanity debug` with the profile selected to see the active target.

For CI or a one-off command, set `SANITY_CLI_MODE=blueprints` and supply the target flags or process environment variables. Blueprint mode gets its targets from flags, then environment variables, then the selected profile. Studio commands that build or serve a local project use the project-pinned CLI. Set `SANITY_CLI_MODE=legacy` to run those commands while a profile is selected.

## Technical implementation

We're trying out oclif as the CLI framework. It implements a lot of common CLI patterns, and means we can reuse a lot of the existing code.

New commands can be added by cd'ing into `packages/@sanity/cli` and running `npx oclif generate command <command-name>`. This will create a new command in the `src/commands` folder. You can also just copy one of the existing commands - they have some minor improvements to TypeScript.

You _may_ have to run `pnpm build:cli` (`pnpm watch:cli` is also available) to build the CLI after adding a new command.

In development mode, all the command modules will be "loaded" (eg imported) in order to get their help description etc. At build time (pre-publish), a manifest file will be generated containing the available commands. This will be used by the CLI to determine which commands are available, and prevent loading commands that are not to be run (functionality provided by oclif, not specific to Sanity CLI).

## Local Development

To run the CLI in development mode, you can run `pnpm run watch` in the `packages/@sanity/cli` folder or `pnpm watch:cli` in the root of the repo.

This will watch for changes in the `src` folder and rebuild the CLI on every change running it from the `dist` folder.

To test the specific commands you can navigate to `fixtures` and run `npx sanity <command>`. Since everything is watching for changes no need to rebuild when trying new commands.

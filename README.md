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

## Technical implementation

We're trying out oclif as the CLI framework. It implements a lot of common CLI patterns, and means we can reuse a lot of the existing code.

New commands can be added by cd'ing into `packages/@sanity/cli` and running `npx oclif generate command <command-name>`. This will create a new command in the `src/commands` folder. You can also just copy one of the existing commands - they have some minor improvements to TypeScript.

You _may_ have to run `npm run build` (`npm run watch` is also available) to build the CLI after adding a new command.

In development mode, all the command modules will be "loaded" (eg imported) in order to get their help description etc. At build time (pre-publish), a manifest file will be generated containing the available commands. This will be used by the CLI to determine which commands are available, and prevent loading commands that are not to be run (functionality provided by oclif, not specific to Sanity CLI).

## Local Development

To run the CLI in development mode, you can run `pnpm run watch` in the `packages/@sanity/cli` folder or `pnpm watch:cli` in the root of the repo.

This will watch for changes in the `src` folder and rebuild the CLI on every change running it from the `dist` folder.

To test the specific commands you can navigate to `fixtures` and run `npx sanity <command>`. Since everything is watching for changes no need to rebuild when trying new commands.

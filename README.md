# Sanity CLI

> [!CAUTION]
> This is _not_ the source code for the currently published `@sanity/cli` and related modules! Read below!

## Background

We're rewriting the Sanity CLI and CLI-related modules for a blueprints-first world. It should support both the new and the old world (studio-based projects). It will also provide a significantly improved developer experience.

The current state is very much WIP - see migration progress below.

The currently published `@sanity/cli` source code lives in the [sanity monorepo](https://github.com/sanity-io/sanity/tree/next/packages/%40sanity/cli) and is spread across the `@sanity/cli` and `sanity` modules for legacy reasons. The intention is for the `@sanity/cli` module to house everything CLI related going forward.

## Technical implementation

We're trying out oclif as the CLI framework. It implements a lot of common CLI patterns, and means we can reuse a lot of the existing code.

New commands can be added by cd'ing into `packages/@sanity/cli` and running `npx oclif generate command <command-name>`. This will create a new command in the `src/commands` folder. You can also just copy one of the existing commands - they have some minor improvements to TypeScript.

You _may_ have to run `npm run build` (`npm run watch` is also available) to build the CLI after adding a new command.

In development mode, all the command modules will be "loaded" (eg imported) in order to get their help description etc. At build time (pre-publish), a manifest file will be generated containing the available commands. This will be used by the CLI to determine which commands are available, and prevent loading commands that are not to be run (functionality provided by oclif, not specific to Sanity CLI).

## Local Development

To run the CLI in development mode, you can run `pnpm run watch` in the `packages/@sanity/cli` folder or `pnpm watch:cli` in the root of the repo.

This will watch for changes in the `src` folder and rebuild the CLI on every change running it from the `dist` folder.

To test the specific commands you can navigate to `examples` and run `npx sanity <command>`. Since everything is watching for changes no need to rebuild when trying new commands.

## Migration progress

| Ported? | Command   |
| ------- | --------- |
| ❌      | backup    |
| ❌      | build     |
| ❌      | codemod   |
| ❌      | cors      |
| ❌      | dataset   |
| ✅      | debug     |
| ❌      | deploy    |
| ✅      | dev       |
| ✅      | docs      |
| ❌      | documents |
| ✅      | exec      |
| ❌      | graphql   |
| ✅      | help      |
| ❌      | hook      |
| ❌      | init      |
| ✅      | install   |
| ✅      | learn     |
| ✅      | login     |
| ✅      | logout    |
| ✅      | manage    |
| ❌      | manifest  |
| ❌      | migration |
| ❌      | preview   |
| ✅      | projects  |
| ❌      | schema    |
| ❌      | start     |
| ✅      | telemetry |
| ✅      | tokens    |
| ❌      | typegen   |
| ❌      | undeploy  |
| ❌      | users     |
| ✅      | versions  |

# @sanity/cli-core

Groups of helper functions for the Sanity CLI and related tooling.

# API

Instead of importing from the main `@sanity/cli-core` barrel (which pulls in the full dependency graph, including `jsdom`), import from the more granular export sub-paths.

> **Note:** The root `@sanity/cli-core` export is kept for backwards compatibility for now. Do not add new exports there; use the appropriate sub-path instead.

## `@sanity/cli-core/apiClient`

Authenticated Sanity API client factories.

| Export                         | Description                                    |
| ------------------------------ | ---------------------------------------------- |
| `getGlobalCliClient(options)`  | Create an unscoped (global) Sanity API client. |
| `getProjectCliClient(options)` | Create a project-scoped Sanity API client.     |
| `GlobalCliClientOptions`       | Options type for `getGlobalCliClient`.         |
| `ProjectCliClientOptions`      | Options type for `getProjectCliClient`.        |

## `@sanity/cli-core/browser`

Browser environment mock. Note this depends on `jsdom` (~46 MB) and so has non-trivial performance implications.

| Export                     | Description                                    |
| -------------------------- | ---------------------------------------------- |
| `mockBrowserEnvironment()` | Set up a mocked browser environment via JSDOM. |

## `@sanity/cli-core/config`

CLI, studio, and workspace configuration helpers.

| Export                            | Description                                                       |
| --------------------------------- | ----------------------------------------------------------------- |
| `getCliConfig(workDir)`           | Read and cache the CLI config for a project.                      |
| `getCliConfigUncached(workDir)`   | Read the CLI config without caching.                              |
| `getCliConfigSync(workDir)`       | Synchronously read the CLI config.                                |
| `getCliToken()`                   | Get the stored CLI authentication token.                          |
| `clearCliTokenCache()`            | Clear the cached CLI token.                                       |
| `getCliUserConfig()`              | Read the full CLI user config from disk.                          |
| `getUserConfig()`                 | Get a `ConfigStore` instance for the CLI user config.             |
| `setCliUserConfig(key, value)`    | Write a value to the CLI user config.                             |
| `findProjectRoot(cwd)`            | Resolve the nearest project root directory.                       |
| `findProjectRootSync(cwd)`        | Synchronously resolve the nearest project root.                   |
| `getStudioConfig(options)`        | Load the studio configuration.                                    |
| `getStudioWorkspaces(options)`    | Resolve the list of studio workspaces.                            |
| `isStudioConfig(config)`          | Type-guard for studio config objects.                             |
| `findStudioConfigPath(cwd)`       | Find the studio config file path.                                 |
| `tryFindStudioConfigPath(cwd)`    | Find the studio config file path, returning `null` if not found.  |
| `findPathForFiles(cwd, files)`    | Find the directory containing any of the given config file names. |
| `isWorkbenchApp(config)`          | Type-guard for workbench app configs.                             |
| `parseWorkbenchCliConfig(config)` | Parse a workbench CLI config object.                              |
| `getSanityConfigDir()`            | Get the path to the global Sanity config directory.               |
| `getSanityDataDir()`              | Get the path to the global Sanity data directory.                 |
| `getSanityEnvVar(name)`           | Read a `SANITY_*` environment variable.                           |
| `getSanityUrl(path?)`             | Build a `sanity.io` URL.                                          |
| `getWorkspace(options)`           | Resolve a specific workspace from the studio config.              |

## `@sanity/cli-core/debug`

Namespaced `debug` logger.

| Export                | Description                                                     |
| --------------------- | --------------------------------------------------------------- |
| `debug`               | `debug` instance scoped to `sanity:cli`.                        |
| `subdebug(namespace)` | Create a child `debug` instance under `sanity:cli:<namespace>`. |

## `@sanity/cli-core/errors`

Typed CLI error classes.

| Export                            | Description                                             |
| --------------------------------- | ------------------------------------------------------- |
| `NonInteractiveError`             | Thrown when a command requires an interactive terminal. |
| `NotFoundError`                   | Thrown for 404-type resource-not-found situations.      |
| `isNotFoundError(err)`            | Type-guard for `NotFoundError`.                         |
| `ProjectRootNotFoundError`        | Thrown when no project root can be resolved.            |
| `isProjectRootNotFoundError(err)` | Type-guard for `ProjectRootNotFoundError`.              |

## `@sanity/cli-core/package-manager`

Package manager detection and utilities.

| Export                                | Description                                                            |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `getRunningPackageManager()`          | Detect which package manager is currently running.                     |
| `getBinCommand(pkg, args?)`           | Get the correct bin invocation command for the active package manager. |
| `getYarnMajorVersion()`               | Get the major version of the installed Yarn.                           |
| `readPackageJson(dir)`                | Read and parse a `package.json` file.                                  |
| `resolveLocalPackage(name)`           | Resolve the path to a locally installed package.                       |
| `resolveLocalPackageFrom(name, from)` | Resolve a local package relative to a given directory.                 |
| `resolveLocalPackagePath(name)`       | Resolve only the package root path.                                    |
| `getLocalPackageDir(name)`            | Get the directory of a locally installed package.                      |
| `getLocalPackageVersion(name)`        | Get the version of a locally installed package.                        |
| `DetectedPackageManager`              | Union type of supported package manager identifiers.                   |
| `PackageJson`                         | Type representing a parsed `package.json`.                             |
| `ReadPackageJsonOptions`              | Options type for `readPackageJson`.                                    |

## `@sanity/cli-core/request`

HTTP request utilities built on [`get-it`](https://github.com/sanity-io/get-it).

| Export                                                                                                                                  | Description                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `createRequester(middleware?)`                                                                                                          | Create a configured `get-it` requester instance.                  |
| `Requester`                                                                                                                             | `get-it` `Requester` type.                                        |
| `MiddlewareOptions`                                                                                                                     | Options type for `createRequester`.                               |
| `agent`, `base`, `injectResponse`, `jsonRequest`, `jsonResponse`, `keepAlive`, `observable`, `progress`, `proxy`, `retry`, `urlEncoded` | Optional `get-it` middleware for use alongside `createRequester`. |

## `@sanity/cli-core/schemas`

Zod schemas for CLI configuration and app manifests.

| Export                  | Description                                |
| ----------------------- | ------------------------------------------ |
| `cliConfigSchema`       | Zod schema for the CLI config file.        |
| `coreAppManifestSchema` | Zod schema for core app manifests.         |
| `studioManifestSchema`  | Zod schema for studio manifests.           |
| `CoreAppManifest`       | Inferred type for `coreAppManifestSchema`. |
| `StudioManifest`        | Inferred type for `studioManifestSchema`.  |

## `@sanity/cli-core/tasks`

Worker-based task runners.

| Export                   | Description                                  |
| ------------------------ | -------------------------------------------- |
| `studioWorkerTask(task)` | Run a task in the studio worker.             |
| `createStudioWorker()`   | Create a studio worker instance.             |
| `tsxWorkerTask(task)`    | Run a TypeScript task via `tsx` in a worker. |

## `@sanity/cli-core/telemetry`

Telemetry store and reporting helpers.

| Export                     | Description                                                 |
| -------------------------- | ----------------------------------------------------------- |
| `getCliTelemetry()`        | Get the active CLI telemetry store.                         |
| `setCliTelemetry(store)`   | Set the active CLI telemetry store.                         |
| `clearCliTelemetry()`      | Reset the active CLI telemetry store.                       |
| `reportCliTraceError(err)` | Record an error in the active CLI trace.                    |
| `getTelemetryBaseInfo()`   | Collect base telemetry properties (OS, Node version, etc.). |
| `noopLogger`               | A no-op telemetry logger for use in tests.                  |
| `CLI_TELEMETRY_SYMBOL`     | Symbol used as the key for the telemetry store.             |

## `@sanity/cli-core/types`

TypeScript types only — no runtime code.

| Export                    | Description                                                  |
| ------------------------- | ------------------------------------------------------------ |
| `CliConfig`               | Shape of the `sanity.cli.ts` / `sanity.cli.js` config file.  |
| `TypeGenConfig`           | Config options for type generation.                          |
| `UserViteConfig`          | User-supplied Vite config type.                              |
| `ApplicationType`         | Union of supported Sanity application types.                 |
| `ProjectRootResult`       | Return type of `findProjectRoot`.                            |
| `SanityCommandInterface`  | Interface for `SanityCommand` (useful for mocking).          |
| `CLITelemetryStore`       | Telemetry store interface.                                   |
| `ConsentInformation`      | Telemetry consent data type.                                 |
| `TelemetryUserProperties` | Telemetry user properties type.                              |
| `Output`                  | Object type for CLI output helpers (`log`, `warn`, `error`). |
| `RequireProps`            | Utility type to make specific keys required.                 |
| `SanityOrgUser`           | Shape of a Sanity organization user.                         |
| `PackageJson`             | Parsed `package.json` type.                                  |
| `ReadPackageJsonOptions`  | Options for `readPackageJson`.                               |
| `CoreAppManifest`         | Core app manifest type.                                      |
| `StudioManifest`          | Studio manifest type.                                        |

## `@sanity/cli-core/util`

Pure, zero-dependency utility functions related to module importing, paths and path resolution, environment detection and other miscellaneous tools.

| Export                          | Description                                                            |
| ------------------------------- | ---------------------------------------------------------------------- |
| `doImport(specifier)`           | Dynamically import a module.                                           |
| `importModule(specifier, root)` | Import a module resolved relative to a project root.                   |
| `getSanityConfigDir()`          | Get the global Sanity config directory.                                |
| `getSanityDataDir()`            | Get the global Sanity data directory.                                  |
| `getSanityEnvVar(name)`         | Read a `SANITY_*` environment variable.                                |
| `getSanityUrl(path?)`           | Build a `sanity.io` URL.                                               |
| `getWorkspace(options)`         | Resolve a workspace from the studio config.                            |
| `isCi()`                        | Detect whether running in a CI environment.                            |
| `isInteractive()`               | Detect whether the terminal is interactive.                            |
| `isStaging()`                   | Detect whether running against the staging API.                        |
| `isTrueish(value)`              | Return `true` for common truthy string values (`"1"`, `"true"`, etc.). |
| `normalizePath(path)`           | Normalize a file path to use forward slashes.                          |
| `safeStructuredClone(value)`    | `structuredClone` with a fallback for environments that lack it.       |

## `@sanity/cli-core/ux`

Terminal UI utilities: prompts, spinners, boxes, and more.

| Export                                                                                                               | Description                                                    |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `select`, `input`, `confirm`, `checkbox`, `password`, `number`, `search`, `editor`, `expand`, `rawlist`, `Separator` | Interactive prompt helpers from `@inquirer/prompts`.           |
| `spinner(options?)`                                                                                                  | Create a terminal spinner.                                     |
| `spinnerPromise(promise, options)`                                                                                   | Wrap a promise with a spinner.                                 |
| `Spinner`, `SpinnerInstance`, `SpinnerOptions`, `SpinnerPromiseOptions`                                              | Spinner types.                                                 |
| `boxen(text, options?)`                                                                                              | Render text inside a terminal box.                             |
| `BoxenOptions`, `Boxes`, `CustomBorderStyle`, `Spacing`                                                              | `boxen` types.                                                 |
| `colorizeJson(value)`                                                                                                | Pretty-print and colorize a JSON value for terminal output.    |
| `logSymbols`                                                                                                         | Colored Unicode symbols: `✔` `✖` `⚠` `ℹ`.                      |
| `getTimer()`                                                                                                         | Create a high-resolution timer.                                |
| `NonInteractiveError`                                                                                                | Error thrown when a prompt runs in a non-interactive terminal. |

## `@sanity/cli-core/SanityCommand`

Base class for building Sanity CLI commands (wraps [oclif](https://oclif.io/)).

| Export                   | Description                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `SanityCommand`          | Abstract base `Command` class with Sanity-specific helpers (`getCliConfig`, `getProjectId`, `getProjectRoot`, `isUnattended`, `output`, etc.). |
| `SanityCommandInterface` | Interface for `SanityCommand`, useful for creating mock implementations in tests.                                                              |

## `@sanity/cli-core/ExitCodes`

Standard exit codes for CLI commands.

| Export                    | Description                                               |
| ------------------------- | --------------------------------------------------------- |
| `exitCodes.SUCCESS`       | `0` — command completed normally.                         |
| `exitCodes.RUNTIME_ERROR` | `1` — something went wrong (API errors, network, config). |
| `exitCodes.USAGE_ERROR`   | `2` — user provided invalid input.                        |
| `exitCodes.USER_ABORT`    | `3` — user declined a confirmation.                       |
| `exitCodes.SIGINT`        | `130` — user interrupted via Ctrl+C (128 + SIGINT).       |

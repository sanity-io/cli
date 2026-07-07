# @sanity/workbench-cli

## [1.2.0](https://github.com/sanity-io/cli/compare/workbench-cli-v1.1.3...workbench-cli-v1.2.0)

_2026-07-07_

### Features

- **workbench:** persist a media library's installation config on `sanity deploy` ([#1441](https://github.com/sanity-io/cli/pull/1441)) ([4cf600f](https://github.com/sanity-io/cli/commit/4cf600ff0bb862146831d0a37f6de0d3195bf412))
- **workbench:** move the typed `isWorkbenchApp` to `@sanity/workbench-cli`, derived from the schema so it can't drift. `@sanity/cli-core` keeps a boolean `isWorkbenchApp` for compatibility. ([#1429](https://github.com/sanity-io/cli/pull/1429)) ([263bbf9](https://github.com/sanity-io/cli/commit/263bbf917da5de55c65f4b4a7d3215d87ed87b49))
- **workbench:** stamp the app's bus identity into its bundle ([#1438](https://github.com/sanity-io/cli/pull/1438)) ([9c7b6cb](https://github.com/sanity-io/cli/commit/9c7b6cb8ae5859a378e2af3c70731cc6a8cefc91))
- **workbench:** add `unstable_defineMediaLibrary` ([#1423](https://github.com/sanity-io/cli/pull/1423)) ([2c7c00c](https://github.com/sanity-io/cli/commit/2c7c00c5f1d0136b95b085db840764a07612f345))

  Declare the Sanity Media Library as a workbench app and define its installation config.

### Bug Fixes

- **deploy:** restructure core app deploy and extract shared deploy checks ([#1406](https://github.com/sanity-io/cli/pull/1406)) ([a414fca](https://github.com/sanity-io/cli/commit/a414fcaf4937e12ab468a40e9c02cac943c9e1d6))
- **workbench:** thread views/services as one `exposes` bundle through the ([#1424](https://github.com/sanity-io/cli/pull/1424)) ([bebd59b](https://github.com/sanity-io/cli/commit/bebd59b0002c52355efa41eea473b1e02b8b930c))
  build/dev plumbing, so adding a declaration family no longer touches every hop

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 2.2.0

## [1.1.3](https://github.com/sanity-io/cli/compare/workbench-cli-v1.1.2...workbench-cli-v1.1.3)

_2026-07-01_

### Bug Fixes

- **deps:** unpin vite and bump to ^8.1.2 ([#1410](https://github.com/sanity-io/cli/pull/1410)) ([3801bd7](https://github.com/sanity-io/cli/commit/3801bd7ebc4aacf7f3e196b4dd73991f8a24d6b7))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 2.1.3

## [1.1.2](https://github.com/sanity-io/cli/compare/workbench-cli-v1.1.1...workbench-cli-v1.1.2)

_2026-06-30_

### Bug Fixes

- **deps:** pin vite to 8.1.0 to avoid broken 8.1.1 studio builds ([#1408](https://github.com/sanity-io/cli/pull/1408)) ([596baa7](https://github.com/sanity-io/cli/commit/596baa753d6479f2ca30318ca299aff3a0ad2aa8))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 2.1.2

## [1.1.1](https://github.com/sanity-io/cli/compare/workbench-cli-v1.1.0...workbench-cli-v1.1.1)

_2026-06-29_

### Bug Fixes

- **workbench:** move workbench related code into workbench-cli package ([#1384](https://github.com/sanity-io/cli/pull/1384)) ([85605dd](https://github.com/sanity-io/cli/commit/85605dd4832a967d364900926a46b0b5d02602f5))
- **workbench:** upgrade @module-federation/vite to 1.16.11 ([#1389](https://github.com/sanity-io/cli/pull/1389)) ([12c2867](https://github.com/sanity-io/cli/commit/12c286773832f80fbecde60f1d5481fb041f92c5))
- **workbench:** claim lock when developing workbench remote ([#1387](https://github.com/sanity-io/cli/pull/1387)) ([cb80a56](https://github.com/sanity-io/cli/commit/cb80a56b86d385ae2e0d57d0cfe10b7a993d8ee7))
- **workbench:** claim lock when developing workbench remote ([#1387](https://github.com/sanity-io/cli/pull/1387)) ([cb80a56](https://github.com/sanity-io/cli/commit/cb80a56b86d385ae2e0d57d0cfe10b7a993d8ee7))

## [1.1.0](https://github.com/sanity-io/cli/releases/tag/workbench-cli-v1.1.0)

_2026-06-22_

### Features

- add workbench under unstable flags ([#907](https://github.com/sanity-io/cli/pull/907)) ([a2deacf](https://github.com/sanity-io/cli/commit/a2deacf2ed71783bb34927aca9d2b9b41c2f0f3d))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 2.1.0

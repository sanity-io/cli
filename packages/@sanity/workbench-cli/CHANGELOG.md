# @sanity/workbench-cli

## [1.6.0](https://github.com/sanity-io/cli/compare/workbench-cli-v1.5.0...workbench-cli-v1.6.0)

_2026-07-20_

### Features

- **workbench:** make `slug` required ([#1564](https://github.com/sanity-io/cli/pull/1564)) ([e5c9360](https://github.com/sanity-io/cli/commit/e5c93600265b9da1407b59eddf79d54103771b92))

### Bug Fixes

- **workbench:** deploy icons for workbench apps and studios ([#1518](https://github.com/sanity-io/cli/pull/1518)) ([20d9ff2](https://github.com/sanity-io/cli/commit/20d9ff2a8c774532e64877e79080350dc7ec1fda))
- **deps:** update dependency @module-federation/vite to v1.18.1 ([#1563](https://github.com/sanity-io/cli/pull/1563)) ([3061bfa](https://github.com/sanity-io/cli/commit/3061bfa6c18b6ff2411c295ac2630438b5f3208f))
- **workbench:** sync app title on redeploy ([#1520](https://github.com/sanity-io/cli/pull/1520)) ([a4a9907](https://github.com/sanity-io/cli/commit/a4a9907b15f9ee9e62dcc3f1379d850208494461))
- **workbench:** pre-bundle interface deps in the dev server ([#1557](https://github.com/sanity-io/cli/pull/1557)) ([3522ae7](https://github.com/sanity-io/cli/commit/3522ae7cf4bbd475a2a9d84a300b471bc58870cb))
- **workbench:** serve built apps with `sanity start` ([#1547](https://github.com/sanity-io/cli/pull/1547)) ([6012a04](https://github.com/sanity-io/cli/commit/6012a049f3db217f7a286d681bbeac5cba495aca))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 2.5.1

## [1.5.0](https://github.com/sanity-io/cli/compare/workbench-cli-v1.4.0...workbench-cli-v1.5.0)

_2026-07-17_

### Features

- declare application visibility from the CLI config ([#1541](https://github.com/sanity-io/cli/pull/1541)) ([cc06484](https://github.com/sanity-io/cli/commit/cc06484481b6586c40320836b311ea1395119c47))

### Bug Fixes

- **workbench:** align interface records with brett's shape ([#1538](https://github.com/sanity-io/cli/pull/1538)) ([fb121f0](https://github.com/sanity-io/cli/commit/fb121f0c0b1f16ccf52f4c52e561522bd5a6c494))
- **deps:** update dependency @module-federation/vite to v1.17.0 ([#1544](https://github.com/sanity-io/cli/pull/1544)) ([cf65928](https://github.com/sanity-io/cli/commit/cf65928ed36e77650df4fb2d5d3b9afeb27003de))
- **deps:** update dependency @module-federation/vite to v1.17.1 ([#1550](https://github.com/sanity-io/cli/pull/1550)) ([018a48d](https://github.com/sanity-io/cli/commit/018a48d13f0f1677db0d1527e7db03f7800e3008))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 2.5.0

## [1.4.0](https://github.com/sanity-io/cli/compare/workbench-cli-v1.3.0...workbench-cli-v1.4.0)

_2026-07-15_

### Features

- **workbench:** undeploy through the applications API ([#1472](https://github.com/sanity-io/cli/pull/1472)) ([6ddf505](https://github.com/sanity-io/cli/commit/6ddf505229ebc19169572d225385d9ed6f22f4cb))
- **deploy:** report workbench URLs on deploy and undeploy ([#1507](https://github.com/sanity-io/cli/pull/1507)) ([76b2a1e](https://github.com/sanity-io/cli/commit/76b2a1e9529699bf58cf469aaf489e8b14a27d0c))

### Bug Fixes

- **workbench:** align interface shape with brett ([#1512](https://github.com/sanity-io/cli/pull/1512)) ([bb7ea81](https://github.com/sanity-io/cli/commit/bb7ea815ad818012b7139135b9109e54fcb43250))
- **workbench:** emit standalone SPA for workbench remotes ([#1517](https://github.com/sanity-io/cli/pull/1517)) ([b2dcc3c](https://github.com/sanity-io/cli/commit/b2dcc3c9256e37045c269dd195bc3fed249189a7))
- **workbench:** inline app-id define via rolldownOptions ([#1514](https://github.com/sanity-io/cli/pull/1514)) ([44d6633](https://github.com/sanity-io/cli/commit/44d66336504ffac2a160d60907f06c9e249620c7))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 2.4.0

## [1.3.0](https://github.com/sanity-io/cli/compare/workbench-cli-v1.2.0...workbench-cli-v1.3.0)

_2026-07-13_

### Features

- **workbench:** deploy workbench apps to the Sanity app registry on `sanity deploy`, registering their interfaces (app view, views, services). Plain studios and coreApps are unaffected. ([#1442](https://github.com/sanity-io/cli/pull/1442)) ([a377fdb](https://github.com/sanity-io/cli/commit/a377fdb1e6c277311f97f632ac5fe76bc41f3904))
- **workbench:** send `isSingleton` on core-app create (`POST /applications`) when set, surface it in the deploy report and `--json`, and relay the API's rejection message on failure. ([#1455](https://github.com/sanity-io/cli/pull/1455)) ([7f83938](https://github.com/sanity-io/cli/commit/7f83938eed8055b3fa6f2c8faf6f17e5f48f9694))
- **workbench:** send studio workspaces (project, dataset, base path, title, icon) with workbench studio deploys, so the dashboard can surface them. ([#1453](https://github.com/sanity-io/cli/pull/1453)) ([fa1edf4](https://github.com/sanity-io/cli/commit/fa1edf4b13539e077880a7205e9b96d3252ae5d2))
- **deploy:** create workbench apps at a configured slug ([#1473](https://github.com/sanity-io/cli/pull/1473)) ([0d0ae06](https://github.com/sanity-io/cli/commit/0d0ae066a28b1225dcf88ee600facd43f1c17d25))

### Bug Fixes

- **workbench:** hash local app configs into an `id` so the workbench can detect config changes without stringifying ([#1468](https://github.com/sanity-io/cli/pull/1468)) ([e53c53d](https://github.com/sanity-io/cli/commit/e53c53dae1d17e652b9f5ff5b580e061b1657517))
- **workbench:** forward config and interface contract versions on the dev wire ([#1469](https://github.com/sanity-io/cli/pull/1469)) ([cda20c6](https://github.com/sanity-io/cli/commit/cda20c622246c1f8bad38280aa4b181ea3ae73ab))
- **workbench:** set the `__SANITY_STAGING__` runtime flag in the dev shell so staging environments resolve the staging API ([#1474](https://github.com/sanity-io/cli/pull/1474)) ([6a2fb73](https://github.com/sanity-io/cli/commit/6a2fb73571e3123a75a22a701f9f2391b554bf9c))
- **deploy:** nest expose and config summaries in the dry-run report ([#1475](https://github.com/sanity-io/cli/pull/1475)) ([64e22e1](https://github.com/sanity-io/cli/commit/64e22e1280f763e31acbaa9e0ac28ca573c8dcb4))
- **deps:** update dependency @module-federation/vite to v1.16.14 ([#1484](https://github.com/sanity-io/cli/pull/1484)) ([812c875](https://github.com/sanity-io/cli/commit/812c87586ee573dfa1eeb9a0c9baa5eaac091252))
- **workbench:** rename the internal `installationConfig` field to `config`. ([#1456](https://github.com/sanity-io/cli/pull/1456)) ([62e8ad6](https://github.com/sanity-io/cli/commit/62e8ad66096ca6c840cfe7d960df2a91e9314e16))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 2.3.0

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

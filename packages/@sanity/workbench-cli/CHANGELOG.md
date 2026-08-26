# @sanity/workbench-cli

## 2.2.1

[Compare changes](https://github.com/sanity-io/cli/compare/workbench-cli-v2.2.0...workbench-cli-v2.2.1)

_2026-08-26_

### Bug Fixes

- **workbench:** enforce app-wide interface name uniqueness ([#1760](https://github.com/sanity-io/cli/pull/1760)) ([027db7f](https://github.com/sanity-io/cli/commit/027db7f9792757243e94e76c7924012dd5a002ed))

## 2.2.0

[Compare changes](https://github.com/sanity-io/cli/compare/workbench-cli-v2.1.0...workbench-cli-v2.2.0)

_2026-08-26_

### Features

- make name the application identity, slug the address ([#1748](https://github.com/sanity-io/cli/pull/1748)) ([cec18fc](https://github.com/sanity-io/cli/commit/cec18fc56c7874b890797c5679ba9fd2ac561303))
- **workbench:** enable type-safe window, panel, and tile declarations ([#1755](https://github.com/sanity-io/cli/pull/1755)) ([36b61b3](https://github.com/sanity-io/cli/commit/36b61b39d1d09010fa68098d2064d3dab51cdbd3))
- **workbench:** stabilize unstable_defineApp ([#1756](https://github.com/sanity-io/cli/pull/1756)) ([69a180e](https://github.com/sanity-io/cli/commit/69a180ec221e5762e56b7afef59ea952e4d3fee3))
- **workbench:** align application workers with the web worker api ([#1757](https://github.com/sanity-io/cli/pull/1757)) ([ee095b5](https://github.com/sanity-io/cli/commit/ee095b5fe9f2268d4d542e5eb170c5d111eb6832))
- **workbench:** rename view type discriminator to surface ([#1759](https://github.com/sanity-io/cli/pull/1759)) ([d9bd013](https://github.com/sanity-io/cli/commit/d9bd01305e08d5c5dc5a006a50d899453283b1c7))

### Bug Fixes

- append content-hash to remote-entry ([#1747](https://github.com/sanity-io/cli/pull/1747)) ([aae7de5](https://github.com/sanity-io/cli/commit/aae7de5d1a0ac2a021f1a6eb0e7f89e62b623817))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 3.4.0

## 2.1.0

[Compare changes](https://github.com/sanity-io/cli/compare/workbench-cli-v2.0.2...workbench-cli-v2.1.0)

_2026-08-24_

### Features

- **workbench:** allow window entries with multiple panel views ([#1741](https://github.com/sanity-io/cli/pull/1741)) ([3f8c612](https://github.com/sanity-io/cli/commit/3f8c6120887335f1bdd76a2c76f91bfd31b9272d))

### Bug Fixes

- **workbench:** decouple cli from sanity/workbench ([#1734](https://github.com/sanity-io/cli/pull/1734)) ([ea4dc56](https://github.com/sanity-io/cli/commit/ea4dc5660f10eb4b1758c3924ea2241d4007e35f))
- **workbench:** disable federation dts plugins ([#1740](https://github.com/sanity-io/cli/pull/1740)) ([666d2fb](https://github.com/sanity-io/cli/commit/666d2fbb2725f77684724bb944f31c7b06e8d634))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 3.3.0

## 2.0.2

[Compare changes](https://github.com/sanity-io/cli/compare/workbench-cli-v2.0.1...workbench-cli-v2.0.2)

_2026-08-19_

### Bug Fixes

- **workbench-cli:** let a config-only dev server share a slug with its app server ([#1725](https://github.com/sanity-io/cli/pull/1725)) ([9925e21](https://github.com/sanity-io/cli/commit/9925e214ff98ca9f49c8194cb8990514de081aef))

## 2.0.1

[Compare changes](https://github.com/sanity-io/cli/compare/workbench-cli-v2.0.0...workbench-cli-v2.0.1)

_2026-08-17_

### Bug Fixes

- **deps:** update dependency @module-federation/vite to v1.20.7 ([#1706](https://github.com/sanity-io/cli/pull/1706)) ([60e664f](https://github.com/sanity-io/cli/commit/60e664f0ad3bddf2b35d1b6db04b10e44420011a))

## 2.0.0

[Compare changes](https://github.com/sanity-io/cli/compare/workbench-cli-v1.10.0...workbench-cli-v2.0.0)

_2026-08-14_

### ⚠ BREAKING CHANGES

- **cli:** unify the --json shape of deploy and undeploy ([#1691](https://github.com/sanity-io/cli/pull/1691)) ([8ed25bb](https://github.com/sanity-io/cli/commit/8ed25bbc0c2e2b3365d5b3dcd88567563ae9ab5a))

### Features

- **workbench:** key a dev app's id on its slug ([#1667](https://github.com/sanity-io/cli/pull/1667)) ([e11a2d3](https://github.com/sanity-io/cli/commit/e11a2d3d7f72beb5575f0cde1f455cc8e39a01d0))
- send deployment access array for workbench studios ([#1676](https://github.com/sanity-io/cli/pull/1676)) ([3601ecf](https://github.com/sanity-io/cli/commit/3601ecfa7ff232ed42caf67d9e7b98847222b605))

### Bug Fixes

- **deps:** update dependency @module-federation/vite to v1.20.5 ([#1683](https://github.com/sanity-io/cli/pull/1683)) ([a5779c1](https://github.com/sanity-io/cli/commit/a5779c1e83fffe5acde2877d8e54c0dad6f3abb1))
- **cli:** trim deploy payload and undeploy dry-run output ([#1696](https://github.com/sanity-io/cli/pull/1696)) ([1462d82](https://github.com/sanity-io/cli/commit/1462d8236f67a706397ca774fb3f9abaf4929cd6))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 3.0.0

## 1.10.0

[Compare changes](https://github.com/sanity-io/cli/compare/workbench-cli-v1.9.0...workbench-cli-v1.10.0)

_2026-08-04_

### Features

- **workbench:** register tile view type ([#1659](https://github.com/sanity-io/cli/pull/1659)) ([1ae4d8e](https://github.com/sanity-io/cli/commit/1ae4d8e1ae625e08fca3ae1273fab46f91c33677))

## [1.9.0](https://github.com/sanity-io/cli/compare/workbench-cli-v1.8.0...workbench-cli-v1.9.0)

_2026-08-03_

### Features

- **workbench:** drop `name` from unstable_defineApp ([#1631](https://github.com/sanity-io/cli/pull/1631)) ([b11a64b](https://github.com/sanity-io/cli/commit/b11a64b65401e9baa93ad318486baa5c9c55480e))
- **workbench:** register asset_source view type ([#1638](https://github.com/sanity-io/cli/pull/1638)) ([7eae909](https://github.com/sanity-io/cli/commit/7eae9097aa1278a5d97ff41e8526dbd41f040434))
- **workbench:** deploy and forward asset_source views ([#1639](https://github.com/sanity-io/cli/pull/1639)) ([6e2d902](https://github.com/sanity-io/cli/commit/6e2d9022ce2c9165a6d1355cd84ece372280ce48))
- **workbench:** derive an app's interfaces once, for dev and deploy alike ([#1630](https://github.com/sanity-io/cli/pull/1630)) ([e39886f](https://github.com/sanity-io/cli/commit/e39886f4ad0ebd765ec1716a36ca77ea266e3dfa))

### Bug Fixes

- **deploy:** build and deploy a federated studio with its installed package versions rather than silently ignoring `deployment.autoUpdates`, report the existing app id when its slug is already taken, and apply the app's `visibility` ([#1635](https://github.com/sanity-io/cli/pull/1635)) ([206c037](https://github.com/sanity-io/cli/commit/206c0371b56ab852ea779ccf258e1ddfc1488ac3))
- **deps:** update dependency @module-federation/vite to v1.20.1 ([#1650](https://github.com/sanity-io/cli/pull/1650)) ([f934f32](https://github.com/sanity-io/cli/commit/f934f324c98d469c9354ae4f4504af6d6e0d41a5))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 2.8.0

## [1.8.0](https://github.com/sanity-io/cli/compare/workbench-cli-v1.7.2...workbench-cli-v1.8.0)

_2026-07-29_

### Features

- support providing sanityEnv to execution context ([#1608](https://github.com/sanity-io/cli/pull/1608)) ([161efb5](https://github.com/sanity-io/cli/commit/161efb54ec091c2c9603b6e6e469deb12fd374a1))

### Bug Fixes

- **workbench:** forward an app interface for a local workbench studio ([#1605](https://github.com/sanity-io/cli/pull/1605)) ([a0735b1](https://github.com/sanity-io/cli/commit/a0735b1f5bf0e465a86ef7dd3ddd3f4a8f3519cb))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 2.7.0

## [1.7.2](https://github.com/sanity-io/cli/compare/workbench-cli-v1.7.1...workbench-cli-v1.7.2)

_2026-07-28_

### Bug Fixes

- **workbench:** align the local dev config version with Brett ([#1601](https://github.com/sanity-io/cli/pull/1601)) ([7332e1f](https://github.com/sanity-io/cli/commit/7332e1f699aa4c98f8787cb6e4c3d879d75cd7c1))
- **deploy:** when a workbench app's slug is already taken, report the existing app id and how to reuse it via `deployment.appId` ([#1596](https://github.com/sanity-io/cli/pull/1596)) ([d988745](https://github.com/sanity-io/cli/commit/d9887459fcf9e1c98ff4df06c0af7f0798f68e3f))
- **workbench:** validate app config at build, dev, and deploy ([#1590](https://github.com/sanity-io/cli/pull/1590)) ([efb5705](https://github.com/sanity-io/cli/commit/efb5705b0ccde1108a2503f921a9cab4f2aa850e))
- **workbench:** output federation static assets to static dir ([#1594](https://github.com/sanity-io/cli/pull/1594)) ([643f3d4](https://github.com/sanity-io/cli/commit/643f3d471fc913d4a66b5c18f8e73ec48eea0075))
- **deps:** update dependency @module-federation/vite to v1.19.1 ([#1599](https://github.com/sanity-io/cli/pull/1599)) ([cdd03f8](https://github.com/sanity-io/cli/commit/cdd03f8a9d7d471539bc58b7c0de4ae7c24a952a))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 2.6.0

## [1.7.1](https://github.com/sanity-io/cli/compare/workbench-cli-v1.7.0...workbench-cli-v1.7.1)

_2026-07-22_

### Bug Fixes

- **workbench:** derive config id with Web Crypto ([#1575](https://github.com/sanity-io/cli/pull/1575)) ([d3e59eb](https://github.com/sanity-io/cli/commit/d3e59eb08ac3746fc03db6ddedf60fef5f47244c))

## [1.7.0](https://github.com/sanity-io/cli/compare/workbench-cli-v1.6.0...workbench-cli-v1.7.0)

_2026-07-21_

### Features

- **workbench:** centralize app id generation ([#1540](https://github.com/sanity-io/cli/pull/1540)) ([abc8897](https://github.com/sanity-io/cli/commit/abc88976b631a7f47bb0071ec37d59ff0e7fe5dd))

### Bug Fixes

- **init:** pre-fill workbench app slug from the entered name/title ([#1574](https://github.com/sanity-io/cli/pull/1574)) ([a66212c](https://github.com/sanity-io/cli/commit/a66212cb4330dc040ea9f856f1976aca21f85c1e))
- **workbench:** sync app visibility on redeploy ([#1565](https://github.com/sanity-io/cli/pull/1565)) ([a41c5a4](https://github.com/sanity-io/cli/commit/a41c5a436ba292ae13e5e7138f53599f01b0745e))

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

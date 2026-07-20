# Changelog

## [4.1.1](https://github.com/sanity-io/cli/compare/cli-build-v4.1.0...cli-build-v4.1.1)

_2026-07-20_

### Bug Fixes

- **workbench:** pre-bundle interface deps in the dev server ([#1557](https://github.com/sanity-io/cli/pull/1557)) ([3522ae7](https://github.com/sanity-io/cli/commit/3522ae7cf4bbd475a2a9d84a300b471bc58870cb))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/workbench-cli bumped to 1.6.0
    - @sanity/cli-core bumped to 2.5.1

## [4.1.0](https://github.com/sanity-io/cli/compare/cli-build-v4.0.0...cli-build-v4.1.0)

_2026-07-15_

### Features

- Allow boolean for reactCompiler config ([#1513](https://github.com/sanity-io/cli/pull/1513)) ([6a292b7](https://github.com/sanity-io/cli/commit/6a292b7dcca05137b7457f8dcd605f68aa76dac2))

### Bug Fixes

- **cli-build:** add bridge toggle and workbench SPA build steps ([#1516](https://github.com/sanity-io/cli/pull/1516)) ([0679b10](https://github.com/sanity-io/cli/commit/0679b10daae86d52138888457734d632fff5b896))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/workbench-cli bumped to 1.4.0
    - @sanity/cli-core bumped to 2.4.0

## [4.0.0](https://github.com/sanity-io/cli/compare/cli-build-v3.0.0...cli-build-v4.0.0)

_2026-07-13_

### ⚠ BREAKING CHANGES

- move compareDependencyVersions into cli-build ([#1466](https://github.com/sanity-io/cli/pull/1466)) ([f424cba](https://github.com/sanity-io/cli/commit/f424cba7c1c2de601ce1c7e1d062e3a8dba6745b))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/workbench-cli bumped to 1.3.0
    - @sanity/cli-core bumped to 2.3.0

## [3.0.0](https://github.com/sanity-io/cli/compare/cli-build-v2.0.1...cli-build-v3.0.0)

_2026-07-07_

### ⚠ BREAKING CHANGES

- move internal build logic to cli-build package ([#1412](https://github.com/sanity-io/cli/pull/1412)) ([de6f30c](https://github.com/sanity-io/cli/commit/de6f30c9adcebecb6cdfd0510762ed1ca44d8fd1))

### Features

- **cli-build:** preconnect and modulepreload the CDN `sanity` module for auto-update studios ([#1402](https://github.com/sanity-io/cli/pull/1402)) ([afd62a5](https://github.com/sanity-io/cli/commit/afd62a5fcc2bb7640026a88f88f445a69293ef7b))

  Re-introduces the resource hints reverted in #1400. `preconnect` only warms a socket, so it runs unconditionally and is safe in every engine. `modulepreload` follows the CDN's cross-origin redirect, which triggers a WebKit CORS bug that blanks the studio, so it is gated behind a positive allowlist: it runs only for engines confirmed to handle the redirect (desktop and Android Chromium and Gecko). Any unrecognised or WebKit engine - including all iOS browsers - falls back to the plain import-map load, costing a missed download rather than risking a blank studio.

- **workbench:** stamp the app's bus identity into its bundle ([#1438](https://github.com/sanity-io/cli/pull/1438)) ([9c7b6cb](https://github.com/sanity-io/cli/commit/9c7b6cb8ae5859a378e2af3c70731cc6a8cefc91))

### Bug Fixes

- **workbench:** thread views/services as one `exposes` bundle through the ([#1424](https://github.com/sanity-io/cli/pull/1424)) ([bebd59b](https://github.com/sanity-io/cli/commit/bebd59b0002c52355efa41eea473b1e02b8b930c))
  build/dev plumbing, so adding a declaration family no longer touches every hop

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/workbench-cli bumped to 1.2.0
    - @sanity/cli-core bumped to 2.2.0

## [2.0.1](https://github.com/sanity-io/cli/compare/cli-build-v2.0.0...cli-build-v2.0.1)

_2026-07-01_

### Bug Fixes

- **deps:** unpin vite and bump to ^8.1.2 ([#1410](https://github.com/sanity-io/cli/pull/1410)) ([3801bd7](https://github.com/sanity-io/cli/commit/3801bd7ebc4aacf7f3e196b4dd73991f8a24d6b7))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 2.1.3
    - @sanity/workbench-cli bumped to 1.1.3

## [2.0.0](https://github.com/sanity-io/cli/compare/cli-build-v1.1.2...cli-build-v2.0.0)

_2026-06-30_

### ⚠ BREAKING CHANGES

- move buildStaticFiles into cli-build, clean up exports ([#1397](https://github.com/sanity-io/cli/pull/1397)) ([def5e11](https://github.com/sanity-io/cli/commit/def5e11efbe0e7859a3e3b014d17b3e6425feb21))

### Bug Fixes

- **deps:** pin vite to 8.1.0 to avoid broken 8.1.1 studio builds ([#1408](https://github.com/sanity-io/cli/pull/1408)) ([596baa7](https://github.com/sanity-io/cli/commit/596baa753d6479f2ca30318ca299aff3a0ad2aa8))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 2.1.2
    - @sanity/workbench-cli bumped to 1.1.2

## [1.1.2](https://github.com/sanity-io/cli/compare/cli-build-v1.1.1...cli-build-v1.1.2)

_2026-06-29_

### Bug Fixes

- **cli-build:** skip redundant initial render in sanity dev watcher ([#1388](https://github.com/sanity-io/cli/pull/1388)) ([adf90ea](https://github.com/sanity-io/cli/commit/adf90ea6691ee6c36849e426de9729533706f47f))
- revert "feat(cli-build): preconnect and modulepreload the CDN sanity module for auto-update studios (#1276)" ([#1400](https://github.com/sanity-io/cli/pull/1400)) ([e29d4bb](https://github.com/sanity-io/cli/commit/e29d4bbd254f47afd976876587f5cd57dce149bc))
- move logic for getting env vars into cli-build package ([#1373](https://github.com/sanity-io/cli/pull/1373)) ([ae0c624](https://github.com/sanity-io/cli/commit/ae0c624454dad4594eee21ff76a92c162272708e))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/workbench-cli bumped to 1.1.1

## [1.1.1](https://github.com/sanity-io/cli/compare/cli-build-v1.1.0...cli-build-v1.1.1)

_2026-06-23_

### Bug Fixes

- **deps:** remove rolldown overrides now that vite 8.1.0 ships rolldown 1.1.2 ([#1356](https://github.com/sanity-io/cli/pull/1356)) ([d96cf4f](https://github.com/sanity-io/cli/commit/d96cf4f37648f82416b11753b85d9eba1c3e1742))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 2.1.1

## [1.1.0](https://github.com/sanity-io/cli/compare/cli-build-v1.0.5...cli-build-v1.1.0)

_2026-06-22_

### Features

- **cli-build:** preconnect and modulepreload the CDN sanity module for auto-update studios ([#1276](https://github.com/sanity-io/cli/pull/1276)) ([71d4f20](https://github.com/sanity-io/cli/commit/71d4f20e27edc112038a6887284baeeca772cc73))
- add workbench under unstable flags ([#907](https://github.com/sanity-io/cli/pull/907)) ([a2deacf](https://github.com/sanity-io/cli/commit/a2deacf2ed71783bb34927aca9d2b9b41c2f0f3d))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 2.1.0
    - @sanity/workbench-cli bumped to 1.1.0

## [1.0.5](https://github.com/sanity-io/cli/compare/cli-build-v1.0.4...cli-build-v1.0.5)

_2026-06-11_

### Bug Fixes

- **deps:** bump sanity monorepo packages to v6 ([#1258](https://github.com/sanity-io/cli/pull/1258)) ([72bde8f](https://github.com/sanity-io/cli/commit/72bde8f016ee958b8745e5f01d12b4c6149d6df1))

  Updates `@sanity/schema`, `@sanity/types`, `@sanity/codegen`, `@sanity/import`, and `@sanity/migrate` in `@sanity/cli`, and `@sanity/schema` and `@sanity/types` in `@sanity/cli-build`, to versions compatible with Sanity v6.

## [1.0.4](https://github.com/sanity-io/cli/compare/cli-build-v1.0.3...cli-build-v1.0.4)

_2026-06-11_

### Bug Fixes

- **cli-build:** emit vendor chunks in single vite build for auto-updates ([#1223](https://github.com/sanity-io/cli/pull/1223)) ([a59950f](https://github.com/sanity-io/cli/commit/a59950f8213a5f523270b990a0606ad073316d7a))

  Auto-updating studios and apps no longer run `vite.build` twice, roughly halving `sanity build` times. The vendor packages (`react`, `react-dom`, `styled-components`) are emitted as hashed browser-loadable ESM chunks by the same build that bundles the studio/app, and the import map in `index.html` is derived from the build output. The internal `buildVendorDependencies` helper is removed in favor of `resolveVendorBuildConfig` and a consolidated `autoUpdates` build option.

## [1.0.3](https://github.com/sanity-io/cli/compare/cli-build-v1.0.2...cli-build-v1.0.3)

_2026-06-10_

### Bug Fixes

- **deps:** Update react monorepo to ^19.2.7 ([#1245](https://github.com/sanity-io/cli/pull/1245)) ([73677fa](https://github.com/sanity-io/cli/commit/73677fafeabc2633bfb8e683fd36f8ade89022a6))

## [1.0.2](https://github.com/sanity-io/cli/compare/cli-build-v1.0.1...cli-build-v1.0.2)

_2026-06-10_

### Bug Fixes

- remove spread operator from viteReact plugin ([#1230](https://github.com/sanity-io/cli/pull/1230)) ([23e6568](https://github.com/sanity-io/cli/commit/23e6568dbdd319e2e2f77a8275853800233150cc))

## [1.0.1](https://github.com/sanity-io/cli/compare/cli-build-v1.0.0...cli-build-v1.0.1)

_2026-06-04_

### Bug Fixes

- **deps:** update dependency semver to ^7.8.1 ([#1187](https://github.com/sanity-io/cli/pull/1187)) ([d34c1e6](https://github.com/sanity-io/cli/commit/d34c1e62f9696f0bbd9cb7d86e32998ae17c2669))

## [1.0.0](https://github.com/sanity-io/cli/compare/cli-build-v0.2.2...cli-build-v1.0.0)

_2026-06-04_

### ⚠ BREAKING CHANGES

- Upgrade to Vite v8, plugin-react to v6, vite-node to v6 ([#698](https://github.com/sanity-io/cli/pull/698)) ([8d77ae6](https://github.com/sanity-io/cli/commit/8d77ae6981f5b3986d19e928df28891f472baa03))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 2.0.0

## [0.2.2](https://github.com/sanity-io/cli/compare/cli-build-v0.2.1...cli-build-v0.2.2)

_2026-06-03_

### Bug Fixes

- ensure babel-plugin-react-compiler is a peer dependency ([#1175](https://github.com/sanity-io/cli/pull/1175)) ([d2de934](https://github.com/sanity-io/cli/commit/d2de934fa3bfbe3d82ca37ad9db3eae567677a4b))
- **deps:** Update react monorepo to ^19.2.6 ([#1173](https://github.com/sanity-io/cli/pull/1173)) ([c847618](https://github.com/sanity-io/cli/commit/c8476184695ec6331abefd8dfb3f8ad2402d6e55))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 1.3.4

## [0.2.1](https://github.com/sanity-io/cli/compare/cli-build-v0.2.0...cli-build-v0.2.1)

_2026-06-02_

### Bug Fixes

- add missing changeset for `@sanity/cli-core` ([#1153](https://github.com/sanity-io/cli/pull/1153)) ([ef5b390](https://github.com/sanity-io/cli/commit/ef5b390a439ca8612584ce1c3c1f7d4dbab8172f))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @sanity/cli-core bumped to 1.3.3

## [0.2.0](https://github.com/sanity-io/cli/compare/cli-build-v0.1.1...cli-build-v0.2.0)

_2026-06-02_

### Features

- Move more build/schema logic to cli-build package ([#1130](https://github.com/sanity-io/cli/pull/1130)) ([6165c80](https://github.com/sanity-io/cli/commit/6165c80c63ab6af0dd76b36e60f1d78f798eb13d))

## [0.1.1](https://github.com/sanity-io/cli/compare/cli-build-v0.1.0...cli-build-v0.1.1)

_2026-05-13_

### Bug Fixes

- release to re-publish new cli-build package ([#1077](https://github.com/sanity-io/cli/pull/1077)) ([2fae51f](https://github.com/sanity-io/cli/commit/2fae51f7c06acdf5b5cb711cfdcfa36749b7ba97))

## [0.1.0](https://github.com/sanity-io/cli/releases/tag/cli-build-v0.1.0)

_2026-05-13_

### Features

- split out build logic into a new package ([#1062](https://github.com/sanity-io/cli/pull/1062)) ([543223d](https://github.com/sanity-io/cli/commit/543223d697f252f020d6668fd39a56db03839148))

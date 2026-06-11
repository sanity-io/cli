# Changelog

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

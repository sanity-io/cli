# Changelog

## [0.1.0-alpha.6](https://github.com/sanity-io/cli/compare/cli-core-v0.1.0-alpha.5...cli-core-v0.1.0-alpha.6) (2026-01-16)


### Features

* **deploy:** add app manifest ([#274](https://github.com/sanity-io/cli/issues/274)) ([712650d](https://github.com/sanity-io/cli/commit/712650db1add4855dc9c849954e2b51b95b4ff3d))


### Bug Fixes

* **core:** add typegen to CLI config type ([#283](https://github.com/sanity-io/cli/issues/283)) ([11be33a](https://github.com/sanity-io/cli/commit/11be33a11fb90160dbdb0fa142275ce75f73f175))

## [0.1.0-alpha.5](https://github.com/sanity-io/cli/compare/cli-core-v0.1.0-alpha.4...cli-core-v0.1.0-alpha.5) (2026-01-09)


### Features

* migrate schema deploy ([#242](https://github.com/sanity-io/cli/issues/242)) ([268b256](https://github.com/sanity-io/cli/commit/268b2560dd189663498df40abe39f9149ccbc6b7))


### Bug Fixes

* **deps:** update dependency @sanity/types to v5 ([#269](https://github.com/sanity-io/cli/issues/269)) ([77f0617](https://github.com/sanity-io/cli/commit/77f0617a8f9c20998b69d54e0397eb6008fca5ea))
* **deps:** update sanity-tooling ([#260](https://github.com/sanity-io/cli/issues/260)) ([c1d7c9d](https://github.com/sanity-io/cli/commit/c1d7c9d130a54f32aa85b3815a1dcecce73530af))

## [0.1.0-alpha.4](https://github.com/sanity-io/cli/compare/cli-core-v0.1.0-alpha.3...cli-core-v0.1.0-alpha.4) (2025-12-30)


### Features

* add a eslint-config-cli package ([#226](https://github.com/sanity-io/cli/issues/226)) ([2980003](https://github.com/sanity-io/cli/commit/2980003fc8d1b3935f436f7e29c00207e65db6fc))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @sanity/eslint-config-cli bumped to 0.0.0-alpha.1

## [0.1.0-alpha.3](https://github.com/sanity-io/cli/compare/cli-core-v0.0.2-alpha.3...cli-core-v0.1.0-alpha.3) (2025-12-24)


### ⚠ BREAKING CHANGES

* add ux core helpers ([#219](https://github.com/sanity-io/cli/issues/219))

### Features

* add ux core helpers ([#219](https://github.com/sanity-io/cli/issues/219)) ([d2a7d78](https://github.com/sanity-io/cli/commit/d2a7d7858a1c83792a02abb2cd95fe44cbe3b6ed))
* **graphql:** migrate graphql undeploy command ([#194](https://github.com/sanity-io/cli/issues/194)) ([3915139](https://github.com/sanity-io/cli/commit/39151391c3b557a53ed26e03016d9b7f7683285a))
* **init:** migration of init command setup, plan/coupon logic, and authentication logic ([#199](https://github.com/sanity-io/cli/issues/199)) ([012168e](https://github.com/sanity-io/cli/commit/012168eb03ab7e309918206511dc60c21dea573f))
* move tree util to core package ([#208](https://github.com/sanity-io/cli/issues/208)) ([83417a2](https://github.com/sanity-io/cli/commit/83417a2a004338e62a5f898f733c4d1732b36e9b))

## [0.0.2-alpha.3](https://github.com/sanity-io/cli/compare/cli-core-v0.0.2-alpha.2...cli-core-v0.0.2-alpha.3) (2025-12-19)


### Bug Fixes

* **deps:** update oclif-tooling ([#210](https://github.com/sanity-io/cli/issues/210)) ([66f8c47](https://github.com/sanity-io/cli/commit/66f8c47c6abac9aefbdd5d41ef0253d1ccf413b9))

## [0.0.2-alpha.2](https://github.com/sanity-io/cli/compare/cli-core-v0.0.2-alpha.1...cli-core-v0.0.2-alpha.2) (2025-12-17)


### Features

* add import studio config util ([#185](https://github.com/sanity-io/cli/issues/185)) ([c1be611](https://github.com/sanity-io/cli/commit/c1be61110e7bb954ebdf580753dcdb555dcf55db))
* **exec:** move cliClient ([#180](https://github.com/sanity-io/cli/issues/180)) ([47c89ea](https://github.com/sanity-io/cli/commit/47c89ea08ebceb575cb375f02b62ba5ccbf2f7c2))
* **graphql:** add graphql list command ([#139](https://github.com/sanity-io/cli/issues/139)) ([c77149e](https://github.com/sanity-io/cli/commit/c77149e8bab14938e2974d34d5b088157fd6f9b8))
* **media:** add media create-aspect command ([#144](https://github.com/sanity-io/cli/issues/144)) ([ea8224f](https://github.com/sanity-io/cli/commit/ea8224fccf50923134991effd1395ab6b800ece9))
* move mock browser utils ([#175](https://github.com/sanity-io/cli/issues/175)) ([db43757](https://github.com/sanity-io/cli/commit/db437572b2aaeba2920a419c9c55966567495751))
* parse cli config using Zod schema in `createCliConfig` ([547ac52](https://github.com/sanity-io/cli/commit/547ac528f7a762ee2295513eb09f6b2d439d8119))


### Bug Fixes

* **core:** fixes issues with loading cli config ([#137](https://github.com/sanity-io/cli/issues/137)) ([8cf088e](https://github.com/sanity-io/cli/commit/8cf088e4afc06247dc82c09a6bceeb2b89f06c8b))
* **deps:** update dependency debug to ^4.4.3 ([#154](https://github.com/sanity-io/cli/issues/154)) ([f1cf942](https://github.com/sanity-io/cli/commit/f1cf942572ba47b5f91652748fdfa05eecc8260d))
* **deps:** update dependency vite to ^7.1.6 ([#136](https://github.com/sanity-io/cli/issues/136)) ([acf30f9](https://github.com/sanity-io/cli/commit/acf30f93345efe17572b83babbe9ebdb80917223))
* **deps:** update dependency vite to v7 ([#133](https://github.com/sanity-io/cli/issues/133)) ([fd96f03](https://github.com/sanity-io/cli/commit/fd96f032e7f78fe5df45646dc70300953426c700))
* **deps:** update sanity-tooling ([#117](https://github.com/sanity-io/cli/issues/117)) ([7543a82](https://github.com/sanity-io/cli/commit/7543a82ae8f9eb8e8acc759b6eda567fc2b49064))

## [0.0.2-alpha.1](https://github.com/sanity-io/cli/compare/cli-core-v0.0.2-alpha.0...cli-core-v0.0.2-alpha.1) (2025-09-17)


### Bug Fixes

* allow passing more client options to methods ([#120](https://github.com/sanity-io/cli/issues/120)) ([5c131aa](https://github.com/sanity-io/cli/commit/5c131aa50ea24f017d74db89bf9675a52bf0b3a1))

## [0.0.2-alpha.0](https://github.com/sanity-io/cli/compare/cli-core-v0.0.1-alpha.0...cli-core-v0.0.2-alpha.0) (2025-09-11)


### Bug Fixes

* **deps:** update oclif-tooling ([#116](https://github.com/sanity-io/cli/issues/116)) ([26a92ee](https://github.com/sanity-io/cli/commit/26a92eeeccbf6b92ab91fa08fedd09f2823cd8a3))

## [0.0.1-alpha.0](https://github.com/sanity-io/cli/compare/cli-core-v0.0.0-alpha.0...cli-core-v0.0.1-alpha.0) (2025-09-11)


### Features

* add cli core package for shared utils ([#61](https://github.com/sanity-io/cli/issues/61)) ([5d2af2a](https://github.com/sanity-io/cli/commit/5d2af2a8704f5ecfa73fb3d547e4671509fdbcdf))
* add cli-test package for test helpers ([#62](https://github.com/sanity-io/cli/issues/62)) ([e84a0bf](https://github.com/sanity-io/cli/commit/e84a0bfcf14fbcc2e5f7b3f97911e421b82bcf05))
* add debug command ([#70](https://github.com/sanity-io/cli/issues/70)) ([4edb88d](https://github.com/sanity-io/cli/commit/4edb88d340d21150341b7d2a6197fb772b4fb395))
* **cli:** add start command ([#46](https://github.com/sanity-io/cli/issues/46)) ([86c7b24](https://github.com/sanity-io/cli/commit/86c7b2436eee27294670d5f3129440c110192fb7))
* **documents:** add documents get command ([#84](https://github.com/sanity-io/cli/issues/84)) ([aeea660](https://github.com/sanity-io/cli/commit/aeea66066d688a5929f2f042e1e3977ec748224c))
* **hook:** add hook create command ([#74](https://github.com/sanity-io/cli/issues/74)) ([c2126e5](https://github.com/sanity-io/cli/commit/c2126e5e06fdb8500a6dc866285bcd27edc220f9))
* **telemetry:** add telemetry commands ([#75](https://github.com/sanity-io/cli/issues/75)) ([9f0ca66](https://github.com/sanity-io/cli/commit/9f0ca6688b61872c34a2eb396d2865ce3e085230))
* **telemetry:** shows a disclosure in all CLI commands ([#69](https://github.com/sanity-io/cli/issues/69)) ([406024a](https://github.com/sanity-io/cli/commit/406024a2e55cd6ef59432bde22df5f6bd6de04cb))


### Bug Fixes

* **cli:** align minimum node version in package with runtime check ([#30](https://github.com/sanity-io/cli/issues/30)) ([e64d763](https://github.com/sanity-io/cli/commit/e64d763c73d95b8c2e6d7bef11494b8db06a1322))

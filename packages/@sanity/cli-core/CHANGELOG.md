# Changelog

## [0.1.0-alpha.15](https://github.com/sanity-io/cli/compare/cli-core-v0.1.0-alpha.14...cli-core-v0.1.0-alpha.15) (2026-02-23)


### Features

* **cli-core:** export requester with shared middleware ([#451](https://github.com/sanity-io/cli/issues/451)) ([c506e8a](https://github.com/sanity-io/cli/commit/c506e8aa4a5b477b0f343b7408eb603b6d469cb1))


### Bug Fixes

* issues reading CLI config in CJS project ([#428](https://github.com/sanity-io/cli/issues/428)) ([42701d0](https://github.com/sanity-io/cli/commit/42701d001f46fe89761544725e668b070079f5ac))

## [0.1.0-alpha.14](https://github.com/sanity-io/cli/compare/cli-core-v0.1.0-alpha.13...cli-core-v0.1.0-alpha.14) (2026-02-19)


### Bug Fixes

* add more debug logging ([#437](https://github.com/sanity-io/cli/issues/437)) ([687bcbf](https://github.com/sanity-io/cli/commit/687bcbf2f00a0f8ccc5187a5b4a8ae41b166f1e8))

## [0.1.0-alpha.13](https://github.com/sanity-io/cli/compare/cli-core-v0.1.0-alpha.12...cli-core-v0.1.0-alpha.13) (2026-02-18)


### Features

* **schema:** moving latest updates to schema extract command ([#425](https://github.com/sanity-io/cli/issues/425)) ([b4f55ef](https://github.com/sanity-io/cli/commit/b4f55ef4267d3a173c2d11d9942a0608010148ff))

## [0.1.0-alpha.12](https://github.com/sanity-io/cli/compare/cli-core-v0.1.0-alpha.11...cli-core-v0.1.0-alpha.12) (2026-02-13)


### Features

* **update:** oclif hook to notify of updated versions of CLI ([#374](https://github.com/sanity-io/cli/issues/374)) ([4172cbc](https://github.com/sanity-io/cli/commit/4172cbc548d51033208e534d98dd660113d7586d))


### Bug Fixes

* **build:** fixes issue with app build not failing for missing deps ([#409](https://github.com/sanity-io/cli/issues/409)) ([7a266fd](https://github.com/sanity-io/cli/commit/7a266fdf9fd6ad0acafcbd6770354a838b3d655e))
* **manifest:** fixes manifest extract not working ([#382](https://github.com/sanity-io/cli/issues/382)) ([3d14632](https://github.com/sanity-io/cli/commit/3d14632ec71ba731214356e755ce0e0194d46f7f))

## [0.1.0-alpha.11](https://github.com/sanity-io/cli/compare/cli-core-v0.1.0-alpha.10...cli-core-v0.1.0-alpha.11) (2026-02-05)


### Bug Fixes

* **core:** re-add chalk dependency ([#395](https://github.com/sanity-io/cli/issues/395)) ([b51f986](https://github.com/sanity-io/cli/commit/b51f9862238785e47f4e65766061156706e64bf3))

## [0.1.0-alpha.10](https://github.com/sanity-io/cli/compare/cli-core-v0.1.0-alpha.9...cli-core-v0.1.0-alpha.10) (2026-02-05)


### Bug Fixes

* add no-console lint rule ([7823696](https://github.com/sanity-io/cli/commit/78236965ebdd784d01384b96b23bc590eeaaa325))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @sanity/eslint-config-cli bumped to 0.0.0-alpha.2

## [0.1.0-alpha.9](https://github.com/sanity-io/cli/compare/cli-core-v0.1.0-alpha.8...cli-core-v0.1.0-alpha.9) (2026-02-05)


### Features

* add typegen generate command ([#340](https://github.com/sanity-io/cli/issues/340)) ([3230469](https://github.com/sanity-io/cli/commit/32304690cedcb4215e02d128e90576a56846cc16))
* allow making telemetry calls from CLI ([#346](https://github.com/sanity-io/cli/issues/346)) ([41ef21e](https://github.com/sanity-io/cli/commit/41ef21eb1c3d6c1854b91bb0c953aa8596e39566))
* make telemetry calls in commands ([#347](https://github.com/sanity-io/cli/issues/347)) ([6e22909](https://github.com/sanity-io/cli/commit/6e229091b41e581bf3ebe4be3540dca5a5b5c9c8))


### Bug Fixes

* **core:** fixes issue with resolving plugins in studio config ([#349](https://github.com/sanity-io/cli/issues/349)) ([71689bf](https://github.com/sanity-io/cli/commit/71689bf6e0f36590d61b03c37c90527a61ec8224))
* **deps:** update dependency @inquirer/prompts to ^8.2.0 ([#342](https://github.com/sanity-io/cli/issues/342)) ([e4bdbe2](https://github.com/sanity-io/cli/commit/e4bdbe2d6e632043f31bcafed118eeee036852cc))
* **documents:** fixes documents validate not working ([#386](https://github.com/sanity-io/cli/issues/386)) ([9a3337b](https://github.com/sanity-io/cli/commit/9a3337bd1d6c4af799bd1ef729414f45de2e8d8a))
* **schema:** fixes schema extract command ([#375](https://github.com/sanity-io/cli/issues/375)) ([6382401](https://github.com/sanity-io/cli/commit/63824011f8cd64bb2f0ec422e51701fc4c8e6140))

## [0.1.0-alpha.8](https://github.com/sanity-io/cli/compare/cli-core-v0.1.0-alpha.7...cli-core-v0.1.0-alpha.8) (2026-01-23)


### Bug Fixes

* **deps:** update sanity-tooling to ^5.6.0 ([#324](https://github.com/sanity-io/cli/issues/324)) ([85d115e](https://github.com/sanity-io/cli/commit/85d115efc7e73d3a2a32dc56db23ab9422cc98cf))
* token logic for `getCliClient()` ([#322](https://github.com/sanity-io/cli/issues/322)) ([d62eeda](https://github.com/sanity-io/cli/commit/d62eeda5004eb70db5ce0a74813fb64a1ebb114d))

## [0.1.0-alpha.7](https://github.com/sanity-io/cli/compare/cli-core-v0.1.0-alpha.6...cli-core-v0.1.0-alpha.7) (2026-01-20)


### Bug Fixes

* **deps:** update sanity-tooling ([#292](https://github.com/sanity-io/cli/issues/292)) ([dfacca8](https://github.com/sanity-io/cli/commit/dfacca832f94a94b00e898b315e3fef567c90026))
* **deps:** update sanity-tooling ([#311](https://github.com/sanity-io/cli/issues/311)) ([51476f4](https://github.com/sanity-io/cli/commit/51476f4f47a004b7dc5b2ce0f9cf3e2be1a13b40))

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

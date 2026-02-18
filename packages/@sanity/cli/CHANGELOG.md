# Changelog

## [6.0.0-alpha.13](https://github.com/sanity-io/cli/compare/cli-v6.0.0-alpha.12...cli-v6.0.0-alpha.13) (2026-02-18)


### Bug Fixes

* throw on error instead of using assertion ([#423](https://github.com/sanity-io/cli/issues/423)) ([36f3053](https://github.com/sanity-io/cli/commit/36f3053a3510a91c2e2187e63b767ebfeb97952f))

## [6.0.0-alpha.12](https://github.com/sanity-io/cli/compare/cli-v6.0.0-alpha.11...cli-v6.0.0-alpha.12) (2026-02-13)


### Features

* **update:** oclif hook to notify of updated versions of CLI ([#374](https://github.com/sanity-io/cli/issues/374)) ([4172cbc](https://github.com/sanity-io/cli/commit/4172cbc548d51033208e534d98dd660113d7586d))


### Bug Fixes

* **build:** fixes issue with app build not failing for missing deps ([#409](https://github.com/sanity-io/cli/issues/409)) ([7a266fd](https://github.com/sanity-io/cli/commit/7a266fdf9fd6ad0acafcbd6770354a838b3d655e))
* **cli:** set up telemetry even if project root/config not found ([#397](https://github.com/sanity-io/cli/issues/397)) ([0e4b9b2](https://github.com/sanity-io/cli/commit/0e4b9b268ea8d52dcd8581234880ea08552465a5))
* **deps:** update dependency chokidar to v5 ([#411](https://github.com/sanity-io/cli/issues/411)) ([1dc251a](https://github.com/sanity-io/cli/commit/1dc251aefa436fcb5a84a9038e00ee6558eb9170))
* **deps:** update sanity-tooling ([#403](https://github.com/sanity-io/cli/issues/403)) ([8ba4536](https://github.com/sanity-io/cli/commit/8ba45368a324c9e1145f6b4ec14327dffe702a08))
* **deps:** update sanity-tooling ([#416](https://github.com/sanity-io/cli/issues/416)) ([66038c6](https://github.com/sanity-io/cli/commit/66038c64deeb9ce312bb37a39136371611a55882))
* **manifest:** fixes manifest extract not working ([#382](https://github.com/sanity-io/cli/issues/382)) ([3d14632](https://github.com/sanity-io/cli/commit/3d14632ec71ba731214356e755ce0e0194d46f7f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/cli-core bumped to 0.1.0-alpha.12
  * devDependencies
    * @sanity/cli-test bumped to 0.0.2-alpha.11

## [6.0.0-alpha.11](https://github.com/sanity-io/cli/compare/cli-v6.0.0-alpha.10...cli-v6.0.0-alpha.11) (2026-02-05)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/cli-core bumped to 0.1.0-alpha.11
  * devDependencies
    * @sanity/cli-test bumped to 0.0.2-alpha.10

## [6.0.0-alpha.10](https://github.com/sanity-io/cli/compare/cli-v6.0.0-alpha.9...cli-v6.0.0-alpha.10) (2026-02-05)


### Bug Fixes

* add no-console lint rule ([7823696](https://github.com/sanity-io/cli/commit/78236965ebdd784d01384b96b23bc590eeaaa325))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/cli-core bumped to 0.1.0-alpha.10
  * devDependencies
    * @sanity/cli-test bumped to 0.0.2-alpha.9
    * @sanity/eslint-config-cli bumped to 0.0.0-alpha.2

## [6.0.0-alpha.9](https://github.com/sanity-io/cli/compare/cli-v6.0.0-alpha.8...cli-v6.0.0-alpha.9) (2026-02-05)


### Features

* add typegen generate command ([#340](https://github.com/sanity-io/cli/issues/340)) ([3230469](https://github.com/sanity-io/cli/commit/32304690cedcb4215e02d128e90576a56846cc16))
* allow making telemetry calls from CLI ([#346](https://github.com/sanity-io/cli/issues/346)) ([41ef21e](https://github.com/sanity-io/cli/commit/41ef21eb1c3d6c1854b91bb0c953aa8596e39566))
* **graphql:** add graphql deploy command ([#366](https://github.com/sanity-io/cli/issues/366)) ([fdb407b](https://github.com/sanity-io/cli/commit/fdb407bd21a379cacf0141728c7b657fe596340a))
* inject env variables before the commands are run ([#297](https://github.com/sanity-io/cli/issues/297)) ([eb01a5f](https://github.com/sanity-io/cli/commit/eb01a5f74c19824425cf83e0e95e6e5bc0857736))
* make telemetry calls in commands ([#347](https://github.com/sanity-io/cli/issues/347)) ([6e22909](https://github.com/sanity-io/cli/commit/6e229091b41e581bf3ebe4be3540dca5a5b5c9c8))
* **mcp:** moving latest updates from old cli ([#352](https://github.com/sanity-io/cli/issues/352)) ([92c3d3d](https://github.com/sanity-io/cli/commit/92c3d3df744a03bacff55b2c60ddf85749533c6b))
* **projects:** migrating `projects create` command ([#336](https://github.com/sanity-io/cli/issues/336)) ([11e8592](https://github.com/sanity-io/cli/commit/11e8592fe57b8d54bc5f0a340f0b887052013cef))
* show warnings before running commands ([#307](https://github.com/sanity-io/cli/issues/307)) ([b7422bb](https://github.com/sanity-io/cli/commit/b7422bbc5357da2e764e17e454f84eaa2ff043a6))


### Bug Fixes

* **core:** fixes issue with resolving plugins in studio config ([#349](https://github.com/sanity-io/cli/issues/349)) ([71689bf](https://github.com/sanity-io/cli/commit/71689bf6e0f36590d61b03c37c90527a61ec8224))
* **deps:** update dependency @babel/traverse to ^7.28.6 ([#372](https://github.com/sanity-io/cli/issues/372)) ([9933c79](https://github.com/sanity-io/cli/commit/9933c79575847896c1256b031eee0f63f88f4727))
* **deps:** update dependency @sanity/template-validator to v3 ([#393](https://github.com/sanity-io/cli/issues/393)) ([fdf07d5](https://github.com/sanity-io/cli/commit/fdf07d5014fdfe3ad0820cd66561267b55135d2f))
* **deps:** update dependency console-table-printer to ^2.15.0 ([#373](https://github.com/sanity-io/cli/issues/373)) ([f8eb61b](https://github.com/sanity-io/cli/commit/f8eb61b45b05bb39a965bb15aaad62231abc3f7f))
* **deps:** update dependency styled-components to ^6.3.8 ([#343](https://github.com/sanity-io/cli/issues/343)) ([453facf](https://github.com/sanity-io/cli/commit/453facf0e3599f4d1e03e243e9ef8c5796851ff2))
* **deps:** update dependency tar to ^7.5.6 ([#338](https://github.com/sanity-io/cli/issues/338)) ([0361f0a](https://github.com/sanity-io/cli/commit/0361f0a906eb0a905ad67b1b7d53627694298b68))
* **deps:** update oclif-tooling ([#335](https://github.com/sanity-io/cli/issues/335)) ([b4327e0](https://github.com/sanity-io/cli/commit/b4327e0f90d1c46a0ef18f1e402b6a8e798db394))
* **deps:** update sanity-tooling ([#356](https://github.com/sanity-io/cli/issues/356)) ([651d330](https://github.com/sanity-io/cli/commit/651d330c473da4dcb838f772b2f5bd1eecb30e75))
* **deps:** update sanity-tooling ([#370](https://github.com/sanity-io/cli/issues/370)) ([9ccdea8](https://github.com/sanity-io/cli/commit/9ccdea816a990899b15b06426e0c2a9d0701ecc9))
* **deps:** update sanity-tooling ([#384](https://github.com/sanity-io/cli/issues/384)) ([361f505](https://github.com/sanity-io/cli/commit/361f50590154fcb7efc7e65dba996bd16789a6f9))
* **deps:** update sanity-tooling ([#392](https://github.com/sanity-io/cli/issues/392)) ([d64d3d4](https://github.com/sanity-io/cli/commit/d64d3d4fd6507a8920158cb1f4822cae83607b6e))
* **documents:** fixes documents validate not working ([#386](https://github.com/sanity-io/cli/issues/386)) ([9a3337b](https://github.com/sanity-io/cli/commit/9a3337bd1d6c4af799bd1ef729414f45de2e8d8a))
* **schema:** fixes schema extract command ([#375](https://github.com/sanity-io/cli/issues/375)) ([6382401](https://github.com/sanity-io/cli/commit/63824011f8cd64bb2f0ec422e51701fc4c8e6140))
* **schema:** fixes schema validate not working ([#376](https://github.com/sanity-io/cli/issues/376)) ([c4120aa](https://github.com/sanity-io/cli/commit/c4120aa134a2919f464041be603b3ed74cfeead5))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/cli-core bumped to 0.1.0-alpha.9
  * devDependencies
    * @sanity/cli-test bumped to 0.0.2-alpha.8

## [6.0.0-alpha.8](https://github.com/sanity-io/cli/compare/cli-v6.0.0-alpha.7...cli-v6.0.0-alpha.8) (2026-01-23)


### Features

* **init:** migrating nextjs and templated app setup to new cli ([#300](https://github.com/sanity-io/cli/issues/300)) ([d67ec4c](https://github.com/sanity-io/cli/commit/d67ec4c1da12b87d1b786119a744198fb3af229d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/cli-core bumped to 0.1.0-alpha.8
  * devDependencies
    * @sanity/cli-test bumped to 0.0.2-alpha.7

## [6.0.0-alpha.7](https://github.com/sanity-io/cli/compare/cli-v6.0.0-alpha.6...cli-v6.0.0-alpha.7) (2026-01-20)


### Features

* **telemetry:** add telemetry store ([#112](https://github.com/sanity-io/cli/issues/112)) ([01b632c](https://github.com/sanity-io/cli/commit/01b632cb7e804dcb7fe3cc75ffcad610b3a3db0a))


### Bug Fixes

* **deps:** update dependency @sanity/runtime-cli to v13 ([#313](https://github.com/sanity-io/cli/issues/313)) ([71dd35a](https://github.com/sanity-io/cli/commit/71dd35a6ee224116f1dc6c461fd7cf452063633a))
* **deps:** update sanity-tooling ([#292](https://github.com/sanity-io/cli/issues/292)) ([dfacca8](https://github.com/sanity-io/cli/commit/dfacca832f94a94b00e898b315e3fef567c90026))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/cli-core bumped to 0.1.0-alpha.7
  * devDependencies
    * @sanity/cli-test bumped to 0.0.2-alpha.6

## [6.0.0-alpha.6](https://github.com/sanity-io/cli/compare/cli-v6.0.0-alpha.5...cli-v6.0.0-alpha.6) (2026-01-16)


### Features

* **deploy:** add app manifest ([#274](https://github.com/sanity-io/cli/issues/274)) ([712650d](https://github.com/sanity-io/cli/commit/712650db1add4855dc9c849954e2b51b95b4ff3d))
* **init:** moving project detail logic ([#243](https://github.com/sanity-io/cli/issues/243)) ([830ce32](https://github.com/sanity-io/cli/commit/830ce32981436e53330d1538fbbfce3bd31d5f5c))
* **init:** moving templates for init to new cli ([#290](https://github.com/sanity-io/cli/issues/290)) ([fd42cd5](https://github.com/sanity-io/cli/commit/fd42cd597ef005690cd92035fce77a46be43e0a3))
* **manifest:** make extractManifestSafe safe ([#271](https://github.com/sanity-io/cli/issues/271)) ([6ddb29c](https://github.com/sanity-io/cli/commit/6ddb29ce30338b32da88383a0f1d583113980fe4))


### Bug Fixes

* **debug:** fixes issue with debug showing incorrect info ([#253](https://github.com/sanity-io/cli/issues/253)) ([0592afd](https://github.com/sanity-io/cli/commit/0592afd53ca5719593a96a653373d4299e6057c6))
* **ml:** fixes issues with importing aspects ([#291](https://github.com/sanity-io/cli/issues/291)) ([0f6b398](https://github.com/sanity-io/cli/commit/0f6b3985c312276195b4d92ba0fa9e3a8d3aa948))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/cli-core bumped to 0.1.0-alpha.6
  * devDependencies
    * @sanity/cli-test bumped to 0.0.2-alpha.5

## [6.0.0-alpha.5](https://github.com/sanity-io/cli/compare/cli-v6.0.0-alpha.4...cli-v6.0.0-alpha.5) (2026-01-09)


### Features

* migrate schema deploy ([#242](https://github.com/sanity-io/cli/issues/242)) ([268b256](https://github.com/sanity-io/cli/commit/268b2560dd189663498df40abe39f9149ccbc6b7))
* migrate schema list ([#198](https://github.com/sanity-io/cli/issues/198)) ([62f46ac](https://github.com/sanity-io/cli/commit/62f46acf17905f9630a1540c58c724acf810a12a))


### Bug Fixes

* **deps:** update sanity-tooling ([#260](https://github.com/sanity-io/cli/issues/260)) ([c1d7c9d](https://github.com/sanity-io/cli/commit/c1d7c9d130a54f32aa85b3815a1dcecce73530af))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/cli-core bumped to 0.1.0-alpha.5
  * devDependencies
    * @sanity/cli-test bumped to 0.0.2-alpha.4

## [6.0.0-alpha.4](https://github.com/sanity-io/cli/compare/cli-v6.0.0-alpha.3...cli-v6.0.0-alpha.4) (2025-12-30)


### Features

* add a eslint-config-cli package ([#226](https://github.com/sanity-io/cli/issues/226)) ([2980003](https://github.com/sanity-io/cli/commit/2980003fc8d1b3935f436f7e29c00207e65db6fc))


### Bug Fixes

* **deps:** update dependency eventsource to ^4.1.0 ([#240](https://github.com/sanity-io/cli/issues/240)) ([6d3fc42](https://github.com/sanity-io/cli/commit/6d3fc42926e06af85a683bc2cbdd4c2db20a1ee3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/cli-core bumped to 0.1.0-alpha.4
  * devDependencies
    * @sanity/cli-test bumped to 0.0.2-alpha.3
    * @sanity/eslint-config-cli bumped to 0.0.0-alpha.1

## [6.0.0-alpha.3](https://github.com/sanity-io/cli/compare/cli-v6.0.0-alpha.2...cli-v6.0.0-alpha.3) (2025-12-24)


### ⚠ BREAKING CHANGES

* add ux core helpers ([#219](https://github.com/sanity-io/cli/issues/219))

### Features

* add CI specific token label ([#7934](https://github.com/sanity-io/cli/issues/7934)) ([8652165](https://github.com/sanity-io/cli/commit/86521650df38a7e393b4a747a211ff00d2105f45))
* add CLI command to open Sanity Learn ([#7409](https://github.com/sanity-io/cli/issues/7409)) ([132d1c0](https://github.com/sanity-io/cli/commit/132d1c0455bd6939737eec524b587900b9571c06))
* add cli core package for shared utils ([#61](https://github.com/sanity-io/cli/issues/61)) ([5d2af2a](https://github.com/sanity-io/cli/commit/5d2af2a8704f5ecfa73fb3d547e4671509fdbcdf))
* add CLI options to enable auto-updating studios ([#6514](https://github.com/sanity-io/cli/issues/6514)) ([8dd7938](https://github.com/sanity-io/cli/commit/8dd79387c67f7bf410092eee49beb6da0d8556e5))
* add cli-test package for test helpers ([#62](https://github.com/sanity-io/cli/issues/62)) ([e84a0bf](https://github.com/sanity-io/cli/commit/e84a0bfcf14fbcc2e5f7b3f97911e421b82bcf05))
* add cliInitializedAt field to project metadata ([#6538](https://github.com/sanity-io/cli/issues/6538)) ([37e27c6](https://github.com/sanity-io/cli/commit/37e27c65a2a1bb61a4c952c07d93a77361ce5fec))
* add codemod command ([#143](https://github.com/sanity-io/cli/issues/143)) ([b008a3d](https://github.com/sanity-io/cli/commit/b008a3de1012655300dfe395d5ddf7d7898fffb5))
* add debug command ([#70](https://github.com/sanity-io/cli/issues/70)) ([4edb88d](https://github.com/sanity-io/cli/commit/4edb88d340d21150341b7d2a6197fb772b4fb395))
* add defineCliConfig function ([#12](https://github.com/sanity-io/cli/issues/12)) ([109c93d](https://github.com/sanity-io/cli/commit/109c93d058a18142141794e42e55b551e78eac38))
* add deploy command ([#56](https://github.com/sanity-io/cli/issues/56)) ([d37d050](https://github.com/sanity-io/cli/commit/d37d050b769c66f1381804355f16a62b1e908258))
* add hook logs command ([#76](https://github.com/sanity-io/cli/issues/76)) ([d7c2f84](https://github.com/sanity-io/cli/commit/d7c2f846f4eb591e4b60c28b2ea16fa3c447fde0))
* add import studio config util ([#185](https://github.com/sanity-io/cli/issues/185)) ([c1be611](https://github.com/sanity-io/cli/commit/c1be61110e7bb954ebdf580753dcdb555dcf55db))
* add install command ([#82](https://github.com/sanity-io/cli/issues/82)) ([78dec5b](https://github.com/sanity-io/cli/commit/78dec5ba7e820ab8024a86fb5d8bde480c23d1aa))
* add integration when creating a new project through cli ([#6639](https://github.com/sanity-io/cli/issues/6639)) ([6ea564c](https://github.com/sanity-io/cli/commit/6ea564ce252e00996dd15bb70bee0fe82e28736e))
* add plugin for not found commands ([#25](https://github.com/sanity-io/cli/issues/25)) ([114e567](https://github.com/sanity-io/cli/commit/114e567bdf4ab81dd6d053a3d7e201dc274eca89))
* add support for React Compiler beta ([#7702](https://github.com/sanity-io/cli/issues/7702)) ([ca0374d](https://github.com/sanity-io/cli/commit/ca0374df99ba2e29c8ffeb4a09b41e701d008623))
* add undeploy command ([#39](https://github.com/sanity-io/cli/issues/39)) ([31ecf02](https://github.com/sanity-io/cli/commit/31ecf0228836b8db6829f41fd6a356ed223a4b45))
* add ux core helpers ([#219](https://github.com/sanity-io/cli/issues/219)) ([d2a7d78](https://github.com/sanity-io/cli/commit/d2a7d7858a1c83792a02abb2cd95fe44cbe3b6ed))
* **alias:** add dataset alias commands ([#131](https://github.com/sanity-io/cli/issues/131)) ([d5b4a6e](https://github.com/sanity-io/cli/commit/d5b4a6e8eaa12f345e66db8d21375a47931b46cd))
* **backup:** add backup commands ([#102](https://github.com/sanity-io/cli/issues/102)) ([4428039](https://github.com/sanity-io/cli/commit/44280392cd07654a676d3acecee36ef39d4d7860))
* **backup:** add backup download command ([#138](https://github.com/sanity-io/cli/issues/138)) ([6468291](https://github.com/sanity-io/cli/commit/6468291042085a7060f81197a413d95a88d26dd9))
* **blueprints:** add blueprints and functions commands ([#99](https://github.com/sanity-io/cli/issues/99)) ([5e5f551](https://github.com/sanity-io/cli/commit/5e5f551f617d9bfdc85b95948a5fbea095d5e0d9))
* **cli:** add build command ([#36](https://github.com/sanity-io/cli/issues/36)) ([3bd4b77](https://github.com/sanity-io/cli/commit/3bd4b778b7543ac34397c3ab2e31e9aeae02189d))
* **cli:** add cors entry automatically for template package ([#8035](https://github.com/sanity-io/cli/issues/8035)) ([27254d2](https://github.com/sanity-io/cli/commit/27254d2b7837d29a199049a9bd818a7ecaedfe3d))
* **cli:** add dev command ([#54](https://github.com/sanity-io/cli/issues/54)) ([d813342](https://github.com/sanity-io/cli/commit/d813342fd37422c785c74f6747af73a81f42fb18))
* **cli:** add preview command ([#47](https://github.com/sanity-io/cli/issues/47)) ([68de8c6](https://github.com/sanity-io/cli/commit/68de8c62b7dd9f21d6b3370e3809ba2438dc58f1))
* **cli:** add projects list command ([#26](https://github.com/sanity-io/cli/issues/26)) ([064ffcf](https://github.com/sanity-io/cli/commit/064ffcf2ee4778c54a82d86dfc1c3acafc3a0646))
* **cli:** add SanityCliCommand base class and test helpers ([#13](https://github.com/sanity-io/cli/issues/13)) ([e192755](https://github.com/sanity-io/cli/commit/e192755191993326c821615621875841afb008c1))
* **cli:** add start command ([#46](https://github.com/sanity-io/cli/issues/46)) ([86c7b24](https://github.com/sanity-io/cli/commit/86c7b2436eee27294670d5f3129440c110192fb7))
* **cli:** Add support for exporting dataset with cursor ([#7068](https://github.com/sanity-io/cli/issues/7068)) ([27bc5e2](https://github.com/sanity-io/cli/commit/27bc5e28725a0b4fdf3370dfaad66cb2c6ae5f55))
* **cli:** add support for remote templates with `--template`  ([#7867](https://github.com/sanity-io/cli/issues/7867)) ([5752016](https://github.com/sanity-io/cli/commit/57520163df84de66b64c1a7c1f048ace00e3db86))
* **cli:** add test-template for testing `--template` flag ([#7877](https://github.com/sanity-io/cli/issues/7877)) ([f4b8ae5](https://github.com/sanity-io/cli/commit/f4b8ae578b6f2437923d4d9a62c581db189f36a6))
* **cli:** add users list command ([#23](https://github.com/sanity-io/cli/issues/23)) ([03bebfe](https://github.com/sanity-io/cli/commit/03bebfed93d8baad58b8401c2dbe6c83b0446c37))
* **cli:** add versions command ([#18](https://github.com/sanity-io/cli/issues/18)) ([66a94c4](https://github.com/sanity-io/cli/commit/66a94c422ad2a6f9b442d849d0f11f31064062cf))
* **cli:** add warning and docs for react-19 and Next.Js combined ([#7660](https://github.com/sanity-io/cli/issues/7660)) ([d672adb](https://github.com/sanity-io/cli/commit/d672adb80263f02cc1e6bc0397968f69821de605))
* **cli:** allow credentials when adding CORS entry ([#8191](https://github.com/sanity-io/cli/issues/8191)) ([5368c2b](https://github.com/sanity-io/cli/commit/5368c2b14649245936935ca8399441e599665536))
* **cli:** allow the ability to specify package manager in init command ([#6820](https://github.com/sanity-io/cli/issues/6820)) ([b06a5fa](https://github.com/sanity-io/cli/commit/b06a5fa67afbb213cc10855b9a1d9ee657e981e0))
* **cli:** copy additions for remote project bootstrapper ([#8141](https://github.com/sanity-io/cli/issues/8141)) ([501de29](https://github.com/sanity-io/cli/commit/501de29b825b81c0ac5da911cd51e1387cf69595))
* **cli:** customize help text if coming from `create-sanity` module ([e5678e7](https://github.com/sanity-io/cli/commit/e5678e78e177fc13dce37a33450a35906240e0a9))
* **cli:** generate read token conditionally for remote template ([#7953](https://github.com/sanity-io/cli/issues/7953)) ([d037200](https://github.com/sanity-io/cli/commit/d037200c62030ced1132def7d0b6c2c472fa27a4))
* **cli:** implement minimal init command boilerplate ([007225f](https://github.com/sanity-io/cli/commit/007225fd960adc8d170c38f87c430d920509f34c))
* **cli:** misc copy changes ([#8003](https://github.com/sanity-io/cli/issues/8003)) ([fca9abd](https://github.com/sanity-io/cli/commit/fca9abddeee8e34b9ca6590a8ffb69706b8357b8))
* **cli:** prepare nextjs starter template for live mode ([#7633](https://github.com/sanity-io/cli/issues/7633)) ([1374b91](https://github.com/sanity-io/cli/commit/1374b91f5ec8c5da277a5d7ea60a257ec7055527))
* **cli:** prepare nextjs starter template for live mode ([#7633](https://github.com/sanity-io/cli/issues/7633)) ([483e05e](https://github.com/sanity-io/cli/commit/483e05e24c0b20f00f58c50bb06f18ea5def5759))
* **cli:** remove .github dirs when initializing with a remote template ([#8036](https://github.com/sanity-io/cli/issues/8036)) ([ac5ed0a](https://github.com/sanity-io/cli/commit/ac5ed0a97ad9ceb7abdb0607ebc6bbbb76acefa3))
* **cli:** remove is-builtin-module ([#6579](https://github.com/sanity-io/cli/issues/6579)) ([d8393e5](https://github.com/sanity-io/cli/commit/d8393e5bc78f31af7f12848f761a9a16119c500a))
* **cli:** remove patching of tsconfig.json and thus silver-fleece dependency ([#8114](https://github.com/sanity-io/cli/issues/8114)) ([ac5105a](https://github.com/sanity-io/cli/commit/ac5105a82097a6ae01bc166fa2694b1f03854d8e))
* **cli:** remove v2 init messaging ([#7887](https://github.com/sanity-io/cli/issues/7887)) ([b654255](https://github.com/sanity-io/cli/commit/b65425568ccb074098d067955f8a2aacc455884b))
* **cli:** skip directories without .env.example when bootstrapping remote template ([#8216](https://github.com/sanity-io/cli/issues/8216)) ([e13bd8c](https://github.com/sanity-io/cli/commit/e13bd8c445381ce280d0badb60e52ad6fa50d87c))
* **cli:** slim down remote test template ([#8224](https://github.com/sanity-io/cli/issues/8224)) ([29c556d](https://github.com/sanity-io/cli/commit/29c556da4e186b198823cd222c9a25cf54da3791))
* **cli:** update CLI to use new deploy endpoint ([#7244](https://github.com/sanity-io/cli/issues/7244)) ([f8006d7](https://github.com/sanity-io/cli/commit/f8006d75f45de3d0acea8a7691e26204e1a8dbfc))
* **cli:** use `@sanity/template-validator` package ([#8014](https://github.com/sanity-io/cli/issues/8014)) ([39cd2cf](https://github.com/sanity-io/cli/commit/39cd2cfb3b72e07eaf5a481cc0c0a30b26a59cce))
* **cli:** use `@vercel/frameworks` in `bootstrapRemoteTemplate` ([#8001](https://github.com/sanity-io/cli/issues/8001)) ([8c91427](https://github.com/sanity-io/cli/commit/8c91427db7cdd46f8aeeb14d5e90ab622069012f))
* **cli:** use auto-updates flag in init ([#7401](https://github.com/sanity-io/cli/issues/7401)) ([b145cfb](https://github.com/sanity-io/cli/commit/b145cfbb78bf41001f4a64383a68e810dd401712))
* **codegen:** generate SanityQueries interface in @sanity/codegen ([#6997](https://github.com/sanity-io/cli/issues/6997)) ([#7304](https://github.com/sanity-io/cli/issues/7304)) ([eaa41b9](https://github.com/sanity-io/cli/commit/eaa41b9cf23d730ff335b92e779a31c0a06d1fc3))
* **cors:** add cors add command ([#80](https://github.com/sanity-io/cli/issues/80)) ([ff62eb2](https://github.com/sanity-io/cli/commit/ff62eb211266e3404d51a7d025e9b54df59dcf3c))
* **cors:** add cors delete command ([#81](https://github.com/sanity-io/cli/issues/81)) ([c0dcd56](https://github.com/sanity-io/cli/commit/c0dcd560c9bf1a36f4062e3773ff200ab80d6e21))
* **cors:** add cors list command ([#78](https://github.com/sanity-io/cli/issues/78)) ([9aecd3d](https://github.com/sanity-io/cli/commit/9aecd3d72c15b8ad8b7418c8e1956da60bab446c))
* **create-sanity:** spawn new `@sanity/cli` from `create-sanity` ([#50](https://github.com/sanity-io/cli/issues/50)) ([dfd1e35](https://github.com/sanity-io/cli/commit/dfd1e35f18f3cc330082c0211584ab3f61f58c6f))
* **dataset:** add dataset copy command ([#157](https://github.com/sanity-io/cli/issues/157)) ([34e7800](https://github.com/sanity-io/cli/commit/34e7800b5bf142d763baaf7ecdafd2dc0e054035))
* **dataset:** add dataset create command ([#130](https://github.com/sanity-io/cli/issues/130)) ([bf8a97c](https://github.com/sanity-io/cli/commit/bf8a97c70ae9022f248630f5ccac2a0a0da740ec))
* **dataset:** add dataset delete command ([#125](https://github.com/sanity-io/cli/issues/125)) ([da8e4d9](https://github.com/sanity-io/cli/commit/da8e4d9652c5f1e909419d1fb8639a5ff2102e4d))
* **dataset:** add dataset list command ([#129](https://github.com/sanity-io/cli/issues/129)) ([1db4136](https://github.com/sanity-io/cli/commit/1db4136d58a56696c5e860238493deaa681fa273))
* **dataset:** add dataset visibility commands ([#126](https://github.com/sanity-io/cli/issues/126)) ([c83a7d2](https://github.com/sanity-io/cli/commit/c83a7d2aac246b96f3e2da710ac126deceecc44b))
* **datasets:** add dataset import command ([#124](https://github.com/sanity-io/cli/issues/124)) ([510810f](https://github.com/sanity-io/cli/commit/510810f37491e9d43562f97e393bb132c847cb65))
* **datasets:** add datasets export command ([#123](https://github.com/sanity-io/cli/issues/123)) ([0633345](https://github.com/sanity-io/cli/commit/0633345eec81679bfb9965e247ea830b913032ee))
* **docs:** add docs commands ([#94](https://github.com/sanity-io/cli/issues/94)) ([e6b5500](https://github.com/sanity-io/cli/commit/e6b550043c316acd7b7c64367e92754a1105e4ca))
* **documents:** add documents create command ([#106](https://github.com/sanity-io/cli/issues/106)) ([2a0ed33](https://github.com/sanity-io/cli/commit/2a0ed33a5a1bef47739a5de57379bf691a0d9221))
* **documents:** add documents delete command ([#85](https://github.com/sanity-io/cli/issues/85)) ([8a8d542](https://github.com/sanity-io/cli/commit/8a8d542426c8c38dc3f1dec39d6924d1fd37ee57))
* **documents:** add documents get command ([#84](https://github.com/sanity-io/cli/issues/84)) ([aeea660](https://github.com/sanity-io/cli/commit/aeea66066d688a5929f2f042e1e3977ec748224c))
* **documents:** add documents query command ([#101](https://github.com/sanity-io/cli/issues/101)) ([564cb4a](https://github.com/sanity-io/cli/commit/564cb4afe09afca3908383fd74172d8a571bdb99))
* **documents:** move documents validate command ([#182](https://github.com/sanity-io/cli/issues/182)) ([7d12569](https://github.com/sanity-io/cli/commit/7d12569520375e85bbb74fb171850c91bd5e699f))
* embellish nextjs blog starter ([#7258](https://github.com/sanity-io/cli/issues/7258)) ([0e012cd](https://github.com/sanity-io/cli/commit/0e012cd644eeca4247d59e865a74722b84cb04a6))
* **exec:** move cliClient ([#180](https://github.com/sanity-io/cli/issues/180)) ([47c89ea](https://github.com/sanity-io/cli/commit/47c89ea08ebceb575cb375f02b62ba5ccbf2f7c2))
* **exec:** move exec command ([#186](https://github.com/sanity-io/cli/issues/186)) ([517a759](https://github.com/sanity-io/cli/commit/517a759dbc99c97e2d19dcf00ba653eb0fcadb23))
* **graphql:** add graphql list command ([#139](https://github.com/sanity-io/cli/issues/139)) ([c77149e](https://github.com/sanity-io/cli/commit/c77149e8bab14938e2974d34d5b088157fd6f9b8))
* **graphql:** migrate graphql undeploy command ([#194](https://github.com/sanity-io/cli/issues/194)) ([3915139](https://github.com/sanity-io/cli/commit/39151391c3b557a53ed26e03016d9b7f7683285a))
* **hook:** add hook attempt endpoint ([#100](https://github.com/sanity-io/cli/issues/100)) ([0916eef](https://github.com/sanity-io/cli/commit/0916eef67ed979ce893aa27e438124e7e3b88931))
* **hook:** add hook create command ([#74](https://github.com/sanity-io/cli/issues/74)) ([c2126e5](https://github.com/sanity-io/cli/commit/c2126e5e06fdb8500a6dc866285bcd27edc220f9))
* **hook:** add hook delete command ([#89](https://github.com/sanity-io/cli/issues/89)) ([6100234](https://github.com/sanity-io/cli/commit/61002346669776a139eff85e9b734a324057901d))
* **hook:** add hook list command ([#73](https://github.com/sanity-io/cli/issues/73)) ([088f222](https://github.com/sanity-io/cli/commit/088f222c79852a2d1f1c15fe6a2ec9a8bc043335))
* improve clarity of undeploy output w/ apps ([#173](https://github.com/sanity-io/cli/issues/173)) ([4b17e0b](https://github.com/sanity-io/cli/commit/4b17e0bad91fbd8db158a3e6001f0cd8e5f44a48))
* **init:** migration of init command setup, plan/coupon logic, and authentication logic ([#199](https://github.com/sanity-io/cli/issues/199)) ([012168e](https://github.com/sanity-io/cli/commit/012168eb03ab7e309918206511dc60c21dea573f))
* **mcp:** add mcp configure command ([#203](https://github.com/sanity-io/cli/issues/203)) ([d07541e](https://github.com/sanity-io/cli/commit/d07541e79391257912e61e3f4b5c8c9c9953716c))
* **media:** add media create-aspect command ([#144](https://github.com/sanity-io/cli/issues/144)) ([ea8224f](https://github.com/sanity-io/cli/commit/ea8224fccf50923134991effd1395ab6b800ece9))
* **media:** add media delete-aspect command ([#152](https://github.com/sanity-io/cli/issues/152)) ([47025ad](https://github.com/sanity-io/cli/commit/47025ad8ef9ae379b6e1b8e2cf6f62b51124c0e3))
* **media:** add media deploy-aspect command ([#160](https://github.com/sanity-io/cli/issues/160)) ([40444e7](https://github.com/sanity-io/cli/commit/40444e725d7d7bb79c971cc77c6d7a7d4d6b68ea))
* **media:** add media export command ([#158](https://github.com/sanity-io/cli/issues/158)) ([87a5d39](https://github.com/sanity-io/cli/commit/87a5d395aeed4a496c321430d80de9358c9be4e0))
* **media:** move import media command ([#171](https://github.com/sanity-io/cli/issues/171)) ([a739cf1](https://github.com/sanity-io/cli/commit/a739cf148d4de687c11e5e8a0d25fba657629269))
* migrate auto update functionality from production CLI ([#209](https://github.com/sanity-io/cli/issues/209)) ([86f42c2](https://github.com/sanity-io/cli/commit/86f42c26c05ba81d8592b7d12b54ec824a453711))
* migrate manifest extract command ([#187](https://github.com/sanity-io/cli/issues/187)) ([60137b1](https://github.com/sanity-io/cli/commit/60137b1e85ebf225c37cb691edfa3925d11bb38b))
* migrate schema extract ([#190](https://github.com/sanity-io/cli/issues/190)) ([65a486e](https://github.com/sanity-io/cli/commit/65a486ee1681e4e80ad51df3c75247eb47e90a2b))
* **migration:** add migration list command ([#167](https://github.com/sanity-io/cli/issues/167)) ([fd0a19d](https://github.com/sanity-io/cli/commit/fd0a19da10736f91fcb3f893e7eb3daf962882ec))
* **migration:** move migration create command ([#166](https://github.com/sanity-io/cli/issues/166)) ([c1af277](https://github.com/sanity-io/cli/commit/c1af2774b488df538c334bcce68a2d49a4b41e5b))
* **migration:** move run command to new CLI ([#174](https://github.com/sanity-io/cli/issues/174)) ([6ba3713](https://github.com/sanity-io/cli/commit/6ba3713b2c873c9ae065a41eab5f6e7bc902b1f5))
* move mock browser utils ([#175](https://github.com/sanity-io/cli/issues/175)) ([db43757](https://github.com/sanity-io/cli/commit/db437572b2aaeba2920a419c9c55966567495751))
* move tree util to core package ([#208](https://github.com/sanity-io/cli/issues/208)) ([83417a2](https://github.com/sanity-io/cli/commit/83417a2a004338e62a5f898f733c4d1732b36e9b))
* move up call to PATCH metadata after bootstrapping template files ([#6828](https://github.com/sanity-io/cli/issues/6828)) ([b008b5d](https://github.com/sanity-io/cli/commit/b008b5deebe73da3a79c96c3d7e8f58f7e6a41e4))
* **openapi:** add openapi get and list commands ([#110](https://github.com/sanity-io/cli/issues/110)) ([927e27e](https://github.com/sanity-io/cli/commit/927e27e7922c7b8457e3065c1e9a93212e2e3ea1))
* parse cli config using Zod schema in `createCliConfig` ([547ac52](https://github.com/sanity-io/cli/commit/547ac528f7a762ee2295513eb09f6b2d439d8119))
* **sanity:** studio manifests cont ([#7403](https://github.com/sanity-io/cli/issues/7403)) ([c8f755a](https://github.com/sanity-io/cli/commit/c8f755afc3fa1c21a1bac298fd78f2cbe77aa15f))
* **schema:** move schema validate command ([#191](https://github.com/sanity-io/cli/issues/191)) ([11b746e](https://github.com/sanity-io/cli/commit/11b746ea0f4988bd35b8e4c83d0f930d4b8a7929))
* set print width to 40 ([#6068](https://github.com/sanity-io/cli/issues/6068)) ([0193ce2](https://github.com/sanity-io/cli/commit/0193ce2dae84e02853e17521692ba7af1fb43437))
* **telemetry:** add telemetry commands ([#75](https://github.com/sanity-io/cli/issues/75)) ([9f0ca66](https://github.com/sanity-io/cli/commit/9f0ca6688b61872c34a2eb396d2865ce3e085230))
* **telemetry:** shows a disclosure in all CLI commands ([#69](https://github.com/sanity-io/cli/issues/69)) ([406024a](https://github.com/sanity-io/cli/commit/406024a2e55cd6ef59432bde22df5f6bd6de04cb))
* throw helpful errors during deploy & improve CLI logging ([#177](https://github.com/sanity-io/cli/issues/177)) ([87129f6](https://github.com/sanity-io/cli/commit/87129f6d70a70b54cdea50c572bdb42c93b2eb81))
* **tokens:** add tokens add command ([#87](https://github.com/sanity-io/cli/issues/87)) ([fc5ce91](https://github.com/sanity-io/cli/commit/fc5ce915659f2aa9e875699bad30134aadb38b81))
* **tokens:** add tokens delete command ([#88](https://github.com/sanity-io/cli/issues/88)) ([2e2602e](https://github.com/sanity-io/cli/commit/2e2602ea351ed7b442ff1be889aca69498496d7b))
* **tokens:** add tokens list command ([#86](https://github.com/sanity-io/cli/issues/86)) ([a1fa939](https://github.com/sanity-io/cli/commit/a1fa9392b1788d2f229e6815d018c06e416ece1f))
* **typegen:** add all schema types exported union ([#6962](https://github.com/sanity-io/cli/issues/6962)) ([ca4c28b](https://github.com/sanity-io/cli/commit/ca4c28b51141517372560910ced9203c5fdf464f))
* **typegen:** add optout for prettier formatting ([#6702](https://github.com/sanity-io/cli/issues/6702)) ([3310141](https://github.com/sanity-io/cli/commit/3310141fc3ed56057f046d3c503ca790fb394fa5))
* **typegen:** set overload client methods to default to true ([#7390](https://github.com/sanity-io/cli/issues/7390)) ([d067205](https://github.com/sanity-io/cli/commit/d067205d3a91625822331e69e574235378b04b64))
* update schema types formatting and init to include src ([#7094](https://github.com/sanity-io/cli/issues/7094)) ([6436fae](https://github.com/sanity-io/cli/commit/6436fae72576212fcbc97b0e6dd4090ec1ced089))
* upgrade `sanity init` for Next.js to next-sanity v9 ([#6644](https://github.com/sanity-io/cli/issues/6644)) ([aeaa9ca](https://github.com/sanity-io/cli/commit/aeaa9ca1c8ce5708ad12778b920d2b7136904b18))
* use eslint 9 for new studios ([#7978](https://github.com/sanity-io/cli/issues/7978)) ([8880e62](https://github.com/sanity-io/cli/commit/8880e624a908b8a60a940bc8741206af8296e58a))
* **users:** add users invite command ([#108](https://github.com/sanity-io/cli/issues/108)) ([cfba720](https://github.com/sanity-io/cli/commit/cfba720c44da8686013c98c29e867f2692b48406))


### Bug Fixes

* add --legacy-peer-deps to next-sanity pacakge install ([#7806](https://github.com/sanity-io/cli/issues/7806)) ([f69d87e](https://github.com/sanity-io/cli/commit/f69d87efcfe81d011bceceefbd75201d28df0174))
* allow passing more client options to methods ([#120](https://github.com/sanity-io/cli/issues/120)) ([5c131aa](https://github.com/sanity-io/cli/commit/5c131aa50ea24f017d74db89bf9675a52bf0b3a1))
* allow using cli in sdk apps and add tests ([#27](https://github.com/sanity-io/cli/issues/27)) ([15554c6](https://github.com/sanity-io/cli/commit/15554c69cf7546e849420cf05d51de94a1f93fcd))
* **cli:** align minimum node version in package with runtime check ([#30](https://github.com/sanity-io/cli/issues/30)) ([e64d763](https://github.com/sanity-io/cli/commit/e64d763c73d95b8c2e6d7bef11494b8db06a1322))
* **cli:** don't prepend message about .env.local if creating .env.local ([#7288](https://github.com/sanity-io/cli/issues/7288)) ([1221967](https://github.com/sanity-io/cli/commit/1221967a432398f2c72406ce265655032ea13bff))
* **cli:** outputters should respect %s ([#8037](https://github.com/sanity-io/cli/issues/8037)) ([d79d518](https://github.com/sanity-io/cli/commit/d79d51897a5e50d3aba3c864fa312daf173f6a03))
* **cli:** remove v2 commands ([#5750](https://github.com/sanity-io/cli/issues/5750)) ([e42bdde](https://github.com/sanity-io/cli/commit/e42bddeb01be70d8c30bf99c921d9d7ac9835d38))
* **CLI:** Set integration value for createProject directly in the createProject function ([#7021](https://github.com/sanity-io/cli/issues/7021)) ([cb4e293](https://github.com/sanity-io/cli/commit/cb4e2932ccefca0902541e387d3b870777a11da8))
* **core:** error reporting consent tweaks ([#7131](https://github.com/sanity-io/cli/issues/7131)) ([50c62f4](https://github.com/sanity-io/cli/commit/50c62f414f69e0fd2326784e8f7b7c02787dddf8))
* **core:** fixes issues with loading cli config ([#137](https://github.com/sanity-io/cli/issues/137)) ([8cf088e](https://github.com/sanity-io/cli/commit/8cf088e4afc06247dc82c09a6bceeb2b89f06c8b))
* **deps:** bump `@sanity/pkg-utils` to `v6.10.7` ([#7277](https://github.com/sanity-io/cli/issues/7277)) ([6bfc2a8](https://github.com/sanity-io/cli/commit/6bfc2a82c4eca0d42f5513b73d8ad70a86e753ab))
* **deps:** bump react + sanity dependencies ([#192](https://github.com/sanity-io/cli/issues/192)) ([8f8c009](https://github.com/sanity-io/cli/commit/8f8c009dbb63675d5fcfe10266dc24b118d4fcfa))
* **deps:** deprecation warnings due to `glob` dependency ([#7977](https://github.com/sanity-io/cli/issues/7977)) ([8a30e2e](https://github.com/sanity-io/cli/commit/8a30e2e55e84c0b0f96aeda6de532910524ec87b))
* **deps:** update dependency @inquirer/prompts to ^7.8.6 ([#140](https://github.com/sanity-io/cli/issues/140)) ([b481a84](https://github.com/sanity-io/cli/commit/b481a84d9a44b983c2cdca4bcda65bc7536ee483))
* **deps:** update dependency @sanity/client to ^6.16.0 ([#6548](https://github.com/sanity-io/cli/issues/6548)) ([cf7a952](https://github.com/sanity-io/cli/commit/cf7a95243c140b18ce5137c3efb2630b2bee92ff))
* **deps:** update dependency @sanity/client to ^6.17.2 ([#6567](https://github.com/sanity-io/cli/issues/6567)) ([617ecbf](https://github.com/sanity-io/cli/commit/617ecbf91ac7c622b1029f5cb507863b090cddd4))
* **deps:** update dependency @sanity/client to ^6.18.0 ([#6604](https://github.com/sanity-io/cli/issues/6604)) ([41317be](https://github.com/sanity-io/cli/commit/41317be74a353b1d30840e163b4497e8aef9e826))
* **deps:** update dependency @sanity/client to ^6.18.1 ([#6653](https://github.com/sanity-io/cli/issues/6653)) ([485a124](https://github.com/sanity-io/cli/commit/485a124988a3fbfa5486ad478d6eb919b1e9341f))
* **deps:** update dependency @sanity/client to ^6.18.2 ([#6674](https://github.com/sanity-io/cli/issues/6674)) ([df6f0d3](https://github.com/sanity-io/cli/commit/df6f0d31e6255b03d20a2321c883d6bb679a1dfa))
* **deps:** update dependency @sanity/client to ^6.18.3 ([#6762](https://github.com/sanity-io/cli/issues/6762)) ([fe84199](https://github.com/sanity-io/cli/commit/fe84199aa36fe15e92f3d12a2d9ecc2eccd9522a))
* **deps:** update dependency @sanity/client to ^6.19.0 ([#6781](https://github.com/sanity-io/cli/issues/6781)) ([6dde803](https://github.com/sanity-io/cli/commit/6dde803ab1a446aebf0a5e05bf3c0117316f3de6))
* **deps:** update dependency @sanity/client to ^6.20.0 ([#6886](https://github.com/sanity-io/cli/issues/6886)) ([d3a8ae6](https://github.com/sanity-io/cli/commit/d3a8ae6dafd1bbc58dcda198ff95db5a835ad977))
* **deps:** update dependency @sanity/client to ^6.20.1 ([#7088](https://github.com/sanity-io/cli/issues/7088)) ([95eda1c](https://github.com/sanity-io/cli/commit/95eda1c0478bd2d553c809475a0c52c6458c62cb))
* **deps:** update dependency @sanity/client to ^6.20.2 ([#7111](https://github.com/sanity-io/cli/issues/7111)) ([edbc0a2](https://github.com/sanity-io/cli/commit/edbc0a2019f7ff8f28f241f0feed39df1f71f5c6))
* **deps:** update dependency @sanity/client to ^6.21.0 ([#7137](https://github.com/sanity-io/cli/issues/7137)) ([42a8505](https://github.com/sanity-io/cli/commit/42a850514afdb9cad3cea9db802b853ab80c16a0))
* **deps:** update dependency @sanity/client to ^6.21.1 ([#7215](https://github.com/sanity-io/cli/issues/7215)) ([4390d55](https://github.com/sanity-io/cli/commit/4390d559fe4a943cffcd16c5ad18adc7438df552))
* **deps:** update dependency @sanity/client to ^6.21.2 ([#7354](https://github.com/sanity-io/cli/issues/7354)) ([51da113](https://github.com/sanity-io/cli/commit/51da113d6f77ccd7b5dd9c20938edf8362d51381))
* **deps:** update dependency @sanity/client to ^6.21.3 ([#7373](https://github.com/sanity-io/cli/issues/7373)) ([315a582](https://github.com/sanity-io/cli/commit/315a5828affddc7eda85e13488cfeba4849e827b))
* **deps:** update dependency @sanity/client to ^6.22.0 ([#7522](https://github.com/sanity-io/cli/issues/7522)) ([92d738c](https://github.com/sanity-io/cli/commit/92d738ce6596a15e494becbb9969e80acbded031))
* **deps:** update dependency @sanity/client to ^6.22.1 ([#7585](https://github.com/sanity-io/cli/issues/7585)) ([18a4421](https://github.com/sanity-io/cli/commit/18a4421ca2b6fd09900c2b596d847476586518ac))
* **deps:** update dependency @sanity/client to ^6.22.2 ([#7625](https://github.com/sanity-io/cli/issues/7625)) ([ab91c84](https://github.com/sanity-io/cli/commit/ab91c843e908cb7358d635084f83c695144d1602))
* **deps:** update dependency @sanity/client to ^6.22.3 ([#7766](https://github.com/sanity-io/cli/issues/7766)) ([95ac6bd](https://github.com/sanity-io/cli/commit/95ac6bd26b3b959fe355bc02da0b5564ae63d75f))
* **deps:** update dependency @sanity/client to ^6.22.4 ([#7785](https://github.com/sanity-io/cli/issues/7785)) ([036656b](https://github.com/sanity-io/cli/commit/036656bbb8e098b251db45f7cbbdc55eb0b5d223))
* **deps:** update dependency @sanity/client to ^6.22.5 ([#7837](https://github.com/sanity-io/cli/issues/7837)) ([9ecec64](https://github.com/sanity-io/cli/commit/9ecec64a3806cc6786d34c0e43385a96371a1798))
* **deps:** update dependency @sanity/client to ^6.23.0 ([#7931](https://github.com/sanity-io/cli/issues/7931)) ([9205e43](https://github.com/sanity-io/cli/commit/9205e4366698fc6e176237b9f73b9bd89445f10b))
* **deps:** update dependency @sanity/client to ^6.24.0 ([#7935](https://github.com/sanity-io/cli/issues/7935)) ([2a074e5](https://github.com/sanity-io/cli/commit/2a074e562073dba1ef85fd0fa14a4a3247ed382a))
* **deps:** update dependency @sanity/client to ^6.24.1 ([#7938](https://github.com/sanity-io/cli/issues/7938)) ([b20186d](https://github.com/sanity-io/cli/commit/b20186d3ce5008122cf704fef689293da4c95ddb))
* **deps:** update dependency @sanity/client to ^6.24.3 ([#8213](https://github.com/sanity-io/cli/issues/8213)) ([2c67a10](https://github.com/sanity-io/cli/commit/2c67a10894963088698a57d425b29771e6bc27ef))
* **deps:** update dependency @sanity/icons to ^3.5.0 ([#7929](https://github.com/sanity-io/cli/issues/7929)) ([fffbc3e](https://github.com/sanity-io/cli/commit/fffbc3ecc7069a51ede9f6a309c7d8af6434d349))
* **deps:** update dependency @sanity/icons to ^3.5.1 ([#7989](https://github.com/sanity-io/cli/issues/7989)) ([aa8cdb7](https://github.com/sanity-io/cli/commit/aa8cdb7669e903e9ab5c72dd87f30f9d57a0ebf6))
* **deps:** update dependency @sanity/icons to ^3.5.2 ([#7991](https://github.com/sanity-io/cli/issues/7991)) ([08f4465](https://github.com/sanity-io/cli/commit/08f446591e9b3d8b962838cb373a509c92e7ebd4))
* **deps:** update dependency @sanity/icons to ^3.5.3 ([#8071](https://github.com/sanity-io/cli/issues/8071)) ([3be3eb0](https://github.com/sanity-io/cli/commit/3be3eb0a591b84c06dace6cac652d79931a4f6d7))
* **deps:** update dependency @sanity/icons to ^3.5.5 ([#8106](https://github.com/sanity-io/cli/issues/8106)) ([3106b8d](https://github.com/sanity-io/cli/commit/3106b8d2353912905cdf10e845318f38bee27ac1))
* **deps:** update dependency @sanity/icons to ^3.5.6 ([#8129](https://github.com/sanity-io/cli/issues/8129)) ([0c99b03](https://github.com/sanity-io/cli/commit/0c99b03e1929c6f4a15577ede1d1d6fb88dde693))
* **deps:** update dependency @sanity/icons to ^3.5.7 ([#8155](https://github.com/sanity-io/cli/issues/8155)) ([9b6f1a5](https://github.com/sanity-io/cli/commit/9b6f1a5f84a5572d0583870cf21c737828967a2d))
* **deps:** update dependency @types/node to ^20.19.25 ([#178](https://github.com/sanity-io/cli/issues/178)) ([366c53b](https://github.com/sanity-io/cli/commit/366c53be94fa6470255857776098c542ffc2d132))
* **deps:** update dependency debug to ^4.4.3 ([#154](https://github.com/sanity-io/cli/issues/154)) ([f1cf942](https://github.com/sanity-io/cli/commit/f1cf942572ba47b5f91652748fdfa05eecc8260d))
* **deps:** update dependency form-data to ^4.0.5 ([#179](https://github.com/sanity-io/cli/issues/179)) ([e75775f](https://github.com/sanity-io/cli/commit/e75775f5013513fec60ced8b0456e50a27a20b2f))
* **deps:** update dependency get-it to ^8.4.28 ([#6576](https://github.com/sanity-io/cli/issues/6576)) ([6050f46](https://github.com/sanity-io/cli/commit/6050f463d2d536b19e1d04dcb062b3d5e71f088d))
* **deps:** update dependency get-it to ^8.4.29 ([#6603](https://github.com/sanity-io/cli/issues/6603)) ([ddcea20](https://github.com/sanity-io/cli/commit/ddcea206b825a506cb699c907a82607db43b0fee))
* **deps:** update dependency get-it to ^8.4.30 ([#6676](https://github.com/sanity-io/cli/issues/6676)) ([6bcf2c0](https://github.com/sanity-io/cli/commit/6bcf2c05529f172e1c69d85997fa6d6890e3ac33))
* **deps:** update dependency get-it to ^8.5.0 ([#6758](https://github.com/sanity-io/cli/issues/6758)) ([8fc8863](https://github.com/sanity-io/cli/commit/8fc8863fdaaa22c40f757c3bb96d6609a6dd32f9))
* **deps:** update dependency get-it to ^8.6.0 ([#6884](https://github.com/sanity-io/cli/issues/6884)) ([3777d9f](https://github.com/sanity-io/cli/commit/3777d9fec9330c13cf31e3548b1f0b4161448d0d))
* **deps:** update dependency get-it to ^8.6.2 ([#7052](https://github.com/sanity-io/cli/issues/7052)) ([289e7dd](https://github.com/sanity-io/cli/commit/289e7dd2fff080f5f44980d88c69fa70fa4f478c))
* **deps:** update dependency get-it to ^8.6.3 ([#7108](https://github.com/sanity-io/cli/issues/7108)) ([5a67267](https://github.com/sanity-io/cli/commit/5a672673bc943f67063f4bb32573b714d7c189ef))
* **deps:** update dependency get-it to ^8.6.4 ([#7353](https://github.com/sanity-io/cli/issues/7353)) ([779cc33](https://github.com/sanity-io/cli/commit/779cc335b431d863551cf40c737ad258f4c6b298))
* **deps:** update dependency get-it to ^8.6.5 ([#7376](https://github.com/sanity-io/cli/issues/7376)) ([8509a68](https://github.com/sanity-io/cli/commit/8509a6891f6b27ebb36f2b4935d04d545c8bd2f4))
* **deps:** update dependency get-it to ^8.6.6 ([#8221](https://github.com/sanity-io/cli/issues/8221)) ([189c2ad](https://github.com/sanity-io/cli/commit/189c2ad90317f2a2bed6b60546be7edea8dec4ad))
* **deps:** update dependency get-it to ^8.7.0 ([#221](https://github.com/sanity-io/cli/issues/221)) ([ed31a30](https://github.com/sanity-io/cli/commit/ed31a30dc6965b07651a5bfda9cd0be9d9369c73))
* **deps:** update dependency get-tsconfig to ^4.10.1 ([#31](https://github.com/sanity-io/cli/issues/31)) ([99bcddc](https://github.com/sanity-io/cli/commit/99bcddcacae0d4818d3d659b0ffa15dc90304a22))
* **deps:** update dependency groq-js to ^1.10.0 ([#7053](https://github.com/sanity-io/cli/issues/7053)) ([d222180](https://github.com/sanity-io/cli/commit/d22218007c2dc6c3b85e2c48581fa161cd508207))
* **deps:** update dependency groq-js to ^1.11.0 ([#7229](https://github.com/sanity-io/cli/issues/7229)) ([21854bd](https://github.com/sanity-io/cli/commit/21854bdf99fce46016c0d46015af0cf00c5632c2))
* **deps:** update dependency groq-js to ^1.11.1 ([#7247](https://github.com/sanity-io/cli/issues/7247)) ([b59457d](https://github.com/sanity-io/cli/commit/b59457d38d217d0b01835f4246221433385b58ba))
* **deps:** update dependency groq-js to ^1.12.0 ([#7252](https://github.com/sanity-io/cli/issues/7252)) ([5c04960](https://github.com/sanity-io/cli/commit/5c04960936693a78859e712f47ad927ce1d08ad4))
* **deps:** update dependency groq-js to ^1.13.0 ([#7424](https://github.com/sanity-io/cli/issues/7424)) ([c7034d5](https://github.com/sanity-io/cli/commit/c7034d50ef9365ead3859e6157bc6951b765039f))
* **deps:** update dependency groq-js to ^1.14.0 ([#7738](https://github.com/sanity-io/cli/issues/7738)) ([f4a6a65](https://github.com/sanity-io/cli/commit/f4a6a6547c9efe0f30854196291261910ac9dedc))
* **deps:** update dependency groq-js to ^1.14.0 ([#7738](https://github.com/sanity-io/cli/issues/7738)) ([a4fc610](https://github.com/sanity-io/cli/commit/a4fc6102e7c4ad3ef6271ae5d922899adf4402fd))
* **deps:** update dependency groq-js to ^1.14.1 ([#7910](https://github.com/sanity-io/cli/issues/7910)) ([de193d9](https://github.com/sanity-io/cli/commit/de193d9161f5ade797597356a06f3fc3324dea80))
* **deps:** update dependency groq-js to ^1.14.2 ([#7985](https://github.com/sanity-io/cli/issues/7985)) ([b29b931](https://github.com/sanity-io/cli/commit/b29b9313abd28e64ce35f791e2c8dbdcd709f705))
* **deps:** update dependency groq-js to ^1.9.0 ([#6655](https://github.com/sanity-io/cli/issues/6655)) ([055ddb8](https://github.com/sanity-io/cli/commit/055ddb8596ce5548cf297e6910f285ac5fe4ee41))
* **deps:** update dependency vite to ^7.1.6 ([#136](https://github.com/sanity-io/cli/issues/136)) ([acf30f9](https://github.com/sanity-io/cli/commit/acf30f93345efe17572b83babbe9ebdb80917223))
* **deps:** update dependency vite to v7 ([#133](https://github.com/sanity-io/cli/issues/133)) ([fd96f03](https://github.com/sanity-io/cli/commit/fd96f032e7f78fe5df45646dc70300953426c700))
* **deps:** update oclif-tooling ([#116](https://github.com/sanity-io/cli/issues/116)) ([26a92ee](https://github.com/sanity-io/cli/commit/26a92eeeccbf6b92ab91fa08fedd09f2823cd8a3))
* **deps:** update oclif-tooling ([#210](https://github.com/sanity-io/cli/issues/210)) ([66f8c47](https://github.com/sanity-io/cli/commit/66f8c47c6abac9aefbdd5d41ef0253d1ccf413b9))
* **deps:** update oclif-tooling ([#22](https://github.com/sanity-io/cli/issues/22)) ([3480a7b](https://github.com/sanity-io/cli/commit/3480a7be5b32a536299cac932b1e69a453bdbc45))
* **deps:** update sanity-tooling ([#117](https://github.com/sanity-io/cli/issues/117)) ([7543a82](https://github.com/sanity-io/cli/commit/7543a82ae8f9eb8e8acc759b6eda567fc2b49064))
* **deps:** update sanity-tooling ([#149](https://github.com/sanity-io/cli/issues/149)) ([16213b1](https://github.com/sanity-io/cli/commit/16213b1c4aec3f4a8958a88c2ecbc59b418e65e1))
* **deps:** update sanity-tooling ([#40](https://github.com/sanity-io/cli/issues/40)) ([0df98a6](https://github.com/sanity-io/cli/commit/0df98a6060ff054f68137128c732c1b2e4f4eb4d))
* **deps:** update sanity-tooling ([#59](https://github.com/sanity-io/cli/issues/59)) ([04e502c](https://github.com/sanity-io/cli/commit/04e502c9d73603c4e831c95876fd96061d65311c))
* **deps:** upgrade `vite` to v5 ([#5285](https://github.com/sanity-io/cli/issues/5285)) ([c45eac6](https://github.com/sanity-io/cli/commit/c45eac633c7c2c8710160fa51460f894d9aeccfd))
* don't read/write ref during render ([#8077](https://github.com/sanity-io/cli/issues/8077)) ([76bf6b2](https://github.com/sanity-io/cli/commit/76bf6b2c3bacb3f80dce64f628d215255b5b1b6b))
* **loader:** fixes importing TS config files ([#52](https://github.com/sanity-io/cli/issues/52)) ([218044a](https://github.com/sanity-io/cli/commit/218044ae48eb4a717c34c5ded5db6930eecc55df))
* React 19 typings (finally) ([#8171](https://github.com/sanity-io/cli/issues/8171)) ([4283e94](https://github.com/sanity-io/cli/commit/4283e943af395ea35b6c02ae5ef88773fdc44150))
* remove trailing commas when sanitizing ([#7007](https://github.com/sanity-io/cli/issues/7007)) ([94758bd](https://github.com/sanity-io/cli/commit/94758bdfa036852e5e54e664b28ee26fdbddb0df))
* set `cliInitializedAt` even if project bootstrap fails ([#7558](https://github.com/sanity-io/cli/issues/7558)) ([d83a201](https://github.com/sanity-io/cli/commit/d83a201ea96d07ca4db1f03f5d112b47c2ce4eb0))
* **typegen:** move type new line separator into formatter ([#6649](https://github.com/sanity-io/cli/issues/6649)) ([2f6f718](https://github.com/sanity-io/cli/commit/2f6f7180bc135620b785fb12a3a2b31fde8c1a7d))


### Reverts

* **cli:** use default ora options in spinner method ([#8038](https://github.com/sanity-io/cli/issues/8038)) ([432cee5](https://github.com/sanity-io/cli/commit/432cee5343a019f6278bb09e86ec9cd54a6d010e))

## [6.0.0-alpha.2](https://github.com/sanity-io/cli/compare/cli-v6.0.0-alpha.1...cli-v6.0.0-alpha.2) (2025-12-24)


### Bug Fixes

* **deps:** update dependency get-it to ^8.7.0 ([#221](https://github.com/sanity-io/cli/issues/221)) ([ed31a30](https://github.com/sanity-io/cli/commit/ed31a30dc6965b07651a5bfda9cd0be9d9369c73))

## [6.0.0-alpha.1](https://github.com/sanity-io/cli/compare/cli-v6.0.0-alpha.0...cli-v6.0.0-alpha.1) (2025-12-24)


### ⚠ BREAKING CHANGES

* add ux core helpers ([#219](https://github.com/sanity-io/cli/issues/219))

### Features

* add CI specific token label ([#7934](https://github.com/sanity-io/cli/issues/7934)) ([8652165](https://github.com/sanity-io/cli/commit/86521650df38a7e393b4a747a211ff00d2105f45))
* add CLI command to open Sanity Learn ([#7409](https://github.com/sanity-io/cli/issues/7409)) ([132d1c0](https://github.com/sanity-io/cli/commit/132d1c0455bd6939737eec524b587900b9571c06))
* add cli core package for shared utils ([#61](https://github.com/sanity-io/cli/issues/61)) ([5d2af2a](https://github.com/sanity-io/cli/commit/5d2af2a8704f5ecfa73fb3d547e4671509fdbcdf))
* add CLI options to enable auto-updating studios ([#6514](https://github.com/sanity-io/cli/issues/6514)) ([8dd7938](https://github.com/sanity-io/cli/commit/8dd79387c67f7bf410092eee49beb6da0d8556e5))
* add cli-test package for test helpers ([#62](https://github.com/sanity-io/cli/issues/62)) ([e84a0bf](https://github.com/sanity-io/cli/commit/e84a0bfcf14fbcc2e5f7b3f97911e421b82bcf05))
* add cliInitializedAt field to project metadata ([#6538](https://github.com/sanity-io/cli/issues/6538)) ([37e27c6](https://github.com/sanity-io/cli/commit/37e27c65a2a1bb61a4c952c07d93a77361ce5fec))
* add codemod command ([#143](https://github.com/sanity-io/cli/issues/143)) ([b008a3d](https://github.com/sanity-io/cli/commit/b008a3de1012655300dfe395d5ddf7d7898fffb5))
* add debug command ([#70](https://github.com/sanity-io/cli/issues/70)) ([4edb88d](https://github.com/sanity-io/cli/commit/4edb88d340d21150341b7d2a6197fb772b4fb395))
* add defineCliConfig function ([#12](https://github.com/sanity-io/cli/issues/12)) ([109c93d](https://github.com/sanity-io/cli/commit/109c93d058a18142141794e42e55b551e78eac38))
* add deploy command ([#56](https://github.com/sanity-io/cli/issues/56)) ([d37d050](https://github.com/sanity-io/cli/commit/d37d050b769c66f1381804355f16a62b1e908258))
* add hook logs command ([#76](https://github.com/sanity-io/cli/issues/76)) ([d7c2f84](https://github.com/sanity-io/cli/commit/d7c2f846f4eb591e4b60c28b2ea16fa3c447fde0))
* add import studio config util ([#185](https://github.com/sanity-io/cli/issues/185)) ([c1be611](https://github.com/sanity-io/cli/commit/c1be61110e7bb954ebdf580753dcdb555dcf55db))
* add install command ([#82](https://github.com/sanity-io/cli/issues/82)) ([78dec5b](https://github.com/sanity-io/cli/commit/78dec5ba7e820ab8024a86fb5d8bde480c23d1aa))
* add integration when creating a new project through cli ([#6639](https://github.com/sanity-io/cli/issues/6639)) ([6ea564c](https://github.com/sanity-io/cli/commit/6ea564ce252e00996dd15bb70bee0fe82e28736e))
* add plugin for not found commands ([#25](https://github.com/sanity-io/cli/issues/25)) ([114e567](https://github.com/sanity-io/cli/commit/114e567bdf4ab81dd6d053a3d7e201dc274eca89))
* add support for React Compiler beta ([#7702](https://github.com/sanity-io/cli/issues/7702)) ([ca0374d](https://github.com/sanity-io/cli/commit/ca0374df99ba2e29c8ffeb4a09b41e701d008623))
* add undeploy command ([#39](https://github.com/sanity-io/cli/issues/39)) ([31ecf02](https://github.com/sanity-io/cli/commit/31ecf0228836b8db6829f41fd6a356ed223a4b45))
* add ux core helpers ([#219](https://github.com/sanity-io/cli/issues/219)) ([d2a7d78](https://github.com/sanity-io/cli/commit/d2a7d7858a1c83792a02abb2cd95fe44cbe3b6ed))
* **alias:** add dataset alias commands ([#131](https://github.com/sanity-io/cli/issues/131)) ([d5b4a6e](https://github.com/sanity-io/cli/commit/d5b4a6e8eaa12f345e66db8d21375a47931b46cd))
* **backup:** add backup commands ([#102](https://github.com/sanity-io/cli/issues/102)) ([4428039](https://github.com/sanity-io/cli/commit/44280392cd07654a676d3acecee36ef39d4d7860))
* **backup:** add backup download command ([#138](https://github.com/sanity-io/cli/issues/138)) ([6468291](https://github.com/sanity-io/cli/commit/6468291042085a7060f81197a413d95a88d26dd9))
* **blueprints:** add blueprints and functions commands ([#99](https://github.com/sanity-io/cli/issues/99)) ([5e5f551](https://github.com/sanity-io/cli/commit/5e5f551f617d9bfdc85b95948a5fbea095d5e0d9))
* **cli:** add build command ([#36](https://github.com/sanity-io/cli/issues/36)) ([3bd4b77](https://github.com/sanity-io/cli/commit/3bd4b778b7543ac34397c3ab2e31e9aeae02189d))
* **cli:** add cors entry automatically for template package ([#8035](https://github.com/sanity-io/cli/issues/8035)) ([27254d2](https://github.com/sanity-io/cli/commit/27254d2b7837d29a199049a9bd818a7ecaedfe3d))
* **cli:** add dev command ([#54](https://github.com/sanity-io/cli/issues/54)) ([d813342](https://github.com/sanity-io/cli/commit/d813342fd37422c785c74f6747af73a81f42fb18))
* **cli:** add preview command ([#47](https://github.com/sanity-io/cli/issues/47)) ([68de8c6](https://github.com/sanity-io/cli/commit/68de8c62b7dd9f21d6b3370e3809ba2438dc58f1))
* **cli:** add projects list command ([#26](https://github.com/sanity-io/cli/issues/26)) ([064ffcf](https://github.com/sanity-io/cli/commit/064ffcf2ee4778c54a82d86dfc1c3acafc3a0646))
* **cli:** add SanityCliCommand base class and test helpers ([#13](https://github.com/sanity-io/cli/issues/13)) ([e192755](https://github.com/sanity-io/cli/commit/e192755191993326c821615621875841afb008c1))
* **cli:** add start command ([#46](https://github.com/sanity-io/cli/issues/46)) ([86c7b24](https://github.com/sanity-io/cli/commit/86c7b2436eee27294670d5f3129440c110192fb7))
* **cli:** Add support for exporting dataset with cursor ([#7068](https://github.com/sanity-io/cli/issues/7068)) ([27bc5e2](https://github.com/sanity-io/cli/commit/27bc5e28725a0b4fdf3370dfaad66cb2c6ae5f55))
* **cli:** add support for remote templates with `--template`  ([#7867](https://github.com/sanity-io/cli/issues/7867)) ([5752016](https://github.com/sanity-io/cli/commit/57520163df84de66b64c1a7c1f048ace00e3db86))
* **cli:** add test-template for testing `--template` flag ([#7877](https://github.com/sanity-io/cli/issues/7877)) ([f4b8ae5](https://github.com/sanity-io/cli/commit/f4b8ae578b6f2437923d4d9a62c581db189f36a6))
* **cli:** add users list command ([#23](https://github.com/sanity-io/cli/issues/23)) ([03bebfe](https://github.com/sanity-io/cli/commit/03bebfed93d8baad58b8401c2dbe6c83b0446c37))
* **cli:** add versions command ([#18](https://github.com/sanity-io/cli/issues/18)) ([66a94c4](https://github.com/sanity-io/cli/commit/66a94c422ad2a6f9b442d849d0f11f31064062cf))
* **cli:** add warning and docs for react-19 and Next.Js combined ([#7660](https://github.com/sanity-io/cli/issues/7660)) ([d672adb](https://github.com/sanity-io/cli/commit/d672adb80263f02cc1e6bc0397968f69821de605))
* **cli:** allow credentials when adding CORS entry ([#8191](https://github.com/sanity-io/cli/issues/8191)) ([5368c2b](https://github.com/sanity-io/cli/commit/5368c2b14649245936935ca8399441e599665536))
* **cli:** allow the ability to specify package manager in init command ([#6820](https://github.com/sanity-io/cli/issues/6820)) ([b06a5fa](https://github.com/sanity-io/cli/commit/b06a5fa67afbb213cc10855b9a1d9ee657e981e0))
* **cli:** copy additions for remote project bootstrapper ([#8141](https://github.com/sanity-io/cli/issues/8141)) ([501de29](https://github.com/sanity-io/cli/commit/501de29b825b81c0ac5da911cd51e1387cf69595))
* **cli:** customize help text if coming from `create-sanity` module ([e5678e7](https://github.com/sanity-io/cli/commit/e5678e78e177fc13dce37a33450a35906240e0a9))
* **cli:** generate read token conditionally for remote template ([#7953](https://github.com/sanity-io/cli/issues/7953)) ([d037200](https://github.com/sanity-io/cli/commit/d037200c62030ced1132def7d0b6c2c472fa27a4))
* **cli:** implement minimal init command boilerplate ([007225f](https://github.com/sanity-io/cli/commit/007225fd960adc8d170c38f87c430d920509f34c))
* **cli:** misc copy changes ([#8003](https://github.com/sanity-io/cli/issues/8003)) ([fca9abd](https://github.com/sanity-io/cli/commit/fca9abddeee8e34b9ca6590a8ffb69706b8357b8))
* **cli:** prepare nextjs starter template for live mode ([#7633](https://github.com/sanity-io/cli/issues/7633)) ([1374b91](https://github.com/sanity-io/cli/commit/1374b91f5ec8c5da277a5d7ea60a257ec7055527))
* **cli:** prepare nextjs starter template for live mode ([#7633](https://github.com/sanity-io/cli/issues/7633)) ([483e05e](https://github.com/sanity-io/cli/commit/483e05e24c0b20f00f58c50bb06f18ea5def5759))
* **cli:** remove .github dirs when initializing with a remote template ([#8036](https://github.com/sanity-io/cli/issues/8036)) ([ac5ed0a](https://github.com/sanity-io/cli/commit/ac5ed0a97ad9ceb7abdb0607ebc6bbbb76acefa3))
* **cli:** remove is-builtin-module ([#6579](https://github.com/sanity-io/cli/issues/6579)) ([d8393e5](https://github.com/sanity-io/cli/commit/d8393e5bc78f31af7f12848f761a9a16119c500a))
* **cli:** remove patching of tsconfig.json and thus silver-fleece dependency ([#8114](https://github.com/sanity-io/cli/issues/8114)) ([ac5105a](https://github.com/sanity-io/cli/commit/ac5105a82097a6ae01bc166fa2694b1f03854d8e))
* **cli:** remove v2 init messaging ([#7887](https://github.com/sanity-io/cli/issues/7887)) ([b654255](https://github.com/sanity-io/cli/commit/b65425568ccb074098d067955f8a2aacc455884b))
* **cli:** skip directories without .env.example when bootstrapping remote template ([#8216](https://github.com/sanity-io/cli/issues/8216)) ([e13bd8c](https://github.com/sanity-io/cli/commit/e13bd8c445381ce280d0badb60e52ad6fa50d87c))
* **cli:** slim down remote test template ([#8224](https://github.com/sanity-io/cli/issues/8224)) ([29c556d](https://github.com/sanity-io/cli/commit/29c556da4e186b198823cd222c9a25cf54da3791))
* **cli:** update CLI to use new deploy endpoint ([#7244](https://github.com/sanity-io/cli/issues/7244)) ([f8006d7](https://github.com/sanity-io/cli/commit/f8006d75f45de3d0acea8a7691e26204e1a8dbfc))
* **cli:** use `@sanity/template-validator` package ([#8014](https://github.com/sanity-io/cli/issues/8014)) ([39cd2cf](https://github.com/sanity-io/cli/commit/39cd2cfb3b72e07eaf5a481cc0c0a30b26a59cce))
* **cli:** use `@vercel/frameworks` in `bootstrapRemoteTemplate` ([#8001](https://github.com/sanity-io/cli/issues/8001)) ([8c91427](https://github.com/sanity-io/cli/commit/8c91427db7cdd46f8aeeb14d5e90ab622069012f))
* **cli:** use auto-updates flag in init ([#7401](https://github.com/sanity-io/cli/issues/7401)) ([b145cfb](https://github.com/sanity-io/cli/commit/b145cfbb78bf41001f4a64383a68e810dd401712))
* **codegen:** generate SanityQueries interface in @sanity/codegen ([#6997](https://github.com/sanity-io/cli/issues/6997)) ([#7304](https://github.com/sanity-io/cli/issues/7304)) ([eaa41b9](https://github.com/sanity-io/cli/commit/eaa41b9cf23d730ff335b92e779a31c0a06d1fc3))
* **cors:** add cors add command ([#80](https://github.com/sanity-io/cli/issues/80)) ([ff62eb2](https://github.com/sanity-io/cli/commit/ff62eb211266e3404d51a7d025e9b54df59dcf3c))
* **cors:** add cors delete command ([#81](https://github.com/sanity-io/cli/issues/81)) ([c0dcd56](https://github.com/sanity-io/cli/commit/c0dcd560c9bf1a36f4062e3773ff200ab80d6e21))
* **cors:** add cors list command ([#78](https://github.com/sanity-io/cli/issues/78)) ([9aecd3d](https://github.com/sanity-io/cli/commit/9aecd3d72c15b8ad8b7418c8e1956da60bab446c))
* **create-sanity:** spawn new `@sanity/cli` from `create-sanity` ([#50](https://github.com/sanity-io/cli/issues/50)) ([dfd1e35](https://github.com/sanity-io/cli/commit/dfd1e35f18f3cc330082c0211584ab3f61f58c6f))
* **dataset:** add dataset copy command ([#157](https://github.com/sanity-io/cli/issues/157)) ([34e7800](https://github.com/sanity-io/cli/commit/34e7800b5bf142d763baaf7ecdafd2dc0e054035))
* **dataset:** add dataset create command ([#130](https://github.com/sanity-io/cli/issues/130)) ([bf8a97c](https://github.com/sanity-io/cli/commit/bf8a97c70ae9022f248630f5ccac2a0a0da740ec))
* **dataset:** add dataset delete command ([#125](https://github.com/sanity-io/cli/issues/125)) ([da8e4d9](https://github.com/sanity-io/cli/commit/da8e4d9652c5f1e909419d1fb8639a5ff2102e4d))
* **dataset:** add dataset list command ([#129](https://github.com/sanity-io/cli/issues/129)) ([1db4136](https://github.com/sanity-io/cli/commit/1db4136d58a56696c5e860238493deaa681fa273))
* **dataset:** add dataset visibility commands ([#126](https://github.com/sanity-io/cli/issues/126)) ([c83a7d2](https://github.com/sanity-io/cli/commit/c83a7d2aac246b96f3e2da710ac126deceecc44b))
* **datasets:** add dataset import command ([#124](https://github.com/sanity-io/cli/issues/124)) ([510810f](https://github.com/sanity-io/cli/commit/510810f37491e9d43562f97e393bb132c847cb65))
* **datasets:** add datasets export command ([#123](https://github.com/sanity-io/cli/issues/123)) ([0633345](https://github.com/sanity-io/cli/commit/0633345eec81679bfb9965e247ea830b913032ee))
* **docs:** add docs commands ([#94](https://github.com/sanity-io/cli/issues/94)) ([e6b5500](https://github.com/sanity-io/cli/commit/e6b550043c316acd7b7c64367e92754a1105e4ca))
* **documents:** add documents create command ([#106](https://github.com/sanity-io/cli/issues/106)) ([2a0ed33](https://github.com/sanity-io/cli/commit/2a0ed33a5a1bef47739a5de57379bf691a0d9221))
* **documents:** add documents delete command ([#85](https://github.com/sanity-io/cli/issues/85)) ([8a8d542](https://github.com/sanity-io/cli/commit/8a8d542426c8c38dc3f1dec39d6924d1fd37ee57))
* **documents:** add documents get command ([#84](https://github.com/sanity-io/cli/issues/84)) ([aeea660](https://github.com/sanity-io/cli/commit/aeea66066d688a5929f2f042e1e3977ec748224c))
* **documents:** add documents query command ([#101](https://github.com/sanity-io/cli/issues/101)) ([564cb4a](https://github.com/sanity-io/cli/commit/564cb4afe09afca3908383fd74172d8a571bdb99))
* **documents:** move documents validate command ([#182](https://github.com/sanity-io/cli/issues/182)) ([7d12569](https://github.com/sanity-io/cli/commit/7d12569520375e85bbb74fb171850c91bd5e699f))
* embellish nextjs blog starter ([#7258](https://github.com/sanity-io/cli/issues/7258)) ([0e012cd](https://github.com/sanity-io/cli/commit/0e012cd644eeca4247d59e865a74722b84cb04a6))
* **exec:** move cliClient ([#180](https://github.com/sanity-io/cli/issues/180)) ([47c89ea](https://github.com/sanity-io/cli/commit/47c89ea08ebceb575cb375f02b62ba5ccbf2f7c2))
* **exec:** move exec command ([#186](https://github.com/sanity-io/cli/issues/186)) ([517a759](https://github.com/sanity-io/cli/commit/517a759dbc99c97e2d19dcf00ba653eb0fcadb23))
* **graphql:** add graphql list command ([#139](https://github.com/sanity-io/cli/issues/139)) ([c77149e](https://github.com/sanity-io/cli/commit/c77149e8bab14938e2974d34d5b088157fd6f9b8))
* **graphql:** migrate graphql undeploy command ([#194](https://github.com/sanity-io/cli/issues/194)) ([3915139](https://github.com/sanity-io/cli/commit/39151391c3b557a53ed26e03016d9b7f7683285a))
* **hook:** add hook attempt endpoint ([#100](https://github.com/sanity-io/cli/issues/100)) ([0916eef](https://github.com/sanity-io/cli/commit/0916eef67ed979ce893aa27e438124e7e3b88931))
* **hook:** add hook create command ([#74](https://github.com/sanity-io/cli/issues/74)) ([c2126e5](https://github.com/sanity-io/cli/commit/c2126e5e06fdb8500a6dc866285bcd27edc220f9))
* **hook:** add hook delete command ([#89](https://github.com/sanity-io/cli/issues/89)) ([6100234](https://github.com/sanity-io/cli/commit/61002346669776a139eff85e9b734a324057901d))
* **hook:** add hook list command ([#73](https://github.com/sanity-io/cli/issues/73)) ([088f222](https://github.com/sanity-io/cli/commit/088f222c79852a2d1f1c15fe6a2ec9a8bc043335))
* improve clarity of undeploy output w/ apps ([#173](https://github.com/sanity-io/cli/issues/173)) ([4b17e0b](https://github.com/sanity-io/cli/commit/4b17e0bad91fbd8db158a3e6001f0cd8e5f44a48))
* **init:** migration of init command setup, plan/coupon logic, and authentication logic ([#199](https://github.com/sanity-io/cli/issues/199)) ([012168e](https://github.com/sanity-io/cli/commit/012168eb03ab7e309918206511dc60c21dea573f))
* **mcp:** add mcp configure command ([#203](https://github.com/sanity-io/cli/issues/203)) ([d07541e](https://github.com/sanity-io/cli/commit/d07541e79391257912e61e3f4b5c8c9c9953716c))
* **media:** add media create-aspect command ([#144](https://github.com/sanity-io/cli/issues/144)) ([ea8224f](https://github.com/sanity-io/cli/commit/ea8224fccf50923134991effd1395ab6b800ece9))
* **media:** add media delete-aspect command ([#152](https://github.com/sanity-io/cli/issues/152)) ([47025ad](https://github.com/sanity-io/cli/commit/47025ad8ef9ae379b6e1b8e2cf6f62b51124c0e3))
* **media:** add media deploy-aspect command ([#160](https://github.com/sanity-io/cli/issues/160)) ([40444e7](https://github.com/sanity-io/cli/commit/40444e725d7d7bb79c971cc77c6d7a7d4d6b68ea))
* **media:** add media export command ([#158](https://github.com/sanity-io/cli/issues/158)) ([87a5d39](https://github.com/sanity-io/cli/commit/87a5d395aeed4a496c321430d80de9358c9be4e0))
* **media:** move import media command ([#171](https://github.com/sanity-io/cli/issues/171)) ([a739cf1](https://github.com/sanity-io/cli/commit/a739cf148d4de687c11e5e8a0d25fba657629269))
* migrate auto update functionality from production CLI ([#209](https://github.com/sanity-io/cli/issues/209)) ([86f42c2](https://github.com/sanity-io/cli/commit/86f42c26c05ba81d8592b7d12b54ec824a453711))
* migrate manifest extract command ([#187](https://github.com/sanity-io/cli/issues/187)) ([60137b1](https://github.com/sanity-io/cli/commit/60137b1e85ebf225c37cb691edfa3925d11bb38b))
* migrate schema extract ([#190](https://github.com/sanity-io/cli/issues/190)) ([65a486e](https://github.com/sanity-io/cli/commit/65a486ee1681e4e80ad51df3c75247eb47e90a2b))
* **migration:** add migration list command ([#167](https://github.com/sanity-io/cli/issues/167)) ([fd0a19d](https://github.com/sanity-io/cli/commit/fd0a19da10736f91fcb3f893e7eb3daf962882ec))
* **migration:** move migration create command ([#166](https://github.com/sanity-io/cli/issues/166)) ([c1af277](https://github.com/sanity-io/cli/commit/c1af2774b488df538c334bcce68a2d49a4b41e5b))
* **migration:** move run command to new CLI ([#174](https://github.com/sanity-io/cli/issues/174)) ([6ba3713](https://github.com/sanity-io/cli/commit/6ba3713b2c873c9ae065a41eab5f6e7bc902b1f5))
* move mock browser utils ([#175](https://github.com/sanity-io/cli/issues/175)) ([db43757](https://github.com/sanity-io/cli/commit/db437572b2aaeba2920a419c9c55966567495751))
* move tree util to core package ([#208](https://github.com/sanity-io/cli/issues/208)) ([83417a2](https://github.com/sanity-io/cli/commit/83417a2a004338e62a5f898f733c4d1732b36e9b))
* move up call to PATCH metadata after bootstrapping template files ([#6828](https://github.com/sanity-io/cli/issues/6828)) ([b008b5d](https://github.com/sanity-io/cli/commit/b008b5deebe73da3a79c96c3d7e8f58f7e6a41e4))
* **openapi:** add openapi get and list commands ([#110](https://github.com/sanity-io/cli/issues/110)) ([927e27e](https://github.com/sanity-io/cli/commit/927e27e7922c7b8457e3065c1e9a93212e2e3ea1))
* parse cli config using Zod schema in `createCliConfig` ([547ac52](https://github.com/sanity-io/cli/commit/547ac528f7a762ee2295513eb09f6b2d439d8119))
* **sanity:** studio manifests cont ([#7403](https://github.com/sanity-io/cli/issues/7403)) ([c8f755a](https://github.com/sanity-io/cli/commit/c8f755afc3fa1c21a1bac298fd78f2cbe77aa15f))
* **schema:** move schema validate command ([#191](https://github.com/sanity-io/cli/issues/191)) ([11b746e](https://github.com/sanity-io/cli/commit/11b746ea0f4988bd35b8e4c83d0f930d4b8a7929))
* set print width to 40 ([#6068](https://github.com/sanity-io/cli/issues/6068)) ([0193ce2](https://github.com/sanity-io/cli/commit/0193ce2dae84e02853e17521692ba7af1fb43437))
* **telemetry:** add telemetry commands ([#75](https://github.com/sanity-io/cli/issues/75)) ([9f0ca66](https://github.com/sanity-io/cli/commit/9f0ca6688b61872c34a2eb396d2865ce3e085230))
* **telemetry:** shows a disclosure in all CLI commands ([#69](https://github.com/sanity-io/cli/issues/69)) ([406024a](https://github.com/sanity-io/cli/commit/406024a2e55cd6ef59432bde22df5f6bd6de04cb))
* throw helpful errors during deploy & improve CLI logging ([#177](https://github.com/sanity-io/cli/issues/177)) ([87129f6](https://github.com/sanity-io/cli/commit/87129f6d70a70b54cdea50c572bdb42c93b2eb81))
* **tokens:** add tokens add command ([#87](https://github.com/sanity-io/cli/issues/87)) ([fc5ce91](https://github.com/sanity-io/cli/commit/fc5ce915659f2aa9e875699bad30134aadb38b81))
* **tokens:** add tokens delete command ([#88](https://github.com/sanity-io/cli/issues/88)) ([2e2602e](https://github.com/sanity-io/cli/commit/2e2602ea351ed7b442ff1be889aca69498496d7b))
* **tokens:** add tokens list command ([#86](https://github.com/sanity-io/cli/issues/86)) ([a1fa939](https://github.com/sanity-io/cli/commit/a1fa9392b1788d2f229e6815d018c06e416ece1f))
* **typegen:** add all schema types exported union ([#6962](https://github.com/sanity-io/cli/issues/6962)) ([ca4c28b](https://github.com/sanity-io/cli/commit/ca4c28b51141517372560910ced9203c5fdf464f))
* **typegen:** add optout for prettier formatting ([#6702](https://github.com/sanity-io/cli/issues/6702)) ([3310141](https://github.com/sanity-io/cli/commit/3310141fc3ed56057f046d3c503ca790fb394fa5))
* **typegen:** also search for queries in app and sanity folders ([#6475](https://github.com/sanity-io/cli/issues/6475)) ([104bd81](https://github.com/sanity-io/cli/commit/104bd813951bec82abd1cb1f72ad6df0de1e0714))
* **typegen:** set overload client methods to default to true ([#7390](https://github.com/sanity-io/cli/issues/7390)) ([d067205](https://github.com/sanity-io/cli/commit/d067205d3a91625822331e69e574235378b04b64))
* update schema types formatting and init to include src ([#7094](https://github.com/sanity-io/cli/issues/7094)) ([6436fae](https://github.com/sanity-io/cli/commit/6436fae72576212fcbc97b0e6dd4090ec1ced089))
* upgrade `sanity init` for Next.js to next-sanity v9 ([#6644](https://github.com/sanity-io/cli/issues/6644)) ([aeaa9ca](https://github.com/sanity-io/cli/commit/aeaa9ca1c8ce5708ad12778b920d2b7136904b18))
* use eslint 9 for new studios ([#7978](https://github.com/sanity-io/cli/issues/7978)) ([8880e62](https://github.com/sanity-io/cli/commit/8880e624a908b8a60a940bc8741206af8296e58a))
* **users:** add users invite command ([#108](https://github.com/sanity-io/cli/issues/108)) ([cfba720](https://github.com/sanity-io/cli/commit/cfba720c44da8686013c98c29e867f2692b48406))


### Bug Fixes

* add --legacy-peer-deps to next-sanity pacakge install ([#7806](https://github.com/sanity-io/cli/issues/7806)) ([f69d87e](https://github.com/sanity-io/cli/commit/f69d87efcfe81d011bceceefbd75201d28df0174))
* allow passing more client options to methods ([#120](https://github.com/sanity-io/cli/issues/120)) ([5c131aa](https://github.com/sanity-io/cli/commit/5c131aa50ea24f017d74db89bf9675a52bf0b3a1))
* allow using cli in sdk apps and add tests ([#27](https://github.com/sanity-io/cli/issues/27)) ([15554c6](https://github.com/sanity-io/cli/commit/15554c69cf7546e849420cf05d51de94a1f93fcd))
* **cli:** align minimum node version in package with runtime check ([#30](https://github.com/sanity-io/cli/issues/30)) ([e64d763](https://github.com/sanity-io/cli/commit/e64d763c73d95b8c2e6d7bef11494b8db06a1322))
* **cli:** don't prepend message about .env.local if creating .env.local ([#7288](https://github.com/sanity-io/cli/issues/7288)) ([1221967](https://github.com/sanity-io/cli/commit/1221967a432398f2c72406ce265655032ea13bff))
* **cli:** outputters should respect %s ([#8037](https://github.com/sanity-io/cli/issues/8037)) ([d79d518](https://github.com/sanity-io/cli/commit/d79d51897a5e50d3aba3c864fa312daf173f6a03))
* **cli:** remove comments from moviedb template, hide location field ([#6488](https://github.com/sanity-io/cli/issues/6488)) ([4bf8c16](https://github.com/sanity-io/cli/commit/4bf8c16c05edeca32ca98f50fc8facef1514e890))
* **cli:** remove v2 commands ([#5750](https://github.com/sanity-io/cli/issues/5750)) ([e42bdde](https://github.com/sanity-io/cli/commit/e42bddeb01be70d8c30bf99c921d9d7ac9835d38))
* **CLI:** Set integration value for createProject directly in the createProject function ([#7021](https://github.com/sanity-io/cli/issues/7021)) ([cb4e293](https://github.com/sanity-io/cli/commit/cb4e2932ccefca0902541e387d3b870777a11da8))
* **core:** error reporting consent tweaks ([#7131](https://github.com/sanity-io/cli/issues/7131)) ([50c62f4](https://github.com/sanity-io/cli/commit/50c62f414f69e0fd2326784e8f7b7c02787dddf8))
* **core:** fixes issues with loading cli config ([#137](https://github.com/sanity-io/cli/issues/137)) ([8cf088e](https://github.com/sanity-io/cli/commit/8cf088e4afc06247dc82c09a6bceeb2b89f06c8b))
* **deps:** bump `@sanity/pkg-utils` to `v6.10.7` ([#7277](https://github.com/sanity-io/cli/issues/7277)) ([6bfc2a8](https://github.com/sanity-io/cli/commit/6bfc2a82c4eca0d42f5513b73d8ad70a86e753ab))
* **deps:** bump react + sanity dependencies ([#192](https://github.com/sanity-io/cli/issues/192)) ([8f8c009](https://github.com/sanity-io/cli/commit/8f8c009dbb63675d5fcfe10266dc24b118d4fcfa))
* **deps:** deprecation warnings due to `glob` dependency ([#7977](https://github.com/sanity-io/cli/issues/7977)) ([8a30e2e](https://github.com/sanity-io/cli/commit/8a30e2e55e84c0b0f96aeda6de532910524ec87b))
* **deps:** update dependency @inquirer/prompts to ^7.8.6 ([#140](https://github.com/sanity-io/cli/issues/140)) ([b481a84](https://github.com/sanity-io/cli/commit/b481a84d9a44b983c2cdca4bcda65bc7536ee483))
* **deps:** update dependency @sanity/client to ^6.16.0 ([#6548](https://github.com/sanity-io/cli/issues/6548)) ([cf7a952](https://github.com/sanity-io/cli/commit/cf7a95243c140b18ce5137c3efb2630b2bee92ff))
* **deps:** update dependency @sanity/client to ^6.17.2 ([#6567](https://github.com/sanity-io/cli/issues/6567)) ([617ecbf](https://github.com/sanity-io/cli/commit/617ecbf91ac7c622b1029f5cb507863b090cddd4))
* **deps:** update dependency @sanity/client to ^6.18.0 ([#6604](https://github.com/sanity-io/cli/issues/6604)) ([41317be](https://github.com/sanity-io/cli/commit/41317be74a353b1d30840e163b4497e8aef9e826))
* **deps:** update dependency @sanity/client to ^6.18.1 ([#6653](https://github.com/sanity-io/cli/issues/6653)) ([485a124](https://github.com/sanity-io/cli/commit/485a124988a3fbfa5486ad478d6eb919b1e9341f))
* **deps:** update dependency @sanity/client to ^6.18.2 ([#6674](https://github.com/sanity-io/cli/issues/6674)) ([df6f0d3](https://github.com/sanity-io/cli/commit/df6f0d31e6255b03d20a2321c883d6bb679a1dfa))
* **deps:** update dependency @sanity/client to ^6.18.3 ([#6762](https://github.com/sanity-io/cli/issues/6762)) ([fe84199](https://github.com/sanity-io/cli/commit/fe84199aa36fe15e92f3d12a2d9ecc2eccd9522a))
* **deps:** update dependency @sanity/client to ^6.19.0 ([#6781](https://github.com/sanity-io/cli/issues/6781)) ([6dde803](https://github.com/sanity-io/cli/commit/6dde803ab1a446aebf0a5e05bf3c0117316f3de6))
* **deps:** update dependency @sanity/client to ^6.20.0 ([#6886](https://github.com/sanity-io/cli/issues/6886)) ([d3a8ae6](https://github.com/sanity-io/cli/commit/d3a8ae6dafd1bbc58dcda198ff95db5a835ad977))
* **deps:** update dependency @sanity/client to ^6.20.1 ([#7088](https://github.com/sanity-io/cli/issues/7088)) ([95eda1c](https://github.com/sanity-io/cli/commit/95eda1c0478bd2d553c809475a0c52c6458c62cb))
* **deps:** update dependency @sanity/client to ^6.20.2 ([#7111](https://github.com/sanity-io/cli/issues/7111)) ([edbc0a2](https://github.com/sanity-io/cli/commit/edbc0a2019f7ff8f28f241f0feed39df1f71f5c6))
* **deps:** update dependency @sanity/client to ^6.21.0 ([#7137](https://github.com/sanity-io/cli/issues/7137)) ([42a8505](https://github.com/sanity-io/cli/commit/42a850514afdb9cad3cea9db802b853ab80c16a0))
* **deps:** update dependency @sanity/client to ^6.21.1 ([#7215](https://github.com/sanity-io/cli/issues/7215)) ([4390d55](https://github.com/sanity-io/cli/commit/4390d559fe4a943cffcd16c5ad18adc7438df552))
* **deps:** update dependency @sanity/client to ^6.21.2 ([#7354](https://github.com/sanity-io/cli/issues/7354)) ([51da113](https://github.com/sanity-io/cli/commit/51da113d6f77ccd7b5dd9c20938edf8362d51381))
* **deps:** update dependency @sanity/client to ^6.21.3 ([#7373](https://github.com/sanity-io/cli/issues/7373)) ([315a582](https://github.com/sanity-io/cli/commit/315a5828affddc7eda85e13488cfeba4849e827b))
* **deps:** update dependency @sanity/client to ^6.22.0 ([#7522](https://github.com/sanity-io/cli/issues/7522)) ([92d738c](https://github.com/sanity-io/cli/commit/92d738ce6596a15e494becbb9969e80acbded031))
* **deps:** update dependency @sanity/client to ^6.22.1 ([#7585](https://github.com/sanity-io/cli/issues/7585)) ([18a4421](https://github.com/sanity-io/cli/commit/18a4421ca2b6fd09900c2b596d847476586518ac))
* **deps:** update dependency @sanity/client to ^6.22.2 ([#7625](https://github.com/sanity-io/cli/issues/7625)) ([ab91c84](https://github.com/sanity-io/cli/commit/ab91c843e908cb7358d635084f83c695144d1602))
* **deps:** update dependency @sanity/client to ^6.22.3 ([#7766](https://github.com/sanity-io/cli/issues/7766)) ([95ac6bd](https://github.com/sanity-io/cli/commit/95ac6bd26b3b959fe355bc02da0b5564ae63d75f))
* **deps:** update dependency @sanity/client to ^6.22.4 ([#7785](https://github.com/sanity-io/cli/issues/7785)) ([036656b](https://github.com/sanity-io/cli/commit/036656bbb8e098b251db45f7cbbdc55eb0b5d223))
* **deps:** update dependency @sanity/client to ^6.22.5 ([#7837](https://github.com/sanity-io/cli/issues/7837)) ([9ecec64](https://github.com/sanity-io/cli/commit/9ecec64a3806cc6786d34c0e43385a96371a1798))
* **deps:** update dependency @sanity/client to ^6.23.0 ([#7931](https://github.com/sanity-io/cli/issues/7931)) ([9205e43](https://github.com/sanity-io/cli/commit/9205e4366698fc6e176237b9f73b9bd89445f10b))
* **deps:** update dependency @sanity/client to ^6.24.0 ([#7935](https://github.com/sanity-io/cli/issues/7935)) ([2a074e5](https://github.com/sanity-io/cli/commit/2a074e562073dba1ef85fd0fa14a4a3247ed382a))
* **deps:** update dependency @sanity/client to ^6.24.1 ([#7938](https://github.com/sanity-io/cli/issues/7938)) ([b20186d](https://github.com/sanity-io/cli/commit/b20186d3ce5008122cf704fef689293da4c95ddb))
* **deps:** update dependency @sanity/client to ^6.24.3 ([#8213](https://github.com/sanity-io/cli/issues/8213)) ([2c67a10](https://github.com/sanity-io/cli/commit/2c67a10894963088698a57d425b29771e6bc27ef))
* **deps:** update dependency @sanity/icons to ^3.5.0 ([#7929](https://github.com/sanity-io/cli/issues/7929)) ([fffbc3e](https://github.com/sanity-io/cli/commit/fffbc3ecc7069a51ede9f6a309c7d8af6434d349))
* **deps:** update dependency @sanity/icons to ^3.5.1 ([#7989](https://github.com/sanity-io/cli/issues/7989)) ([aa8cdb7](https://github.com/sanity-io/cli/commit/aa8cdb7669e903e9ab5c72dd87f30f9d57a0ebf6))
* **deps:** update dependency @sanity/icons to ^3.5.2 ([#7991](https://github.com/sanity-io/cli/issues/7991)) ([08f4465](https://github.com/sanity-io/cli/commit/08f446591e9b3d8b962838cb373a509c92e7ebd4))
* **deps:** update dependency @sanity/icons to ^3.5.3 ([#8071](https://github.com/sanity-io/cli/issues/8071)) ([3be3eb0](https://github.com/sanity-io/cli/commit/3be3eb0a591b84c06dace6cac652d79931a4f6d7))
* **deps:** update dependency @sanity/icons to ^3.5.5 ([#8106](https://github.com/sanity-io/cli/issues/8106)) ([3106b8d](https://github.com/sanity-io/cli/commit/3106b8d2353912905cdf10e845318f38bee27ac1))
* **deps:** update dependency @sanity/icons to ^3.5.6 ([#8129](https://github.com/sanity-io/cli/issues/8129)) ([0c99b03](https://github.com/sanity-io/cli/commit/0c99b03e1929c6f4a15577ede1d1d6fb88dde693))
* **deps:** update dependency @sanity/icons to ^3.5.7 ([#8155](https://github.com/sanity-io/cli/issues/8155)) ([9b6f1a5](https://github.com/sanity-io/cli/commit/9b6f1a5f84a5572d0583870cf21c737828967a2d))
* **deps:** update dependency @types/node to ^20.19.25 ([#178](https://github.com/sanity-io/cli/issues/178)) ([366c53b](https://github.com/sanity-io/cli/commit/366c53be94fa6470255857776098c542ffc2d132))
* **deps:** update dependency debug to ^4.4.3 ([#154](https://github.com/sanity-io/cli/issues/154)) ([f1cf942](https://github.com/sanity-io/cli/commit/f1cf942572ba47b5f91652748fdfa05eecc8260d))
* **deps:** update dependency form-data to ^4.0.5 ([#179](https://github.com/sanity-io/cli/issues/179)) ([e75775f](https://github.com/sanity-io/cli/commit/e75775f5013513fec60ced8b0456e50a27a20b2f))
* **deps:** update dependency get-it to ^8.4.28 ([#6576](https://github.com/sanity-io/cli/issues/6576)) ([6050f46](https://github.com/sanity-io/cli/commit/6050f463d2d536b19e1d04dcb062b3d5e71f088d))
* **deps:** update dependency get-it to ^8.4.29 ([#6603](https://github.com/sanity-io/cli/issues/6603)) ([ddcea20](https://github.com/sanity-io/cli/commit/ddcea206b825a506cb699c907a82607db43b0fee))
* **deps:** update dependency get-it to ^8.4.30 ([#6676](https://github.com/sanity-io/cli/issues/6676)) ([6bcf2c0](https://github.com/sanity-io/cli/commit/6bcf2c05529f172e1c69d85997fa6d6890e3ac33))
* **deps:** update dependency get-it to ^8.5.0 ([#6758](https://github.com/sanity-io/cli/issues/6758)) ([8fc8863](https://github.com/sanity-io/cli/commit/8fc8863fdaaa22c40f757c3bb96d6609a6dd32f9))
* **deps:** update dependency get-it to ^8.6.0 ([#6884](https://github.com/sanity-io/cli/issues/6884)) ([3777d9f](https://github.com/sanity-io/cli/commit/3777d9fec9330c13cf31e3548b1f0b4161448d0d))
* **deps:** update dependency get-it to ^8.6.2 ([#7052](https://github.com/sanity-io/cli/issues/7052)) ([289e7dd](https://github.com/sanity-io/cli/commit/289e7dd2fff080f5f44980d88c69fa70fa4f478c))
* **deps:** update dependency get-it to ^8.6.3 ([#7108](https://github.com/sanity-io/cli/issues/7108)) ([5a67267](https://github.com/sanity-io/cli/commit/5a672673bc943f67063f4bb32573b714d7c189ef))
* **deps:** update dependency get-it to ^8.6.4 ([#7353](https://github.com/sanity-io/cli/issues/7353)) ([779cc33](https://github.com/sanity-io/cli/commit/779cc335b431d863551cf40c737ad258f4c6b298))
* **deps:** update dependency get-it to ^8.6.5 ([#7376](https://github.com/sanity-io/cli/issues/7376)) ([8509a68](https://github.com/sanity-io/cli/commit/8509a6891f6b27ebb36f2b4935d04d545c8bd2f4))
* **deps:** update dependency get-it to ^8.6.6 ([#8221](https://github.com/sanity-io/cli/issues/8221)) ([189c2ad](https://github.com/sanity-io/cli/commit/189c2ad90317f2a2bed6b60546be7edea8dec4ad))
* **deps:** update dependency get-tsconfig to ^4.10.1 ([#31](https://github.com/sanity-io/cli/issues/31)) ([99bcddc](https://github.com/sanity-io/cli/commit/99bcddcacae0d4818d3d659b0ffa15dc90304a22))
* **deps:** update dependency groq-js to ^1.10.0 ([#7053](https://github.com/sanity-io/cli/issues/7053)) ([d222180](https://github.com/sanity-io/cli/commit/d22218007c2dc6c3b85e2c48581fa161cd508207))
* **deps:** update dependency groq-js to ^1.11.0 ([#7229](https://github.com/sanity-io/cli/issues/7229)) ([21854bd](https://github.com/sanity-io/cli/commit/21854bdf99fce46016c0d46015af0cf00c5632c2))
* **deps:** update dependency groq-js to ^1.11.1 ([#7247](https://github.com/sanity-io/cli/issues/7247)) ([b59457d](https://github.com/sanity-io/cli/commit/b59457d38d217d0b01835f4246221433385b58ba))
* **deps:** update dependency groq-js to ^1.12.0 ([#7252](https://github.com/sanity-io/cli/issues/7252)) ([5c04960](https://github.com/sanity-io/cli/commit/5c04960936693a78859e712f47ad927ce1d08ad4))
* **deps:** update dependency groq-js to ^1.13.0 ([#7424](https://github.com/sanity-io/cli/issues/7424)) ([c7034d5](https://github.com/sanity-io/cli/commit/c7034d50ef9365ead3859e6157bc6951b765039f))
* **deps:** update dependency groq-js to ^1.14.0 ([#7738](https://github.com/sanity-io/cli/issues/7738)) ([f4a6a65](https://github.com/sanity-io/cli/commit/f4a6a6547c9efe0f30854196291261910ac9dedc))
* **deps:** update dependency groq-js to ^1.14.0 ([#7738](https://github.com/sanity-io/cli/issues/7738)) ([a4fc610](https://github.com/sanity-io/cli/commit/a4fc6102e7c4ad3ef6271ae5d922899adf4402fd))
* **deps:** update dependency groq-js to ^1.14.1 ([#7910](https://github.com/sanity-io/cli/issues/7910)) ([de193d9](https://github.com/sanity-io/cli/commit/de193d9161f5ade797597356a06f3fc3324dea80))
* **deps:** update dependency groq-js to ^1.14.2 ([#7985](https://github.com/sanity-io/cli/issues/7985)) ([b29b931](https://github.com/sanity-io/cli/commit/b29b9313abd28e64ce35f791e2c8dbdcd709f705))
* **deps:** update dependency groq-js to ^1.9.0 ([#6655](https://github.com/sanity-io/cli/issues/6655)) ([055ddb8](https://github.com/sanity-io/cli/commit/055ddb8596ce5548cf297e6910f285ac5fe4ee41))
* **deps:** update dependency vite to ^7.1.6 ([#136](https://github.com/sanity-io/cli/issues/136)) ([acf30f9](https://github.com/sanity-io/cli/commit/acf30f93345efe17572b83babbe9ebdb80917223))
* **deps:** update dependency vite to v7 ([#133](https://github.com/sanity-io/cli/issues/133)) ([fd96f03](https://github.com/sanity-io/cli/commit/fd96f032e7f78fe5df45646dc70300953426c700))
* **deps:** update oclif-tooling ([#116](https://github.com/sanity-io/cli/issues/116)) ([26a92ee](https://github.com/sanity-io/cli/commit/26a92eeeccbf6b92ab91fa08fedd09f2823cd8a3))
* **deps:** update oclif-tooling ([#210](https://github.com/sanity-io/cli/issues/210)) ([66f8c47](https://github.com/sanity-io/cli/commit/66f8c47c6abac9aefbdd5d41ef0253d1ccf413b9))
* **deps:** update oclif-tooling ([#22](https://github.com/sanity-io/cli/issues/22)) ([3480a7b](https://github.com/sanity-io/cli/commit/3480a7be5b32a536299cac932b1e69a453bdbc45))
* **deps:** update sanity-tooling ([#117](https://github.com/sanity-io/cli/issues/117)) ([7543a82](https://github.com/sanity-io/cli/commit/7543a82ae8f9eb8e8acc759b6eda567fc2b49064))
* **deps:** update sanity-tooling ([#149](https://github.com/sanity-io/cli/issues/149)) ([16213b1](https://github.com/sanity-io/cli/commit/16213b1c4aec3f4a8958a88c2ecbc59b418e65e1))
* **deps:** update sanity-tooling ([#40](https://github.com/sanity-io/cli/issues/40)) ([0df98a6](https://github.com/sanity-io/cli/commit/0df98a6060ff054f68137128c732c1b2e4f4eb4d))
* **deps:** update sanity-tooling ([#59](https://github.com/sanity-io/cli/issues/59)) ([04e502c](https://github.com/sanity-io/cli/commit/04e502c9d73603c4e831c95876fd96061d65311c))
* **deps:** upgrade `vite` to v5 ([#5285](https://github.com/sanity-io/cli/issues/5285)) ([c45eac6](https://github.com/sanity-io/cli/commit/c45eac633c7c2c8710160fa51460f894d9aeccfd))
* don't read/write ref during render ([#8077](https://github.com/sanity-io/cli/issues/8077)) ([76bf6b2](https://github.com/sanity-io/cli/commit/76bf6b2c3bacb3f80dce64f628d215255b5b1b6b))
* **loader:** fixes importing TS config files ([#52](https://github.com/sanity-io/cli/issues/52)) ([218044a](https://github.com/sanity-io/cli/commit/218044ae48eb4a717c34c5ded5db6930eecc55df))
* React 19 typings (finally) ([#8171](https://github.com/sanity-io/cli/issues/8171)) ([4283e94](https://github.com/sanity-io/cli/commit/4283e943af395ea35b6c02ae5ef88773fdc44150))
* remove trailing commas when sanitizing ([#7007](https://github.com/sanity-io/cli/issues/7007)) ([94758bd](https://github.com/sanity-io/cli/commit/94758bdfa036852e5e54e664b28ee26fdbddb0df))
* set `cliInitializedAt` even if project bootstrap fails ([#7558](https://github.com/sanity-io/cli/issues/7558)) ([d83a201](https://github.com/sanity-io/cli/commit/d83a201ea96d07ca4db1f03f5d112b47c2ce4eb0))
* **typegen:** move type new line separator into formatter ([#6649](https://github.com/sanity-io/cli/issues/6649)) ([2f6f718](https://github.com/sanity-io/cli/commit/2f6f7180bc135620b785fb12a3a2b31fde8c1a7d))


### Reverts

* **cli:** use default ora options in spinner method ([#8038](https://github.com/sanity-io/cli/issues/8038)) ([432cee5](https://github.com/sanity-io/cli/commit/432cee5343a019f6278bb09e86ec9cd54a6d010e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/cli-core bumped to 0.1.0-alpha.3

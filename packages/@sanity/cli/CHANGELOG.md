# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [6.2.0](https://github.com/sanity-io/cli/compare/cli-v6.1.8...cli-v6.2.0) (2026-03-19)


### Features

* **debug:** improve output format, allow running outside project ([#733](https://github.com/sanity-io/cli/issues/733)) ([f2f2e2f](https://github.com/sanity-io/cli/commit/f2f2e2f31c2bdebf3cb138074ed92b2c0979aa09))
* **init:** improve flags for the init command ([#729](https://github.com/sanity-io/cli/issues/729)) ([171ad3f](https://github.com/sanity-io/cli/commit/171ad3fda4b448892f719adef840c55786fcf7ef))


### Bug Fixes

* align on plural topic names, provide aliases for singular ([#714](https://github.com/sanity-io/cli/issues/714)) ([32f0884](https://github.com/sanity-io/cli/commit/32f0884d4c60672e00fe83449e8bad7dda1dfc38))
* deprecate `start` command (preview alias) ([#721](https://github.com/sanity-io/cli/issues/721)) ([cffaf22](https://github.com/sanity-io/cli/commit/cffaf221e366ddc985f7ee833fa6ff533d177a4e))
* **mcp:** use explicit mode for setupMCP during init ([#744](https://github.com/sanity-io/cli/issues/744)) ([e11f495](https://github.com/sanity-io/cli/commit/e11f49543cd5281434f0a0bff91d2badd3b32883))
* support non-interactive mode for app templates and fix isInteractive CI detection ([#735](https://github.com/sanity-io/cli/issues/735)) ([ff9f15f](https://github.com/sanity-io/cli/commit/ff9f15f3f7a599b3bb06dbd25117e2d865623123))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/cli-core bumped to 1.2.0
  * devDependencies
    * @sanity/cli-test bumped to 0.2.6

## [6.1.8](https://github.com/sanity-io/cli/compare/cli-v6.1.7...cli-v6.1.8) (2026-03-18)


### Bug Fixes

* **deps:** update dependency @vercel/frameworks to v3.21.1 ([#709](https://github.com/sanity-io/cli/issues/709)) ([17fce97](https://github.com/sanity-io/cli/commit/17fce975d8338cedbd8157ec16c91e5f2683332e))
* **deps:** update dependency dotenv to ^17.3.1 ([#710](https://github.com/sanity-io/cli/issues/710)) ([a85db85](https://github.com/sanity-io/cli/commit/a85db857d30d03cf54b4952bb498cce2f5ff4b69))
* **deps:** update dependency nanoid to ^5.1.6 ([#705](https://github.com/sanity-io/cli/issues/705)) ([1f7a96d](https://github.com/sanity-io/cli/commit/1f7a96d097327fc74b1087ea440ac4f5fb0c240e))
* **deps:** update dependency tar to ^7.5.11 ([#706](https://github.com/sanity-io/cli/issues/706)) ([9b55d34](https://github.com/sanity-io/cli/commit/9b55d34f473658d38bf2c665172b9e3538fcb5da))
* **deps:** update dependency tar-fs to ^3.1.2 ([#707](https://github.com/sanity-io/cli/issues/707)) ([14d1ce3](https://github.com/sanity-io/cli/commit/14d1ce348ec284dfdb3246528b34e1321bf08b48))
* **deps:** update dependency tar-stream to ^3.1.8 ([#708](https://github.com/sanity-io/cli/issues/708)) ([6019bc4](https://github.com/sanity-io/cli/commit/6019bc41d8d94cefb0eaac6e93769d9d893a71d5))
* **deps:** update oclif-tooling ([#720](https://github.com/sanity-io/cli/issues/720)) ([e63ad1a](https://github.com/sanity-io/cli/commit/e63ad1a99604d0c0e906e5bd32e1b39eb10b7c95))
* **deps:** update sanity-tooling ([#716](https://github.com/sanity-io/cli/issues/716)) ([9c30109](https://github.com/sanity-io/cli/commit/9c30109edf13f8952754c6705b66bc149dfc65bf))
* **deps:** update sanity-tooling ([#727](https://github.com/sanity-io/cli/issues/727)) ([f8797a4](https://github.com/sanity-io/cli/commit/f8797a4786a1794219fd313b7ab4d9c52c22d7b3))
* load all env vars for schema extract ([#725](https://github.com/sanity-io/cli/issues/725)) ([67ee0a5](https://github.com/sanity-io/cli/commit/67ee0a5d25a7f01f3aebf7039407e43485aa0297))
* prevent duplicate deprecation warnings during `sanity deploy` ([#726](https://github.com/sanity-io/cli/issues/726)) ([7f70ba3](https://github.com/sanity-io/cli/commit/7f70ba3ed4ed537fea5968e0c39a402f6aa8c6a4))
* validate MCP tokens against Sanity API instead of MCP server ([#732](https://github.com/sanity-io/cli/issues/732)) ([5b573b8](https://github.com/sanity-io/cli/commit/5b573b885a194b8cee2682ee2a7782d217b164b2))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/cli-core bumped to 1.1.3
  * devDependencies
    * @sanity/cli-test bumped to 0.2.5
    * @sanity/eslint-config-cli bumped to 1.0.1

## [6.1.7](https://github.com/sanity-io/cli/compare/cli-v6.1.6...cli-v6.1.7) (2026-03-16)


### Bug Fixes

* resolve vendor dependencies using node module resolution ([#691](https://github.com/sanity-io/cli/issues/691)) ([44b0e98](https://github.com/sanity-io/cli/commit/44b0e9866f2e742d91d95e42ed7ac93139b29d70))

## [6.1.6](https://github.com/sanity-io/cli/compare/cli-v6.1.5...cli-v6.1.6) (2026-03-16)


### Bug Fixes

* **deps:** update sanity-tooling ([#683](https://github.com/sanity-io/cli/issues/683)) ([aee2e6e](https://github.com/sanity-io/cli/commit/aee2e6e8395e0584b7233fe37b41dba954fff7e0))
* getCliClient() token not passed through ([#688](https://github.com/sanity-io/cli/issues/688)) ([15c6b7d](https://github.com/sanity-io/cli/commit/15c6b7d3c40ac1f2975c1e09befd9a308612f012))
* schema extract path always appends `schema.json` ([#686](https://github.com/sanity-io/cli/issues/686)) ([daa0013](https://github.com/sanity-io/cli/commit/daa0013cf6ff2836976be840b67d75036cfce9d6))

## [6.1.5](https://github.com/sanity-io/cli/compare/cli-v6.1.4...cli-v6.1.5) (2026-03-14)


### Bug Fixes

* allow running `sanity debug` outside of project context ([#678](https://github.com/sanity-io/cli/issues/678)) ([0110989](https://github.com/sanity-io/cli/commit/01109892fd3ff6de03a6a2778ad0aad613dbbdba))
* **cli:** send extracted `ManifestSchemaType[]` to `/schemas` endpoint ([#680](https://github.com/sanity-io/cli/issues/680)) ([2afef5a](https://github.com/sanity-io/cli/commit/2afef5abda6f897a582c1b9ba224346acb42b2a9))

## [6.1.4](https://github.com/sanity-io/cli/compare/cli-v6.1.3...cli-v6.1.4) (2026-03-13)


### Bug Fixes

* **deps:** update oclif-tooling ([#651](https://github.com/sanity-io/cli/issues/651)) ([f807f1d](https://github.com/sanity-io/cli/commit/f807f1dc351e4657debf86c00c5537b014391feb))
* tsconfig paths not respected in the sanity config ([#669](https://github.com/sanity-io/cli/issues/669)) ([7ecf06b](https://github.com/sanity-io/cli/commit/7ecf06b61781f449081a618c70203d2223b6e47c))
* validate auth token before MCP token creation ([#667](https://github.com/sanity-io/cli/issues/667)) ([fd0d4e7](https://github.com/sanity-io/cli/commit/fd0d4e78616667120e6cd2ae498352f928c47c1d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/cli-core bumped to 1.1.2
  * devDependencies
    * @sanity/cli-test bumped to 0.2.4

## [6.1.3](https://github.com/sanity-io/cli/compare/cli-v6.1.2...cli-v6.1.3) (2026-03-13)


### Bug Fixes

* use non-deprecated `--project-id` flag for dataset import during init ([#661](https://github.com/sanity-io/cli/issues/661)) ([0b660b9](https://github.com/sanity-io/cli/commit/0b660b97c197bd07e5210700ffbacfa43af94e00))

## [6.1.2](https://github.com/sanity-io/cli/compare/cli-v6.1.1...cli-v6.1.2) (2026-03-13)


### Bug Fixes

* bump react+react-dom to latest on new installs ([#658](https://github.com/sanity-io/cli/issues/658)) ([87b733f](https://github.com/sanity-io/cli/commit/87b733ffb3922d4d492e569918b6087e302f39e9))
* resolve react-dom/server and @sanity/ui from studio workDir ([#657](https://github.com/sanity-io/cli/issues/657)) ([ce07d42](https://github.com/sanity-io/cli/commit/ce07d42e67acd906a3b585c4a62c031ea6c53bee))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/cli-core bumped to 1.1.1
  * devDependencies
    * @sanity/cli-test bumped to 0.2.3

## [6.1.1](https://github.com/sanity-io/cli/compare/cli-v6.1.0...cli-v6.1.1) (2026-03-13)


### Bug Fixes

* lazy-load icon resolver to avoid pulling in @sanity/ui at import time ([#636](https://github.com/sanity-io/cli/issues/636)) ([e2a6c6d](https://github.com/sanity-io/cli/commit/e2a6c6d5c430002a3effaf3fc822e3c8e070970c))

## [6.1.0](https://github.com/sanity-io/cli/compare/cli-v6.0.0...cli-v6.1.0) (2026-03-12)


### Features

* **mcp:** improve mcp setup process ([#630](https://github.com/sanity-io/cli/issues/630)) ([27d8ba8](https://github.com/sanity-io/cli/commit/27d8ba86a8f506c8a56773fb65438ef6d33aae38))


### Bug Fixes

* don't treat user aborts as telemetry errors ([#624](https://github.com/sanity-io/cli/issues/624)) ([6cc7682](https://github.com/sanity-io/cli/commit/6cc7682030a7dea9dfb9a80aa691a2cfb52444b9))
* hide `sanity start` alias from help text ([#620](https://github.com/sanity-io/cli/issues/620)) ([2447f63](https://github.com/sanity-io/cli/commit/2447f63595d2781c39a2c5ecb29abefdecda215b))
* **init:** duplicate default dataset help text ([#627](https://github.com/sanity-io/cli/issues/627)) ([9cba643](https://github.com/sanity-io/cli/commit/9cba643428b42b3ec6a67f54ac181bb381844047))
* mock getUserConfig in telemetry test and update debug namespace ([#631](https://github.com/sanity-io/cli/issues/631)) ([2f03a4c](https://github.com/sanity-io/cli/commit/2f03a4c797d8f4110b03a1d19f9ad18a63a2bcd5))
* simplify git config retrieval, reduce dependencies ([#616](https://github.com/sanity-io/cli/issues/616)) ([b258394](https://github.com/sanity-io/cli/commit/b25839459c9a602d3937c2d85f7117ec884b8835))
* vite version showing as null in dev/preview output ([349e7c9](https://github.com/sanity-io/cli/commit/349e7c9ee06d0d5129625ae6b2030ac7faf9006c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/cli-core bumped to 1.1.0
  * devDependencies
    * @sanity/cli-test bumped to 0.2.2

## [6.0.0](https://github.com/sanity-io/cli/compare/cli-v5.14.1...cli-v6.0.0) (2026-03-11)


### ⚠ BREAKING CHANGES

* A small number of commands produce tabular output where v5 produces line-separated lists. Scripts that parse command output (e.g., tab-splitting to produce CSV-like data from users list) could be affected. In the future we will support --json for easier parsing
* We removed some internal cli types. If your project relied on them, you might see build issues.
* Some command output format changes

### Features

* A small number of commands produce tabular output where v5 produces line-separated lists. Scripts that parse command output (e.g., tab-splitting to produce CSV-like data from users list) could be affected. In the future we will support --json for easier parsing ([7515453](https://github.com/sanity-io/cli/commit/751545332ae7713964c81fd1f7e95bfb46a244f5))
* Dataset embeddings configuration commands — New dataset embeddings commands to configure embeddings for datasets. ([7515453](https://github.com/sanity-io/cli/commit/751545332ae7713964c81fd1f7e95bfb46a244f5))
* Global --project-id and --dataset flags — Run commands outside a project directory without needing a sanity.cli.ts config. ([#548](https://github.com/sanity-io/cli/issues/548), [#500](https://github.com/sanity-io/cli/issues/500), [#558](https://github.com/sanity-io/cli/issues/558)) ([7515453](https://github.com/sanity-io/cli/commit/751545332ae7713964c81fd1f7e95bfb46a244f5))
* Non-interactive environment detection — Prompts detect CI/pipeline environments automatically, preventing hangs in automated workflows. ([#470](https://github.com/sanity-io/cli/issues/470)) ([7515453](https://github.com/sanity-io/cli/commit/751545332ae7713964c81fd1f7e95bfb46a244f5))
* SDK templates are ESM by default — New SDK projects created via sanity init use ESM. ([#576](https://github.com/sanity-io/cli/issues/576)) ([7515453](https://github.com/sanity-io/cli/commit/751545332ae7713964c81fd1f7e95bfb46a244f5))
* Some command output format changes ([7515453](https://github.com/sanity-io/cli/commit/751545332ae7713964c81fd1f7e95bfb46a244f5))
* We removed some internal cli types. If your project relied on them, you might see build issues. ([7515453](https://github.com/sanity-io/cli/commit/751545332ae7713964c81fd1f7e95bfb46a244f5))


### Bug Fixes

* Boolean flags no longer get confused with commands that have positional arguments. ([7515453](https://github.com/sanity-io/cli/commit/751545332ae7713964c81fd1f7e95bfb46a244f5))
* Extract manifest and deploy schemas on deploy. ([#563](https://github.com/sanity-io/cli/issues/563)) ([7515453](https://github.com/sanity-io/cli/commit/751545332ae7713964c81fd1f7e95bfb46a244f5))
* Fix inverted CORS guard in bootstrapRemoteTemplate. ([#547](https://github.com/sanity-io/cli/issues/547)) ([7515453](https://github.com/sanity-io/cli/commit/751545332ae7713964c81fd1f7e95bfb46a244f5))
* GraphQL and certain commands now support vite aliases. ([7515453](https://github.com/sanity-io/cli/commit/751545332ae7713964c81fd1f7e95bfb46a244f5))
* Strict flag parsing. Unknown flags now produce an error and halt execution rather than being silently ignored. For example, passing --datset foo (a typo) previously had no effect; it now returns an error. ([7515453](https://github.com/sanity-io/cli/commit/751545332ae7713964c81fd1f7e95bfb46a244f5))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/cli-core bumped to 1.0.1
  * devDependencies
    * @sanity/cli-test bumped to 0.2.1

## [5.14.1](https://github.com/sanity-io/sanity/compare/v5.14.0...v5.14.1) (2026-03-10)

**Note:** Version bump only for package @sanity/cli

## [5.14.0](https://github.com/sanity-io/sanity/compare/v5.13.0...v5.14.0) (2026-03-10)

**Note:** Version bump only for package @sanity/cli

## [5.13.0](https://github.com/sanity-io/sanity/compare/v5.12.0...v5.13.0) (2026-03-03)

### Features

* **cli:** upgrade blueprints doctor and plan ([#12258](https://github.com/sanity-io/sanity/issues/12258)) ([64d162e](https://github.com/sanity-io/sanity/commit/64d162ee2832b4ef2ee72779c8c390a44f9cfbde)) by Taylor Beseda (tbeseda@gmail.com)

## [5.12.0](https://github.com/sanity-io/sanity/compare/v5.11.0...v5.12.0) (2026-02-24)

### Features

* **cli:** add Gemini, Codex and Copilot CLIs to MCP configure ([#12194](https://github.com/sanity-io/sanity/issues/12194)) ([093e716](https://github.com/sanity-io/sanity/commit/093e7165e77bce80e11e59e7a98f58524d363e43)) by James Woods (jwwoods01@gmail.com)
* **cli:** upgrade blueprints commands ([#12226](https://github.com/sanity-io/sanity/issues/12226)) ([245a07f](https://github.com/sanity-io/sanity/commit/245a07ff585caf4c63536c47f7dd468c5c01205a)) by Taylor Beseda (tbeseda@gmail.com)

## [5.11.0](https://github.com/sanity-io/sanity/compare/v5.10.0...v5.11.0) (2026-02-19)

**Note:** Version bump only for package @sanity/cli

## [5.10.0](https://github.com/sanity-io/sanity/compare/v5.9.0...v5.10.0) (2026-02-17)

**Note:** Version bump only for package @sanity/cli

## [5.9.0](https://github.com/sanity-io/sanity/compare/v5.8.1...v5.9.0) (2026-02-10)

### Features

* **cli:** add schema extraction to dev and build commands ([#11761](https://github.com/sanity-io/sanity/issues/11761)) ([c3a4cb1](https://github.com/sanity-io/sanity/commit/c3a4cb19e11147ba91a832420fed13504e8b58a4)) by Kristoffer Brabrand (kristoffer@brabrand.no)

### Bug Fixes

* update readLocalBlueprint signature ([#12097](https://github.com/sanity-io/sanity/issues/12097)) ([7a16694](https://github.com/sanity-io/sanity/commit/7a166946ce61e278eff9e83328a98aaf74b249b9)) by Simon MacDonald (simon.macdonald@gmail.com)

### Reverts

* rollback v5.9.0 version bump ([#12139](https://github.com/sanity-io/sanity/issues/12139)) ([4195d26](https://github.com/sanity-io/sanity/commit/4195d269f400347fb16765400842f765eb1625ec)) by Bjørge Næss (bjoerge@gmail.com)

## [5.8.1](https://github.com/sanity-io/sanity/compare/v5.8.0...v5.8.1) (2026-02-05)

### Bug Fixes

* **deps:** update dependency @sanity/template-validator to ^2.4.5 ([#12076](https://github.com/sanity-io/sanity/issues/12076)) ([6da793e](https://github.com/sanity-io/sanity/commit/6da793e90e421abeea39533dde344295c8b52ebf)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)
* **deps:** update dependency @sanity/template-validator to v3 ([#12092](https://github.com/sanity-io/sanity/issues/12092)) ([d889072](https://github.com/sanity-io/sanity/commit/d88907264bf0ac667a89097299c41c83a257b12e)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)

## [5.8.0](https://github.com/sanity-io/sanity/compare/v5.7.0...v5.8.0) (2026-02-03)

### Features

* **cli:** add typegen to dev and build commands ([#11957](https://github.com/sanity-io/sanity/issues/11957)) ([dc6baae](https://github.com/sanity-io/sanity/commit/dc6baaed2d132e3d1fd020f0871d929fb9a34a5c)) by Kristoffer Brabrand (kristoffer@brabrand.no)
* **cli:** add watch mode for typegen generate command ([#11867](https://github.com/sanity-io/sanity/issues/11867)) ([c22e65e](https://github.com/sanity-io/sanity/commit/c22e65eb958f98c47e2cdfc028618aa2fe512760)) by Kristoffer Brabrand (kristoffer@brabrand.no)

## [5.7.0](https://github.com/sanity-io/sanity/compare/v5.6.0...v5.7.0) (2026-01-27)

### Bug Fixes

* **cli:** pass CLI project ID to runtime-cli if set, upgrade runtime-cli ([#11971](https://github.com/sanity-io/sanity/issues/11971)) ([539bf4a](https://github.com/sanity-io/sanity/commit/539bf4aca764cab92e0a0241a78eb599844f7d26)) by Espen Hovlandsdal (espen@hovlandsdal.com)

## [5.6.0](https://github.com/sanity-io/sanity/compare/v5.5.0...v5.6.0) (2026-01-22)

### Bug Fixes

* **deps:** Update babel monorepo to ^7.28.6 ([#11876](https://github.com/sanity-io/sanity/issues/11876)) ([c86d4fb](https://github.com/sanity-io/sanity/commit/c86d4fb25421e864811dd09eae520d7d7d54a50f)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)
* **test:** symlink in monorepo deps after installing ([#11905](https://github.com/sanity-io/sanity/issues/11905)) ([2b9d06b](https://github.com/sanity-io/sanity/commit/2b9d06bb967b1250a7ed6dab6a81a02c1f713c84)) by Kristoffer Brabrand (kristoffer@brabrand.no)

## [5.5.0](https://github.com/sanity-io/sanity/compare/v5.4.0...v5.5.0) (2026-01-19)

### Features

* **cli:** allow configuring schemaExtraction in sanity.cli.ts ([#11824](https://github.com/sanity-io/sanity/issues/11824)) ([6fd624b](https://github.com/sanity-io/sanity/commit/6fd624bc580db4886fa23a087774034fc8f49bd5)) by Kristoffer Brabrand (kristoffer@brabrand.no)

## [5.4.0](https://github.com/sanity-io/sanity/compare/v5.3.1...v5.4.0) (2026-01-15)

**Note:** Version bump only for package @sanity/cli

## [5.3.1](https://github.com/sanity-io/sanity/compare/v5.3.0...v5.3.1) (2026-01-14)

**Note:** Version bump only for package @sanity/cli

## [5.3.0](https://github.com/sanity-io/sanity/compare/v5.2.0...v5.3.0) (2026-01-13)

### Features

* **cli:** add mcp configuration support for zed and opencode ([#11747](https://github.com/sanity-io/sanity/issues/11747)) ([30121a5](https://github.com/sanity-io/sanity/commit/30121a5fe05f02f7588932a0327dfc848d7c0c1e)) by James Woods (jwwoods01@gmail.com)
* GRO-4157 dynamic mcp init prompt ([#11555](https://github.com/sanity-io/sanity/issues/11555)) ([e6f4485](https://github.com/sanity-io/sanity/commit/e6f4485432679942aa53155363c97b73d77aceda)) by Matthew Ritter (matthew.ritter@sanity.io)
* **typegen:** add ArrayOf utility type for inline object array members ([#11698](https://github.com/sanity-io/sanity/issues/11698)) ([895b404](https://github.com/sanity-io/sanity/commit/895b404899446c0dec5c5e130cefaa645fccde3e)) by Kristoffer Brabrand (kristoffer@brabrand.no)

### Bug Fixes

* **linter:** enforce no unnecessary boolean literal comparisons ([#11734](https://github.com/sanity-io/sanity/issues/11734)) ([94462ad](https://github.com/sanity-io/sanity/commit/94462ad1f55c5a809f030ab21db5148bf921726b)) by Cody Olsen (81981+stipsan@users.noreply.github.com)
* **vitest:** migrate Date, Worker, and Observer mocking to v4 API ([#11754](https://github.com/sanity-io/sanity/issues/11754)) ([20caed1](https://github.com/sanity-io/sanity/commit/20caed10d7531f82167354623799371e580449be)) by Copilot (198982749+Copilot@users.noreply.github.com)

## [5.2.0](https://github.com/sanity-io/sanity/compare/v5.1.0...v5.2.0) (2026-01-07)

### Bug Fixes

* **cli:** update init output docs command text ([#10074](https://github.com/sanity-io/sanity/issues/10074)) ([ad1c6bd](https://github.com/sanity-io/sanity/commit/ad1c6bd7065820824e333395194c7a486a9a06a3)) by Mark Michon (mark.michon@sanity.io)

## [5.1.0](https://github.com/sanity-io/sanity/compare/v5.0.1...v5.1.0) (2025-12-22)

**Note:** Version bump only for package @sanity/cli

## [5.0.1](https://github.com/sanity-io/sanity/compare/v5.0.0...v5.0.1) (2025-12-17)

**Note:** Version bump only for package @sanity/cli

## [5.0.0](https://github.com/sanity-io/sanity/compare/v4.22.0...v5.0.0) (2025-12-16)

### ⚠ BREAKING CHANGES

* **typegen:** return same case when generating types (#11330)

### Features

* **typegen:** memoizations, refactoring add improved progress reporting ([#10294](https://github.com/sanity-io/sanity/issues/10294)) ([5d6ac17](https://github.com/sanity-io/sanity/commit/5d6ac171739442c4db418eed8176d1845cb8181a)), closes [#8950](https://github.com/sanity-io/sanity/issues/8950) by Kristoffer Brabrand (kristoffer@brabrand.no)
* **typegen:** return same case when generating types ([#11330](https://github.com/sanity-io/sanity/issues/11330)) ([0402647](https://github.com/sanity-io/sanity/commit/0402647eb06a4dde3d1c93ebf70192c47ee52e36)) by Sindre Gulseth (sgulseth@gmail.com)

## [4.22.0](https://github.com/sanity-io/sanity/compare/v4.21.1...v4.22.0) (2025-12-16)

### Features

* update mcp configured prompt text ([#11514](https://github.com/sanity-io/sanity/issues/11514)) ([b595fee](https://github.com/sanity-io/sanity/commit/b595fee91a0f780b99ab0adaa593839df30f6cf7)) by Matthew Ritter (matthew.ritter@sanity.io)

### Bug Fixes

* **cli:** telemetry in MCP commands ([#11487](https://github.com/sanity-io/sanity/issues/11487)) ([9e805d6](https://github.com/sanity-io/sanity/commit/9e805d64ae4e7f36c4bdc6632789cfd7aedab6a8)) by James Woods (jwwoods01@gmail.com)
* **cli:** update runtime commands ([#11513](https://github.com/sanity-io/sanity/issues/11513)) ([6f9ae4f](https://github.com/sanity-io/sanity/commit/6f9ae4f90456f5b592363aba4c188b24f3d38d4c)) by Taylor Beseda (tbeseda@gmail.com)

## [4.21.1](https://github.com/sanity-io/sanity/compare/v4.21.0...v4.21.1) (2025-12-11)

### Bug Fixes

* **cli:** blueprints doctor does not require existing blueprint config ([#11444](https://github.com/sanity-io/sanity/issues/11444)) ([b8d9a94](https://github.com/sanity-io/sanity/commit/b8d9a94e4b142aa2860b7ce0e928f3c7c72a257e)) by Taylor Beseda (tbeseda@gmail.com)
* mcp cli wording ([#11457](https://github.com/sanity-io/sanity/issues/11457)) ([2aa0766](https://github.com/sanity-io/sanity/commit/2aa0766f7c5ad5f57c39a10525584489283a3a1f)) by James Woods (jwwoods01@gmail.com)

## [4.21.0](https://github.com/sanity-io/sanity/compare/v4.20.3...v4.21.0) (2025-12-09)

### Features

* setup mcp on sanity init and add mcp add command to cli ([#11409](https://github.com/sanity-io/sanity/issues/11409)) ([4752fb1](https://github.com/sanity-io/sanity/commit/4752fb174ad862817d40e0eeba07074fa62d3801)) by James Woods (jwwoods01@gmail.com)
* setup mcp on sanity init and add mcp add command to cli ([#11434](https://github.com/sanity-io/sanity/issues/11434)) ([e27bea7](https://github.com/sanity-io/sanity/commit/e27bea79c96cd743931f1d52cf9ceed52dd88f88)) by James Woods (jwwoods01@gmail.com)
* Update runtime-cli to v12 ([#11410](https://github.com/sanity-io/sanity/issues/11410)) ([3fea96a](https://github.com/sanity-io/sanity/commit/3fea96acee0a8e5ccdd2c63a78eaa7fb273e39e0)) by Dave Sewell (snocorp@gmail.com)

### Bug Fixes

* **deps:** update dependency get-it to ^8.7.0 ([#11395](https://github.com/sanity-io/sanity/issues/11395)) ([5f4487a](https://github.com/sanity-io/sanity/commit/5f4487aff99167094b2d1ea91058a45771198833)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)
* **deps:** update dependency groq-js to ^1.23.0 ([#11429](https://github.com/sanity-io/sanity/issues/11429)) ([b100ba4](https://github.com/sanity-io/sanity/commit/b100ba48cf49f31c0230c92095450aa0690e7d4b)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)

## [4.20.3](https://github.com/sanity-io/sanity/compare/v4.20.2...v4.20.3) (2025-12-04)

### Bug Fixes

* **deps:** Update react monorepo to ^19.2.1 ([#11389](https://github.com/sanity-io/sanity/issues/11389)) ([ad157b1](https://github.com/sanity-io/sanity/commit/ad157b1e393f997d9c0dacdd964781169a95d2de)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)

## [4.20.2](https://github.com/sanity-io/sanity/compare/v4.20.1...v4.20.2) (2025-12-04)

**Note:** Version bump only for package @sanity/cli

## [4.20.1](https://github.com/sanity-io/sanity/compare/v4.20.0...v4.20.1) (2025-12-03)

### Bug Fixes

* **deps:** update dependency groq-js to ^1.22.0 ([#11366](https://github.com/sanity-io/sanity/issues/11366)) ([6976b77](https://github.com/sanity-io/sanity/commit/6976b77295f0959abc588fe24dbd45e246d4b217)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)
* ERR_REQUIRE_CYCLE_MODULE on older node, and windows resolve regression ([#11385](https://github.com/sanity-io/sanity/issues/11385)) ([bfaa1c7](https://github.com/sanity-io/sanity/commit/bfaa1c7710e4d0c2f422689ca107a7f84c37c763)) by Cody Olsen (81981+stipsan@users.noreply.github.com)

## [4.20.0](https://github.com/sanity-io/sanity/compare/v4.19.0...v4.20.0) (2025-12-02)

**Note:** Version bump only for package @sanity/cli

## [4.19.0](https://github.com/sanity-io/sanity/compare/v4.18.0...v4.19.0) (2025-11-25)

### Features

* **cli:** add typegen configuration through cli config ([#11135](https://github.com/sanity-io/sanity/issues/11135)) ([cfd2d9c](https://github.com/sanity-io/sanity/commit/cfd2d9c26870a7dbfebfef97ac575507f7a0edbe)) by Kristoffer Brabrand (kristoffer@brabrand.no)

## [4.18.0](https://github.com/sanity-io/sanity/compare/v4.17.0...v4.18.0) (2025-11-21)

### Bug Fixes

* **deps:** update dependency groq-js to ^1.21.0 ([#11216](https://github.com/sanity-io/sanity/issues/11216)) ([fc8f483](https://github.com/sanity-io/sanity/commit/fc8f4832c1a80162bdc54a229f66c3af911a3d21)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)

## [4.17.0](https://github.com/sanity-io/sanity/compare/v4.16.0...v4.17.0) (2025-11-20)

### Bug Fixes

* **actions:** `onComplete` considered harmful, use local state instead ([#11199](https://github.com/sanity-io/sanity/issues/11199)) ([461f54d](https://github.com/sanity-io/sanity/commit/461f54d62f50ee96cc959ea97c023dbbda9d048e)) by Cody Olsen (81981+stipsan@users.noreply.github.com)

## [4.16.0](https://github.com/sanity-io/sanity/compare/v4.15.0...v4.16.0) (2025-11-18)

### Features

* allow configuring sanity CLI config in testing ([#11133](https://github.com/sanity-io/sanity/issues/11133)) ([dd909ce](https://github.com/sanity-io/sanity/commit/dd909ce127696298e35a4810ed2c6cad9e4ffe40)) by Kristoffer Brabrand (kristoffer@brabrand.no)

### Bug Fixes

* **deps:** Update babel monorepo to ^7.28.5 ([#11181](https://github.com/sanity-io/sanity/issues/11181)) ([08d6e66](https://github.com/sanity-io/sanity/commit/08d6e66c0aa5cc7103da8e734c4bb151d9b0a179)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)
* **deps:** upgrade react compiler to v1 ([#10834](https://github.com/sanity-io/sanity/issues/10834)) ([2573cb1](https://github.com/sanity-io/sanity/commit/2573cb15c224c762636500b339d0c2701aad1e68)) by Cody Olsen (81981+stipsan@users.noreply.github.com)
* **functions:** support host flag in functions dev ([#11118](https://github.com/sanity-io/sanity/issues/11118)) ([9588b8b](https://github.com/sanity-io/sanity/commit/9588b8b805bdf4c1d911e7700be2f476a88a2f12)) by Simon MacDonald (simon.macdonald@gmail.com)

## [4.15.0](https://github.com/sanity-io/sanity/compare/v4.14.2...v4.15.0) (2025-11-11)

### Bug Fixes

* **typegen:** allow generating types to absolute path ([#7620](https://github.com/sanity-io/sanity/issues/7620)) ([#11081](https://github.com/sanity-io/sanity/issues/11081)) ([f8b4e87](https://github.com/sanity-io/sanity/commit/f8b4e87fdb54a8d294a7ffc754cf5f662adfdaab)) by Kristoffer Brabrand (kristoffer@brabrand.no)

### Reverts

* **deps:** add patch-package as direct dependency ([#11085](https://github.com/sanity-io/sanity/issues/11085)) ([#11086](https://github.com/sanity-io/sanity/issues/11086)) ([45a5dbf](https://github.com/sanity-io/sanity/commit/45a5dbf56a174884032b212e4dc5b61cba1acb31)) by Bjørge Næss (bjoerge@gmail.com)

## [4.14.2](https://github.com/sanity-io/sanity/compare/v4.14.1...v4.14.2) (2025-11-07)

### Bug Fixes

* **cli:** disable dynamic-import when running cli from local source ([#11078](https://github.com/sanity-io/sanity/issues/11078)) ([a30a092](https://github.com/sanity-io/sanity/commit/a30a0923467591cf1c57638d0e370bbbd0856d06)) by Kristoffer Brabrand (kristoffer@brabrand.no)
* **deps:** add patch-package as direct dependency ([#11085](https://github.com/sanity-io/sanity/issues/11085)) ([3a6536c](https://github.com/sanity-io/sanity/commit/3a6536ca7c5fc64daec42057dc56a06c14cd74e2)) by Bjørge Næss (bjoerge@gmail.com)

## [4.14.1](https://github.com/sanity-io/sanity/compare/v4.14.0...v4.14.1) (2025-11-06)

**Note:** Version bump only for package @sanity/cli

## [4.14.0](https://github.com/sanity-io/sanity/compare/v4.13.0...v4.14.0) (2025-11-06)

### Bug Fixes

* **cli:** add new function test flag ([#11007](https://github.com/sanity-io/sanity/issues/11007)) ([22bd071](https://github.com/sanity-io/sanity/commit/22bd07126984e872f3fd3817f54c52a0da1114e9)) by Simon MacDonald (simon.macdonald@gmail.com)
* **deps:** add `@babel/parser`, an implicit dep of `recast` ([#11042](https://github.com/sanity-io/sanity/issues/11042)) ([bc08d28](https://github.com/sanity-io/sanity/commit/bc08d286f2cf618152dd483765df70304a120155)) by Cody Olsen (81981+stipsan@users.noreply.github.com)
* **deps:** update dependency @sanity/client to ^7.12.1 ([#11029](https://github.com/sanity-io/sanity/issues/11029)) ([df2aa67](https://github.com/sanity-io/sanity/commit/df2aa672f39c9a847e4102f1f0e18d240e1aa808)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)

## [4.13.0](https://github.com/sanity-io/sanity/compare/v4.12.0...v4.13.0) (2025-11-03)

### Features

* Add shopify domain to shopify template ([#10983](https://github.com/sanity-io/sanity/issues/10983)) ([6138bda](https://github.com/sanity-io/sanity/commit/6138bda22905993b66b678d23d2ced43db23e060)) by Indrek Kärner (152283155+indrekkarner@users.noreply.github.com)
* **cli/blueprints:** doctor command ([#10987](https://github.com/sanity-io/sanity/issues/10987)) ([7485f28](https://github.com/sanity-io/sanity/commit/7485f28d37a3b8dddd8b8f07b404fcbf3cbf0f33)) by Taylor Beseda (tbeseda@gmail.com)

### Bug Fixes

* **deps:** catalog vitest, jsdom add overrides ([a54467e](https://github.com/sanity-io/sanity/commit/a54467e2e5a2b6cd0fceb46b37f3143577cb45bc)) by Bjørge Næss (bjoerge@gmail.com)
* use www for sanity website urls ([#10994](https://github.com/sanity-io/sanity/issues/10994)) ([de66f58](https://github.com/sanity-io/sanity/commit/de66f58229ed3999cd2c193cac6df48aa3046e58)) by Bjørge Næss (bjoerge@gmail.com)

## [4.12.0](https://github.com/sanity-io/sanity/compare/v4.11.0...v4.12.0) (2025-10-28)

**Note:** Version bump only for package @sanity/cli

## [4.11.0](https://github.com/sanity-io/sanity/compare/v4.10.3...v4.11.0) (2025-10-21)

### Bug Fixes

* **cli:** pipe stderr when installing dependencies ([#10839](https://github.com/sanity-io/sanity/issues/10839)) ([704a357](https://github.com/sanity-io/sanity/commit/704a357fc0c0e172fc9f4c5c44e5ed275e4895fe)) by Bjørge Næss (bjoerge@gmail.com)
* **deps:** update dependency groq-js to ^1.20.0 ([#10852](https://github.com/sanity-io/sanity/issues/10852)) ([ae0f0c7](https://github.com/sanity-io/sanity/commit/ae0f0c78f89281b48f0dec0340ae55acf51c768b)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)

## [4.10.3](https://github.com/sanity-io/sanity/compare/v4.10.2...v4.10.3) (2025-10-14)

### Bug Fixes

* **deps:** update dependency @sanity/client to ^7.12.0 ([#10802](https://github.com/sanity-io/sanity/issues/10802)) ([391127a](https://github.com/sanity-io/sanity/commit/391127adf802b946deba689f64099cb4ee306e61))

## [4.10.2](https://github.com/sanity-io/sanity/compare/v4.10.1...v4.10.2) (2025-09-30)

**Note:** Version bump only for package @sanity/cli

## [4.10.1](https://github.com/sanity-io/sanity/compare/v4.10.0...v4.10.1) (2025-09-25)

### Bug Fixes

* **deps:** update dependency groq-js to ^1.19.0 ([#10751](https://github.com/sanity-io/sanity/issues/10751)) ([0e61cf3](https://github.com/sanity-io/sanity/commit/0e61cf345b61c49a2408c40210e60aa165ea8a97))

## [4.10.0](https://github.com/sanity-io/sanity/compare/v4.9.0...v4.10.0) (2025-09-23)

### Bug Fixes

* **deps:** update dependency @sanity/client to ^7.11.2 ([#10667](https://github.com/sanity-io/sanity/issues/10667)) ([3d3ea0d](https://github.com/sanity-io/sanity/commit/3d3ea0df4bad43af82ae6b10f0c2ca6c7270bfeb))
* use generated react compiler typings ([#10672](https://github.com/sanity-io/sanity/issues/10672)) ([ac6c9a0](https://github.com/sanity-io/sanity/commit/ac6c9a09559c4ae33929f63f4379c73efec0f3f8))

## [4.9.0](https://github.com/sanity-io/sanity/compare/v4.8.1...v4.9.0) (2025-09-16)

### Features

* **cli:** Add delta flags to functions test command ([#10607](https://github.com/sanity-io/sanity/issues/10607)) ([166f7af](https://github.com/sanity-io/sanity/commit/166f7afc022c20a0e773256f238ab26d9e85d050))
* **init:** update next.js init template to next-sanity v11 ([#10610](https://github.com/sanity-io/sanity/issues/10610)) ([bd3d363](https://github.com/sanity-io/sanity/commit/bd3d3638612c4c605173390df495036a2a01fab6))

## [4.8.1](https://github.com/sanity-io/sanity/compare/v4.8.0...v4.8.1) (2025-09-10)

**Note:** Version bump only for package @sanity/cli

## [4.8.0](https://github.com/sanity-io/sanity/compare/v4.7.0...v4.8.0) (2025-09-10)

### Bug Fixes

* **deps:** Update babel monorepo to ^7.28.4 ([#10601](https://github.com/sanity-io/sanity/issues/10601)) ([cd6611a](https://github.com/sanity-io/sanity/commit/cd6611a87fc6f003434bb72629effd31f21a0ab2))
* **deps:** update dependency @sanity/client to ^7.11.1 ([#10593](https://github.com/sanity-io/sanity/issues/10593)) ([96d3546](https://github.com/sanity-io/sanity/commit/96d35461db9de547e7ddd3d8987501ae41f9423d))

## [4.7.0](https://github.com/sanity-io/sanity/compare/v4.6.1...v4.7.0) (2025-09-09)

### Features

* **cli:** Add & update docstrings to AppConfig type ([#10514](https://github.com/sanity-io/sanity/issues/10514)) ([5be6ca4](https://github.com/sanity-io/sanity/commit/5be6ca438fccdd1ac2a57444bcde7b3ff937afb8))

### Bug Fixes

* **cli:** warn if engine requirements not met ([#10461](https://github.com/sanity-io/sanity/issues/10461)) ([739e913](https://github.com/sanity-io/sanity/commit/739e9135ded8b6f9b0be4e5d1bf36a531944a249))
* **deps:** update dependency @sanity/client to ^7.11.0 ([#10518](https://github.com/sanity-io/sanity/issues/10518)) ([5cfeba6](https://github.com/sanity-io/sanity/commit/5cfeba6b5d7f03c566740298ca4661c1066cc6aa))
* **deps:** update dependency groq-js to ^1.18.0 ([#10576](https://github.com/sanity-io/sanity/issues/10576)) ([176527f](https://github.com/sanity-io/sanity/commit/176527ff1aa281cb7a890e9abe00185a60263f2a))

## [4.6.1](https://github.com/sanity-io/sanity/compare/v4.6.0...v4.6.1) (2025-09-02)

### Bug Fixes

* **deps:** update dependency @sanity/client to ^7.10.0 ([#10465](https://github.com/sanity-io/sanity/issues/10465)) ([62103ca](https://github.com/sanity-io/sanity/commit/62103ca0e384f49317a8c25cdb578ca5895fbb1a))

## [4.6.0](https://github.com/sanity-io/sanity/compare/v4.5.0...v4.6.0) (2025-08-26)

### Features

* support new Function document change events (`create`, `delete`, `update`) and filters (`includeDrafts` and `includeAllVersions`) ([#10413](https://github.com/sanity-io/sanity/issues/10413)) ([1835683](https://github.com/sanity-io/sanity/commit/1835683189abcfa49ffb06a4144ee59cf3ea16a1))

### Bug Fixes

* **deps:** update dependency @sanity/client to ^7.9.0 ([#10412](https://github.com/sanity-io/sanity/issues/10412)) ([392f5dc](https://github.com/sanity-io/sanity/commit/392f5dc710fd1184709b268a4cc40b6af2e37162))

## [4.5.0](https://github.com/sanity-io/sanity/compare/v4.4.1...v4.5.0) (2025-08-19)

### Bug Fixes

* **deps:** Update babel monorepo to ^7.28.3 ([#10301](https://github.com/sanity-io/sanity/issues/10301)) ([cb6718b](https://github.com/sanity-io/sanity/commit/cb6718b8ef05a003336aa0ac7bf42d092d8205ae))

## [4.4.1](https://github.com/sanity-io/sanity/compare/v4.4.0...v4.4.1) (2025-08-14)

### Bug Fixes

* allow v20 in node engines ([#10290](https://github.com/sanity-io/sanity/issues/10290)) ([73150e9](https://github.com/sanity-io/sanity/commit/73150e9befde5cb531279c9b206a08682df3ff38))

## [4.4.0](https://github.com/sanity-io/sanity/compare/v4.3.0...v4.4.0) (2025-08-13)

### Bug Fixes

* **cli:** env vars not loading in sanity.cli when using vite callback ([#10186](https://github.com/sanity-io/sanity/issues/10186)) ([42122dc](https://github.com/sanity-io/sanity/commit/42122dc31534e8057a42cfc3c16cea46752346ac))
* update engines to require node >=22.12.0 ([#10227](https://github.com/sanity-io/sanity/issues/10227)) ([c1b9fe2](https://github.com/sanity-io/sanity/commit/c1b9fe2b70ccbb9ff4bce0845dfaad25cafcd35a))

## [4.3.0](https://github.com/sanity-io/sanity/compare/v4.2.0...v4.3.0) (2025-08-05)

### Bug Fixes

* **cli:** Add missing flag to blueprints add example ([#10089](https://github.com/sanity-io/sanity/issues/10089)) ([10c001a](https://github.com/sanity-io/sanity/commit/10c001aa5e394ddd17d7e7914760978594058e66))
* **cli:** remove workspace version specifier ([#10109](https://github.com/sanity-io/sanity/issues/10109)) ([6a84ff7](https://github.com/sanity-io/sanity/commit/6a84ff7593f5b03b466770efb8fa1869adb112e5))
* **deps:** update dependency @sanity/client to ^7.8.2 ([#10181](https://github.com/sanity-io/sanity/issues/10181)) ([f63be89](https://github.com/sanity-io/sanity/commit/f63be89404282e45a64b18acc2dee7585bd3dcf1))

## [4.2.0](https://github.com/sanity-io/sanity/compare/v4.1.1...v4.2.0) (2025-07-29)

### Features

* **cli:** add openapi command group with list and get subcommands ([#9924](https://github.com/sanity-io/sanity/issues/9924)) ([9fa20e9](https://github.com/sanity-io/sanity/commit/9fa20e91afb911b5d913af08677fa87f86e6b143))

### Bug Fixes

* **deps:** Update babel monorepo ([#10045](https://github.com/sanity-io/sanity/issues/10045)) ([a47ceea](https://github.com/sanity-io/sanity/commit/a47ceea64da2afd82133a16008cdfdb7890af782))
* **deps:** update dependency @sanity/client to ^7.8.1 ([#10066](https://github.com/sanity-io/sanity/issues/10066)) ([4e0d1c5](https://github.com/sanity-io/sanity/commit/4e0d1c53856b2e6bf6c61b3609fa8ba6fcd011dc))
* **deps:** update dependency groq-js to ^1.17.3 ([#10069](https://github.com/sanity-io/sanity/issues/10069)) ([d74c4fb](https://github.com/sanity-io/sanity/commit/d74c4fb87eeae2bd18cd99a5df725c8469b8f8e7))
* **deps:** update dependency next-sanity to v10 ([#9998](https://github.com/sanity-io/sanity/issues/9998)) ([226ab14](https://github.com/sanity-io/sanity/commit/226ab1460f763c89507401a38f59f005d7fbcfde))
* **functions:** update help docs ([#10070](https://github.com/sanity-io/sanity/issues/10070)) ([02e95dd](https://github.com/sanity-io/sanity/commit/02e95dd0061fadfa312ee840e1cc715dcdd49397))

## [4.1.1](https://github.com/sanity-io/sanity/compare/v4.1.0...v4.1.1) (2025-07-22)

**Note:** Version bump only for package @sanity/cli

## [4.1.0](https://github.com/sanity-io/sanity/compare/v4.0.1...v4.1.0) (2025-07-21)

### Bug Fixes

* **deps:** update dependency @sanity/client to ^7.8.0 ([#9974](https://github.com/sanity-io/sanity/issues/9974)) ([abca37f](https://github.com/sanity-io/sanity/commit/abca37f07db11a1b97c53e6718f293542237a1ca))
* **deps:** update dependency groq-js to ^1.17.2 ([#10020](https://github.com/sanity-io/sanity/issues/10020)) ([1c2dcb0](https://github.com/sanity-io/sanity/commit/1c2dcb096a8874e72bbc35e4a9fb7e1de7526eb0))

## [4.0.1](https://github.com/sanity-io/sanity/compare/v4.0.0...v4.0.1) (2025-07-16)

**Note:** Version bump only for package @sanity/cli

## [4.0.0](https://github.com/sanity-io/sanity/compare/v3.99.0...v4.0.0) (2025-07-14)

### ⚠ BREAKING CHANGES

* remove node 18, make base 20 (#9804)

### Features

* **cli): feat(cli:** add docs search and read commands ([#9910](https://github.com/sanity-io/sanity/issues/9910)) ([d2742dd](https://github.com/sanity-io/sanity/commit/d2742dd38013c3f5516ba15886471f0b89d786b8))

### Bug Fixes

* remove node 18, make base 20 ([#9804](https://github.com/sanity-io/sanity/issues/9804)) ([8fa2157](https://github.com/sanity-io/sanity/commit/8fa2157bf7d5f1390f0e1663cb32bb1ffd361188))

## [3.99.0](https://github.com/sanity-io/sanity/compare/v3.98.1...v3.99.0) (2025-07-11)

### Bug Fixes

* **cli:** add document-id flag to functions test ([#9944](https://github.com/sanity-io/sanity/issues/9944)) ([b9e7fcd](https://github.com/sanity-io/sanity/commit/b9e7fcd9c017a2051b09e299e1d21ad1cb7eb37b))

## <small>3.98.1 (2025-07-09)</small>

* test: remove flag from cli token tests (#9925) ([6b4088a](https://github.com/sanity-io/sanity/commit/6b4088a)), closes [#9925](https://github.com/sanity-io/sanity/issues/9925)
* test(cli): update to use pnpm to install instead of npm  (#9929) ([ebba8b0](https://github.com/sanity-io/sanity/commit/ebba8b0)), closes [#9929](https://github.com/sanity-io/sanity/issues/9929)

## [3.98.0](https://github.com/sanity-io/sanity/compare/v3.97.1...v3.98.0) (2025-07-07)

**Note:** Version bump only for package @sanity/cli

## [3.97.1](https://github.com/sanity-io/sanity/compare/v3.97.0...v3.97.1) (2025-07-04)

**Note:** Version bump only for package @sanity/cli

## [3.97.0](https://github.com/sanity-io/sanity/compare/v3.96.0...v3.97.0) (2025-07-04)

### Features

* **cli:** add --project-id as alias of --project to init ([#9799](https://github.com/sanity-io/sanity/issues/9799)) ([af00ad2](https://github.com/sanity-io/sanity/commit/af00ad21343f9b93da1890c8d2be6c627726fd1f)) by Rune Botten (rbotten@gmail.com)
* **cli:** add `sanity projects create` command ([#9830](https://github.com/sanity-io/sanity/issues/9830)) ([af20bbf](https://github.com/sanity-io/sanity/commit/af20bbf4af983f60e1a57c1a8c01ba2a7a90b597)) by Rune Botten (rbotten@gmail.com)
* **cli:** add API tokens management commands ([#9821](https://github.com/sanity-io/sanity/issues/9821)) ([6494f59](https://github.com/sanity-io/sanity/commit/6494f59c505e9bafa69a01db09c1f0ebf4c93a62)) by Rune Botten (rbotten@gmail.com)

### Bug Fixes

* add with user token option to functions test command ([#9881](https://github.com/sanity-io/sanity/issues/9881)) ([fd2aa4c](https://github.com/sanity-io/sanity/commit/fd2aa4c9d25018ba66ada5b13d1e51b0d6f0a0dd)) by Simon MacDonald (simon.macdonald@gmail.com)

## [3.96.0](https://github.com/sanity-io/sanity/compare/v3.95.0...v3.96.0) (2025-07-02)

### Bug Fixes

* **deps:** update dependency get-it to ^8.6.10 ([#9859](https://github.com/sanity-io/sanity/issues/9859)) ([3185e41](https://github.com/sanity-io/sanity/commit/3185e41f4a4044e3de78a6ffae81c20e008465a4)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)
* Update runtime-cli dependency ([#9857](https://github.com/sanity-io/sanity/issues/9857)) ([45cf8f0](https://github.com/sanity-io/sanity/commit/45cf8f05a7cd81b5be7a3fce6a23b04e4928cb2d)) by Simon MacDonald (simon.macdonald@gmail.com)

## [3.95.0](https://github.com/sanity-io/sanity/compare/v3.94.2...v3.95.0) (2025-06-25)

**Note:** Version bump only for package @sanity/cli

## [3.94.2](https://github.com/sanity-io/sanity/compare/v3.94.1...v3.94.2) (2025-06-24)

**Note:** Version bump only for package @sanity/cli

## [3.94.1](https://github.com/sanity-io/sanity/compare/v3.94.0...v3.94.1) (2025-06-24)

### Bug Fixes

* **cli:** init unattended mode ([#9481](https://github.com/sanity-io/sanity/issues/9481)) ([feb8c15](https://github.com/sanity-io/sanity/commit/feb8c151ebdf4cae01e5f126936fe68238b02f41)) by Rune Botten (rbotten@gmail.com)

## [3.94.0](https://github.com/sanity-io/sanity/compare/v3.93.0...v3.94.0) (2025-06-24)

### Bug Fixes

* **deps:** update dependency groq-js to ^1.17.1 ([#9766](https://github.com/sanity-io/sanity/issues/9766)) ([f915231](https://github.com/sanity-io/sanity/commit/f915231339443a233f4ff981dc7632dc8a0106aa)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)
* stop publishing src folders to npm ([#9744](https://github.com/sanity-io/sanity/issues/9744)) ([e9296c1](https://github.com/sanity-io/sanity/commit/e9296c12d1c68ea912a309a6bfe6cb752172ba07)) by Cody Olsen (81981+stipsan@users.noreply.github.com)

## [3.93.0](https://github.com/sanity-io/sanity/compare/v3.92.0...v3.93.0) (2025-06-17)

### Features

* **cli:** Improve guidance after SDK app init ([#9640](https://github.com/sanity-io/sanity/issues/9640)) ([52ea1d6](https://github.com/sanity-io/sanity/commit/52ea1d6df9f4ada9eb472d1cea718ac5aedbc929)) by Cole Peters (cole@colepeters.com)
* **cli:** report error cause after catching CLI error ([b137973](https://github.com/sanity-io/sanity/commit/b1379735325373d96a7a11ad05ac2a91648b8979)) by Ash (ash@sanity.io)
* **cli:** update runtime-cli and enable example flag ([#9652](https://github.com/sanity-io/sanity/issues/9652)) ([2daf089](https://github.com/sanity-io/sanity/commit/2daf089745f2556d35f0380279d441ee6d10c92b)) by Taylor Beseda (tbeseda@gmail.com)

### Bug Fixes

* **deps:** Update babel monorepo ([#9690](https://github.com/sanity-io/sanity/issues/9690)) ([6d52330](https://github.com/sanity-io/sanity/commit/6d523302ffa0232653baacde84bbf6244953f599)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)
* **deps:** update dependency @sanity/client to ^7.6.0 ([#9649](https://github.com/sanity-io/sanity/issues/9649)) ([e41e814](https://github.com/sanity-io/sanity/commit/e41e8140d2de74151228f535181d368407aa9111)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)
* update link to join community ([#9646](https://github.com/sanity-io/sanity/issues/9646)) ([608e0a2](https://github.com/sanity-io/sanity/commit/608e0a2db57391a57fe16cd1b79818ff46ac5811)) by Bjørge Næss (bjoerge@gmail.com)

## [3.92.0](https://github.com/sanity-io/sanity/compare/v3.91.0...v3.92.0) (2025-06-10)

### Features

* **cli:** update React and friends for Studios created via init ([#9576](https://github.com/sanity-io/sanity/issues/9576)) ([0ebfbfe](https://github.com/sanity-io/sanity/commit/0ebfbfe4f5313141b38f7092ff198d564d1eb328)) by Bjørge Næss (bjoerge@gmail.com)

### Bug Fixes

* **cli:** do not create projects with undefined organizations ([#9548](https://github.com/sanity-io/sanity/issues/9548)) ([3717582](https://github.com/sanity-io/sanity/commit/37175828033f8c6a7e3302fa5e39d8a19b35c11a)) by Carolina Gonzalez (carolina@sanity.io)
* **deps:** update dependency @sanity/client to ^7.4.1 ([#9563](https://github.com/sanity-io/sanity/issues/9563)) ([28995c1](https://github.com/sanity-io/sanity/commit/28995c11d7e920467e50116a5be97f215ab85fd2)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)
* **deps:** update dependency @sanity/client to ^7.5.0 ([#9591](https://github.com/sanity-io/sanity/issues/9591)) ([f33154b](https://github.com/sanity-io/sanity/commit/f33154ba7336299ee0969a0a8db5bf106c3a7825)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)
* DevEx improvements when using functions cli commands ([#9595](https://github.com/sanity-io/sanity/issues/9595)) ([844b3d4](https://github.com/sanity-io/sanity/commit/844b3d4b3a0cbfe1020b0815d67100a62f1841e1)) by Simon MacDonald (simon.macdonald@gmail.com)
* speedup `sanity dev` by warming up the entry file ([#9567](https://github.com/sanity-io/sanity/issues/9567)) ([10dc15d](https://github.com/sanity-io/sanity/commit/10dc15df6a2d86515f53d3950dafb8462fac4073)) by Cody Olsen (81981+stipsan@users.noreply.github.com)

## [3.91.0](https://github.com/sanity-io/sanity/compare/v3.90.0...v3.91.0) (2025-06-03)

### Bug Fixes

* **deps:** update dependency @sanity/client to ^7.4.0 ([#9527](https://github.com/sanity-io/sanity/issues/9527)) ([1184899](https://github.com/sanity-io/sanity/commit/1184899e50bf559e0f47db0e94df942a7fa7be3a)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)
* **deps:** update dependency groq-js to ^1.17.0 ([#9507](https://github.com/sanity-io/sanity/issues/9507)) ([ceb86ec](https://github.com/sanity-io/sanity/commit/ceb86ecd0d98f5028f81d2909a92c94ad15e89c5)) by renovate[bot] (29139614+renovate[bot]@users.noreply.github.com)

### Reverts

* publish v3.91.0 ([#9546](https://github.com/sanity-io/sanity/issues/9546)) ([#9550](https://github.com/sanity-io/sanity/issues/9550)) ([d191e4c](https://github.com/sanity-io/sanity/commit/d191e4cdbccc68cda01f864c0290528df91d9571)) by Bjørge Næss (bjoerge@gmail.com)

# Changelog

## [3.86.1](https://github.com/sanity-io/sanity/compare/v3.86.0...v3.86.1) (2025-04-23)

### Bug Fixes

* **cli:** address comments from RUN-341 ([#9216](https://github.com/sanity-io/sanity/issues/9216)) ([58cfcae](https://github.com/sanity-io/sanity/commit/58cfcae3474cb7ffe5e34e22db3d10f5bf2b20fe))

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/codegen bumped to 3.86.1
    * @sanity/util bumped to 3.86.1
  * devDependencies
    * @sanity/types bumped to 3.86.1

## [3.86.0](https://github.com/sanity-io/sanity/compare/cli-v3.85.1...cli-v3.86.0) (2025-04-22)

### Features

* **cli:** blueprints commands ([#9197](https://github.com/sanity-io/sanity/issues/9197)) ([e97fccb](https://github.com/sanity-io/sanity/commit/e97fccbde58692d48e538cf60e15e77e3f958a3a))

### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/codegen bumped to 3.86.0
    * @sanity/util bumped to 3.86.0
  * devDependencies
    * @sanity/types bumped to 3.86.0

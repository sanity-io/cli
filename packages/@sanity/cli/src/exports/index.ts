export type {GraphQLAPIConfig} from '../actions/graphql/types.js'
export {createCliConfig} from '../config/createCliConfig.js'
export {defineCliConfig} from '../config/defineCliConfig.js'
export type {CliApiConfig} from '../types.js'
export {type CliClientOptions, getCliClient} from '../util/cliClient.js'
export {loadEnv} from '../util/loadEnv.js'
export type {CliConfig, UserViteConfig} from '@sanity/cli-core'

// Workbench application extension API. Canonical implementation in
// `@sanity/federation`; re-exported here so `sanity/cli` can surface it to
// app authors via `import {unstable_defineApp} from 'sanity/cli'`. Pinned ahead
// of the `@sanity/federation@0.1.0-alpha.9` release that adds the root export —
// resolves once that's published.
// eslint-disable-next-line import-x/no-unresolved
export {type DefineAppInput, unstable_defineApp} from '@sanity/federation'

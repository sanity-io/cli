export type {GraphQLAPIConfig} from '../actions/graphql/types.js'
export {createCliConfig} from '../config/createCliConfig.js'
export {defineCliConfig} from '../config/defineCliConfig.js'
export type {CliApiConfig} from '../types.js'
export {type CliClientOptions, getCliClient} from '../util/cliClient.js'
export {loadEnv} from '../util/loadEnv.js'
export type {CliConfig, UserViteConfig} from '@sanity/cli-core'

// Workbench application extension API (config-time). Canonical implementation
// in `@sanity/federation`; re-exported here so `sanity/cli` can surface it to
// app authors via `import {unstable_defineApp} from 'sanity/cli'`.
// The runtime helper `unstable_defineView` is NOT here — it bundles to the
// browser, so it lives on the browser-safe `@sanity/cli/runtime` entry to keep
// `cli-core` out of the frontend bundle.
export {type DefineAppInput, unstable_defineApp} from '@sanity/federation'

export type {GraphQLAPIConfig} from '../actions/graphql/types.js'
export {createCliConfig} from '../config/createCliConfig.js'
export {defineCliConfig} from '../config/defineCliConfig.js'
export type {CliApiConfig} from '../types.js'
export {type CliClientOptions, getCliClient} from '../util/cliClient.js'
export {loadEnv} from '../util/loadEnv.js'
export type {CliConfig, UserViteConfig} from '@sanity/cli-core/types'

// Module-federation application extension API (config-time). Canonical
// implementation lives in `@sanity/workbench-cli`; re-exported here so
// `sanity/cli` can surface it to app authors via
// `import {unstable_defineApp} from 'sanity/cli'`. The runtime helpers
// `unstable_defineView`/`unstable_defineService` are NOT here — they bundle to
// the browser, so they live on the browser-safe `@sanity/cli/runtime` entry to
// keep Node-only deps out of the frontend bundle.
export {type DefineAppInput, unstable_defineApp} from '@sanity/workbench-cli'

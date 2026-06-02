export type {GraphQLAPIConfig} from '../actions/graphql/types.js'
export {createCliConfig} from '../config/createCliConfig.js'
export {defineCliConfig} from '../config/defineCliConfig.js'
export type {CliApiConfig} from '../types.js'
export {type CliClientOptions, getCliClient} from '../util/cliClient.js'
export {loadEnv} from '../util/loadEnv.js'
export type {CliConfig, UserViteConfig} from '@sanity/cli-core'

// Workbench application extension API. Canonical implementation in
// `@sanity/federation`; re-exported here so `sanity/cli` can surface it to
// app authors via `import {unstable_defineApp} from 'sanity/cli'`.
// `unstable_defineView` is the runtime view-authoring helper; its long-term
// home is the `sanity` runtime package, but it's surfaced here for now so view
// src files can `import {unstable_defineView} from '@sanity/cli'`. Component
// props are inferred from the view type, so no prop types are re-exported.
export {type DefineAppInput, unstable_defineApp, unstable_defineView} from '@sanity/federation'

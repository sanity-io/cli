import {mockBrowserEnvironment} from '@sanity/cli-core'

// This script is meant to be used with Node's --import flag to preload
// the Sanity Studio environment before executing user scripts.
// Example: node --import ./registerBrowserEnv.js user-script.js

const rootPath = process.env.SANITY_BASE_PATH || process.cwd()

await mockBrowserEnvironment(rootPath)

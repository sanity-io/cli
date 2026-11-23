import {type CliConfig} from '@sanity/cli-core'

import {defineApplication} from '../../src/_exports/index.js'

const app = {organizationId: 'org', slug: 'app', title: 'App'}

export const omitted: CliConfig = {app: defineApplication(app)}
export const undefinedEntry: CliConfig = {app: defineApplication({...app, entry: undefined})}
export const entry: CliConfig = {app: defineApplication({...app, entry: './src/App.tsx'})}

// @ts-expect-error plain configs keep rejecting explicit `undefined`
export const plain: CliConfig = {app: {entry: undefined}}

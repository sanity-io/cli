import {defineApplication, defineCliConfig} from '../../src/exports/index.js'

const app = {organizationId: 'org', slug: 'app', title: 'App'}

defineCliConfig({app: defineApplication(app)})
defineCliConfig({app: defineApplication({...app, entry: undefined})})
defineCliConfig({app: defineApplication({...app, entry: './src/App.tsx'})})

// @ts-expect-error plain configs keep rejecting explicit `undefined`
defineCliConfig({app: {entry: undefined}})

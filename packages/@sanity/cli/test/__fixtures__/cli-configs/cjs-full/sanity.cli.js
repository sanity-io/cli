/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Full-featured CJS config covering all config sections
const path = require('node:path')

module.exports = {
  api: {
    dataset: 'production',
    projectId: 'cjsf123',
  },
  deployment: {
    appId: 'my-cjs-studio',
    autoUpdates: true,
  },
  graphql: [
    {
      generation: 'gen3',
      id: 'default',
      playground: true,
      tag: 'default',
      workspace: 'default',
    },
  ],
  mediaLibrary: {
    aspectsPath: path.resolve(__dirname, 'aspects'),
  },
  project: {
    basePath: '/studio',
  },
  reactStrictMode: true,
  server: {
    hostname: '0.0.0.0',
    port: 4000,
  },
}

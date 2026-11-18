/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// CJS config with relative require and spread override
const {baseConfig} = require('./base')
const {serverDefaults} = require('./shared')

module.exports = {
  ...baseConfig,
  server: {
    ...serverDefaults,
    port: 4444,
  },
}

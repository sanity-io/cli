/* eslint-disable no-undef */
// CJS config with environment variables and conditional logic
const isCI = process.env.CI === 'true'
const dataset = process.env.SANITY_STUDIO_DATASET || 'development'
const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'cjsenv123'

module.exports = {
  api: {
    dataset: isCI ? 'test' : dataset,
    projectId,
  },
  server: {
    hostname: process.env.HOST || 'localhost',
    port: Number(process.env.PORT) || 3333,
  },
  ...(isCI ? {} : {reactStrictMode: true}),
}

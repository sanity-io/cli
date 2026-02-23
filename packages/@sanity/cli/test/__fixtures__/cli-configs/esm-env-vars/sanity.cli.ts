import {defineCliConfig} from 'sanity/cli'

// Config values derived from environment variables with conditional logic
const isCI = process.env.CI === 'true'
const dataset = process.env.SANITY_STUDIO_DATASET || 'development'
const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'env123'

export default defineCliConfig({
  api: {
    dataset: isCI ? 'test' : dataset,
    projectId,
  },
  server: {
    hostname: process.env.HOST || 'localhost',
    port: Number(process.env.PORT) || 3333,
  },
  ...(isCI ? {} : {reactStrictMode: true}),
})

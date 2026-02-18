import {defineCliConfig} from 'sanity/cli'

// This directory has BOTH sanity.cli.ts and sanity.cli.js
// The config loader should throw an error when both exist
export default defineCliConfig({
  api: {
    dataset: 'from-ts',
    projectId: 'both123',
  },
})

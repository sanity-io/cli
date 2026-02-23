// This directory has BOTH sanity.cli.ts and sanity.cli.js
// The config loader should throw an error when both exist
export default {
  api: {
    dataset: 'from-js',
    projectId: 'both123',
  },
}

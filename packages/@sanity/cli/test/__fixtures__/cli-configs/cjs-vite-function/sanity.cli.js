/* eslint-disable eslint-js/no-undef */
// CJS config with non-serializable vite function (forces main-thread fallback)
module.exports = {
  api: {
    dataset: 'production',
    projectId: 'cjsvf123',
  },
  vite: async (config) => {
    return {
      ...config,
      build: {sourcemap: true},
    }
  },
}

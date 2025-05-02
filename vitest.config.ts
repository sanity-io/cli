import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      exclude: ['**/*.{test,spec,stories,d}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}', 'examples/**'],
      include: ['packages/@sanity/cli/**/*.{ts,tsx}', 'packages/create-sanity/**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['html', 'json', 'json-summary'],
    },
  },
})

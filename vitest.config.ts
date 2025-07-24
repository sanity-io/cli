import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        '**/*.{test,spec,stories,d}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        'examples/**',
        'packages/@sanity/cli/test/**',
      ],
      include: [
        'packages/@sanity/cli/**/*.{ts,tsx}',
        'packages/@sanity/core/**/*.{ts,tsx}',
        'packages/create-sanity/**/*.{ts,tsx}',
      ],
      provider: 'istanbul',
      reporter: ['html', 'json', 'json-summary'],
    },
  },
})

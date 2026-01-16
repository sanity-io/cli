import {defineConfig} from 'vitest/config'

export default defineConfig({
  // This is needed to avoid listening to changes in the tmp directory
  // Without this, watch will go in an infinite loop
  server: {
    watch: {
      ignored: ['**/tmp/**/*'],
    },
  },
  test: {
    coverage: {
      exclude: [
        '**/*.{test,spec,stories,d}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        'examples/**',
        'packages/@sanity/cli/test/**',
        // Vitest 4.0 no longer auto-excludes these directories
        '**/dist/**',
        '**/tmp/**',
        '**/coverage/**',
        '**/.git/**',
      ],
      include: [
        'packages/@sanity/cli/**/*.{ts,tsx}',
        'packages/@sanity/cli-core/**/*.{ts,tsx}',
        'packages/create-sanity/**/*.{ts,tsx}',
      ],
      provider: 'istanbul',
      reporter: ['html', 'json', 'json-summary'],
    },
    // Add explicit exclude for test execution
    exclude: ['**/node_modules/**', '**/dist/**', '**/tmp/**', '**/.git/**'],
    projects: ['packages/@sanity/cli', 'packages/@sanity/cli-core', 'packages/create-sanity'],
  },
})

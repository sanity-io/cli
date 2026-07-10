import {build} from 'vite'

import {writeWorkbenchRuntime} from '../dev/writeWorkbenchRuntime.js'

/**
 * Bundle the workbench host shell — `index.html` plus a client bundle that
 * calls `renderWorkbench` — into the federation build's output directory, so
 * hosting can serve the app standalone at its slug. The production counterpart
 * of the shell the workbench dev server serves.
 * @internal
 */
export async function buildWorkbenchHost(options: {
  basePath: string
  cwd: string
  minify: boolean
  organizationId: string
  outputDir: string
  sourceMap: boolean
}): Promise<void> {
  const {basePath, cwd, minify, organizationId, outputDir, sourceMap} = options

  const root = await writeWorkbenchRuntime({cwd, organizationId, reactStrictMode: false})

  await build({
    base: basePath,
    build: {
      // The federation remote is already in outputDir — don't wipe it.
      emptyOutDir: false,
      minify,
      outDir: outputDir,
      sourcemap: sourceMap,
    },
    configFile: false,
    define: {__SANITY_STAGING__: process.env.SANITY_INTERNAL_ENV === 'staging'},
    logLevel: 'silent',
    mode: 'production',
    resolve: {dedupe: ['react', 'react-dom']},
    root,
  })
}

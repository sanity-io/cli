/**
 * Vitest worker setup for the Sanity CLI.
 *
 * This builds the worker TS files into JS files using esbuild bundling.
 * All internal dependencies are bundled inline, while npm packages remain external.
 */
import {unlink} from 'node:fs/promises'

import {build, type BuildContext, type BuildOptions, context} from 'esbuild'

const compiledFiles: Set<string> = new Set()
let buildContexts: BuildContext[] = []

/**
 * Generate esbuild configuration for bundling worker files.
 *
 * @param filePath - The worker file path to bundle
 * @param outputFile - The output file path for the bundled worker
 * @returns esbuild configuration object
 */
function esbuildOptions(filePath: string, outputFile: string): BuildOptions {
  return {
    bundle: true,
    conditions: ['node', 'import'],
    entryPoints: [filePath],
    format: 'esm',
    loader: {'.json': 'json'},
    logLevel: 'warning',
    mainFields: ['module', 'main'],
    outfile: outputFile,
    packages: 'external',
    platform: 'node',
    sourcemap: false,
    target: 'node20',
  }
}

/**
 * Bundle a single worker file with esbuild.
 *
 * @param filePath - The worker file path to bundle
 * @param external - Array of package names to keep external
 * @returns The output file path
 */
async function bundleWorkerFile(filePath: string): Promise<string> {
  const outputFile = filePath.replace(/\.ts$/, '.js')

  await build(esbuildOptions(filePath, outputFile))

  compiledFiles.add(outputFile)
  return outputFile
}

/**
 * Bundle all worker files with esbuild (non-watch mode).
 *
 * @param filePaths - Array of worker file paths to bundle
 */
async function setupBundling(filePaths: string[]) {
  console.log(`Found ${filePaths.length} worker files to bundle`)

  for (const workerFile of filePaths) {
    try {
      await bundleWorkerFile(workerFile)
      console.log(`✓ Bundled ${workerFile}`)
    } catch (error) {
      console.error(`✗ Failed to bundle ${workerFile}:`, error)
      throw error
    }
  }
}

/**
 * Set up watch mode for worker files using esbuild's native watch API.
 *
 * @param files - Array of worker file paths to watch
 */
async function setupWatchMode(files: string[]) {
  for (const filePath of files) {
    const outputFile = filePath.replace(/\.ts$/, '.js')

    const ctx = await context(esbuildOptions(filePath, outputFile))

    await ctx.watch()
    buildContexts.push(ctx)
    compiledFiles.add(outputFile)

    console.log(`👀 Watching ${filePath}`)
  }
}

/**
 * Setup function to build the worker files with esbuild.
 *
 * Bundles the worker files with esbuild and sets up watch mode if in watch mode.
 * All npm packages are automatically marked as external (loaded from node_modules at runtime).
 * Only internal project code is bundled inline.
 *
 * @param filePaths - The paths to the worker files to build
 * @returns A promise that resolves when the worker build is setup
 * @throws If the worker files cannot be bundled
 * @throws If the watcher cannot be set up
 */
export async function setupWorkerBuild(filePaths: string[]) {
  // Determine if we're in watch mode
  const isWatchMode =
    process.env.VITEST_WATCH === 'true' ||
    !process.argv.includes('run') ||
    process.env.CI === 'false'

  await (isWatchMode ? setupWatchMode(filePaths) : setupBundling(filePaths))
}

/**
 * Teardown function to clean up the worker build.
 *
 * Closes all build contexts and deletes the compiled JavaScript files.
 *
 * @returns A promise that resolves when the worker build is teared down
 * @throws If the build contexts cannot be disposed
 * @throws If the compiled JavaScript files cannot be deleted
 */
export async function teardownWorkerBuild(): Promise<void> {
  // Dispose all build contexts (for watch mode)
  for (const ctx of buildContexts) {
    await ctx.dispose()
  }
  buildContexts = []

  // Clean up compiled JavaScript files
  console.log('Cleaning up compiled JavaScript files...')
  for (const filePath of compiledFiles) {
    try {
      await unlink(filePath)
      console.log(`✓ Deleted ${filePath}`)
    } catch (error) {
      console.error(`Failed to delete ${filePath}:`, error)
    }
  }
  compiledFiles.clear()
}

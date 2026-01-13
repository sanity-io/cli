/**
 * Vitest worker setup for the Sanity CLI.
 *
 * This builds the worker TS files into JS files for ease to use in the tests.
 */

import {mkdir, readFile, unlink, writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'

import {type Options, transform} from '@swc/core'
import {type FSWatcher, watch} from 'chokidar'

// Shared SWC configuration for worker compilation
const swcOptions: Options = {
  isModule: true,
  jsc: {
    parser: {
      syntax: 'typescript' as const,
      tsx: true,
    },
    target: 'es2023' as const,
    transform: {
      react: {
        runtime: 'automatic' as const,
      },
    },
  },
  sourceMaps: true,
}

const compiledFiles: Set<string> = new Set()
let watcher: FSWatcher | null = null

async function setupSWC(filePaths: string[]) {
  console.log(`Found ${filePaths.length} worker files to setup with SWC`)

  // Compile each worker file
  for (const workerFile of filePaths) {
    try {
      await compileWorkerFile(workerFile)
      console.log(`✓ Compiled ${workerFile} with SWC`)
    } catch (error) {
      console.error(`✗ Failed to compile ${workerFile}:`, error)
      throw error
    }
  }
}

async function compileWorkerFile(filePath: string) {
  const sourceCode = await readFile(filePath, 'utf8')
  const result = await transform(sourceCode, {
    filename: filePath,
    ...swcOptions,
  })

  // Write compiled file next to the source file
  const outputFile = filePath.replace(/\.ts$/, '.js')
  await mkdir(dirname(outputFile), {recursive: true})
  await writeFile(outputFile, result.code)

  // Track the compiled file for cleanup
  compiledFiles.add(outputFile)

  return outputFile
}

function setupWatchMode() {
  console.log('Setting up watch mode for worker files with SWC...')

  watcher = watch(['**/*.worker.ts', '../cli-core/src/**/*.worker.ts'], {
    ignored: ['node_modules/**', 'dist/**'],
    persistent: true,
  })

  watcher.on('change', async (filePath: string) => {
    console.log(`Worker file changed: ${filePath}`)
    try {
      await compileWorkerFile(filePath)
      console.log(`✓ Recompiled ${filePath} with SWC`)
    } catch (error) {
      console.error(`Failed to recompile ${filePath}:`, error)
    }
  })

  watcher.on('add', async (filePath: string) => {
    console.log(`New worker file added: ${filePath}`)
    try {
      await compileWorkerFile(filePath)
      console.log(`✓ Compiled new file ${filePath} with SWC`)
    } catch (error) {
      console.error(`Failed to compile new file ${filePath}:`, error)
    }
  })
}

/**
 * Setup function to build the worker files with SWC.
 *
 * Compiles the worker files with SWC and sets up watch mode if in watch mode.
 *
 * @param filePaths - The paths to the worker files to build
 * @returns A promise that resolves when the worker build is setup
 * @throws If the worker files cannot be compiled
 * @throws If the watcher cannot be set up
 */
export async function setupWorkerBuild(filePaths: string[]) {
  console.log('Setting up worker build with SWC...')
  await setupSWC(filePaths)

  // Set up watch mode if in watch mode
  if (process.env.VITEST_WATCH === 'true' || process.argv.includes('--watch')) {
    setupWatchMode()
  }
}

/**
 * Teardown function to clean up the worker build.
 *
 * Closes the watcher and deletes the compiled JavaScript files.
 *
 * @returns A promise that resolves when the worker build is teared down
 * @throws If the watcher cannot be closed
 * @throws If the compiled JavaScript files cannot be deleted
 */
export async function teardownWorkerBuild(): Promise<void> {
  if (watcher) {
    await watcher.close()
  }

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

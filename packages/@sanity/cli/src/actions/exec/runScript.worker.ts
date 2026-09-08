import {createRunnableDevEnvironment, mergeConfig, resolveConfig} from 'vite'

const scriptPath = process.argv[2]
const scriptArguments = process.argv.slice(3)

if (!scriptPath) {
  throw new Error('No script path provided')
}

// Make process.argv match direct Node script execution rather than exposing this worker.
process.argv = [process.argv[0], scriptPath, ...scriptArguments]

// This mirrors what Vite's `runnerImport` does, but keeps the environment open after the
// script's top-level evaluation finishes. `runnerImport` closes the module runner as soon as
// the entry module resolves, so scripts that keep running from a floating promise (for example
// a `main().catch(...)` entrypoint) fail with "Vite module runner has been closed." on any
// `import()` evaluated after that point. Instead, the environment is closed on `beforeExit`,
// once the event loop has drained and the script's pending work has settled.
const environment = createRunnableDevEnvironment(
  'inline',
  await resolveConfig(
    mergeConfig(
      {
        logLevel: 'error',
        resolve: {tsconfigPaths: true},
        root: process.env.SANITY_BASE_PATH || process.cwd(),
      },
      {
        cacheDir: process.cwd(),
        configFile: false,
        envDir: false,
        environments: {
          inline: {
            consumer: 'server',
            dev: {moduleRunnerTransform: true},
            resolve: {
              // `runnerImport` adds `module-sync` only when the running Node version supports
              // that export condition, which every Node version this package supports does.
              conditions: ['node', 'module-sync'],
              external: true,
              mainFields: [],
            },
          },
        },
      },
    ),
    'serve',
  ),
  {hot: false, runnerOptions: {hmr: {logger: false}}},
)

let closing: Promise<void> | undefined
function closeEnvironment(): Promise<void> {
  closing ??= environment.close()
  return closing
}

await environment.init()

// `beforeExit` fires when the event loop is empty, which is after any floating async work in
// the script has settled. Closing the environment there does not keep the process alive: once
// the close completes, the loop drains again and the process exits normally.
process.once('beforeExit', closeEnvironment)

try {
  await environment.runner.import(scriptPath)
} catch (error) {
  await closeEnvironment()
  throw error
}

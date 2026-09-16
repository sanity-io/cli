import {runnerImport} from 'vite'

const scriptPath = process.argv[2]
const scriptArguments = process.argv.slice(3)

if (!scriptPath) {
  throw new Error('No script path provided')
}

// Make process.argv match direct Node script execution rather than exposing this worker.
process.argv = [process.argv[0], scriptPath, ...scriptArguments]

await runnerImport(scriptPath, {
  logLevel: 'error',
  resolve: {tsconfigPaths: true},
  root: process.env.SANITY_BASE_PATH || process.cwd(),
})

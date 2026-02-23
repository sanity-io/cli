import {spawn} from 'node:child_process'
import path from 'node:path'

interface ExecScriptOptions {
  extraArguments: string[]
  flags: {
    'mock-browser-env': boolean
    'with-user-token': boolean
  }
  scriptPath: string
  workDir: string
}

export async function execScript(options: ExecScriptOptions): Promise<void> {
  const {extraArguments, flags, scriptPath, workDir} = options
  const mockBrowserEnv = flags['mock-browser-env']
  const withUserToken = flags['with-user-token']

  const resolvedScriptPath = path.resolve(scriptPath)

  const browserEnvPath = new URL('registerBrowserEnv.worker.js', import.meta.url).href
  const configClientPath = new URL('configClient.worker.js', import.meta.url).href

  // Use jiti loader for TypeScript support in the spawned child process
  // We need to resolve the jiti loader path from the CLI's node_modules since the child
  // process will run from the user's script directory where jiti may not be installed.
  // Resolve the jiti loader using Node's module resolution relative to package.json
  const jitiLoaderPath: string = import.meta.resolve('@rexxars/jiti', import.meta.url)
  if (!jitiLoaderPath) {
    throw new Error('@sanity/cli not able to resolve jiti loader')
  }

  const baseArgs = mockBrowserEnv
    ? ['--import', jitiLoaderPath, '--import', browserEnvPath]
    : ['--import', jitiLoaderPath]
  const tokenArgs = withUserToken ? ['--import', configClientPath] : []

  const nodeArgs = [...baseArgs, ...tokenArgs, resolvedScriptPath, ...extraArguments]

  const proc = spawn(process.argv[0], nodeArgs, {
    env: {
      ...process.env,
      SANITY_BASE_PATH: workDir,
    },
    stdio: 'inherit',
  })

  // Signal handlers to forward signals to child process
  const handleExit = (): void => {
    proc.kill()
  }
  const handleSigInt = (): void => {
    proc.kill('SIGINT')
  }
  const handleSigTerm = (): void => {
    proc.kill('SIGTERM')
  }

  process.on('exit', handleExit)
  process.on('SIGINT', handleSigInt)
  process.on('SIGTERM', handleSigTerm)

  return new Promise<void>((resolve, reject) => {
    proc.on('exit', (code, signal) => {
      // Clean up listeners when child process exits
      process.removeListener('exit', handleExit)
      process.removeListener('SIGINT', handleSigInt)
      process.removeListener('SIGTERM', handleSigTerm)

      if (signal) reject(new Error(`Script terminated by signal: ${signal}`))
      else if (code && code !== 0) reject(new Error(`Script exited with code: ${code}`))
      else resolve()
    })
    proc.on('error', (err) => {
      // Clean up listeners on error too
      process.removeListener('exit', handleExit)
      process.removeListener('SIGINT', handleSigInt)
      process.removeListener('SIGTERM', handleSigTerm)
      reject(err)
    })
  })
}

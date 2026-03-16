import {spawn} from 'node:child_process'
import path from 'node:path'

import {CLIError} from '@oclif/core/errors'
import {getCliToken} from '@sanity/cli-core'

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

  // Use tsx loader for TypeScript support in the spawned child process
  // We need to resolve the tsx loader path from the CLI's node_modules since the child
  // process will run from the user's script directory where tsx may not be installed.
  // Resolve the tsx loader using Node's module resolution relative to package.json
  const tsxLoaderPath: string = import.meta.resolve('tsx', import.meta.url)
  if (!tsxLoaderPath) {
    throw new Error('@sanity/cli not able to resolve tsx loader')
  }

  // When --with-user-token is specified, resolve the token in the parent process
  // and pass it via environment variable. This avoids a module-instance mismatch where
  // the worker's `getCliClient` import resolves to a different module than the script's
  // `import {getCliClient} from 'sanity/cli'`, causing the __internal__getToken mutation
  // to not propagate.
  let tokenEnv: Record<string, string> = {}
  if (withUserToken) {
    const token = await getCliToken()
    if (!token) {
      throw new CLIError(
        '--with-user-token specified, but no auth token could be found. Run `sanity login`',
      )
    }
    tokenEnv = {SANITY_AUTH_TOKEN: token}
  }

  const baseArgs = mockBrowserEnv
    ? ['--import', tsxLoaderPath, '--import', browserEnvPath]
    : ['--import', tsxLoaderPath]

  const nodeArgs = [...baseArgs, resolvedScriptPath, ...extraArguments]

  const proc = spawn(process.argv[0], nodeArgs, {
    env: {
      ...process.env,
      SANITY_BASE_PATH: workDir,
      ...tokenEnv,
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

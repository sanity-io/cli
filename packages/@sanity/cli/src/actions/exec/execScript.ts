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

  // Use tsx loader for TypeScript support in the spawned child process
  // We need to resolve the tsx loader path from the CLI's node_modules since the child
  // process will run from the user's script directory where tsx may not be installed.
  // Resolve the tsx loader using Node's module resolution relative to package.json
  const tsxLoaderPath: string = import.meta.resolve('tsx', import.meta.url)
  if (!tsxLoaderPath) {
    throw new Error('@sanity/cli not able to resolve tsx loader')
  }

  const baseArgs = mockBrowserEnv
    ? ['--import', tsxLoaderPath, '--import', browserEnvPath]
    : ['--import', tsxLoaderPath]
  const tokenArgs = withUserToken ? ['--import', configClientPath] : []

  const nodeArgs = [...baseArgs, ...tokenArgs, resolvedScriptPath, ...extraArguments]

  const proc = spawn(process.argv[0], nodeArgs, {
    env: {
      ...process.env,
      SANITY_BASE_PATH: workDir,
    },
    stdio: 'inherit',
  })
  return new Promise<void>((resolve, reject) => {
    proc.on('exit', (code, signal) => {
      if (signal) reject(new Error(`Script terminated by signal: ${signal}`))
      else if (code && code !== 0) reject(new Error(`Script exited with code: ${code}`))
      else resolve()
    })
    proc.on('error', reject)
    process.on('exit', () => proc.kill())
    process.on('SIGINT', () => proc.kill('SIGINT'))
    process.on('SIGTERM', () => proc.kill('SIGTERM'))
  })
}

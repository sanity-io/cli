import {spawn} from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

import {packageDirectory} from 'pkg-dir'

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

  const cliPkgDir = await packageDirectory({cwd: import.meta.dirname})
  if (!cliPkgDir) {
    throw new Error('Unable to resolve @sanity/cli module root')
  }

  const threadsDir = path.join(cliPkgDir, 'dist', 'threads')
  const browserEnvPath = path.join(threadsDir, 'registerBrowserEnv.js')
  const configClientPath = path.join(threadsDir, 'configClient.js')

  // Verify threads directory exists
  if (!(await fs.stat(threadsDir).catch(() => false))) {
    throw new Error('@sanity/cli module build error: missing threads directory')
  }

  // Use tsx loader for TypeScript support in the spawned child process
  // We need to resolve the tsx loader path from the CLI's node_modules since the child
  // process will run from the user's script directory where tsx may not be installed.
  let tsxLoaderPath: string
  try {
    // Resolve the tsx loader using Node's module resolution relative to package.json
    const tsxPackageUrl = import.meta.resolve('tsx/package.json', import.meta.url)
    tsxLoaderPath = new URL('dist/loader.mjs', tsxPackageUrl).pathname
  } catch {
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

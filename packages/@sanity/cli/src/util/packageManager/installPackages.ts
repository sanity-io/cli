import {type Command} from '@oclif/core'
import {execa, type Options, type Result} from 'execa'

import {getPartialEnvWithNpmPath, type PackageManager} from './packageManagerChoice.js'

export interface InstallOptions {
  packageManager: PackageManager
  packages: string[]
}

export async function installDeclaredPackages(
  cwd: string,
  packageManager: PackageManager,
  context: {output: {log: Command['log']}},
): Promise<void> {
  const {output} = context
  const execOptions: Options = {
    cwd,
    encoding: 'utf8',
    env: getPartialEnvWithNpmPath(cwd),
    stdio: 'inherit',
  }

  const npmArgs = ['install', '--legacy-peer-deps']
  let result: Result | undefined
  switch (packageManager) {
    case 'bun': {
      const bunArgs = ['install']
      output.log(`Running 'bun ${bunArgs.join(' ')}'`)
      result = await execa('bun', bunArgs, execOptions)

      break
    }
    case 'manual': {
      output.log(`Manual installation selected - run 'npm ${npmArgs.join(' ')}' or similar`)

      break
    }
    case 'npm': {
      output.log(`Running 'npm ${npmArgs.join(' ')}'`)
      result = await execa('npm', npmArgs, execOptions)

      break
    }
    case 'pnpm': {
      const pnpmArgs = ['install']
      output.log(`Running 'pnpm ${pnpmArgs.join(' ')}'`)
      result = await execa('pnpm', pnpmArgs, execOptions)

      break
    }
    case 'yarn': {
      const yarnArgs = ['install']
      output.log(`Running 'yarn ${yarnArgs.join(' ')}'`)
      result = await execa('yarn', yarnArgs, execOptions)

      break
    }
    // No default
  }

  if (result?.exitCode || result?.failed) {
    throw new Error('Dependency installation failed')
  }
}

export async function installNewPackages(
  options: InstallOptions,
  context: {output: {log: Command['log']}; workDir: string},
): Promise<void> {
  const {packageManager, packages} = options
  const {output, workDir} = context
  const execOptions: Options = {
    cwd: workDir,
    encoding: 'utf8',
    env: getPartialEnvWithNpmPath(workDir),
    stdio: 'inherit',
  }

  const npmArgs = ['install', '--legacy-peer-deps', '--save', ...packages]
  let result: Result<Options> | undefined
  switch (packageManager) {
    case 'bun': {
      const bunArgs = ['add', ...packages]
      output.log(`Running 'bun ${bunArgs.join(' ')}'`)
      result = await execa('bun', bunArgs, execOptions)

      break
    }
    case 'manual': {
      output.log(`Manual installation selected - run 'npm ${npmArgs.join(' ')}' or equivalent`)

      break
    }
    case 'npm': {
      output.log(`Running 'npm ${npmArgs.join(' ')}'`)
      result = await execa('npm', npmArgs, execOptions)

      break
    }
    case 'pnpm': {
      const pnpmArgs = ['add', '--save-prod', ...packages]
      output.log(`Running 'pnpm ${pnpmArgs.join(' ')}'`)
      result = await execa('pnpm', pnpmArgs, execOptions)

      break
    }
    case 'yarn': {
      const yarnArgs = ['add', ...packages]
      output.log(`Running 'yarn ${yarnArgs.join(' ')}'`)
      result = await execa('yarn', yarnArgs, execOptions)

      break
    }
    // No default
  }

  if (result?.exitCode || result?.failed) {
    throw new Error('Package installation failed')
  }
}

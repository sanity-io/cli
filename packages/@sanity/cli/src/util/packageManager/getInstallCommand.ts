import {getPackageManagerChoice} from './packageManagerChoice.js'

export async function getInstallCommand(options: {
  depType?: 'dev' | 'peer' | 'prod'
  pkgNames?: string[]
  workDir: string
}): Promise<string> {
  const {depType = 'prod', pkgNames, workDir} = options
  const {chosen} = await getPackageManagerChoice(workDir, {interactive: false})

  // eg `npm install`, `yarn install`, `pnpm install`
  if (!pkgNames || pkgNames.length === 0) {
    return `${chosen} install`
  }

  const pkgNameString = pkgNames.join(' ')

  if (chosen === 'yarn') {
    const flag = depType === 'dev' || depType === 'peer' ? ` --${depType}` : ''
    return `yarn add ${pkgNameString}${flag}`
  } else if (chosen === 'pnpm') {
    return `pnpm add ${pkgNameString} --save-${depType}`
  }

  return `npm install ${pkgNameString} --save-${depType}`
}

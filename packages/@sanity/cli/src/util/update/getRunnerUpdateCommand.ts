import {type SanityPackage} from '../packageManager/installationInfo/types.js'
import {getRunnerCommand, type PackageRunner} from './packageRunner.js'

const BIN_NAMES: Record<SanityPackage, string> = {
  '@sanity/cli': 'sanity',
  sanity: 'sanity',
}

export function getRunnerUpdateCommand(runner: PackageRunner, packageName: SanityPackage): string {
  return getRunnerCommand(runner, {bin: BIN_NAMES[packageName], pkg: `${packageName}@latest`}).join(
    ' ',
  )
}

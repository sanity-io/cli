import {warn} from '@oclif/core/ux'
import {chalk} from '@sanity/cli-core/ux'
import semver from 'semver'

import {type PackageJson} from '../types.js'

export function warnOnUnsupportedRuntime(cliPkg: PackageJson): void {
  const engines = cliPkg.engines
  if (!engines) {
    return
  }

  const currentNodeVersion = process.versions.node
  if (!semver.satisfies(currentNodeVersion, engines.node)) {
    warn(
      chalk.red(`\nThe current Node.js version (${`v${currentNodeVersion}`}) is not supported
Please upgrade to a version that satisfies the range ${chalk.green.bold(engines.node)}\n`),
    )
  }
}

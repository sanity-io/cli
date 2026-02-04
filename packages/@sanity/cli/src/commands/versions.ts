import {styleText} from 'node:util'

import {SanityCommand} from '@sanity/cli-core'
import {padStart} from 'lodash-es'

import {findSanityModulesVersions} from '../actions/versions/findSanityModulesVersions.js'
import {getDisplayName, getFormatters} from '../actions/versions/getFormatters.js'
import {versionsDebug} from '../actions/versions/versionsDebug.js'

export class Versions extends SanityCommand<typeof Versions> {
  static override description = 'Shows installed versions of Sanity Studio and components'
  static override examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    const root = (await this.getProjectRoot()).directory

    const versions = await findSanityModulesVersions({cwd: root})

    versionsDebug('resolved versions:', versions)

    const {formatName, versionLength} = getFormatters(versions)
    for (const mod of versions) {
      const version = padStart(mod.installed || '<missing>', versionLength)
      const latest =
        mod.installed === mod.latest
          ? styleText('green', '(up to date)')
          : `(latest: ${styleText('yellow', mod.latest)})`

      this.log(`${formatName(getDisplayName(mod))} ${version} ${latest}`)
    }
  }
}

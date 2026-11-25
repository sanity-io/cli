import {type FlagInput} from '@oclif/core/interfaces'
import {getSanityUrl, getStudioConfig, SanityCommand} from '@sanity/cli-core'
import open from 'open'

import {getManageUrl} from '../actions/projects/getManageUrl.js'
import {resolveProjectForCommand} from '../actions/targets/blueprintCommandTarget.js'
import {getCheckoutBlueprint} from '../util/checkoutBlueprint.js'
import {getOrganizationFlag, getProjectIdFlag, getWithBlueprintsFlag} from '../util/sharedFlags.js'

export class ManageCommand extends SanityCommand<typeof ManageCommand> {
  static override description = 'Open project settings in your browser'
  static override flags = {
    ...getWithBlueprintsFlag(),
    ...getProjectIdFlag({
      dependsOn: ['with-blueprints'],
      exclusive: ['organization'],
      semantics: 'specify',
    }),
    ...getOrganizationFlag({
      dependsOn: ['with-blueprints'],
      exclusive: ['project'],
      semantics: 'specify',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    // Parse to ensure no invalid flags are passed
    const {flags} = await this.parse(ManageCommand)
    if (flags['with-blueprints']) {
      const checkout = flags.project || flags.organization ? undefined : getCheckoutBlueprint()
      const organizationId =
        flags.organization ??
        (checkout?.scopeType === 'organization' ? checkout.scopeId : undefined)
      const url = organizationId
        ? getSanityUrl(`/organizations/${organizationId}`)
        : getManageUrl(await resolveProjectForCommand(this, flags))
      this.log(`Opening ${url}`)
      await open(url)
      return
    }

    const cliConfig = await this.getCliConfig()
    // Read the projectId from the CLI config
    let projectId = cliConfig?.api?.projectId

    if (!projectId) {
      const projectRoot = await this.getProjectRoot()
      const config = await getStudioConfig(projectRoot.directory, {resolvePlugins: false})
      if (!Array.isArray(config) && config.projectId) {
        projectId = config.projectId
      }
    }

    const url = getManageUrl(projectId)

    this.log(`Opening ${url}`)
    await open(url)
  }
}

import {select, Separator} from '@sanity/cli-core/ux'

import {type ApplicationType, listApplications} from '../../services/applications.js'

/**
 * Offers an interactive deploy without `deployment.appId` the organization's
 * applications of `type`. Returns the configured or picked id; undefined creates one.
 * @internal
 */
export async function selectWorkbenchAppId({
  appId,
  flags,
  organizationId,
  type,
}: {
  appId: string | undefined
  flags: {build: boolean; yes: boolean}
  organizationId: string | undefined
  type: ApplicationType
}): Promise<string | undefined> {
  // --yes also covers dry runs and CI; --no-build fails a first deploy regardless of the pick
  if (appId || !organizationId || flags.yes || !flags.build) return appId

  const existing = (await listApplications(organizationId)).filter((app) => app.type === type)

  if (existing.length === 0) return undefined

  const selected = await select({
    choices: [
      {name: 'New application deployment', value: 'NEW_APP'},
      new Separator(' ════ Existing applications: ════ '),
      ...existing.map((app) => ({name: app.title, value: app.id})),
    ],
    loop: false,
    message: 'Would you like to create a new application deployment, or deploy to an existing one?',
    pageSize: 10,
  })

  return selected === 'NEW_APP' ? undefined : selected
}

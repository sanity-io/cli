import {
  findPathForFiles,
  getCliConfig,
  getStudioConfig,
  isWorkbenchApp,
  tryFindStudioConfigPath,
} from '@sanity/cli-core'
import {input, select} from '@sanity/cli-core/ux'
import {toAppSlug} from '@sanity/workbench-cli/init'

import {getOrganizationGrants, listOrganizations} from '../../services/organizations.js'
import {getProjectById} from '../../services/projects.js'
import {determineIsApp} from '../../util/determineIsApp.js'
import {getManageUrl} from '../projects/getManageUrl.js'
import {type CodeMod} from './types.js'
import {upgradeRequiredPackages} from './upgradeRequiredPackages.js'

// `defineApplication` landed in 6.12.0; the Dashboard also needs the CLI fixes released since
const MIN_SANITY_VERSION = '6.20.0'
const MIN_SDK_VERSION = '3.9.1'

const purpose = 'Move an existing Studio or SDK app onto the Dashboard'
const description = `
Rewrites sanity.cli.ts (or .js) so the next \`sanity dev\` and \`sanity deploy\` run the project
as a new Dashboard application. Asks for the application's title and slug, and looks up the
organization from the project. Offers to upgrade sanity (older than ${MIN_SANITY_VERSION}) and, in
SDK apps, @sanity/sdk and @sanity/sdk-react (older than ${MIN_SDK_VERSION}) to their latest versions.

from: app: {organizationId: 'oAbc', entry: './src/App.tsx'}
  to: app: defineApplication({title: 'Acme', slug: 'acme', organizationId: 'oAbc', entry: './src/App.tsx'})

The existing deployment is left alone. Remove \`deployment.appId\` before deploying, or the
Dashboard build replaces the existing application.
`.trim()

export const dashboard: CodeMod = {
  description,
  filename: 'dashboard.js',
  prepare: async ({dry, output, workDir}) => {
    const config = await getCliConfig(workDir)
    if (isWorkbenchApp(config.app)) {
      throw new Error('This project is already a Dashboard application.')
    }

    const projectId = config.api?.projectId
    let organizationId = config.app?.organizationId
    // Deploy creates the application with both IDs, and the API rejects a project outside the
    // organization, so a project's organization is the only valid choice
    if (!organizationId && projectId) {
      organizationId = (await getProjectById(projectId)).organizationId ?? undefined
      if (!organizationId) {
        throw new Error(
          `Project ${projectId} isn't in an organization, and a Dashboard application needs one. Move the project into an organization at ${getManageUrl(projectId)}, then run this again.`,
        )
      }
    }
    if (!organizationId) {
      const choices = await Promise.all(
        (await listOrganizations()).map(async ({id, name}) => {
          // Grants can 401 for implicit memberships; treat any failure as no access
          const grants = await getOrganizationGrants(id).catch(() => null)
          const canDeploy = (grants?.['sanity.sdk.applications'] ?? []).some((resource) =>
            resource.grants.some((grant) => grant.name === 'deploy'),
          )
          return {
            disabled: canDeploy ? false : 'Insufficient permissions',
            name: `${name} [${id}]`,
            value: id,
          }
        }),
      )
      if (!choices.some((choice) => choice.disabled === false)) {
        throw new Error(
          "You can't deploy applications in any of your organizations. Ask an organization administrator for access, then run this again.",
        )
      }
      organizationId = await select({choices, message: 'Organization that owns the application:'})
    }

    let suggestedTitle = config.app?.title
    if (!suggestedTitle && (await tryFindStudioConfigPath(workDir))) {
      const studioConfig = await getStudioConfig(workDir, {resolvePlugins: false})
      suggestedTitle = Array.isArray(studioConfig) ? undefined : studioConfig.title
    }

    const title = await input({
      default: suggestedTitle,
      message: 'Application title:',
      validate: (value) => (value.trim() ? true : 'Enter a title for the application.'),
    })

    // A studio titled after its host would otherwise suggest the one slug that's rejected
    const suggestedSlug = toAppSlug(title) ?? undefined
    const slug = await input({
      default: suggestedSlug === config.studioHost ? undefined : suggestedSlug,
      message: 'Application slug (the hostname it deploys to):',
      validate: (value) => {
        if (toAppSlug(value) !== value) {
          return 'Use lowercase letters, numbers and hyphens, starting with a letter.'
        }
        if (value === config.studioHost) {
          return `"${value}" is your Studio's hostname (studioHost), so the deploy would fail. Choose a different slug.`
        }
        return true
      },
    })

    // `app.id` is the deprecated spelling and deploy still honours it
    const appIdKey = config.deployment?.appId ? 'deployment.appId' : config.app?.id && 'app.id'
    if (appIdKey) {
      output.warn(
        `Remove \`${appIdKey}\` from your CLI config before you deploy. It points at your existing application, and deploying with it in place replaces that application with the Dashboard build.`,
      )
    }

    const required = [
      {min: MIN_SANITY_VERSION, name: 'sanity', neededBy: 'the Dashboard needs'},
      ...(determineIsApp(config)
        ? ['@sanity/sdk', '@sanity/sdk-react'].map((name) => ({
            min: MIN_SDK_VERSION,
            name,
            neededBy: 'SDK apps need',
          }))
        : []),
    ]
    await upgradeRequiredPackages(required, {dry, output, workDir})

    // getCliConfig has already checked there is exactly one
    const cliConfigPaths = await findPathForFiles(workDir, ['sanity.cli.ts', 'sanity.cli.js'])
    const paths = cliConfigPaths.filter((path) => path.exists).map((path) => path.path)

    return {options: {organizationId, slug, title: title.trim()}, paths}
  },
  purpose,
}

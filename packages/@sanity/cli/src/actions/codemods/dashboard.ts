import {readFile} from 'node:fs/promises'
import path from 'node:path'

import {
  findPathForFiles,
  getCliConfig,
  getLocalPackageVersion,
  getStudioConfig,
  isWorkbenchApp,
  tryFindStudioConfigPath,
} from '@sanity/cli-core'
import {getYarnMajorVersion, readPackageJson} from '@sanity/cli-core/package-manager'
import {confirm, input, select} from '@sanity/cli-core/ux'
import {toAppSlug} from '@sanity/workbench-cli/init'
import {execa} from 'execa'
import {lt} from 'semver'
import yaml from 'yaml'

import {getOrganizationGrants, listOrganizations} from '../../services/organizations.js'
import {getProjectById} from '../../services/projects.js'
import {determineIsApp} from '../../util/determineIsApp.js'
import {detectWorkspace} from '../../util/packageManager/installationInfo/detectWorkspace.js'
import {
  getPackageManagerChoice,
  getPartialEnvWithNpmPath,
} from '../../util/packageManager/packageManagerChoice.js'
import {getManageUrl} from '../projects/getManageUrl.js'
import {type CodeMod} from './types.js'

// `defineApplication` landed in 6.12.0; the Dashboard also needs the CLI fixes released since
const MIN_SANITY_VERSION = '6.20.0'
const MIN_SDK_VERSION = '3.9.1'

interface RequiredPackage {
  min: string
  name: string
  neededBy: string
}

async function findOutdated(packages: RequiredPackage[], workDir: string) {
  const installed = await Promise.all(
    packages.map(({name}) => getLocalPackageVersion(name, workDir)),
  )
  return packages.flatMap((pkg, index) => {
    const version = installed[index]
    return version && lt(version, pkg.min) ? [{...pkg, version}] : []
  })
}

function listOutdated(packages: Awaited<ReturnType<typeof findOutdated>>) {
  return packages
    .map(({min, name, neededBy, version}) => `  - ${name} ${version} (${neededBy} ${min} or later)`)
    .join('\n')
}

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

    const required: RequiredPackage[] = [
      {min: MIN_SANITY_VERSION, name: 'sanity', neededBy: 'the Dashboard needs'},
      ...(determineIsApp(config)
        ? ['@sanity/sdk', '@sanity/sdk-react'].map((name) => ({
            min: MIN_SDK_VERSION,
            name,
            neededBy: 'SDK apps need',
          }))
        : []),
    ]
    const outdated = await findOutdated(required, workDir)
    if (outdated.length > 0) {
      output.warn(
        `\`sanity dev\` and \`sanity deploy\` will fail until you upgrade:\n${listOutdated(outdated)}`,
      )

      const {chosen: packageManager} = await getPackageManagerChoice(workDir, {interactive: false})
      const {dependencies, devDependencies} = await readPackageJson(
        path.join(workDir, 'package.json'),
        {skipSchemaValidation: true},
      )
      let pnpmOverrides: string[] = []
      if (packageManager === 'pnpm') {
        const {root} = await detectWorkspace(workDir)
        const [workspaceConfig, rootManifest] = await Promise.all([
          readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8').then(yaml.parse, () => null),
          readFile(path.join(root, 'package.json'), 'utf8').then(JSON.parse, () => null),
        ])
        pnpmOverrides = Object.keys({
          ...rootManifest?.pnpm?.overrides,
          ...workspaceConfig?.overrides,
        })
      }

      // bun's upgrade leaves a catalog untouched, yarn's swaps `catalog:` for a plain range, and
      // pnpm's does the same when `overrides` pins the package
      const isUnupgradableCatalog = (name: string) =>
        (dependencies?.[name] ?? devDependencies?.[name] ?? '').startsWith('catalog:') &&
        (packageManager === 'bun' ||
          packageManager === 'yarn' ||
          pnpmOverrides.some((key) => key === name || key.startsWith(`${name}@`)))
      const catalogued = outdated.filter(({name}) => isUnupgradableCatalog(name))
      const upgradable = outdated.filter(({name}) => !isUnupgradableCatalog(name))

      if (catalogued.length > 0) {
        const targets = catalogued.map(({min, name}) => `${name} to ^${min} or later`).join(', ')
        const install = `then run \`${packageManager} install\``
        output.log(
          packageManager === 'pnpm'
            ? `pnpm can't upgrade catalog packages that \`overrides\` pin, so update them yourself: set ${targets} in the catalog and in \`overrides\`, ${install}.`
            : `${packageManager} can't upgrade catalog packages, so update them yourself: set ${targets} in the catalog in ${packageManager === 'bun' ? 'the root package.json' : '.yarnrc.yml'}, ${install}.`,
        )
      }

      if (upgradable.length > 0) {
        const names = upgradable.map(({name}) => name)
        const latest = names.map((name) => `${name}@latest`)
        // pnpm keeps `catalog:` and bumps the catalog entry only with `update --latest`
        const command = {
          bun: ['bun', 'update', ...latest],
          manual: undefined,
          npm: ['npm', 'install', '--legacy-peer-deps', ...latest],
          pnpm: ['pnpm', 'update', ...names, '--latest'],
          yarn: ['yarn', (getYarnMajorVersion() ?? 1) >= 2 ? 'up' : 'upgrade', ...latest],
        }[packageManager]

        if (!command) {
          output.log(`Upgrade ${names.join(', ')} to the latest version with your package manager.`)
        } else if (
          dry ||
          !(await confirm({
            default: true,
            message: `Upgrade ${names.join(', ')} to the latest version now?`,
          }))
        ) {
          output.log(`Run \`${command.join(' ')}\` to upgrade.`)
        } else {
          output.log(`Running \`${command.join(' ')}\``)
          // The version check below reports a failed upgrade, so the exit code isn't needed
          await execa(command[0], command.slice(1), {
            cwd: workDir,
            env: getPartialEnvWithNpmPath(workDir),
            reject: false,
            stdio: 'inherit',
          })
          const stillOutdated = await findOutdated(upgradable, workDir)
          if (stillOutdated.length > 0) {
            output.warn(
              `These are still too old after the upgrade. Upgrade them before you run \`sanity dev\` or \`sanity deploy\`:\n${listOutdated(stillOutdated)}`,
            )
          }
        }
      }
    }

    // getCliConfig has already checked there is exactly one
    const cliConfigPaths = await findPathForFiles(workDir, ['sanity.cli.ts', 'sanity.cli.js'])
    const paths = cliConfigPaths.filter((path) => path.exists).map((path) => path.path)

    return {options: {organizationId, slug, title: title.trim()}, paths}
  },
  purpose,
}

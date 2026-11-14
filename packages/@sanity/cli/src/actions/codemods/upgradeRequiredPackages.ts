import {readFile} from 'node:fs/promises'
import path from 'node:path'

import {getLocalPackageVersion, type Output} from '@sanity/cli-core'
import {getYarnMajorVersion, readPackageJson} from '@sanity/cli-core/package-manager'
import {confirm} from '@sanity/cli-core/ux'
import {execa} from 'execa'
import {lt} from 'semver'
import yaml from 'yaml'

import {detectWorkspace} from '../../util/packageManager/installationInfo/detectWorkspace.js'
import {
  getPackageManagerChoice,
  getPartialEnvWithNpmPath,
} from '../../util/packageManager/packageManagerChoice.js'

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

// corepack's `packageManager: "yarn@4.9.1"` names the major even without a .yarnrc.yml
function declaredYarnMajor(field: unknown) {
  const match = typeof field === 'string' ? /^yarn@(\d+)/.exec(field) : null
  return match ? Number.parseInt(match[1], 10) : undefined
}

function listOutdated(packages: Awaited<ReturnType<typeof findOutdated>>) {
  return packages
    .map(({min, name, neededBy, version}) => `  - ${name} ${version} (${neededBy} ${min} or later)`)
    .join('\n')
}

export async function upgradeRequiredPackages(
  required: RequiredPackage[],
  {dry, output, workDir}: {dry: boolean; output: Output; workDir: string},
): Promise<void> {
  const outdated = await findOutdated(required, workDir)
  if (outdated.length > 0) {
    output.warn(
      `\`sanity dev\` and \`sanity deploy\` will fail until you upgrade:\n${listOutdated(outdated)}`,
    )

    const {chosen: packageManager} = await getPackageManagerChoice(workDir, {interactive: false})
    const {root, yarnBerry} = await detectWorkspace(workDir)
    const [{dependencies, devDependencies}, rootManifest] = await Promise.all([
      readPackageJson(path.join(workDir, 'package.json'), {skipSchemaValidation: true}),
      readFile(path.join(root, 'package.json'), 'utf8').then(JSON.parse, () => null),
    ])
    let pnpmOverrides: string[] = []
    if (packageManager === 'pnpm') {
      const workspacePath = path.join(root, 'pnpm-workspace.yaml')
      const workspaceConfig = await readFile(workspacePath, 'utf8').then(yaml.parse, () => null)
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
      // Berry dropped `yarn upgrade`, and the user agent only names yarn when the CLI itself was
      // run through yarn, so take the project's own signals first
      const isYarnBerry =
        yarnBerry ||
        (declaredYarnMajor(rootManifest?.packageManager) ?? getYarnMajorVersion() ?? 1) >= 2
      // pnpm keeps `catalog:` and bumps the catalog entry only with `update --latest`
      const command = {
        bun: ['bun', 'update', ...latest],
        manual: undefined,
        npm: ['npm', 'install', '--legacy-peer-deps', ...latest],
        pnpm: ['pnpm', 'update', ...names, '--latest'],
        yarn: ['yarn', isYarnBerry ? 'up' : 'upgrade', ...latest],
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
}

import sortObject from 'deep-sort-object'

import {type PackageJson, type SanityJson} from '../../types.js'

const manifestPropOrder = [
  'name',
  'private',
  'version',
  'description',
  'main',
  'author',
  'license',
  'scripts',
  'keywords',
  'dependencies',
  'devDependencies',
]

export function createPackageManifest(
  data: Omit<PackageJson, 'version'> & {gitRemote?: string} & {isAppTemplate?: boolean},
): string {
  const {isAppTemplate} = data

  const dependencies = data.dependencies
    ? {
        dependencies: sortObject(data.dependencies as Record<string, unknown>) as Record<
          string,
          string
        >,
      }
    : ({} as Record<string, never>)

  const devDependencies = data.devDependencies
    ? {
        devDependencies: sortObject(data.devDependencies as Record<string, unknown>) as Record<
          string,
          string
        >,
      }
    : ({} as Record<string, never>)

  // Don't write a prettier config for SDK apps; we want to allow developers to use their own
  const prettierConfig = isAppTemplate
    ? ({} as Record<string, never>)
    : {
        prettier: {
          bracketSpacing: false,
          printWidth: 100,
          semi: false,
          singleQuote: true,
        },
      }

  const pkg = {
    ...getCommonManifest(data),

    keywords: ['sanity'],
    main: 'package.json',
    scripts:
      data.scripts ||
      ({
        build: 'sanity build',
        deploy: 'sanity deploy',
        'deploy-graphql': 'sanity graphql deploy',
        dev: 'sanity dev',
        start: 'sanity start',
      } as Record<string, string>),

    ...dependencies,
    ...devDependencies,
    ...prettierConfig,
  }

  return serializeManifest(pkg as unknown as PackageJson)
}

function getCommonManifest(data: Omit<PackageJson, 'version'> & {gitRemote?: string}) {
  const pkg: PackageJson = {
    name: data.name as string,
    version: '1.0.0',
    ...(data.author ? {author: data.author as string} : {}),
    ...(data.description ? {description: data.description as string} : {}),
    license: (data.license as string | undefined) || 'UNLICENSED',
  }

  if (pkg.license === 'UNLICENSED') {
    pkg.private = true
  }

  if (data.gitRemote) {
    pkg.repository = {
      type: 'git',
      url: data.gitRemote,
    }
  }

  return pkg
}

function serializeManifest(src: PackageJson | SanityJson): string {
  const props = [...manifestPropOrder, ...Object.keys(src)]
  const ordered: Record<string, unknown> = {}
  for (const prop of props) {
    const source = src as Record<string, unknown>
    if (source[prop] !== undefined && ordered[prop] === undefined) {
      ordered[prop] = source[prop]
    }
  }

  return `${JSON.stringify(ordered, null, 2)}\n`
}

import {type PackageJson, type SanityJson} from '../../types.js'

const manifestPropOrder = [
  'name',
  'private',
  'version',
  'type',
  'description',
  'main',
  'author',
  'license',
  'scripts',
  'keywords',
  'dependencies',
  'devDependencies',
]

// PackageJson has an index signature ([x: string]: unknown) from z.looseObject,
// which causes Omit to collapse the type. Strip the index signature first, then Omit.
type RemoveIndex<T> = {
  [K in keyof T as string extends K ? never : K]: T[K]
}
type PackageJsonWithoutVersion = Omit<RemoveIndex<PackageJson>, 'version'>

interface CreatePackageManifestOptions extends PackageJsonWithoutVersion {
  gitRemote?: string

  isAppTemplate?: boolean
}

export function createPackageManifest(data: CreatePackageManifestOptions): string {
  const {isAppTemplate} = data

  const dependencies = data.dependencies ? {dependencies: sortKeys(data.dependencies)} : {}

  const devDependencies = data.devDependencies
    ? {devDependencies: sortKeys(data.devDependencies)}
    : {}

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

  const type = data.type
    ? {
        type: data.type,
      }
    : {}

  const pkg: PackageJson = {
    ...getCommonManifest(data),

    keywords: ['sanity'],
    main: 'package.json',
    ...type,
    scripts: data.scripts || {
      build: 'sanity build',
      deploy: 'sanity deploy',
      ...(isAppTemplate ? {} : {'deploy-graphql': 'sanity graphql deploy'}),
      dev: 'sanity dev',
      start: 'sanity start',
    },

    ...dependencies,
    ...devDependencies,
    ...prettierConfig,
  }

  return serializeManifest(pkg)
}

function getCommonManifest(data: PackageJsonWithoutVersion & {gitRemote?: string}) {
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

function sortKeys(obj: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).toSorted(([a], [b]) => a.localeCompare(b)))
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

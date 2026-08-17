import {validRange} from 'semver'
import {describe, expect, test} from 'vitest'

import {sdkAppDependencies} from '../sdkAppDependencies.js'
import {studioDependencies} from '../studioDependencies.js'

/**
 * Packages scaffolded by `sanity init` that declare peer dependencies on other scaffolded
 * packages. A floating specifier (`latest`, `*`) on any of these means a third-party major
 * release can make the generated `package.json` unresolvable, breaking `sanity init` for every
 * new project. These must therefore always be concrete ranges that agree with each other.
 */
const peerConstrainedTooling = ['@sanity/eslint-config-studio', 'eslint', 'prettier', 'typescript']

const templates = {
  sdkAppDependencies,
  studioDependencies,
} as const

describe('init template dependencies', () => {
  describe.each(Object.entries(templates))('%s', (_name, template) => {
    const allDependencies: Record<string, string> = {
      ...template.dependencies,
      ...template.devDependencies,
    }

    test.each(peerConstrainedTooling)(
      '%s is pinned to a concrete range, not a floating specifier',
      (pkg) => {
        const range = allDependencies[pkg]
        expect(range, `expected ${pkg} to be declared`).toBeTypeOf('string')

        // `latest` and other dist-tags are not valid semver ranges at all
        expect(validRange(range), `${pkg}: "${range}" is not a valid semver range`).not.toBeNull()

        // `*`, `x` and `` are valid ranges but still float across majors
        expect(validRange(range), `${pkg}: "${range}" matches any version`).not.toBe('*')
      },
    )
  })

  test.each(peerConstrainedTooling)('both templates declare the same %s range', (pkg) => {
    const studio: Record<string, string> = {
      ...studioDependencies.dependencies,
      ...studioDependencies.devDependencies,
    }
    const sdkApp: Record<string, string> = {
      ...sdkAppDependencies.dependencies,
      ...sdkAppDependencies.devDependencies,
    }

    expect(sdkApp[pkg]).toBe(studio[pkg])
  })
})

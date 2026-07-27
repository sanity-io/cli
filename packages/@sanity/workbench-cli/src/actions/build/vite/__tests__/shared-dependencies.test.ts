import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {type PackageJson} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {deriveSharedDependencies} from '../shared-dependencies.js'

describe('deriveSharedDependencies', () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-shared-deps-'))
  })

  afterEach(() => {
    fs.rmSync(projectDir, {force: true, recursive: true})
  })

  /** Write an installed package, optionally nested inside another one. */
  function install(
    name: string,
    version: string,
    options: {dependencies?: Record<string, string>; under?: string} = {},
  ) {
    const base = options.under
      ? path.join(projectDir, 'node_modules', options.under, 'node_modules')
      : path.join(projectDir, 'node_modules')
    const dir = path.join(base, name)
    fs.mkdirSync(dir, {recursive: true})
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({dependencies: options.dependencies, name, version}),
    )
  }

  function derive(pkgJson: Partial<PackageJson>) {
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({name: 'app', version: '1.0.0', ...pkgJson}),
    )
    return deriveSharedDependencies({pkgJson: pkgJson as PackageJson, projectDir})
  }

  test('shares the candidates the app declares and has installed', () => {
    install('react', '19.2.7')
    install('styled-components', '6.4.3')

    expect(derive({dependencies: {react: '^19.2.5', 'styled-components': '^6.4.0'}})).toEqual({
      react: {requiredVersion: '19.2.7'},
      'styled-components': {},
    })
  })

  test('ignores packages the app does not declare', () => {
    install('react', '19.2.7')
    install('@sanity/ui', '3.4.1')

    expect(derive({dependencies: {react: '^19.2.5'}})).toEqual({react: {requiredVersion: '19.2.7'}})
  })

  test('includes a candidate declared only as a devDependency', () => {
    install('@sanity/ui', '3.4.1')

    expect(derive({devDependencies: {'@sanity/ui': '^3'}})).toEqual({'@sanity/ui': {}})
  })

  // An unresolvable key still lands in the container init, which fails the build.
  test('skips a declared candidate that is not installed', () => {
    expect(derive({dependencies: {'@sanity/ui': '^3'}})).toEqual({})
  })

  // One share key serves every import of the package and is built from the
  // top-level copy, so a second major loses exports its consumers need.
  test('skips a candidate that resolves to two majors in the tree', () => {
    install('@sanity/ui', '4.0.0-static.46')
    install('sanity', '6.6.0')
    install('@sanity/ui', '3.4.1', {under: 'sanity'})

    expect(derive({dependencies: {'@sanity/ui': '^4', sanity: '^6'}})).toEqual({})
  })

  test('shares a candidate nested at the same major', () => {
    install('@sanity/ui', '3.6.0')
    install('sanity', '6.6.0')
    install('@sanity/ui', '3.4.1', {under: 'sanity'})

    expect(derive({dependencies: {'@sanity/ui': '^3', sanity: '^6'}})).toEqual({'@sanity/ui': {}})
  })

  // Module federation drops these in dev only, which would leave dev and build
  // with different share maps.
  test('drops a candidate that another selected candidate depends on', () => {
    install('@sanity/sdk', '2.18.0')
    install('@sanity/sdk-react', '2.18.0', {dependencies: {'@sanity/sdk': '2.18.0'}})

    expect(derive({dependencies: {'@sanity/sdk': '^2', '@sanity/sdk-react': '^2'}})).toEqual({
      '@sanity/sdk-react': {},
    })
  })

  // react-dom stays bundled while it can't be shared, and React requires the pair
  // to be the same version, so a caret range would accept a mismatched host copy.
  test('pins react to an exact version and leaves react-dom unshared', () => {
    install('react', '19.2.7')
    install('react-dom', '19.2.7')

    expect(derive({dependencies: {react: '^19.2.5', 'react-dom': '^19.2.5'}})).toEqual({
      react: {requiredVersion: '19.2.7'},
    })
  })
})

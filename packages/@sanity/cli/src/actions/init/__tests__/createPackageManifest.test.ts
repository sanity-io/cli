import {describe, expect, test} from 'vitest'

import {createPackageManifest} from '../createPackageManifest.js'

describe('createPackageManifest', () => {
  test('includes type field when type is "module"', () => {
    const result = createPackageManifest({
      name: 'test-app',
      type: 'module',
    })
    const pkg = JSON.parse(result)

    expect(pkg.type).toBe('module')
  })

  test('includes type field when type is "commonjs"', () => {
    const result = createPackageManifest({
      name: 'test-app',
      type: 'commonjs',
    })
    const pkg = JSON.parse(result)

    expect(pkg.type).toBe('commonjs')
  })

  test('omits type field when not provided', () => {
    const result = createPackageManifest({
      name: 'test-studio',
    })
    const pkg = JSON.parse(result)

    expect(pkg).not.toHaveProperty('type')
  })

  test('omits prettier config when isAppTemplate is true', () => {
    const result = createPackageManifest({
      isAppTemplate: true,
      name: 'test-app',
    })
    const pkg = JSON.parse(result)

    expect(pkg).not.toHaveProperty('prettier')
  })

  test('includes prettier config when isAppTemplate is falsy', () => {
    const result = createPackageManifest({
      name: 'test-studio',
    })
    const pkg = JSON.parse(result)

    expect(pkg.prettier).toEqual({
      bracketSpacing: false,
      printWidth: 100,
      semi: false,
      singleQuote: true,
    })
  })

  test('uses default scripts when none provided', () => {
    const result = createPackageManifest({
      name: 'test-studio',
    })
    const pkg = JSON.parse(result)

    expect(pkg.scripts).toEqual({
      build: 'sanity build',
      deploy: 'sanity deploy',
      'deploy-graphql': 'sanity graphql deploy',
      dev: 'sanity dev',
      start: 'sanity start',
    })
  })

  test('uses custom scripts when provided', () => {
    const customScripts = {
      build: 'sanity build',
      dev: 'sanity dev',
      start: 'sanity start',
    }
    const result = createPackageManifest({
      name: 'test-app',
      scripts: customScripts,
    })
    const pkg = JSON.parse(result)

    expect(pkg.scripts).toEqual(customScripts)
  })

  test('sorts dependencies alphabetically', () => {
    const result = createPackageManifest({
      dependencies: {
        '@sanity/sdk': '^1',
        '@sanity/sdk-react': '^1',
        react: '^19',
        'react-dom': '^19',
      },
      name: 'test-app',
    })
    const pkg = JSON.parse(result)
    const depKeys = Object.keys(pkg.dependencies)

    expect(depKeys).toEqual(['@sanity/sdk', '@sanity/sdk-react', 'react', 'react-dom'])
  })

  test('sorts devDependencies alphabetically', () => {
    const result = createPackageManifest({
      devDependencies: {
        '@types/react': '^18',
        eslint: '^9',
        typescript: '^5',
      },
      name: 'test-app',
    })
    const pkg = JSON.parse(result)
    const devDepKeys = Object.keys(pkg.devDependencies)

    expect(devDepKeys).toEqual(['@types/react', 'eslint', 'typescript'])
  })

  test('sets private to true when license is UNLICENSED', () => {
    const result = createPackageManifest({
      name: 'test-app',
    })
    const pkg = JSON.parse(result)

    expect(pkg.private).toBe(true)
    expect(pkg.license).toBe('UNLICENSED')
  })

  test('does not set private when license is provided', () => {
    const result = createPackageManifest({
      license: 'MIT',
      name: 'test-app',
    })
    const pkg = JSON.parse(result)

    expect(pkg.private).toBeUndefined()
    expect(pkg.license).toBe('MIT')
  })

  test('includes repository when gitRemote is provided', () => {
    const result = createPackageManifest({
      gitRemote: 'https://github.com/test/repo.git',
      name: 'test-app',
    })
    const pkg = JSON.parse(result)

    expect(pkg.repository).toEqual({
      type: 'git',
      url: 'https://github.com/test/repo.git',
    })
  })

  test('produces valid JSON ending with newline', () => {
    const result = createPackageManifest({
      name: 'test-app',
    })

    expect(result.endsWith('\n')).toBe(true)
    expect(() => JSON.parse(result)).not.toThrow()
  })

  test('app template scenario: type module, no prettier, custom scripts', () => {
    const result = createPackageManifest({
      dependencies: {
        '@sanity/sdk': '^1',
        '@sanity/sdk-react': '^1',
        react: '^19',
        'react-dom': '^19',
      },
      devDependencies: {
        typescript: '^5',
      },
      isAppTemplate: true,
      name: 'my-app',
      scripts: {
        build: 'sanity build',
        dev: 'sanity dev',
        start: 'sanity start',
      },
      type: 'module',
    })
    const pkg = JSON.parse(result)

    expect(pkg.type).toBe('module')
    expect(pkg).not.toHaveProperty('prettier')
    expect(pkg.scripts).toEqual({
      build: 'sanity build',
      dev: 'sanity dev',
      start: 'sanity start',
    })
    expect(Object.keys(pkg.dependencies)).toEqual([
      '@sanity/sdk',
      '@sanity/sdk-react',
      'react',
      'react-dom',
    ])
  })
})

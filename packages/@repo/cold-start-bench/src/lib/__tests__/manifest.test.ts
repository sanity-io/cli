import {describe, expect, test} from 'vitest'

import {
  benchVersion,
  isBenchVersion,
  packageClosure,
  type PackageManifest,
  rewriteManifest,
  type WorkspacePackage,
} from '../manifest.ts'

describe('rewriteManifest', () => {
  test('sets the version and pins bench dependencies in every runtime field', () => {
    const manifest: PackageManifest = {
      dependencies: {'@sanity/cli-core': '^3.8.1', 'chalk': '^5.0.0'},
      devDependencies: {'@sanity/cli-core': 'workspace:*'},
      name: '@sanity/cli',
      optionalDependencies: {'@sanity/workbench-cli': '^2.8.0'},
      peerDependencies: {'@sanity/cli-build': '^6'},
      version: '8.13.0',
    }
    const versions = new Map([
      ['@sanity/cli-build', '6.4.1000000001'],
      ['@sanity/cli-core', '3.8.1000000001'],
      ['@sanity/workbench-cli', '2.8.1000000001'],
    ])
    expect(rewriteManifest(manifest, '8.13.1000000001', versions)).toEqual({
      dependencies: {'@sanity/cli-core': '3.8.1000000001', 'chalk': '^5.0.0'},
      devDependencies: {'@sanity/cli-core': 'workspace:*'},
      name: '@sanity/cli',
      optionalDependencies: {'@sanity/workbench-cli': '2.8.1000000001'},
      peerDependencies: {'@sanity/cli-build': '6.4.1000000001'},
      version: '8.13.1000000001',
    })
  })
})

describe('isBenchVersion', () => {
  test.each([
    ['8.13.1000000001', true],
    ['8.13.0', false],
    ['8.13.0-rc.1', false],
    ['garbage', false],
  ])('%s → %s', (version, expected) => {
    expect(isBenchVersion(version)).toBe(expected)
  })
})

describe('benchVersion', () => {
  test('uses a patch number above anything published', () => {
    expect(benchVersion('8.13.0', '00000001ff')).toBe('8.13.1000000001')
    expect(benchVersion('8.13.0-rc.1', '0000000aff')).toBe('8.13.1000000010')
  })

  test('rejects bad input', () => {
    expect(() => benchVersion('latest', '00000001')).toThrow('Invalid version')
    expect(() => benchVersion('1.0.0', 'xyz')).toThrow('Invalid hash')
  })
})

function pkg(name: string, deps: Record<string, string> = {}, isPrivate = false) {
  const entry: WorkspacePackage = {
    manifest: {dependencies: deps, name, private: isPrivate, version: '1.0.0'},
    path: `/ws/${name}`,
  }
  return [name, entry] as const
}

describe('packageClosure', () => {
  const workspace = new Map([
    pkg('@repo/private', {}, true),
    pkg('@sanity/cli', {'@sanity/cli-core': '1', 'chalk': '5'}),
    pkg('@sanity/cli-core'),
    pkg('create-sanity', {'@sanity/cli': '1'}),
  ])

  test('follows workspace dependencies transitively', () => {
    expect(packageClosure(['create-sanity'], workspace).map((p) => p.manifest.name)).toEqual([
      '@sanity/cli',
      '@sanity/cli-core',
      'create-sanity',
    ])
  })

  test('rejects unknown and private packages', () => {
    expect(() => packageClosure(['nope'], workspace)).toThrow('not a package in this workspace')
    expect(() => packageClosure(['@repo/private'], workspace)).toThrow('is private')
  })
})

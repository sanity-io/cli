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
      bin: {sanity: './bin/run.js'},
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
      bin: {sanity: './bin/run.js'},
      dependencies: {'@sanity/cli-core': '3.8.1000000001', 'chalk': '^5.0.0'},
      devDependencies: {'@sanity/cli-core': 'workspace:*'},
      name: '@sanity/cli',
      optionalDependencies: {'@sanity/workbench-cli': '2.8.1000000001'},
      peerDependencies: {'@sanity/cli-build': '6.4.1000000001'},
      version: '8.13.1000000001',
    })
  })

  test('does not mutate the input', () => {
    const manifest = {dependencies: {a: '1'}, name: 'x', version: '1.0.0'}
    rewriteManifest(manifest, '2.0.0', new Map([['a', '2']]))
    expect(manifest).toEqual({dependencies: {a: '1'}, name: 'x', version: '1.0.0'})
  })
})

describe('benchVersion', () => {
  test('uses a patch number above anything published', () => {
    expect(benchVersion('8.13.0', 'g00000001ff')).toBe('8.13.1000000001')
    expect(benchVersion('3.8.1', 'wffffffff00')).toBe(`3.8.${1_000_000_000 + 0xff_ff_ff_ff}`)
  })

  test('drops a prerelease', () => {
    expect(benchVersion('8.13.0-rc.1', 'g0000000a00')).toBe('8.13.1000000010')
  })

  test('rejects bad input', () => {
    expect(() => benchVersion('latest', 'g00000001ff')).toThrow('Invalid version')
    expect(() => benchVersion('1.0.0', 'abc')).toThrow('Invalid bench id')
    expect(() => benchVersion('1.0.0', '0123456789')).toThrow('Invalid bench id')
  })
})

describe('isBenchVersion', () => {
  test.each([
    ['8.13.1000000001', true],
    ['8.13.0', false],
    ['8.13.999999999', false],
    ['8.13.0-rc.1', false],
    ['garbage', false],
  ])('%s → %s', (version, expected) => {
    expect(isBenchVersion(version)).toBe(expected)
  })
})

function pkg(name: string, deps: Record<string, string> = {}, isPrivate = false) {
  return [
    name,
    {manifest: {dependencies: deps, name, private: isPrivate, version: '1.0.0'}, path: `/ws/${name}`},
  ] as const
}

describe('packageClosure', () => {
  const workspace = new Map<string, WorkspacePackage>([
    pkg('@repo/private', {}, true),
    pkg('@sanity/cli', {'@sanity/cli-build': '1', '@sanity/cli-core': '1', 'chalk': '5'}),
    pkg('@sanity/cli-build', {'@sanity/cli-core': '1'}),
    pkg('@sanity/cli-core'),
    pkg('create-sanity', {'@sanity/cli': '1'}),
  ])

  test('follows workspace dependencies transitively, sorted by name', () => {
    expect(packageClosure(['create-sanity'], workspace).map((p) => p.manifest.name)).toEqual([
      '@sanity/cli',
      '@sanity/cli-build',
      '@sanity/cli-core',
      'create-sanity',
    ])
  })

  test('rejects unknown and private packages', () => {
    expect(() => packageClosure(['nope'], workspace)).toThrow('not a package in this workspace')
    expect(() => packageClosure(['@repo/private'], workspace)).toThrow('is private')
  })
})

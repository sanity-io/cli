import {describe, expect, test} from 'vitest'

import {
  detectTemporaryPackageRunner,
  isTemporaryPackageRunner,
} from '../isTemporaryPackageRunner.js'

describe('detectTemporaryPackageRunner', () => {
  test.each([
    ['npx', '/home/user/.npm/_npx/abc123/node_modules/.bin/sanity', 'npx'],
    ['pnpm dlx (linux)', '/home/user/.cache/pnpm/dlx/abc123/node_modules/.bin/sanity', 'pnpm-dlx'],
    [
      'pnpm dlx (macOS)',
      '/Users/me/Library/Caches/pnpm/dlx/102cf35740a0642619d8b0b51b83c812f10a8ac02cfe2b4e9d4807dc772486bd/node_modules/.bin/sanity',
      'pnpm-dlx',
    ],
    ['yarn dlx', '/tmp/xfs-abc123/dlx-12345/node_modules/.bin/sanity', 'yarn-dlx'],
    ['bunx', '/tmp/bunx-1000-sanity@latest/node_modules/.bin/sanity', 'bunx'],
    [
      'Windows npx',
      'C:\\Users\\me\\AppData\\Local\\npm-cache\\_npx\\abc123\\node_modules\\.bin\\sanity.cmd',
      'npx',
    ],
  ])('identifies %s', (_label, path, expected) => {
    expect(detectTemporaryPackageRunner(path)).toBe(expected)
  })

  test.each([
    ['local node_modules/.bin', '/home/user/project/node_modules/.bin/sanity'],
    ['global install', '/usr/local/lib/node_modules/sanity/bin/sanity'],
    ['empty path', ''],
  ])('returns null for %s', (_label, path) => {
    expect(detectTemporaryPackageRunner(path)).toBeNull()
  })

  test('defaults to process.argv[1] when no argument is provided', () => {
    const original = process.argv[1]
    process.argv[1] = '/home/user/.npm/_npx/abc123/node_modules/.bin/sanity'
    try {
      expect(detectTemporaryPackageRunner()).toBe('npx')
    } finally {
      process.argv[1] = original
    }
  })
})

describe('isTemporaryPackageRunner', () => {
  test('is the boolean form of detectTemporaryPackageRunner', () => {
    expect(isTemporaryPackageRunner('/home/user/.npm/_npx/abc/node_modules/.bin/sanity')).toBe(true)
    expect(isTemporaryPackageRunner('/home/user/project/node_modules/.bin/sanity')).toBe(false)
  })
})

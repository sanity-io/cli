import {describe, expect, test} from 'vitest'

import {isTemporaryPackageRunner} from '../isTemporaryPackageRunner.js'

describe('isTemporaryPackageRunner', () => {
  test('returns true for npx temporary cache paths', () => {
    expect(isTemporaryPackageRunner('/home/user/.npm/_npx/abc123/node_modules/.bin/sanity')).toBe(
      true,
    )
  })

  test('returns true for pnpm dlx paths (linux cache layout)', () => {
    expect(
      isTemporaryPackageRunner('/home/user/.cache/pnpm/dlx/abc123/node_modules/.bin/sanity'),
    ).toBe(true)
  })

  test('returns true for pnpm dlx paths (macOS cache layout)', () => {
    expect(
      isTemporaryPackageRunner(
        '/Users/me/Library/Caches/pnpm/dlx/102cf35740a0642619d8b0b51b83c812f10a8ac02cfe2b4e9d4807dc772486bd/node_modules/.bin/sanity',
      ),
    ).toBe(true)
  })

  test('returns true for yarn dlx paths', () => {
    expect(isTemporaryPackageRunner('/tmp/xfs-abc123/dlx-12345/node_modules/.bin/sanity')).toBe(
      true,
    )
  })

  test('returns true for bunx paths', () => {
    expect(isTemporaryPackageRunner('/tmp/bunx-1000-sanity@latest/node_modules/.bin/sanity')).toBe(
      true,
    )
  })

  test('returns true for Windows npx cache paths', () => {
    expect(
      isTemporaryPackageRunner(
        'C:\\Users\\me\\AppData\\Local\\npm-cache\\_npx\\abc123\\node_modules\\.bin\\sanity.cmd',
      ),
    ).toBe(true)
  })

  test('returns false for local node_modules/.bin paths', () => {
    expect(isTemporaryPackageRunner('/home/user/project/node_modules/.bin/sanity')).toBe(false)
  })

  test('returns false for global npm install paths', () => {
    expect(isTemporaryPackageRunner('/usr/local/lib/node_modules/sanity/bin/sanity')).toBe(false)
  })

  test('returns false for an empty path', () => {
    expect(isTemporaryPackageRunner('')).toBe(false)
  })

  test('defaults to process.argv[1] when no argument is provided', () => {
    const original = process.argv[1]
    process.argv[1] = '/home/user/.npm/_npx/abc123/node_modules/.bin/sanity'
    try {
      expect(isTemporaryPackageRunner()).toBe(true)
    } finally {
      process.argv[1] = original
    }
  })
})
